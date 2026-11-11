import { rankDownloadSources } from './automaticMediaDownload.js';
import { readyMediaDownloads } from './readyMediaDownloads.js';
import { downloadableMedia } from './deviceMediaDownload.js';
import { magnetFromInput } from './magnetStreamHelpers.js';
import { smartSourceEvidence } from './smartSourceSelection.js';
import { sourceIsConfirmedCachedForPlayback } from './sourceCacheVisibility.js';
import { fileMatchesSeasonEpisode } from './seasonMediaDownloads.js';

export const MAX_DOWNLOAD_CHOICES = 60;

const unwrap = response => response?.data ?? response ?? {};
const filenameFor = item => String(item?.filename || item?.behaviorHints?.filename ||
  item?.behavior_hints?.filename || item?.name || item?.title || '').trim();

const sizeFromText = value => {
  const match = String(value || '').match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*(TiB|GiB|MiB|KiB|TB|GB|MB|KB)(?=$|[^a-z0-9])/i);
  if (!match) return 0;
  const units = { kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
    kb: 1000, mb: 1000 ** 2, gb: 1000 ** 3, tb: 1000 ** 4 };
  return Math.round(Number(match[1]) * (units[match[2].toLowerCase()] || 0));
};

export const downloadSizeBytes = (source = {}, { allowTorrentSize = false } = {}) => {
  const options = [
    source?.size_bytes, source?.file_size_bytes, source?.fileSizeBytes,
    source?.behaviorHints?.videoSize, source?.behavior_hints?.videoSize,
    source?.fileSize, source?.size,
    ...(allowTorrentSize ? [source?.bytes] : []),
  ];
  for (const raw of options) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1024 && n <= 100 * 1024 ** 4) return Math.round(n);
  }
  return sizeFromText([source?.filename, source?.name, source?.title,
    source?.size, source?.fileSize, source?.description].filter(Boolean).join(' '));
};

export const formatDownloadSize = bytes => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return 'Size unknown';
  const unit = n >= 1024 ** 4 ? 'TB' : n >= 1024 ** 3 ? 'GB' : n >= 1024 ** 2 ? 'MB' : 'KB';
  const divisor = unit === 'TB' ? 1024 ** 4 : unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : 1024;
  return (n / divisor).toFixed(n / divisor < 10 ? 2 : 1).replace(/\.0+$/, '') + ' ' + unit;
};

export const downloadQuality = source => {
  const description = [filenameFor(source), source?.quality, source?.resolution,
    source?.description].filter(Boolean).join(' ');
  const match = description.match(/(?:^|[^a-z0-9])(4320|2160|1440|1080|720|576|480|360)p?(?=$|[^a-z0-9])/i);
  if (match) {
    const n = Number(match[1]);
    return { label: n >= 2160 ? (n === 4320 ? '8K' : '4K') : n + 'p', resolution: n };
  }
  if (/(?:^|[^a-z0-9])(?:4k|uhd)(?=$|[^a-z0-9])/i.test(description)) return { label: '4K', resolution: 2160 };
  if (/(?:^|[^a-z0-9])8k(?=$|[^a-z0-9])/i.test(description)) return { label: '8K', resolution: 4320 };
  return { label: 'Unknown quality', resolution: 0 };
};

export const sortDownloadChoices = (choices, order = 'recommended') => {
  const preferred = (a, b) =>
    a.languageRank - b.languageRank ||
    Number(b.ready) - Number(a.ready) ||
    Number(b.cached) - Number(a.cached) ||
    a.releaseRank - b.releaseRank ||
    b.resolution - a.resolution ||
    a.index - b.index;
  return [...(Array.isArray(choices) ? choices : [])].sort((a, b) => {
    if (order === 'quality') return b.resolution - a.resolution || preferred(a, b);
    if (order === 'smallest' || order === 'largest') {
      // Unknown size stays at the bottom in both size sorts.
      if (!a.sizeBytes && b.sizeBytes) return 1;
      if (a.sizeBytes && !b.sizeBytes) return -1;
      return (order === 'smallest' ? a.sizeBytes - b.sizeBytes : b.sizeBytes - a.sizeBytes) || preferred(a, b);
    }
    return preferred(a, b);
  });
};

