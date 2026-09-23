export const COMPATIBLE_AUTOPLAY_LIMIT = 3;

const entryIndex = (entry) =>
  Number.isFinite(Number(entry?.index))
    ? Number(entry.index)
    : Number.MAX_SAFE_INTEGER;

const effectiveCompatibilityTier = (entry) =>
  entry?.provenWorking === true && Number(entry?.compatibilityTier ?? 2) <= 1
    ? 0
    : Number(entry?.compatibilityTier ?? 2);

const compareLegacyEntries = (left, right) =>
  effectiveCompatibilityTier(left) - effectiveCompatibilityTier(right) ||
  Number(left?.languageRank ?? 0) - Number(right?.languageRank ?? 0) ||
  Number(left?.hardSubtitleRank ?? 0) - Number(right?.hardSubtitleRank ?? 0) ||
  Number(Boolean(right?.successfulPlayback)) - Number(Boolean(left?.successfulPlayback)) ||
  Number(Boolean(right?.provenWorking)) - Number(Boolean(left?.provenWorking)) ||
  Number(Boolean(right?.trustedCached)) - Number(Boolean(left?.trustedCached)) ||
  Number(Boolean(right?.cached)) - Number(Boolean(left?.cached)) ||
  Number(right?.compatibility || 0) - Number(left?.compatibility || 0) ||
  Number(right?.resolution || 0) - Number(left?.resolution || 0) ||
  entryIndex(left) - entryIndex(right);

const compareSmartEntries = (left, right) =>
  Number(left?.languageRank ?? 3) - Number(right?.languageRank ?? 3) ||
  Number(left?.hardSubtitleRank ?? 0) - Number(right?.hardSubtitleRank ?? 0) ||
  effectiveCompatibilityTier(left) - effectiveCompatibilityTier(right) ||
  Number(Boolean(right?.successfulPlayback)) - Number(Boolean(left?.successfulPlayback)) ||
  Number(Boolean(right?.provenWorking)) - Number(Boolean(left?.provenWorking)) ||
  Number(Boolean(right?.trustedCached)) - Number(Boolean(left?.trustedCached)) ||
  Number(Boolean(right?.cached)) - Number(Boolean(left?.cached)) ||
  // Codec playability is decided above; audio quality only breaks ties after it.
  Number(left?.releaseTierRank ?? 6) - Number(right?.releaseTierRank ?? 6) ||
  Number(left?.audioTierRank ?? 4) - Number(right?.audioTierRank ?? 4) ||
  Number(right?.compatibility || 0) - Number(left?.compatibility || 0) ||
  Number(right?.resolution || 0) - Number(left?.resolution || 0) ||
  entryIndex(left) - entryIndex(right);

const compareCompatibleReadyEntries = (left, right) =>
  left?.smartRankingEnabled === false &&
  right?.smartRankingEnabled === false
    ? compareLegacyEntries(left, right)
    : compareSmartEntries(left, right);

export const prioritiseCompatibleAutoplayEntries = (
  entries,
  limit = COMPATIBLE_AUTOPLAY_LIMIT
) => {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const maximum = Math.max(0, Number(limit || 0));

  if (maximum === 0 || list.length < 2) return list;

  const preferred = list
    .filter((entry) => entry?.autoplayReady === true)
    .sort(compareCompatibleReadyEntries)
    .slice(0, maximum);

  if (preferred.length === 0) return list;

  const preferredIndexes = new Set(preferred.map(entryIndex));

  const remaining = list
    .filter((entry) => !preferredIndexes.has(entryIndex(entry)))
    .sort(compareCompatibleReadyEntries);

  return [
    ...preferred,
    ...remaining,
  ];
};
