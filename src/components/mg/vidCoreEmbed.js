const idText = (value) => String(value ?? "").trim();

const tmdbId = (media) => {
  const id = idText(media?.tmdbId ?? media?.tmdb_id ?? media?.id);
  return /^[1-9][0-9]{0,8}$/.test(id) ? id : "";
};

const index = (value, minimum) => {
  const text = idText(value);
  if (!/^(0|[1-9][0-9]*)$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
};

/** VidCore addresses a title with a TMDb ID and TV with one exact episode. */
export const buildVidCoreEmbedUrl = (media = {}) => {
  const type = idText(media.mediaType).toLowerCase();
  if (!["movie", "tv", "episode"].includes(type)) return "";
  const id = tmdbId(media);
  if (!id) return "";
  if (type === "movie") return `https://vidcore.org/embed/movie/${id}`;

  const season = index(media.season ?? media.rdSeason, 0);
  const episode = index(media.episode ?? media.rdEpisode, 1);
  return season === null || episode === null
    ? ""
    : `https://vidcore.org/embed/tv/${id}/${season}/${episode}`;
};