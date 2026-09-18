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

export const sourceHasAuthoritativeCachedSignal = (item) =>
  item?.debridCached === true ||
  item?.runtimeReadyCached === true;

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
