import { getAccessToken } from "@base44/sdk";
import { appParams } from "@/lib/app-params";

/**
 * Real-Debrid requests are resolved on Railway using the authenticated Media
 * God user record. The browser sends only the existing Base44 session token.
 * No Real-Debrid token, refresh credential or private addon URL is transmitted.
 *
 * A guest (no Base44 session) keeps the existing device-specific Base44 path
 * until a secure per-device guest migration can be implemented.
 */
export const INDEPENDENT_RD_ENDPOINT =
  "https://media-god-rd-api-production.up.railway.app";

export const INDEPENDENT_RD_FUNCTIONS = new Set([
  "realDebrid",
  "realDebridAuth",
  "findRdLibrary",
]);

const PRIVATE_FIELDS = new Set([
  "rd_token", "rd_refresh_token", "rd_client_secret", "rd_client_id",
  "user_id", "guest_device_key", "authorization", "access_token",
]);

export async function readAccountSessionToken({ getToken = getAccessToken } = {}) {
  let token = "";
  try {
    const received = await getToken();
    if (typeof received === "string") token = received.trim();
  } catch {
    // Storage-disabled or cookie-only sessions fall back to the old guest /
    // Base44 route rather than constructing a forged account session.
  }
  if (!token && typeof appParams.token === "string") {
    token = appParams.token.trim();
  }
  return token || "";
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
  timeoutMs = 120_000,
} = {}) {
  if (!INDEPENDENT_RD_FUNCTIONS.has(name)) {
    throw new Error("Unsupported independent Real-Debrid function");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Real-Debrid network unavailable");
  }
  const session = token || await readAccountSessionToken();
  if (!session) {
    const error = new Error("A Media God account session is required for Railway Real-Debrid");
    error.code = "NO_ACCOUNT_SESSION";
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${INDEPENDENT_RD_ENDPOINT}/functions/${name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session}`,
        },
        body: JSON.stringify(independentRdPayload(payload)),
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      },
    );
    let data = {};
    try { data = await response.json(); } catch {}
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
  } finally {
    clearTimeout(timer);
  }
}
