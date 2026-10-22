import { isFlixQuestEpisodeSource } from "./episodeSourcePolicy.js";
import { hasUnusableEpisodeAudio } from "./episodeAudio.js";

/*
 * Certain MediaFusion/ElfHosted links return a *playable two-minute error
 * video* ("Stream not found") with HTTP 200. A media element advancing and
 * emitting timeupdate is not proof that the requested episode is on screen.
 *
 * Require independent media/ready evidence before giving such a source
 * automatic episode ownership. Keep it available as a manual choice.
 * Do not generalise this rule to all torrents, all codecs or Live TV.
 */
export const isUnverifiedHostedEpisodeStream = item => {
  if (!item || isFlixQuestEpisodeSource(item)) return false;
  const provider = [
    item?.addon, item?.provider, item?.sourceName,
    item?.label, item?.name,
  ].filter(Boolean).join(" ");
  if (!/\bmedia\s*fusion\b|mediafusion/i.test(provider)) return false;
  const url = String(item?.src || item?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return false;
  if (item?.launchQualified === true ||
      item?.playbackVerified === true ||
      item?.runtimePlaybackVerified === true ||
      item?.verifiedEpisodePlayback === true ||
      item?.debridCached === true ||
      item?.runtimeReadyCached === true ||
      (item?.viaRealDebrid === true && item?.cacheRequired !== true &&
       item?.cometUncached !== true && item?.debridCacheChecked !== false)) return false;
  return true;
};

/** Never discard the source list: this is an *autoplay* gate only. */
export const episodeAutoplayCanTrustSource = item =>
  Boolean(item && !isUnverifiedHostedEpisodeStream(item));

export const rankEpisodeSourceChoices = entries => {
  const list = Array.isArray(entries) ? entries : [];
  const preferred = list.filter(entry =>
    isFlixQuestEpisodeSource(entry?.item) &&
    !hasUnusableEpisodeAudio(entry?.item) &&
    episodeAutoplayCanTrustSource(entry?.item));
  const alternatives = list.filter(entry =>
    !isFlixQuestEpisodeSource(entry?.item) &&
    episodeAutoplayCanTrustSource(entry?.item));
  const unverified = list.filter(entry =>
    isUnverifiedHostedEpisodeStream(entry?.item));
  const nonEnglishFlixQuest = list.filter(entry =>
    isFlixQuestEpisodeSource(entry?.item) &&
    hasUnusableEpisodeAudio(entry?.item));
  return [...alternatives, ...preferred, ...unverified, ...nonEnglishFlixQuest];
};
