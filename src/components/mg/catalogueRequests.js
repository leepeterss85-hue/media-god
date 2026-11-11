import { base44 } from "@/api/base44Client";

/*
 * Cache public TMDB metadata only. User library records, source searches and
 * private addon/Real-Debrid calls must never enter this cache.
 *
 * Sharing a bounded in-flight promise prevents Home, Movies, TV and service
 * rows from issuing identical API requests during navigation.
 */
const MAX_ENTRIES = 140;
const requests = new Map();
const DEFAULT_TTL_MS = 6 * 60 * 1000;

const cacheable = (params) =>
  params && typeof params === "object" &&
  !params.query && !params.multi_search && !params.release_alerts &&
  !params.community_reviews && !params.credits_person_id &&
  !params.user_id && !params.token && !params.auth;

const cacheKey = (params) =>
  JSON.stringify(Object.keys(params).sort().map((key) => [key, params[key]]));

export const clearCatalogueRequestCache = () => requests.clear();

// Render recently visited public catalogue metadata immediately instead of
// showing a skeleton while a cached promise resolves. This never stores
// history, Real-Debrid credentials, source results or user-private records.
export const peekCatalogueMovies = (params) => {
  if (!cacheable(params)) return null;
  const existing = requests.get(cacheKey(params));
  return existing && existing.expiresAt > Date.now() ? existing.response ?? null : null;
};

export const getCatalogueMovies = (params, ttlMs = DEFAULT_TTL_MS) => {
  if (!cacheable(params)) return base44.functions.invoke("getTmdbMovies", params);

  const key = cacheKey(params);
  const now = Date.now();
  const existing = requests.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;

  if (existing) requests.delete(key);
  const request = base44.functions.invoke("getTmdbMovies", params);
  const entry = { promise: request, response: null, expiresAt: now + Math.max(1000, ttlMs) };
  requests.set(key, entry);

  // Store only successfully returned public metadata for an instant revisit.
  // Evict failures so a temporary 429/network error can recover normally.
  void request.then(
    (response) => { if (requests.get(key) === entry) entry.response = response; },
    () => { if (requests.get(key) === entry) requests.delete(key); }
  );

  while (requests.size > MAX_ENTRIES) {
    requests.delete(requests.keys().next().value);
  }
  return request;
};
