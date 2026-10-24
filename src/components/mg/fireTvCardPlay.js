import { getPlaybackDeviceProfile } from "./mediaCompatibility";

// The native Fire Stick launches a VOD title through the same source-card
// discovery and VLC playback pipeline used by manually selected direct files.
// No iframe is started automatically. Manual web scraper tabs remain available
// through the existing player/source views; mobile, desktop and Live TV opt out.
export const launchFireTvCardPlay = (player, media) => {
  if (typeof player?.play !== "function" ||
      !getPlaybackDeviceProfile().nativeFireTv) return false;
  const type = String(media?.mediaType || media?.type || "").toLowerCase();
  if (!(type === "movie" || type === "tv" || type === "series")) return false;

  void player.play({
    ...media,
    preferRd: true,
    verifiedPlaybackPolicy: "strict",
    noRd: false,
    skipRdLookup: false,
    skipAddonLookup: false,
    sources: [],
    completeSources: [],
    discoveredSources: [],
    src: "",
    url: "",
    video_url: "",
  });
  return true;
};
