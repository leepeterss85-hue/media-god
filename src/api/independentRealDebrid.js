import { getAccessToken } from "@base44/sdk";
import { appParams } from "@/lib/app-params";
import { resolveAccountToken } from "./accountSessionToken.js";

/**
 * Real-Debrid requests are resolved on Railway using the authenticated Media
 * God user record. The browser sends only the existing Base44 session token.
 * No Real-Debrid token, refresh credential or private addon URL is transmitted.
 *
 * Guests use a separate device capability and encrypted Railway storage.
 */
export const INDEPENDENT_RD_ENDPOINT =
  "https://media-god-rd-api-production.up.railway.app";

export const INDEPENDENT_RD_FUNCTIONS = new Set([
  "realDebrid",
  "realDebridAuth",
  "findRdLibrary",
  "multiDebrid",
  "fetchAddonStreams",
]);

const PRIVATE_FIELDS = new Set([
  "rd_token", "rd_refresh_token", "rd_client_secret", "rd_client_id",
  "user_id", "guest_device_key", "authorization", "access_token",
]);

export async function readAccountSessionToken({
  getToken = getAccessToken,
  timeoutMs = 1_800,
} = {}) {
  return resolveAccountToken({
    getToken,
    fallbackToken: typeof appParams.token === "string" ? appParams.token : "",
    timeoutMs,
  });
}

export function independentRdPayload(payload = {}) {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !PRIVATE_FIELDS.has(key))
  );
}

export async function invokeIndependentRealDebrid(name, payload = {}, {
  fetchImpl = globalThis.fetch,
  token,
  deviceToken,
  timeoutMs = 120_000,
  // A 401 can mean the native WebView's bootstrap session expired while the
  // Base44 SDK refreshed its account token. Retry only if a NEW token exists.
  refreshToken = () => resolveAccountToken({
    getToken: getAccessToken,
    timeoutMs: 1_200,
  }),
} = {}) {
  if (!INDEPENDENT_RD_FUNCTIONS.has(name)) {
    throw new Error("Unsupported independent Real-Debrid function");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Real-Debrid network unavailable");
  }
  let session = token || await readAccountSessionToken();
  if (!session && !deviceToken) {
    const error = new Error("A Media God account session is required for Railway Real-Debrid");
    error.code = "NO_ACCOUNT_SESSION";
    throw error;
  }
  const controller = new AbortController();
  const hardTimeoutMs = Math.max(1, Number(timeoutMs) || 120_000);
  let timer;
  let timeoutError;
  // Promise.race settles the caller but does not stop an ignored abort.
  // Prevent late responses or token refreshes from starting more work.
  const assertActive = () => {
    if (timeoutError) throw timeoutError;
  };
  // Some Android TV WebViews ignore AbortController, including while reading
  // JSON after a response has already arrived. Bound the *whole* RD operation
  // (including a refreshed-session retry) and never leave playback spinning.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Real-Debrid request timed out. Try the source again.");
      error.code = "RD_REQUEST_TIMEOUT";
      timeoutError = error;
      reject(error);
      controller.abort();
    }, hardTimeoutMs);
  });
  try {
    const operation = (async () => {
    const body = JSON.stringify(independentRdPayload(payload));
    const request = () => fetchImpl(
      `${INDEPENDENT_RD_ENDPOINT}/functions/${name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": deviceToken ? `Device ${deviceToken}` : `Bearer ${session}`,
        },
        body,
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      },
    );
    let response = await request();
    assertActive();
    // Railway verifies every request with Base44 auth.me. A rejected session
    // can be retried safely ONLY when the SDK actually obtained a different
    // Media God session. A 403 (origin/permission denial) is never retried.
    if (!deviceToken && response.status === 401 && typeof refreshToken === "function") {
      let fresh = "";
      try {
        fresh = String(await refreshToken() || "").trim();
      } catch {
        // Retain the original signed-in failure and reconnect guidance.
      }
      assertActive();
      if (fresh && fresh !== session) {
        session = fresh;
        response = await request();
        assertActive();
      }
    }
    let data = {};
    try { data = await response.json(); } catch {}
    assertActive();
    if (!response.ok) {
      const message = typeof data?.error === "string"
        ? data.error
        : `Real-Debrid returned ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.response = { data, status: response.status };
      throw error;
    }
    return { data, status: response.status };
    })();
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
