import { isLowCapacityTvDevice } from "./deviceCapacity.js";

/**
 * Card-sized TMDB posters only. Do not resize hero backdrops, detail artwork,
 * source thumbnails, service logos or any non-TMDB URL.
 *
 * TMDB discovery currently provides /w500 for every poster. Keeping 500px
 * on a 120–175 CSS-pixel catalogue card wastes bandwidth and decoding memory,
 * especially on inexpensive Android TV boxes.
 */
export const cataloguePosterUrl = (source, {
  lowCapacity = isLowCapacityTvDevice(),
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : 960,
} = {}) => {
  const url = String(source || "");
  if (!/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\//.test(url)) {
    return url;
  }
  const desired = lowCapacity ? "w185" : viewportWidth >= 1800 ? "w500" : "w342";
  return url.replace(/\/t\/p\/(?:w\d+|original)\//, "/t/p/" + desired + "/");
};
