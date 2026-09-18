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
    (
      item?.debridCacheChecked === true &&
      item?.debridCached !== true
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

const sourcePlaybackUrl = (item) =>
  clean(
    item?.src ||
      item?.url ||
      item?.stream_url ||
      item?.streamUrl ||
      item?.magnet ||
      item?.magnetLink
  );

const sourcePlaybackHash = (item) => {
  const raw = clean(
    item?.infoHash ||
      item?.info_hash ||
      item?.hash ||
      item?.richMagnet ||
      item?.magnet ||
      item?.magnetLink ||
      item?.src ||
      item?.url
  );

  return raw.match(/(?:btih:)?([a-f0-9]{40}|[a-f0-9]{64})/i)?.[1]?.toLowerCase() || "";
};

export const sourcePlaybackKey = (item) => {
  if (!item) return "";

  const hash = sourcePlaybackHash(item);
  if (hash) {
    return `torrent:${hash}:${clean(item?.fileIdx ?? item?.file_idx)}`;
  }

  const url = sourcePlaybackUrl(item);
  if (url) return `url:${url}`;

  const id = clean(item?.id);
  return id ? `id:${id}` : "";
};

export const sourceRequiresPreparation = (item) => {
  if (!item) return false;
  if (sourceHasPendingCacheSignal(item)) return true;
  if (sourceHasAuthoritativeCachedSignal(item)) return false;

  const url = sourcePlaybackUrl(item);
  const type = clean(item?.type).toLowerCase();
  const torrentLike =
    type === "rd" ||
    type === "rd_torrent" ||
    type === "torrent" ||
    type === "magnet" ||
    /^magnet:/i.test(url) ||
    Boolean(sourcePlaybackHash(item));

  return !(
    item?.viaRealDebrid === true &&
    /^https?:\/\//i.test(url)
  ) && torrentLike;
};

export const sourceIsImmediatelyReady = (item) => {
  if (!item || sourceRequiresPreparation(item)) return false;
  if (sourceHasAuthoritativeCachedSignal(item)) return true;

  const url = sourcePlaybackUrl(item);

  return (
    item?.viaRealDebrid === true ||
    item?.live === true ||
    clean(item?.type).toLowerCase() === "live" ||
    /^(?:https?:|blob:|data:)/i.test(url)
  );
};

export const promoteReadySourceOverPending = ({
  stable,
  ranked,
  lockedUrl = "",
} = {}) => {
  const stableSources = Array.isArray(stable) ? stable.filter(Boolean) : [];
  const rankedSources = Array.isArray(ranked) ? ranked.filter(Boolean) : [];

  if (
    stableSources.length < 2 ||
    clean(lockedUrl) ||
    !sourceRequiresPreparation(stableSources[0])
  ) {
    return stableSources;
  }

  const readyCandidate = rankedSources.find(sourceIsImmediatelyReady);
  if (!readyCandidate) return stableSources;

  const wantedKey = sourcePlaybackKey(readyCandidate);
  const readyIndex = stableSources.findIndex(
    (item) =>
      item === readyCandidate ||
      (wantedKey && sourcePlaybackKey(item) === wantedKey)
  );

  if (readyIndex <= 0) return stableSources;

  const promoted = stableSources.slice();
  const [ready] = promoted.splice(readyIndex, 1);
  promoted.unshift(ready);
  return promoted;
};
