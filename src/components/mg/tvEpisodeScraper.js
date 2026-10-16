const API_BASE = "https://flixquest-api.vercel.app";
const PROVIDERS = ["showbox", "vidsrc", "vidsrcto"];

const text = (value) => String(value ?? "").trim();

const sourceUrl = (item) =>
  text(item?.url || item?.src || item?.file || item?.link || item?.streamUrl);

const languageHint = (item) =>
  text(
    item?.audioLanguage ||
      item?.audio_language ||
      item?.language ||
      item?.lang ||
      item?.name ||
      item?.title ||
      item?.quality ||
      ""
  );

const audioRank = (item) => {
  const hint = languageHint(item).toLowerCase();
  if (/commentary|descriptive audio|audio description|\bad\b/.test(hint)) return 0;
  if (/\b(english|eng|en-us|en-gb)\b/.test(hint)) return 3;
  if (/\b(multi|dual audio|multi-audio)\b/.test(hint)) return 2;
  if (/\b(french|spanish|german|italian|japanese|korean|hindi|russian|portuguese)\b/.test(hint)) return 1;
  return 2; // Unknown language is not proof that audio is broken.
};

const unwrapLinks = (payload) => {
  const candidates = [
    payload?.sources,
    payload?.streams,
    payload?.links,
    payload?.data?.sources,
    payload?.data?.streams,
    payload?.data?.links,
  ];
  return candidates.find(Array.isArray) || [];
};

const withTimeout = async (url, timeoutMs = 9000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Resolve an exact TV episode through the FlixQuest public API.
 * The API does not guarantee English audio, so only explicit language hints
 * are ranked; unknown audio metadata remains eligible.
 */
export async function fetchTvEpisodeSources({ tmdbId, season, episode, title = "" }) {
  const id = text(tmdbId);
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  if (!/^\d{1,9}$/.test(id) ||
      !Number.isInteger(seasonNumber) || seasonNumber < 1 ||
      !Number.isInteger(episodeNumber) || episodeNumber < 1) {
    return [];
  }

  const query = new URLSearchParams({
    tmdbId: id,
    season: String(seasonNumber),
    episode: String(episodeNumber),
  });

  const results = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const payload = await withTimeout(
        `${API_BASE}/${provider}/watch-tv?${query.toString()}`
      );
      return { provider, payload };
    })
  );

  const sources = [];
  for (const { provider, payload } of results) {
    if (!payload || payload?.success === false) continue;
    for (const item of unwrapLinks(payload)) {
      const url = sourceUrl(item);
      if (!/^https?:\/\//i.test(url)) continue;
      if (/\.(?:jpg|jpeg|png|webp|vtt|srt)(?:$|\?)/i.test(url)) continue;
      const quality = text(item?.quality || item?.resolution || item?.label);
      const language = languageHint(item);
      sources.push({
        ...item,
        id: `flixquest:${provider}:${url}`,
        src: url,
        url,
        type: "url",
        label: [title || "TV episode", provider, quality, language].filter(Boolean).join(" · "),
        provider: `flixquest-${provider}`,
        audioLanguage: text(item?.audioLanguage || item?.audio_language || item?.language || item?.lang),
        language,
        flixQuestSource: true,
      });
    }
  }

  const seen = new Set();
  return sources
    .sort((a, b) => audioRank(b) - audioRank(a))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}
