const idText = (value) => String(value ?? "").trim();

const tmdbId = (media) => {
  const id = idText(media?.tmdbId ?? media?.tmdb_id ?? media?.id);
  return /^[1-9][0-9]{0,8}$/.test(id) ? id : "";
};

const imdbId = (media) => {
  const id = idText(media?.imdbId ?? media?.imdb_id);
  return /^tt[0-9]{4,12}$/i.test(id) ? id : "";
};

const index = (value, minimum) => {
  const text = idText(value);
  if (!/^(0|[1-9][0-9]*)$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
};

const tvContext = (media) => {
  const season = index(media?.season ?? media?.rdSeason, 0);
  const episode = index(media?.episode ?? media?.rdEpisode, 1);
  return season === null || episode === null ? null : { season, episode };
};

const validType = (media) => {
  const type = idText(media?.mediaType).toLowerCase();
  return ["movie", "tv", "episode"].includes(type) ? type : "";
};

/**
 * OnlyFlix (share.cdnm.ink) — IMDb or TMDB ID, movies + TV.
 * TV episodes are addressed with ?season=&episode= query parameters.
 */
export const buildOnlyFlixEmbedUrl = (media = {}) => {
  const type = validType(media);
  if (!type) return "";

  const imdb = imdbId(media);
  const tmdb = tmdbId(media);
  if (!imdb && !tmdb) return "";

  const base = imdb
    ? `https://share.cdnm.ink/embed/imdb/${imdb}`
    : `https://share.cdnm.ink/embed/tmdb/${tmdb}`;

  if (type === "movie") return base;

  const ctx = tvContext(media);
  if (!ctx) return "";

  return `${base}?season=${ctx.season}&episode=${ctx.episode}`;
};

/**
 * Public OnlyFlix title page for the separate Multiple Servers button.
 * Keep buildOnlyFlixEmbedUrl unchanged for the green Play action.
 */
export const buildOnlyFlixTitlePageUrl = (media = {}) => {
  const type = validType(media);
  const title = idText(media?.title).trim();
  if (!type || !title) return "";
  // Use search rather than guessing a slug, which can lead to a 404.
  return `https://onlyflix.to/?s=${encodeURIComponent(title)}`;
};
