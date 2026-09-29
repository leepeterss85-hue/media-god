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

/** 2Embed — TMDB or IMDb, movies + TV. */
export const buildTwoEmbedEmbedUrl = (media = {}) => {
  const type = validType(media);
  if (!type) return "";
  const id = tmdbId(media) || imdbId(media);
  if (!id) return "";
  if (type === "movie") return `https://www.2embed.cc/embed/${id}`;
  const ctx = tvContext(media);
  return ctx ? `https://www.2embed.cc/embedtv/${id}&s=${ctx.season}&e=${ctx.episode}` : "";
};

/** CineSrc — TMDB only, movies + TV. */
export const buildCineSrcEmbedUrl = (media = {}) => {
  const type = validType(media);
  if (!type) return "";
  const id = tmdbId(media);
  if (!id) return "";
  if (type === "movie") return `https://cinesrc.st/embed/movie/${id}`;
  const ctx = tvContext(media);
  return ctx ? `https://cinesrc.st/embed/tv/${id}?s=${ctx.season}&e=${ctx.episode}` : "";
};

/** MultiEmbed — TMDB or IMDb, movies + TV. */
export const buildMultiEmbedEmbedUrl = (media = {}) => {
  const type = validType(media);
  if (!type) return "";
  const tmdb = tmdbId(media);
  const imdb = imdbId(media);
  const ctx = type === "movie" ? { season: 0, episode: 0 } : tvContext(media);
  if (!ctx) return "";
  if (tmdb) {
    return type === "movie"
      ? `https://multiembed.mov/?video_id=${tmdb}&tmdb=1`
      : `https://multiembed.mov/?video_id=${tmdb}&tmdb=1&s=${ctx.season}&e=${ctx.episode}`;
  }
  if (imdb) {
    return type === "movie"
      ? `https://multiembed.mov/?video_id=${imdb}`
      : `https://multiembed.mov/?video_id=${imdb}&s=${ctx.season}&e=${ctx.episode}`;
  }
  return "";
};

export const EXTRA_EMBED_PROVIDERS = [
  { key: "twoembed", label: "2Embed", build: buildTwoEmbedEmbedUrl },
  { key: "cinesrc", label: "CineSrc", build: buildCineSrcEmbedUrl },
  { key: "multiembed", label: "MultiEmbed", build: buildMultiEmbedEmbedUrl },
];