import { episodeAudioRank, hasUnusableEpisodeAudio } from "./episodeAudio.js";

const API_BASE = "https://flixquest-api.vercel.app";
const PROVIDERS = ["showbox", "vidsrc", "vidsrcto"];
const SUCCESS_TTL_MS = 60_000;
const cache = new Map();
const inFlight = new Map();
const text = value => String(value ?? "").trim();
const sourceUrl = item => text(item?.url || item?.src || item?.file || item?.link || item?.streamUrl);

const unwrapLinks = payload => {
  if (Array.isArray(payload)) return payload;
  return [payload?.sources, payload?.streams, payload?.links, payload?.data?.sources,
    payload?.data?.streams, payload?.data?.links, payload?.data, payload?.result?.sources]
    .find(Array.isArray) || [];
};

const withTimeout = async (url, timeoutMs = 9000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET", headers: { Accept: "application/json" }, signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const contentFormat = (item, url) => {
  const hint = text(item?.mimeType || item?.contentType || item?.format || item?.type).toLowerCase();
  if (/mpegurl|m3u8|\bhls\b/.test(hint) || /\.m3u8(?:$|[?#])/i.test(url)) return "hls";
  if (/dash|\bmpd\b/.test(hint) || /\.mpd(?:$|[?#])/i.test(url)) return "dash";
  if (/mp4/.test(hint) || /\.(?:mp4|m4v)(?:$|[?#])/i.test(url)) return "mp4";
  return text(item?.format);
};

/** Resolve only the requested episode; provider labels are hints, not audio proof. */
export async function fetchTvEpisodeSources({ tmdbId, season, episode, title = "" }) {
  const id = text(tmdbId);
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  if (!/^\d{1,9}$/.test(id) || Number(id) < 1 || !Number.isInteger(seasonNumber) || seasonNumber < 1 ||
      !Number.isInteger(episodeNumber) || episodeNumber < 1) return [];

  const key = `${id}:${seasonNumber}:${episodeNumber}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.sources.map(item => ({ ...item }));
  if (inFlight.has(key)) return inFlight.get(key);

  const lookup = (async () => {
    const query = new URLSearchParams({ tmdbId: id, season: String(seasonNumber), episode: String(episodeNumber) });
    const results = await Promise.all(PROVIDERS.map(async provider => ({
      provider, payload: await withTimeout(`${API_BASE}/${provider}/watch-tv?${query}`),
    })));
    const sources = [];
    for (const { provider, payload } of results) {
      if (!payload || payload?.success === false) continue;
      for (const item of unwrapLinks(payload)) {
        if (!item || typeof item !== "object") continue;
        const url = sourceUrl(item);
        if (!/^https?:\/\//i.test(url)) continue;
        if (/\.(?:jpg|jpeg|png|webp|vtt|srt|mp3|aac|m4a|html?)(?:$|[?#])/i.test(url) ||
            /^(?:external|iframe|embed|provider)$/i.test(text(item.type))) continue;
        const returnedTmdbId = Number(item.tmdbId ?? item.tmdb_id ?? payload.tmdbId ?? payload.tmdb_id);
        if (returnedTmdbId > 0 && returnedTmdbId !== Number(id)) continue;
        const returnedSeason = Number(item.season ?? item.season_number ?? payload.season ?? payload.season_number);
        const returnedEpisode = Number(item.episode ?? item.episode_number ?? payload.episode ?? payload.episode_number);
        if ((returnedSeason > 0 && returnedSeason !== seasonNumber) ||
            (returnedEpisode > 0 && returnedEpisode !== episodeNumber)) continue;
        if (hasUnusableEpisodeAudio(item)) continue;
        const language = text(item.audioLanguage || item.audio_language || item.language || item.lang);
        const quality = text(item.quality || item.resolution || item.label);
        sources.push({
          ...item,
          id: `flixquest:${provider}:${url}`, src: url, url, type: "url",
          label: [title || "TV episode", provider, quality, language].filter(Boolean).join(" · "),
          provider: `flixquest-${provider}`, audioLanguage: language, language,
          format: contentFormat(item, url), flixQuestSource: true,
          episodeResolver: "flixquest", tmdbId: id, season: seasonNumber, episode: episodeNumber,
          // A scraper response has not inspected the actual media tracks.
          launchQualified: false,
        });
      }
    }
    const seen = new Set();
    const result = sources.sort((a, b) => episodeAudioRank(a) - episodeAudioRank(b)).filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
    if (result.length) cache.set(key, { sources: result, expiresAt: Date.now() + SUCCESS_TTL_MS });
    // Bound retained signed URLs during a long viewing session.
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return result;
  })();
  inFlight.set(key, lookup);
  try {
    return await lookup;
  } finally {
    if (inFlight.get(key) === lookup) inFlight.delete(key);
  }
}
