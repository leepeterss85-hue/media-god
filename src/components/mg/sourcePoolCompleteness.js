const clean = (value) => String(value || "").trim();

const sourceUrl = (item) =>
  clean(
    item?.src ||
      item?.url ||
      item?.magnet ||
      item?.magnetLink
  );

const sourceTorrentHash = (item) => {
  const candidates = [
    item?.infoHash,
    item?.info_hash,
    item?.hash,
    item?.richMagnet,
    item?.magnet,
    item?.magnetLink,
    sourceUrl(item),
  ];

  for (const value of candidates) {
    const raw = clean(value);
    if (!raw) continue;

    const match = raw.match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i);
    const hash = clean(
      match?.[1] ||
        (/^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(raw) ? raw : "")
    ).toLowerCase();

    if (hash) return hash;
  }

  return "";
};

export const completeSourcePoolKey = (item) => {
  if (!item) return "";

  const hash = sourceTorrentHash(item);
  if (hash) {
    const fileIndex =
      item?.fileIdx ??
      item?.file_idx ??
      "";

    return `torrent:${hash}:${String(fileIndex)}`;
  }

  const url = sourceUrl(item);
  if (url) return `url:${url}`;

  const id = clean(item?.id);
  return id ? `id:${id}` : "";
};

const isRealSourceRow = (item) =>
  Boolean(
    item &&
      !item?.diagnostic &&
      String(item?.type || "").toLowerCase() !== "status"
  );

/*
 * Keep the already-published order so an active player never jumps source,
 * while replacing matching fast-start rows with the richer cache-annotated
 * versions and appending every canonical row that was not published yet.
 *
 * Buckets are arrays rather than a key -> item map. Several addons can expose
 * distinct rows with the same torrent/file identity; a map would silently
 * collapse those rows and can recreate the six-source selector regression.
 */
export const mergeCompleteSourcePool = (
  publishedSources,
  completeSources
) => {
  const published = (Array.isArray(publishedSources) ? publishedSources : [])
    .filter(Boolean);
  const complete = (Array.isArray(completeSources) ? completeSources : [])
    .filter(isRealSourceRow);

  if (complete.length === 0) {
    return published;
  }

  const buckets = new Map();

  complete.forEach((item, index) => {
    const key = completeSourcePoolKey(item);
    if (!key) return;

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }

    buckets.get(key).push({ item, index });
  });

  const usedCompleteIndexes = new Set();
  const restored = published
    .filter(isRealSourceRow)
    .map((item) => {
      const key = completeSourcePoolKey(item);
      const bucket = key ? buckets.get(key) : null;
      const replacement = bucket?.shift?.();

      if (!replacement) {
        return item;
      }

      usedCompleteIndexes.add(replacement.index);
      return replacement.item;
    });

  complete.forEach((item, index) => {
    if (!usedCompleteIndexes.has(index)) {
      restored.push(item);
    }
  });

  return restored;
};
