/**
 * Fire Stick defaults back to OnlyFlix now that the Fire OS video-surface
 * repair displays its picture. Keep the alternative WEB SCRAPERS as backups,
 * and never treat the old cdnm.ink URL as a reason to skip OnlyFlix up front.
 * Actual iframe load errors and the Try next button are handled by
 * OnlyFlixEmbedPlayer's existing nextWebFallback pipeline.
 * Phone, web, Live TV and manually selected providers are unchanged.
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

/** Start OnlyFlix when available, but keep a web backup when no URL exists. */
export const initialFireTvScraper = ({ nativeFireTv = false, url = "", mediaType = "", initialProvider = "onlyflix", alternatives = [] } = {}) => {
  if (!nativeFireTv || initialProvider !== "onlyflix" ||
      !["tv", "movie", "episode"].includes(String(mediaType).toLowerCase())) {
    return initialProvider;
  }
  // The positive-pixel Fire TV surface fix now makes this route usable.
  // Do not skip a working OnlyFlix stream because of its former reputation.
  if (/^https:\/\//i.test(String(url))) return "onlyflix";
  const candidates = Array.isArray(alternatives) ? alternatives : [];
  return candidates.find((candidate) =>
    candidate?.id !== "onlyflix" && /^https:\/\//i.test(String(candidate?.url || ""))
  )?.id || initialProvider;
};
