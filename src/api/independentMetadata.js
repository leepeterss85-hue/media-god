/*
 * Public catalogue metadata can run independently of Base44 Functions.
 * No Real-Debrid token, Base44 access token, or private user data is ever
 * forwarded to this endpoint. Other Base44 SDK operations remain unchanged.
 */
export const INDEPENDENT_METADATA_API_URL =
  "https://media-god-metadata-api-production.up.railway.app/functions/getTmdbMovies";

const MAX_LOCAL_BYTES = 240_000;
const MAX_STORED_KEYS = 12;
const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;

const safeStorage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};
const cachePrefix = "mg:public-tmdb-cache:v1:";

const shortHash = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};
const keyFor = (payload) => cachePrefix + shortHash(JSON.stringify(payload || {}));

const readCache = (payload, storage = safeStorage()) => {
  if (!storage) return null;
  try {
    const entry = JSON.parse(storage.getItem(keyFor(payload)) || "null");
    if (!entry || entry.payload !== JSON.stringify(payload || {}) ||
      Date.now() - Number(entry.savedAt || 0) > CACHE_LIFETIME_MS ||
      !entry.data || typeof entry.data !== "object") return null;
    return entry.data;
  } catch {
    return null;
  }
};
const saveCache = (payload, data, storage = safeStorage()) => {
  if (!storage || !data || typeof data !== "object") return;
  const body = JSON.stringify({ payload: JSON.stringify(payload || {}), savedAt: Date.now(), data });
  if (body.length > MAX_LOCAL_BYTES) return;
  try {
    storage.setItem(keyFor(payload), body);
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(cachePrefix)) keys.push(key);
    }
    // Only remove our own public catalogue cache. Never delete history,
    // profiles, credentials, or any Base44 data.
    while (keys.length > MAX_STORED_KEYS) {
      const old = keys.shift();
      if (old && old !== keyFor(payload)) storage.removeItem(old);
    }
  } catch {
    // Low-storage WebViews can reject writes; playback should not depend on it.
  }
};

export async function invokeIndependentMetadata(payload = {}, {
  fetchImpl = globalThis.fetch,
  storage = safeStorage(),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  if (!fetchImpl) throw new Error("Catalogue network unavailable");
  const request = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload : {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(INDEPENDENT_METADATA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`Independent metadata returned ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== "object" || data.error) {
      throw new Error("Independent metadata response invalid");
    }
    saveCache(request, data, storage);
    return { data };
  } catch (error) {
    const saved = readCache(request, storage);
    if (saved) return { data: saved, stale: true };
    throw new Error("Catalogue temporarily unavailable; please retry", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
