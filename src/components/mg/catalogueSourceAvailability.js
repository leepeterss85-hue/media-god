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
      !/\.(?:m3u8|mp4|mkv)(?:\?|$)/i.test(url) === false &&
      !/\b(?:youtube|trailer|captcha|cloudflare)\b/i.test(url);
  });
  if (found) return 'found';
  // No sources or only uncached/unsupported sources is inconclusive, never
  // proof that the film is unavailable through another provider.
  return 'unconfirmed';
}

/** Cap concurrent checks globally and cache only status, never streams. */
export function createCatalogueSourceChecker(invoke, { now = () => Date.now(), concurrency = SOURCE_CHECK_CONCURRENCY } = {}) {
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;
  const pump = () => {
    while (active < Math.max(1, Math.min(2, concurrency)) && queue.length) {
      const job = queue.shift();
      active += 1;
      Promise.resolve().then(() => invoke('fetchAddonStreams', {
        tmdb_id: job.item.tmdb_id ?? job.item.tmdbId ?? job.item.id,
        imdb_id: job.item.imdb_id || job.item.imdbId || '',
        title: job.item.title || '',
        year: job.item.year || '',
        media_type: 'movie',
        fast_mode: true,
      })).then(response => {
        const payload = response?.data?.data || response?.data || response;
        const status = classifyCatalogueSourceResult(payload);
        cache.set(job.key, { status, expires: now() + (status === 'found' ? POSITIVE_TTL_MS : INCONCLUSIVE_TTL_MS) });
        job.resolve(status);
      }).catch(() => {
        cache.set(job.key, { status: 'unknown', expires: now() + INCONCLUSIVE_TTL_MS });
        job.resolve('unknown');
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
  return { check };
}