const fromSource = (item, index, kind) => {
  const filename = filenameFor(item);
  const evidence = smartSourceEvidence(item);
  const quality = downloadQuality(item);
  const ready = kind === 'ready';
  const cached = ready || sourceIsConfirmedCachedForPlayback(item);
  const sizeBytes = downloadSizeBytes(item, { allowTorrentSize: ready });
  return {
    id: kind + ':' + String(item?.id || item?.hash || item?.infoHash ||
      item?.info_hash || item?.url || item?.src || index) + ':' +
      String(item?.fileIdx ?? item?.file_idx ?? ''),
    index, kind, filename, sizeBytes, quality: quality.label,
    resolution: quality.resolution, language: evidence.languageLabel,
    languageRank: evidence.languageRank, release: evidence.releaseTierLabel,
    releaseRank: evidence.releaseTierRank, ready, cached,
    sizeIsTorrentTotal: ready && sizeBytes > 0,
    ...(ready ? { torrentId: String(item.id) } : { source: item }),
  };
};

const magnetFor = item => magnetFromInput(item?.magnet || item?.magnetLink ||
  item?.infoHash || item?.info_hash || item?.src || item?.url);

const directVideoUrl = item => {
  const url = item?.src || item?.url;
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:' || item.externalUrl ||
      /embed|iframe|hls|dash/i.test(String(item.type || '')) ||
      !/\.(mp4|mkv|avi|mov|webm|m4v|ts)$/i.test(parsed.pathname)) return '';
    return parsed.toString();
  } catch { return ''; }
};

export async function discoverDownloadChoices(context, {
  invoke, cancelled = () => false, onProgress = () => {}, maxChoices = MAX_DOWNLOAD_CHOICES,
} = {}) {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(maxChoices) || MAX_DOWNLOAD_CHOICES)));
  const check = () => { if (cancelled()) throw new Error('Download search cancelled.'); };
  const call = async (name, payload) => {
    check();
    const result = unwrap(await invoke(name, payload));
    check();
    return result;
  };
  const identity = { title: context.title, year: context.year,
    media_type: context.mediaType,
    ...(context.mediaType === 'tv' ? { season: context.season, episode: context.episode } : {}),
  };
  const seen = new Set();
  const choices = [];
  const add = (source, kind) => {
    const option = fromSource(source, choices.length, kind);
    const key = kind === 'ready' ? 'torrent:' + option.torrentId
      : magnetFor(source) ? 'magnet:' + magnetFor(source) + ':' + String(source.fileIdx ?? source.file_idx ?? '')
        : 'url:' + directVideoUrl(source);
    if (!key || key === 'url:' || seen.has(key) || !option.filename ||
      /sample|trailer|featurette/i.test(option.filename)) return;
    seen.add(key);
    choices.push(option);
  };

  onProgress('Checking ready files…');
  try {
    const library = await call('realDebrid', { action: 'torrents_list' });
    for (const torrent of rankDownloadSources(readyMediaDownloads(library.torrents, context, limit))) {
      if (choices.length >= limit) break;
      add(torrent, 'ready');
    }
  } catch (error) { check(); } // Addon discovery is still useful without an RD library.

  if (choices.length < limit) {
    onProgress('Finding more qualities and file sizes…');
    try {
      let imdbId = context.imdbId || (/^tt\d+$/i.test(String(context.tmdbId)) ? context.tmdbId : '');
      if (!/^tt\d+$/i.test(String(imdbId))) {
        const resolved = await call('resolveImdb', { ...identity, tmdb_id: context.tmdbId || '' });
        imdbId = resolved.imdb_id;
      }
      if (/^tt\d+$/i.test(String(imdbId))) {
        const response = await call('fetchAddonStreams', {
          ...identity, imdb_id: imdbId, tmdb_id: context.tmdbId || '',
        });
        for (const source of rankDownloadSources(response.streams).slice(0, 250)) {
          if (choices.length >= limit) break;
          if (!magnetFor(source) && !directVideoUrl(source)) continue;
          // Explicitly named TV episodes must match; final resolved filenames
          // are checked again when a download is actually selected.
          if (context.mediaType === 'tv') {
            const name = filenameFor(source);
            if (/s\d{1,2}[ ._-]*e\d{1,3}|\d{1,2}x\d{1,3}/i.test(name) &&
                !fileMatchesSeasonEpisode(name, context.season, context.episode)) continue;
          }
          add(source, 'addon');
        }
      }
    } catch (error) {
      check();
      if (!choices.length) throw error;
    }
  }
  if (!choices.length) throw new Error('No suitable downloadable files found for this title.');
  return sortDownloadChoices(choices);
}

