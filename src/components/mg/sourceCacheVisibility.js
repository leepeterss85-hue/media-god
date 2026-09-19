const clean = (value) => String(value || "").trim();

const normaliseState = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const PENDING_CACHE_STATES = new Set([
  "uncached",
  "not_cached",
  "cache_required",
  "pending",
  "preparing",
  "queued",
  "magnet_conversion",
  "waiting_files_selection",
  "downloading",
  "compressing",
  "uploading",
]);

const PENDING_CACHE_STRATEGIES = new Set([
  "comet_uncached",
  "rd_magnet",
]);

const sourceCacheText = (item) =>
  [
    item?.label,
    item?.name,
    item?.title,
    item?.description,
    item?.cacheLabel,
    item?.cache_label,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

const CACHED_CACHE_STATES = new Set([
  "cached",
  "ready",
  "downloaded",
  "instant",
  "instantly_available",
]);

export const sourceHasAuthoritativeCachedSignal = (item) => {
  if (!item) return false;

  if (
    item?.debridCached === true ||
    item?.runtimeReadyCached === true ||
    item?.cached === true ||
    item?.isCached === true ||
    item?.instant === true
  ) {
    return true;
  }

  const states = [
    item?.debridCacheCheckState,
    item?.cacheStatus,
    item?.cache_status,
    item?.cacheState,
    item?.cache_state,
    item?.torrentStatus,
    item?.torrent_status,
    item?.rdStatus,
    item?.rd_status,
  ].map(normaliseState);

  if (states.some((state) => CACHED_CACHE_STATES.has(state))) {
    return true;
  }

  const text = sourceCacheText(item);
  return (
    /\[\s*RD\s*(?:\+|⚡|✅)\s*\]/i.test(text) ||
    /\b(?:real[\s_-]*debrid|RD)\b[^\n]{0,40}\b(?:cached|instant(?:ly)?[\s_-]*available)\b/i.test(
      text
    )
  );
};

export const sourceHasPendingCacheSignal = (item, strategy = "") => {
  if (!item || sourceHasAuthoritativeCachedSignal(item)) {
    return false;
  }

  if (
    item?.cacheRequired === true ||
    item?.cometUncached === true ||
    normaliseState(item?.debridCacheCheckState) === "uncached" ||
    (
      item?.debridCacheChecked === true &&
      item?.debridCached === false
    )
  ) {
    return true;
  }

  const resolutionStrategy = normaliseState(
    strategy ||
      item?.resolutionStrategy ||
      item?.resolution_strategy
  );

  if (PENDING_CACHE_STRATEGIES.has(resolutionStrategy)) {
    return true;
  }

  const states = [
    item?.cacheStatus,
    item?.cache_status,
    item?.cacheState,
    item?.cache_state,
    item?.torrentStatus,
    item?.torrent_status,
    item?.rdStatus,
    item?.rd_status,
  ].map(normaliseState);

  if (states.some((state) => PENDING_CACHE_STATES.has(state))) {
    return true;
  }

  const text = sourceCacheText(item);

  return (
    /\[\s*RD\s*⬇(?:\uFE0F)?\s*\]/i.test(text) ||
    /\buncached\b|\bnot[\s_-]+cached\b|\bcache[\s_-]+required\b/i.test(text) ||
    /\b(?:real[\s_-]*debrid|RD)[\s_-]+(?:download|downloading|preparing|queued)\b/i.test(
      text
    )
  );
};

/*
 * A row is only counted as cached when Media God has a positive cache/ready
 * signal, or when it is an already-resolved Real-Debrid library/direct row.
 * Merely travelling through Real-Debrid is not enough: Comet uncached rows also
 * carry viaRealDebrid=true while cacheRequired/cometUncached is still true.
 */
export const sourceIsConfirmedCachedForPlayback = (item) => {
  if (!item) return false;

  if (sourceHasAuthoritativeCachedSignal(item)) {
    return true;
  }

  if (sourceHasPendingCacheSignal(item)) {
    return false;
  }

  return item?.viaRealDebrid === true;
};
