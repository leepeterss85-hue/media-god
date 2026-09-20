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

const keepQualifiedPlaybackFields = (published, complete) => {
  if (published?.launchQualified !== true) {
    return complete;
  }

  /*
   * The complete discovery row contains richer cache/addon metadata, but it
   * must never overwrite the already-qualified direct URL, media inspection,
   * file identity or audio-rescue decision that made autoplay safe.
   */
  return {
    ...complete,
    ...published,
    launchQualified: true,
  };
};

/*
 * Keep the already-published order so an active player never jumps source,
 * while replacing matching fast-start rows with richer cache-annotated
 * versions and appending every canonical row that was not published yet.
 *
 * When strict launch qualification is active and no verified row exists yet,
 * retain the diagnostic/status row at index zero. That creates a hard barrier:
 * complete/unverified rows stay visible to the chooser but cannot silently
 * become the automatic active source.
 */
export const mergeCompleteSourcePool = (
  publishedSources,
  completeSources,
  options = {}
) => {
  const published = (Array.isArray(publishedSources) ? publishedSources : [])
    .filter(Boolean);
  const publishedReal = published.filter(isRealSourceRow);
  const publishedStatus = published.filter((item) => !isRealSourceRow(item));
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
  const restored = publishedReal.map((item) => {
    const key = completeSourcePoolKey(item);
    const bucket = key ? buckets.get(key) : null;
    const replacement = bucket?.shift?.();

    if (!replacement) {
      return item;
    }

    usedCompleteIndexes.add(replacement.index);
    return keepQualifiedPlaybackFields(
      item,
      replacement.item
    );
  });

  complete.forEach((item, index) => {
    if (!usedCompleteIndexes.has(index)) {
      restored.push(item);
    }
  });

  const pinWaitingStatus =
    options?.preservePublishedStatus === true &&
    publishedReal.length === 0 &&
    publishedStatus.length > 0;

  return pinWaitingStatus
    ? [
        ...publishedStatus,
        ...restored,
      ]
    : restored;
};
