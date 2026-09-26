/*
 * TMDB movie and TV IDs occupy separate namespaces. Keep a known film's
 * identity when an older saved card or a related-title host carries a TV type.
 * Do not merge the distinct 2021 Finnish series (TV 125242) with the
 * Saoirse Ronan film (movie 1198654).
 */
const typeOf = (value) => {
  const type = String(value || "").trim().toLowerCase();
  if (type === "movie" || type === "film") return "movie";
  if (type === "tv" || type === "series" || type === "show") return "tv";
  return "";
};

const isBadApplesFilm = (item = {}) => {
  const imdbId = String(item?.imdb_id || item?.imdbId || "").trim().toLowerCase();
  if (imdbId === "tt29714073") return true;

  const tmdbId = String(item?.tmdb_id || item?.tmdbId || item?.id || "").trim();
  if (tmdbId !== "1198654") return false;

  const title = String(item?.title || item?.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const year = String(
    item?.year || item?.release_date || item?.releaseDate || item?.first_air_date || ""
  ).slice(0, 4);

  return (
    (title === "bad apples" || title === "bad apple") &&
    (!year || year === "2025" || year === "2026")
  );
};

export const resolveCatalogMediaType = (item = {}, fallbackType = "") => {
  if (isBadApplesFilm(item)) return "movie";

  const explicit = typeOf(item?.media_type || item?.mediaType || item?.type);
  if (explicit) return explicit;

  const fallback = typeOf(fallbackType);
  if (fallback) return fallback;

  if (item?.first_air_date || item?.firstAirDate) return "tv";
  if (item?.name && !item?.title) return "tv";
  return "movie";
};
