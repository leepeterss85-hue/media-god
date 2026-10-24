/**
 * The legacy OnlyFlix CDN embed currently returns HTTP 404 for valid TMDB
 * titles. On native Fire TV, do not strand Play inside a blank cross-origin
 * iframe whose onLoad fires even for a 404 error document. Route the same
 * movie or exact episode into Media God's existing qualified source discovery.
 *
 * Do not change phone, browser, Live TV, or manual scraper selection.
 */
export const needsFireTvScraperRecovery = ({ nativeFireTv = false, url = "", mediaType = "" } = {}) => {
  if (!nativeFireTv || !["tv", "movie", "episode"].includes(String(mediaType).toLowerCase())) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "share.cdnm.ink" &&
      /^\/embed\/(?:imdb|tmdb)\//.test(parsed.pathname);
  } catch {
    return false;
  }
};
