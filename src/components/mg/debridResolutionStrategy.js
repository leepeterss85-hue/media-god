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

  /*
   * A Comet [RD⬇] row can contain a magnet that Media God enriched only with
   * generic public fallback trackers. Those trackers are useful as a last
   * resort, but they are not the torrent-specific metadata Comet uses for its
   * own playback endpoint. Preserve the explicit comet_uncached strategy in
   * that case so the device can ask Comet to start the exact torrent and then
   * adopt the resulting Real-Debrid job by info hash.
   */
  if (
    existingStrategy === "comet_uncached" &&
    item?.torrentMetadataSource === "public_fallback"
  ) {
    return "comet_uncached";
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
