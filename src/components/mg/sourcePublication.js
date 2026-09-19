/*
 * Merge a growing discovery result into an already-published source list
 * without renumbering entries the player has seen.
 *
 * A source identity is not necessarily unique. Several valid addon rows can
 * share one torrent hash/file index while carrying different provider URLs,
 * labels, or playback metadata. Treat identity matches as occurrences, not as
 * a Set: consume one incoming occurrence for each published occurrence, then
 * append every unconsumed incoming row.
 */
export const preservePublishedSourceOrder = (
  published,
  incoming,
  keyFor,
  options = {}
) => {
  const previous = Array.isArray(published)
    ? published.filter((item) => item && !item?.diagnostic)
    : [];
  const next = Array.isArray(incoming)
    ? incoming.filter(Boolean)
    : [];

  if (previous.length === 0) return next;
  if (next.length === 0) return previous;

  const sourceKey =
    typeof keyFor === "function"
      ? keyFor
      : () => "";

  const retainSurplusPublished =
    options?.retainSurplusPublished === true;

  const nextIndexesByKey = new Map();

  next.forEach((item, index) => {
    const key = String(sourceKey(item) || "");
    if (!key) return;

    const indexes = nextIndexesByKey.get(key) || [];
    indexes.push(index);
    nextIndexesByKey.set(key, indexes);
  });

  const nextCursorByKey = new Map();
  const consumedNextIndexes = new Set();
  const stable = [];

  previous.forEach((item) => {
    const key = String(sourceKey(item) || "");
    const indexes = key
      ? nextIndexesByKey.get(key)
      : null;
    const cursor = key
      ? Number(nextCursorByKey.get(key) || 0)
      : 0;

    if (indexes && cursor < indexes.length) {
      const nextIndex = indexes[cursor];
      nextCursorByKey.set(key, cursor + 1);
      consumedNextIndexes.add(nextIndex);
      stable.push(next[nextIndex]);
      return;
    }

    /*
     * The comprehensive result is authoritative for the number of occurrences
     * of an identity it contains. Drop only surplus stale published copies.
     * Rows whose identity vanished entirely remain available as safe fallbacks.
     */
    if (
      key &&
      nextIndexesByKey.has(key) &&
      !retainSurplusPublished
    ) {
      return;
    }

    stable.push(item);
  });

  next.forEach((item, index) => {
    if (!consumedNextIndexes.has(index)) {
      stable.push(item);
    }
  });

  return stable;
};
