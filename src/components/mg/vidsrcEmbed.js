const validId = (value) => {
  const id = String(value ?? "").trim();
  return /^(?:tt[0-9]+|[1-9][0-9]*)$/i.test(id) ? id : "";
};

const validIndex = (value, minimum) => {
  const text = String(value ?? "").trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
};

/**
 * VidSrc publishes embed pages, not direct media streams. Keep this URL
 * separate from automatic source ranking and require an exact episode.
 */
export const buildVidSrcEmbedUrl = (media = {}) => {
  const mediaType = String(media.mediaType || "").trim().toLowerCase();
  if (!["movie", "tv", "episode"].includes(mediaType)) return "";

  const id = [
    media.imdbId,
    media.imdb_id,
    media.tmdbId,
    media.tmdb_id,
    media.id,
  ].map(validId).find(Boolean);
  if (!id) return "";

  if (mediaType === "movie") {
    return "https://vidsrc.to/embed/movie/" + id;
  }

  const season = validIndex(media.season ?? media.rdSeason, 0);
  const episode = validIndex(media.episode ?? media.rdEpisode, 1);
  if (season === null || episode === null) return "";

  return "https://vidsrc.to/embed/tv/" + id + "/" + season + "/" + episode;
};
