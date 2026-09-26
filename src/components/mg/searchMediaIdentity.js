// TMDB ids are the common key used by catalogue details and VOD playback.
// Search corrections may carry an older generic id alongside a corrected one.
export const searchTmdbId = (item) => {
  for (const value of [item?.tmdb_id, item?.tmdbId, item?.id]) {
    if (value != null && value !== "") return value;
  }
  return null;
};
