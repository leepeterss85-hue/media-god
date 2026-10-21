// History outlives signed CDN links. Resolve durable torrent identity again
// instead of handing yesterday's stream URL to the video element.
export function restoreResumeSource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = { ...value };
  const magnet = [source.magnet, source.magnetLink, source.richMagnet, source.src, source.url]
    .find((candidate) => /^magnet:\?/i.test(String(candidate || "")));
  const hash = String(source.infoHash || source.info_hash || "").trim();
  const durableUrl = magnet || (/^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(hash)
    ? `magnet:?xt=urn:btih:${hash}` : "");
  const torrentId = String(source.rdTorrentId || source.torrentId || "").trim();
  if (durableUrl || torrentId) {
    source.src = durableUrl || torrentId;
    source.url = source.src;
    if (durableUrl) source.magnet = durableUrl;
    else source.rdTorrentId = torrentId;
    source.type = durableUrl ? "torrent" : "rd_torrent";
    // Qualification and cache state must be established for this launch.
    delete source.launchQualified;
    delete source.debridCached;
    delete source.cacheRequired;
    delete source.cometUncached;
  }
  return source;
}
