import { episodeAudioRank, hasUnusableEpisodeAudio } from "./episodeAudio.js";
import { isVerificationChallengeStream } from "./verificationChallengeGuard.js";

const API_BASE = "https://flixquest-api.vercel.app";
const PROVIDERS = ["showbox", "vidsrc", "vidsrcto"];
const SUCCESS_TTL_MS = 60_000;
const DEAD_ROUTE_TTL_MS = 5 * 60_000;
const legacyRouteUnavailableUntil = new Map();
const providerCache = new Map();

/*
 * FlixQuest's current app uses a separate v2 scraper service; the old
 * flixquest-api.vercel.app /watch-tv deployment frequently returns HTTP 404.
 * Its v2 instance is NOT a public anonymous endpoint. Operators may configure
 * a reachable, authorised instance in VITE_FLIXQUEST_V2_API_URL. Do not invent
 * endpoints, embed credentials in browser code, or call the app website as if
 * it were a video API.
 */
const configuredV2Base = () => {
  const value = String(
    (typeof window !== "undefined" && window.__MG_FLIXQUEST_V2_API_URL__) ||
    import.meta.env?.VITE_FLIXQUEST_V2_API_URL ||
    ""
  ).trim().replace(/\/+$/, "");
  return safeV2Base(value);
};
const safeV2Base = value => {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password ||
        /^(?:localhost|127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname))
      return "";
    return url.origin + url.pathname.replace(/\/+$/, "").replace(/\/api\/v2$/i, "") + "/api/v2";
  } catch { return ""; }
};

export const flixQuestV2Configured = () => Boolean(configuredV2Base());
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

const withTimeout = async (url, timeoutMs = 3200) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET", headers: { Accept: "application/json" }, signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 404) return { __missingRoute: true };
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const v2Providers = async base => {
  const cached = providerCache.get(base);
  if (cached?.until > Date.now()) return cached.ids;
  const payload = await withTimeout(base + "/providers", 1700);
  const items = Array.isArray(payload?.providers) ? payload.providers : [];
  const ids = items.filter(entry => entry?.enabled !== false)
    .map(entry => text(entry?.id))
    .filter(id => /^[a-z0-9_-]{2,40}$/i.test(id)).slice(0, 4);
  if (ids.length) providerCache.set(base, { ids, until: Date.now() + 10 * 60_000 });
  return ids;
};

const scraperQueries = async ({ id, seasonNumber, episodeNumber, v2Base }) => {
  if (v2Base) {
    const providers = await v2Providers(v2Base);
    const names = providers.length ? providers : ["showbox", "vixsrc"];
    return names.map(provider => ({
      provider,
      url: v2Base + "/stream-tv?" + new URLSearchParams({
        tmdbId: id, season: String(seasonNumber), episode: String(episodeNumber),
        provider, full: "false",
      }),
    }));
  }
  const query = new URLSearchParams({
    tmdbId: id, season: String(seasonNumber), episode: String(episodeNumber),
  });
  return PROVIDERS
    .filter(provider => (legacyRouteUnavailableUntil.get(provider) || 0) <= Date.now())
    .map(provider => ({
      provider,
      url: `${API_BASE}/${provider}/watch-tv?${query}`,
    }));
};

