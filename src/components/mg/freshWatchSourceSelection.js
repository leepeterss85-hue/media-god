/*
 * The web player's Sources button is an explicit request to browse the same
 * manual Real-Debrid/addon source catalogue as Continue Watching. Automatic
 * iframe failure recovery is not a click and must keep its existing hands-off
 * discovery path.
 */
export const isManualSourcesClick = (event) =>
  event?.type === "click";

const positive = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export const sourcePickerMedia = (source = {}) => {
  const mediaType =
    source.mediaType === "tv" ||
    source.type === "series" ||
    source.season != null ||
    source.rdSeason != null ||
    source.episode != null ||
    source.rdEpisode != null
      ? "tv"
      : "movie";
  const season = positive(source.season ?? source.rdSeason);
  const episode = positive(source.episode ?? source.rdEpisode);
  return {
    title: String(source.rdTitle || source.seriesTitle || source.title || "").trim(),
    poster: source.poster || source.poster_url || "",
    rdYear: source.rdYear ?? source.year ?? "",
    tmdbId: source.tmdbId ?? source.tmdb_id ?? source.id ?? "",
    imdbId: source.imdbId || source.imdb_id || "",
    mediaType,
    season: mediaType === "tv" ? season : null,
    episode: mediaType === "tv" ? episode : null,
    resumeAt: Math.max(0, Number(source.startTime || 0) || 0),
    alternateTitles: source.rdAlternateTitles || source.alternateTitles || [],
    alternateYears: source.rdAlternateYears || source.alternateYears || [],
  };
};