const safeResolvedFile = (result, suggested, context) => {
  const file = downloadableMedia(result, suggested);
  if (!file || /sample|trailer|featurette/i.test(file.filename) ||
    (context.mediaType === 'tv' &&
      !fileMatchesSeasonEpisode(file.filename, context.season, context.episode))) return null;
  const matchingFiles = Array.isArray(result.files) ? result.files : [];
  const selected = matchingFiles.find(entry =>
    entry?.selected === true || entry?.rd_selected === true) ||
    matchingFiles.find(entry => String(entry?.path || '').split('/').pop() === file.filename);
  return {
    ...file,
    sizeBytes: downloadSizeBytes(selected || result, { allowTorrentSize: Boolean(selected) }) ||
      downloadSizeBytes({filename: file.filename}),
    quality: downloadQuality({ filename: file.filename }).label,
  };
};

export async function resolveDownloadChoice(option, context, {
  invoke, cancelled = () => false, onProgress = () => {}, pollAttempts = 25,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const check = () => { if (cancelled()) throw new Error('Download request cancelled.'); };
  const call = async (name, payload) => {
    check();
    const result = unwrap(await invoke(name, payload));
    check();
    return result;
  };
  const identity = { title: context.title, year: context.year,
    media_type: context.mediaType,
    ...(context.mediaType === 'tv' ? { season: context.season, episode: context.episode } : {}),
  };
  let result;
  let torrentId = '';
  if (option?.kind === 'ready') {
    if (!option.torrentId) throw new Error('Missing ready file identifier.');
    onProgress('Resolving the selected ready file…');
    result = await call('realDebrid', { action: 'torrent_info', torrent_id: option.torrentId, ...identity });
    torrentId = option.torrentId;
  } else if (option?.kind === 'addon' && option.source) {
    const magnet = magnetFor(option.source);
    if (magnet) {
      onProgress('Resolving the selected source…');
      result = await call('realDebrid', {
        action: 'resolve_best', magnet, ...identity,
        ...(option.source.fileIdx != null || option.source.file_idx != null
          ? { file_idx: option.source.fileIdx ?? option.source.file_idx } : {}),
      });
      torrentId = String(result.torrent_id || '');
    } else {
      const url = directVideoUrl(option.source);
      if (!url) throw new Error('This source is not a direct downloadable file.');
      const path = new URL(url).pathname;
      result = { status: 'ready', stream_url: url,
        filename: option.source.filename || option.source.behaviorHints?.filename ||
          decodeURIComponent(path.split('/').pop()) };
    }
  } else {
    throw new Error('Unknown download choice.');
  }
  if (result.error || result.status === 'failed') {
    throw new Error(result.error || 'Could not resolve the chosen file.');
  }
  if (result.status === 'ready') {
    const file = safeResolvedFile(result, option.filename, context);
    if (!file) throw new Error('The resolved source was not the expected downloadable movie or episode.');
    return file;
  }
  if (!torrentId) throw new Error('This source could not be prepared for download.');
  for (let attempt = 0; attempt < Math.max(0, Math.min(45, pollAttempts)); attempt++) {
    check();
    onProgress('Waiting for Real-Debrid to prepare the selected file…');
    await wait(2000);
    result = await call('realDebrid', { action: 'torrent_info', torrent_id: torrentId, ...identity });
    if (result.status === 'ready') {
      const file = safeResolvedFile(result, option.filename, context);
      if (file) return file;
      throw new Error('The selected file did not match the requested title or episode.');
    }
    if (result.status === 'failed' || result.error) break;
  }
  throw new Error(result?.error ||
    'The file is still preparing in Real-Debrid. Retry this option when it is ready.');
}
