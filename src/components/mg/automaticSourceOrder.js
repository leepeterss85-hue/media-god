export const COMPATIBLE_AUTOPLAY_LIMIT = 3;

const entryIndex = (entry) =>
  Number.isFinite(Number(entry?.index))
    ? Number(entry.index)
    : Number.MAX_SAFE_INTEGER;

const compareCompatibleReadyEntries = (left, right) =>
  Number(left?.languageRank ?? 0) - Number(right?.languageRank ?? 0) ||
  Number(right?.compatibility || 0) - Number(left?.compatibility || 0) ||
  Number(Boolean(right?.trustedCached)) - Number(Boolean(left?.trustedCached)) ||
  Number(Boolean(right?.cached)) - Number(Boolean(left?.cached)) ||
  Number(right?.resolution || 0) - Number(left?.resolution || 0) ||
  entryIndex(left) - entryIndex(right);

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
    .sort(
      (left, right) =>
        Number(left?.languageRank ?? 0) - Number(right?.languageRank ?? 0) ||
        entryIndex(left) - entryIndex(right)
    );

  return [
    ...preferred,
    ...remaining,
  ];
};
