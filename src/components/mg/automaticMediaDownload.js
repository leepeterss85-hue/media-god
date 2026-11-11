import { downloadableMedia } from './deviceMediaDownload.js';
import { readyMediaDownloads } from './readyMediaDownloads.js';
import { candidatesForSeasonEpisode, fileMatchesSeasonEpisode, readySeasonTorrentCandidates } from './seasonMediaDownloads.js';
import { magnetFromInput, magnetInfoHash } from './magnetStreamHelpers.js';
import { smartSourceEvidence, sourceReleaseTier } from './smartSourceSelection.js';
import { sourceIsConfirmedCachedForPlayback } from './sourceCacheVisibility.js';

const unwrap = response => response?.data ?? response ?? {};
const text = item => [item?.filename, item?.title, item?.name, item?.label].filter(Boolean).join(' ');
const excluded = item => /\b(sample|trailer|featurette)\b/i.test(text(item));
const magnetFor = item => magnetFromInput(item?.magnet || item?.infoHash || item?.info_hash || item?.url);
const quality = item => Number(text(item).match(/\b(2160|1080|720|480)p\b/i)?.[1] || 0);

export function rankedDownloadSources(items) {
  return (Array.isArray(items) ? items : []).filter(item => !excluded(item))
    .slice().sort((a, b) =>
      smartSourceEvidence(a).languageRank - smartSourceEvidence(b).languageRank ||
      Number(sourceIsConfirmedCachedForPlayback(b)) - Number(sourceIsConfirmedCachedForPlayback(a)) ||
      sourceReleaseTier(a).rank - sourceReleaseTier(b).rank || quality(b) - quality(a));
}

export function matchingDownloadFile(result, context) {
  if (result?.status !== 'ready' || excluded(result)) return null;
  const file = downloadableMedia(result);
  if (!file || smartSourceEvidence(result).languageRank === 4) return null;
  if (context.mediaType === 'tv') {
    if (!fileMatchesSeasonEpisode(result.filename, context.season, context.episode)) return null;
  } else if (!readyMediaDownloads([{ filename: result.filename, status: 'downloaded' }], context).length) {
    return null;
  }
  return file;
}

/** Discovery only: callers own the final device hand-off and cancellation check. */
export async function discoverMediaDownload(context, {
  invoke, isCancelled = () => false, onProgress = () => {},
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), pollLimit = 60,
} = {}) {
  const check = () => { if (isCancelled()) throw new Error('Download search cancelled.'); };
  const call = async (name, payload) => {
    check();
    let timer;
    try {
      const result = unwrap(await Promise.race([
        invoke(name, payload),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Download search timed out. Please retry.')), 45000); }),
      ]));
      check();
      return result;
    } finally { clearTimeout(timer); }
  };
  const identity = {
    title: context.title, year: context.year,
    ...(context.mediaType === 'tv' ? { season: Number(context.season), episode: Number(context.episode) } : {}),
    prefer_browser_transcode: false,
  };
  if (!context.title || (context.mediaType === 'tv' && (!identity.season || !identity.episode))) {
    throw new Error('Select a film or an exact episode to download.');
  }
  onProgress('Checking your ready files…');
  const library = await call('realDebrid', { action: 'torrents_list' });
  if (library.error || library.status === 'failed') throw new Error(library.error || 'Connect Real-Debrid in Settings to download.');
  const ready = context.mediaType === 'tv'
    ? candidatesForSeasonEpisode(readySeasonTorrentCandidates(library.torrents, context), context.season, context.episode)
    : readyMediaDownloads(library.torrents, context);
  for (const torrent of rankedDownloadSources(ready).slice(0, 8)) {
    try {
      const result = await call('realDebrid', { ...identity, action: 'torrent_info', torrent_id: String(torrent.id) });
      const file = matchingDownloadFile(result, context);
      if (file) return file;
    } catch { check(); }
  }
  onProgress('Finding a suitable download automatically…');
  let imdbId = context.imdbId || (/^tt\d+$/.test(String(context.tmdbId)) ? context.tmdbId : '');
  if (!/^tt\d+$/i.test(imdbId)) {
    const resolved = await call('resolveImdb', {
      imdb_id: '', tmdb_id: context.tmdbId || '', title: context.title,
      year: context.year || '', media_type: context.mediaType || 'movie',
    });
    imdbId = resolved.imdb_id;
    if (!/^tt\d+$/i.test(imdbId || '')) throw new Error(resolved.error || 'Could not identify this title. Please retry.');
  }
  const found = await call('fetchAddonStreams', {
    imdb_id: imdbId, tmdb_id: context.tmdbId || '', title: context.title,
    year: context.year || '', media_type: context.mediaType || 'movie',
    ...(context.mediaType === 'tv' ? { season: identity.season, episode: identity.episode } : {}),
  });
  if (found.error || found.status === 'failed') throw new Error(found.error || 'Source discovery is unavailable. Please retry.');
  const seen = new Set();
  const candidates = rankedDownloadSources(found.streams).filter(item => {
    const magnet = magnetFor(item);
    const key = magnetInfoHash(magnet) || magnet;
    if (!magnet || seen.has(key) || smartSourceEvidence(item).languageRank === 4) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
  for (let index = 0; index < candidates.length; index += 1) {
    const source = candidates[index];
    onProgress(`Checking download ${index + 1} of ${candidates.length}…`);
    let result;
    try {
      result = await call('realDebrid', {
        ...identity, action: 'resolve_best', magnet: magnetFor(source),
        ...(source.fileIdx != null ? { file_idx: Number(source.fileIdx) } : {}),
      });
    } catch { check(); continue; }
    // Monitor one preparation job rather than filling the account with torrents.
    if (result.torrent_id && result.status !== 'ready' && result.status !== 'failed' && !result.error) {
      const torrentId = String(result.torrent_id);
      for (let attempt = 0; attempt < pollLimit; attempt += 1) {
        check();
        onProgress(`Preparing your file${Number.isFinite(Number(result.torrent_progress?.progress)) ? ` · ${Math.round(Number(result.torrent_progress.progress))}%` : ''}… Keep this panel open.`);
        await wait(5000);
        result = await call('realDebrid', { ...identity, action: 'torrent_info', torrent_id: torrentId });
        if (result.status === 'ready' || result.status === 'failed' || result.error) break;
      }
      if (result.status !== 'ready' && result.status !== 'failed' && !result.error) {
        throw new Error('Your file is still preparing in Real-Debrid. Retry when it is ready; the device download has not started yet.');
      }
    }
    const file = matchingDownloadFile(result, context);
    if (file) return file;
  }
  throw new Error('No suitable downloadable file was found. Retry later or choose a source manually.');
}
