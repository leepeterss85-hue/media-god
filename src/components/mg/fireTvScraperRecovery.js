/**
 * Fire TV should not automatically choose the old CDN embed when it is
 * reported black/404. KEEP the web scraper tab strip: select the next real
 * scraper first, and leave OnlyFlix, other web scrapers, and the explicit
 * Sources (torrent/RD) escape hatch available for manual choice.
 * No phone, browser, or Live TV behavior is changed by this helper.
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

/** Pick a web scraper, never the torrent pathway, for direct Fire TV Play. */
export const initialFireTvScraper = ({ nativeFireTv = false, url = "", mediaType = "", initialProvider = "onlyflix", alternatives = [] } = {}) => {
  if (!needsFireTvScraperRecovery({ nativeFireTv, url, mediaType }) || initialProvider !== "onlyflix") {
    return initialProvider;
  }
  const candidates = Array.isArray(alternatives) ? alternatives : [];
  return candidates.find((candidate) =>
    candidate?.id !== "onlyflix" && /^https:\/\//i.test(String(candidate?.url || ""))
  )?.id || initialProvider;
};
