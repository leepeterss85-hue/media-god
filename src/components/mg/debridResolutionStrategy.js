const trackerPattern = /(?:[?&])tr=/i;

export const debridTorrentHasMetadata = (item) => {
  if (!item) return false;

  const torrentTrackers = Array.isArray(item?.torrentTrackers)
    ? item.torrentTrackers.filter(Boolean)
    : [];

  if (torrentTrackers.length > 0) {
    return true;
  }

  return [
    item?.richMagnet,
    item?.magnet,
    item?.magnetLink,
    item?.src,
    item?.url,
  ].some((value) => trackerPattern.test(String(value || "")));
};

export const chooseDebridResolutionStrategy = (
  item,
  { debridCached = false } = {}
) => {
  const existingStrategy = String(item?.resolutionStrategy || "").trim();

  if (debridCached) {
    return "cached_debrid";
  }

  if (
    existingStrategy === "rd_magnet" ||
    debridTorrentHasMetadata(item)
  ) {
    return "rd_magnet";
  }

  if (item?.cometUncached === true) {
    return "comet_uncached";
  }

  return existingStrategy || "rd_magnet";
};
