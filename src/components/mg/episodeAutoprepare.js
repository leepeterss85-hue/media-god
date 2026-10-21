import { episodeAudioRank, hasUnusableEpisodeAudio } from "./episodeAudio.js";
import { episodeSourceMatchesRequest } from "./episodeSourcePolicy.js";
import { episodeAutoplayCanTrustSource } from "./episodeLaunchTrust.js";
import { sourceHasAuthoritativeCachedSignal } from "./sourceCacheVisibility.js";
import { sourceIsAioStreamsCandidate } from "./sourceProviderIdentity.js";

const clean = value => String(value || "").trim();
const hashOf = source => {
  for (const candidate of [
    source?.infoHash, source?.info_hash, source?.hash,
    source?.richMagnet, source?.magnet, source?.magnetLink, source?.src, source?.url,
  ]) {
    const raw = clean(candidate);
    const hash = raw.match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i)?.[1] ||
      (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(raw) ? raw : "");
    if (hash) return hash.toLowerCase();
  }
  return "";
};

/*
 * A failed cached-only RD qualification must not leave an episode sitting on a
 * status card while matching torrents are available manually. Take a *real
 * torrent identity*, not a provider-created HTTP 200 placeholder/error clip,
 * and let the existing foreground RD engine confirm/cache the exact file.
 *
 * This is an attempt to PREPARE the episode, not a claim that an uncached
 * release is instantly playable. The complete source pool is unchanged.
 */
export function episodeAutoprepareCandidates(sources, { season, episode } = {}) {
  return (Array.isArray(sources) ? sources : [])
    .map((item, index) => ({ item, index, hash: hashOf(item) }))
    .filter(({ item, hash }) =>
      item && hash && !item.diagnostic &&
      !["provider", "external", "youtube", "status"].includes(String(item.type || "").toLowerCase()) &&
      episodeSourceMatchesRequest(item, { season, episode }) &&
      episodeAutoplayCanTrustSource(item) &&
      !hasUnusableEpisodeAudio(item)
    )
    .sort((a, b) =>
      Number(sourceHasAuthoritativeCachedSignal(b.item)) -
        Number(sourceHasAuthoritativeCachedSignal(a.item)) ||
      Number(sourceIsAioStreamsCandidate(a.item)) -
        Number(sourceIsAioStreamsCandidate(b.item)) ||
      episodeAudioRank(a.item) - episodeAudioRank(b.item) ||
      a.index - b.index
    )
    .map(({ item, hash }) => {
      const rawMagnet = [
        item.richMagnet, item.magnet, item.magnetLink, item.src, item.url,
      ].find(value => /^magnet:/i.test(clean(value)));
      const magnet = clean(rawMagnet) || `magnet:?xt=urn:btih:${hash}`;
      return {
        ...item,
        // The fallback must go through Media God's Real-Debrid preparation,
        // not blindly open a provider-hosted HTTP placeholder/error movie.
        type: "torrent",
        magnet,
        src: magnet,
        url: magnet,
        episodeAutoPrepare: true,
      };
    });
}
