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

const PUBLIC_IMDB_RESOLVERS = new Set(["resolveImdb", "resolveTvImdb"]);
export async function invokeIndependentImdbResolver(name, payload = {}, {
  fetchImpl = globalThis.fetch,
  storage = safeStorage(),
} = {}) {
  if (!PUBLIC_IMDB_RESOLVERS.has(name)) {
    throw new Error("Unsupported public identity resolver");
  }
  const input = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload : {};
  // The independent endpoint needs only public media identity fields. Never
  // forward account tokens, Real-Debrid credentials, or arbitrary SDK payloads.
  const allowed = [
    "imdb_id", "imdbId", "tmdb_id", "tmdbId", "id",
    "title", "year", "media_type", "mediaType",
  ];
  const request = Object.fromEntries(
    allowed.filter(key => input[key] !== undefined).map(key => [key, input[key]]),
  );
  const cacheRequest = { __resolver: name, ...request };
  // Identity mappings are stable: avoid another network round trip (and quota
  // charge) when this device already has a valid match. Never cache failures.
  const cached = readCache(cacheRequest, storage);
  if (/^tt\d+$/i.test(String(cached?.imdb_id || "")) && !cached.error) {
    return { data: cached };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const endpoint = INDEPENDENT_METADATA_API_URL.replace(
      "/functions/getTmdbMovies", `/functions/${name}`);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Identity service returned ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== "object") throw new Error("Identity service response invalid");
    if (/^tt\d+$/i.test(String(data.imdb_id || "")) && !data.error) {
      saveCache(cacheRequest, data, storage);
    }
    return { data };
  } catch (error) {
    const cached = readCache(cacheRequest, storage);
    if (/^tt\d+$/i.test(String(cached?.imdb_id || "")) && !cached.error) {
      return { data: cached, stale: true };
    }
    throw new Error("Identity lookup temporarily unavailable", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

/*
 * Public Stremio addon discovery. This deliberately does NOT accept private
 * addon manifests, Real-Debrid tokens, or proxy arbitrary URLs. The Railway
 * service has only its vetted credential-free built-in addon catalogue.
 * Never cache user-specific resolved media URLs in localStorage.
 */
export async function invokeIndependentAddonSources(payload = {}, {
  fetchImpl = globalThis.fetch,
} = {}) {
  const input = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload : {};
  const allowed = [
    "imdb_id", "imdbId", "tmdb_id", "tmdbId", "title", "year",
    "alternate_years", "alternate_titles", "media_type", "mediaType",
    "season", "episode", "fast_mode", "exclude_addons", "include_addons",
  ];
  const request = Object.fromEntries(
    allowed.filter(key => input[key] !== undefined).map(key => [key, input[key]]),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(
      INDEPENDENT_METADATA_API_URL.replace(
        "/functions/getTmdbMovies", "/functions/fetchAddonStreams"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "omit",
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`Public source lookup HTTP ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== "object" || !Array.isArray(data.streams)) {
      throw new Error("Public source lookup returned invalid data");
    }
    return { data };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Non-sensitive public app features. All payload fields are whitelisted and
 * deliberately exclude account, debrid, addon and device credentials.
 * No fallback to credit-limited Base44 functions.
 */
const PUBLIC_FEATURE_FIELDS = {
  getEntertainmentNews: ["section", "forceRefresh"],
  getSkipSegments: [
    "imdb_id", "imdbId", "season", "episode",
    "duration", "duration_seconds", "durationSeconds",
  ],
  getFireTvApkLink: [],
};
export async function invokeIndependentPublicFeature(name, payload = {}, {
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_FEATURE_FIELDS, name)) {
    throw new Error("Unsupported public feature");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Public feature network unavailable");
  }
  const input = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload : {};
  const fields = PUBLIC_FEATURE_FIELDS[name];
  const request = Object.fromEntries(
    fields.filter(key => input[key] !== undefined).map(key => [key, input[key]]),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), name === "getEntertainmentNews" ? 60_000 : 20_000);
  try {
    const endpoint = INDEPENDENT_METADATA_API_URL.replace(
      "/functions/getTmdbMovies",
      `/functions/${name}`,
    );
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Independent ${name} returned ${response.status}`);
    }
    const data = await response.json();
    if (!data || typeof data !== "object" || data.error) {
      throw new Error(`Invalid ${name} response`);
    }
    // Never cache signed APK links or user-specific information.
    return { data };
  } finally {
    clearTimeout(timeout);
  }
}
