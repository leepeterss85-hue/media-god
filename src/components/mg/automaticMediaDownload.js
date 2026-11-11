import { excludeServerIssuedIpBoundVod } from './ipBoundVodSafety.js';
import { readyMediaDownloads } from './readyMediaDownloads.js';
import { downloadableMedia } from './deviceMediaDownload.js';
import { magnetFromInput } from './magnetStreamHelpers.js';
import { smartSourceEvidence, sourceReleaseTier } from './smartSourceSelection.js';
import { sourceIsConfirmedCachedForPlayback } from './sourceCacheVisibility.js';
import { fileMatchesSeasonEpisode } from './seasonMediaDownloads.js';

const unwrap = response => response?.data ?? response ?? {};
const magnetFor = source => magnetFromInput(source.magnet || source.magnetLink || source.infoHash || source.info_hash || source.src || source.url);
const nameFor = source => source.filename || source.behaviorHints?.filename || source.title || source.name || '';

export function rankDownloadSources(sources) {
  const seen = new Set();
  return (Array.isArray(sources) ? sources : []).filter(source => {
    const key = source.id || magnetFor(source) || source.src || source.url;
    if (!key || seen.has(key) || /sample|trailer|featurette/i.test(nameFor(source))) return false;
    seen.add(key);
    return true;
  }).sort((a, b) =>
    smartSourceEvidence(a).languageRank - smartSourceEvidence(b).languageRank ||
    Number(sourceIsConfirmedCachedForPlayback(b)) - Number(sourceIsConfirmedCachedForPlayback(a)) ||
    sourceReleaseTier(a).rank - sourceReleaseTier(b).rank
  );
}

/** Discover and resolve a file without starting playback. The caller owns the device handoff. */
export async function discoverMediaDownloads(context, { invoke, cancelled = () => false, onProgress = () => {}, pollAttempts = 30, maxResults = 3, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const limit = Math.max(1, Math.min(3, Math.trunc(Number(maxResults) || 1)));
  const files = [];
  const seen = new Set();
  const addFile = file => {
    if (!file || seen.has(file.url)) return false;
    seen.add(file.url);
    files.push(file);
    return true;
  };
  const check = () => { if (cancelled()) throw new Error('Download cancelled.'); };
  const call = async (name, payload) => {
    check();
    const result = unwrap(await invoke(name, payload));
    check();
    return result;
  };
  const identity = {
    title: context.title, year: context.year, media_type: context.mediaType,
    ...(context.mediaType === 'tv' ? { season: context.season, episode: context.episode } : {}),
  };
  const validate = (result, suggested) => {
    const file = downloadableMedia(result, suggested);
    if (!file || /sample|trailer|featurette/i.test(file.filename)) return null;
    if (context.mediaType === 'tv' && !fileMatchesSeasonEpisode(file.filename, context.season, context.episode)) return null;
    return file;
  };
  let lastError = '';
  let pending = null;
  onProgress('Checking ready files…');
  try {
    const library = await call('realDebrid', { action: 'torrents_list' });
    for (const torrent of rankDownloadSources(readyMediaDownloads(library.torrents, context))) {
      try {
        const result = await call('realDebrid', { action: 'torrent_info', torrent_id: torrent.id, ...identity });
        const file = result.status === 'ready' && validate(result, torrent.filename);
        if (file && addFile(file) && files.length >= limit) return files;
      } catch (error) { check(); lastError = error.message; }
    }
  } catch (error) { check(); lastError = error.message; }

  onProgress('Finding a suitable download…');
  let imdbId = context.imdbId || (/^tt\d+$/i.test(String(context.tmdbId)) ? context.tmdbId : '');
  let found = { streams: [] };
  try {
    if (!/^tt\d+$/i.test(imdbId)) {
      const resolved = await call('resolveImdb', { ...identity, tmdb_id: context.tmdbId || '' });
      imdbId = resolved.imdb_id;
      if (!/^tt\d+$/i.test(imdbId || '')) throw new Error(resolved.error || 'Could not identify this title. Please retry.');
    }
    found = await call('fetchAddonStreams', { ...identity, imdb_id: imdbId, tmdb_id: context.tmdbId || '' });
    if (found.error && !found.streams?.length) throw new Error(found.error);
  } catch (error) {
    check();
    if (files.length) return files; // Ready files are still usable when addon lookup fails.
    throw error;
  }
  let uncachedAttempts = 0;
  for (const source of rankDownloadSources(excludeServerIssuedIpBoundVod(found.streams)).slice(0, 12)) {
    check();
    try {
      const magnet = magnetFor(source);
      let result;
      if (magnet) {
        // Avoid filling the account with pending torrents if no cached copy exists.
        if (!sourceIsConfirmedCachedForPlayback(source) && uncachedAttempts++ >= 1) continue;
        onProgress('Preparing a download file…');
        result = await call('realDebrid', {
          action: 'resolve_best', magnet, ...identity,
          ...(source.fileIdx != null || source.file_idx != null ? { file_idx: source.fileIdx ?? source.file_idx } : {}),
        });
        if (result.status !== 'ready') {
          if (result.torrent_id && !pending) pending = { id: result.torrent_id, filename: nameFor(source) };
          lastError = result.error || lastError;
          continue;
        }
      } else {
        const url = source.src || source.url;
        // A filename hint alone is not evidence that an arbitrary webpage is a file.
        if (!url || source.externalUrl || /embed|iframe|hls|dash/i.test(source.type || '')) continue;
        const path = new URL(url).pathname;
        if (!/\.(mp4|mkv|avi|mov|webm|m4v|ts)$/i.test(path)) continue;
        result = { stream_url: url, filename: source.filename || source.behaviorHints?.filename || decodeURIComponent(path.split('/').pop()) };
      }
      const file = validate(result, nameFor(source));
      if (file && addFile(file) && files.length >= limit) return files;
    } catch (error) { check(); lastError = error.message; }
  }
  // Do not make users wait for an uncached torrent when some ready files exist.
  if (files.length) return files;
  for (let attempt = 0; pending && attempt < pollAttempts; attempt++) {
    check();
    onProgress('Waiting for Real-Debrid to prepare the file…');
    await wait(2000);
    check();
    try {
      const result = await call('realDebrid', { action: 'torrent_info', torrent_id: pending.id, ...identity });
      const file = result.status === 'ready' && validate(result, pending.filename);
      if (file) { addFile(file); return files; }
      if (result.status === 'failed' || result.error) break;
    } catch (error) { check(); lastError = error.message; break; }
  }
  throw new Error(pending
    ? 'A matching file is still being prepared by Real-Debrid. Retry when it is ready; no device download has started yet.'
    : lastError || 'No suitable downloadable file was found. Try again later or choose a source manually.');
}

/** Backwards-compatible single best match used by season bulk downloads. */
export async function discoverMediaDownload(context, options) {
  const files = await discoverMediaDownloads(context, { ...options, maxResults: 1 });
  return files[0];
}
