/**
 * Optional browse-time ADDON source hints, not a playback guarantee.
 * Keep only short-lived status flags in memory. Never save source URLs,
 * stream names, debrid tokens or search payloads to localStorage.
 * Only scan user-requested movie results: series need an exact episode.
 */
import { sourceHasAuthoritativeCachedSignal, sourceHasPendingCacheSignal } from './sourceCacheVisibility.js';
import { isVerificationChallengeStream } from './verificationChallengeGuard.js';

export const SOURCE_CHECK_BATCH = 8;
export const SOURCE_CHECK_CONCURRENCY = 2;
const POSITIVE_TTL_MS = 20 * 60 * 1000;
const INCONCLUSIVE_TTL_MS = 2 * 60 * 1000;
const VERIFIED_EMPTY_TTL_MS = 5 * 60 * 1000;

// An empty addon list does not prove the provider worked. Only a completed,
// exhaustive, healthy check with zero raw streams from every enabled addon is
// evidence of "no addon sources". Provider/browser embeds remain unverified.
const isHealthyEmptyAddonResponse = data => {
  if (!data || data.error || !Array.isArray(data.streams) || data.streams.length) return false;
  const checked = Number(data.addons_checked);
  const available = Number(data.addons_available);
  const diagnostics = data.diagnostics;
  if (!Number.isInteger(checked) || checked < 1 || checked !== available ||
      !Array.isArray(diagnostics) || diagnostics.length !== checked) return false;
  return diagnostics.every(item =>
    item && item.status === 'no_playable_streams' &&
    Number(item.stream_count) === 0 && Number(item.playable_count) === 0
  );
};

export function isComprehensiveAddonNoSourceResult(data) {
  return data?.fast_mode === false && isHealthyEmptyAddonResponse(data);
}

export function catalogueSourceKey(item) {
  if (item?.media_type !== 'movie') return '';
  const id = String(item?.tmdb_id ?? item?.tmdbId ?? item?.id ?? '').trim();
  const year = String(item?.year ?? '').slice(0, 4);
  if (!/^\d{1,10}$/.test(id)) return '';
  return `movie:${id}:${year}`;
}

export function classifyCatalogueSourceResult(data) {
  if (data?.error || !data || !Array.isArray(data.streams)) return 'unknown';
  const discovered = data.streams.filter(stream =>
    stream && stream.unsupported !== true &&
    !isVerificationChallengeStream(stream) &&
    !/^(?:provider|youtube|trailer|external|control)$/i.test(String(stream.type || '')) &&
    !/\b(?:trailer|preview|captcha|verify.{0,10}human)\b/i.test(String(stream.label || ''))
  );
  const found = discovered.some(stream => {
    if (sourceHasPendingCacheSignal(stream) && !sourceHasAuthoritativeCachedSignal(stream)) return false;
    if (sourceHasAuthoritativeCachedSignal(stream)) return true;
    const url = String(stream.src || stream.url || '').trim();
    // A plausible direct URL is a discovered candidate, not validated video.
    return /^https:\/\//i.test(url) &&
      /\.(?:m3u8|mp4|mkv)(?:\?|$)/i.test(url) &&
      !/\b(?:youtube|trailer|captcha|cloudflare)\b/i.test(url);
  });
  if (found) return 'found';
  // No sources or only uncached/unsupported sources is inconclusive, never
  // proof that the film is unavailable through another provider.
  return 'unconfirmed';
}

/** Keep both source checks bounded; cache status only, never returned URLs. */
export function createCatalogueSourceChecker(invoke, { now = () => Date.now(), concurrency = SOURCE_CHECK_CONCURRENCY } = {}) {
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  const listeners = new Set();
  let active = 0;
  const sourceRequest = (item, fastMode) => invoke('fetchAddonStreams', {
    tmdb_id: item.tmdb_id ?? item.tmdbId ?? item.id,
    imdb_id: item.imdb_id || item.imdbId || '',
    title: item.title || '',
    year: item.year || '',
    media_type: 'movie',
    fast_mode: fastMode,
  });
  const unwrap = (response) => response?.data?.data || response?.data || response;
  const getStatus = (item) => {
    const row = cache.get(catalogueSourceKey(item));
    return row && row.expires > now() ? row.status : 'unknown';
  };
  const pump = () => {
    while (active < Math.max(1, Math.min(2, concurrency)) && queue.length) {
      const job = queue.shift();
      active += 1;
      (async () => {
        const fast = unwrap(await sourceRequest(job.item, true));
        const first = classifyCatalogueSourceResult(fast);
        if (first === 'found' || first === 'unknown') return first;
        // Full pass can return additional configured sources the quick pass
        // misses. Fail-open instead of hiding titles on a partial/failed scan.
        const full = unwrap(await sourceRequest(job.item, false));
        const second = classifyCatalogueSourceResult(full);
        if (second === 'found') return 'found';
        if (second !== 'unknown' && isComprehensiveAddonNoSourceResult(full) &&
            fast?.fast_mode === true && isHealthyEmptyAddonResponse(fast)) {
          return 'no-sources';
        }
        return second;
      })().catch(() => 'unknown').then(status => {
        cache.set(job.key, {
          status,
          expires: now() + (status === 'found' ? POSITIVE_TTL_MS :
            status === 'no-sources' ? VERIFIED_EMPTY_TTL_MS : INCONCLUSIVE_TTL_MS),
        });
        job.resolve(status);
        for (const listener of listeners) {
          try { listener(job.key, status); } catch { /* UI listeners may unmount */ }
        }
      }).finally(() => {
        pending.delete(job.key);
        active -= 1;
        pump();
      });
    }
  };
  const check = item => {
    const key = catalogueSourceKey(item);
    if (!key) return Promise.resolve('unknown');
    const old = cache.get(key);
    if (old && old.expires > now()) return Promise.resolve(old.status);
    if (pending.has(key)) return pending.get(key);
    const promise = new Promise(resolve => queue.push({ key, item, resolve }));
    pending.set(key, promise);
    pump();
    return promise;
  };
  const subscribe = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { check, getStatus, subscribe };
}
