const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

export const sourceProviderIdentityText = (item) =>
  [
    item?.addon,
    item?.sourceName,
    item?.source_name,
    item?.providerName,
    item?.provider,
    item?.debridProvider,
    item?.label,
    item?.name,
    item?.title,
    item?.description,
    item?.src,
    item?.url,
    item?.magnet,
    item?.magnetLink,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

export const sourceIsAioStreamsCandidate = (item) =>
  /(?:\baio\s*streams?\b|aiostreams(?:\.elfhosted\.com)?)/i.test(
    sourceProviderIdentityText(item)
  );

export const sourceLooksTorrentLike = (item) => {
  if (!item) return false;

  const type = clean(item?.type).toLowerCase();
  if (["rd", "rd_torrent", "torrent", "magnet"].includes(type)) {
    return true;
  }

  if (
    item?.debridCached === true ||
    item?.runtimeReadyCached === true ||
    item?.cacheRequired === true
  ) {
    return true;
  }

  const torrentIdentity = [
    item?.infoHash,
    item?.info_hash,
    item?.magnet,
    item?.magnetLink,
    item?.richMagnet,
    item?.src,
    item?.url,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

  return (
    /magnet:\?xt=urn:btih:/i.test(torrentIdentity) ||
    /\b[a-f0-9]{40}\b/i.test(torrentIdentity) ||
    /\b[a-f0-9]{64}\b/i.test(torrentIdentity)
  );
};