const contentFormat = (item, url) => {
  const hint = text(item?.mimeType || item?.contentType || item?.format || item?.type).toLowerCase();
  if (/mpegurl|m3u8|\bhls\b/.test(hint) || /\.m3u8(?:$|[?#])/i.test(url)) return "hls";
  if (/dash|\bmpd\b/.test(hint) || /\.mpd(?:$|[?#])/i.test(url)) return "dash";
  if (/mp4/.test(hint) || /\.(?:mp4|m4v)(?:$|[?#])/i.test(url)) return "mp4";
  return text(item?.format);
};

// An API may return links for other episodes, adverts, or commentary. A
// provider with only rejected links must not win the first-response race.
const validEpisodeLink = (item, payload, id, seasonNumber, episodeNumber) => {
  if (!item || typeof item !== "object" || isVerificationChallengeStream(item)) return false;
  const url = sourceUrl(item);
  if (!/^https?:\/\//i.test(url) ||
      /\.(?:jpg|jpeg|png|webp|vtt|srt|mp3|aac|m4a|html?)(?:$|[?#])/i.test(url) ||
      /^(?:external|iframe|embed|provider)$/i.test(text(item.type)) ||
      hasUnusableEpisodeAudio(item)) return false;
  const returnedTmdbId = Number(item.tmdbId ?? item.tmdb_id ?? payload.tmdbId ?? payload.tmdb_id);
  const returnedSeason = Number(item.season ?? item.season_number ?? payload.season ?? payload.season_number);
  const returnedEpisode = Number(item.episode ?? item.episode_number ?? payload.episode ?? payload.episode_number);
  if ((returnedTmdbId > 0 && returnedTmdbId !== Number(id)) ||
      (returnedSeason > 0 && returnedSeason !== seasonNumber) ||
      (returnedEpisode > 0 && returnedEpisode !== episodeNumber)) return false;
  // An API may provide a fully proxied media URL and also describe headers
  // used inside its proxy. Only a raw URL requiring custom headers is unsafe.
  if (item.headers && Object.keys(item.headers).length &&
      !/\/proxy(?:\/|\?)/i.test(url)) return false;
  return true;
};

/** Resolve only the requested episode; provider labels are hints, not audio proof. */
export async function fetchTvEpisodeSources({
  tmdbId, season, episode, title = "", scraperBaseUrl = "",
}) {
  const id = text(tmdbId);
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  if (!/^\d{1,9}$/.test(id) || Number(id) < 1 || !Number.isInteger(seasonNumber) || seasonNumber < 1 ||
      !Number.isInteger(episodeNumber) || episodeNumber < 1) return [];

  const v2Base = scraperBaseUrl
    ? safeV2Base(scraperBaseUrl)
    : configuredV2Base();
  const key = `${v2Base || "legacy"}:${id}:${seasonNumber}:${episodeNumber}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.sources.map(item => ({ ...item }));
  if (inFlight.has(key)) return inFlight.get(key);

  const lookup = (async () => {
    const requests = await scraperQueries({ id, seasonNumber, episodeNumber, v2Base });
    if (!requests.length) return [];
    /*
     * Race all providers and start from the first useful stream instead of
     * waiting for a slow or dead provider. The remaining provider requests
     * settle harmlessly and will be retried only on the next episode.
     */
    const firstUseful = await Promise.any(requests.map(async ({ provider, url }) => {
      const payload = await withTimeout(url);
      if (!v2Base && payload?.__missingRoute)
        legacyRouteUnavailableUntil.set(provider, Date.now() + DEAD_ROUTE_TTL_MS);
      if (!payload || payload.__missingRoute || payload.success === false ||
          !unwrapLinks(payload).some(item =>
            validEpisodeLink(item, payload, id, seasonNumber, episodeNumber)
          )) throw new Error("no_episode_stream");
      return { provider, payload };
    })).catch(() => null);
    const results = firstUseful ? [firstUseful] : [];
    const sources = [];
    for (const { provider, payload } of results) {
      if (!payload || payload?.success === false) continue;
      for (const item of unwrapLinks(payload)) {
        if (!validEpisodeLink(item, payload, id, seasonNumber, episodeNumber)) continue;
        const url = sourceUrl(item);
        const language = text(
          item.audioLanguage || item.audio_language || item.language || item.lang ||
          item.hlsAudioLanguage
        );
        const quality = text(item.quality || item.resolution || item.label);
        sources.push({
          ...item,
          id: `flixquest:${provider}:${url}`, src: url, url, type: "url",
          label: [title || "TV episode", provider, quality, language].filter(Boolean).join(" · "),
          provider: `flixquest-${provider}`, audioLanguage: language, language,
          format: item.isM3U8 === true ? "hls" : item.isDASH === true ? "dash" : contentFormat(item, url),
          flixQuestSource: true,
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
