import { getPlaybackDeviceProfile } from "./mediaCompatibility";

// The Fire Stick's main Play button must enter the same selectable web-scraper
// player available from source cards. OnlyFlix's obsolete CDN embed is
// automatically skipped in that player on Fire TV; the other scraper tabs,
// remote controls, fullscreen and explicit Sources button remain available.
// Native VLC still owns resolved DIRECT media from the Sources handoff.
// Phone, desktop and Live TV never enter this Fire TV-only route.
export const launchFireTvCardPlay = (player, media) => {
  if (!getPlaybackDeviceProfile().nativeFireTv) return false;
  const type = String(media?.mediaType || media?.type || "").toLowerCase();
  if (!(type === "movie" || type === "tv" || type === "series")) return false;

  const scraperMedia = {
    ...media,
    mediaType: type === "series" ? "tv" : type,
    type: type === "series" ? "series" : type,
  };

  // Never pass an OnlyFlix/VidCore webpage URL to LibVLC: web providers
  // require their own iframe/player with the user's manual scraper selector.
  if (typeof player?.playOnlyFlix === "function" &&
      player.playOnlyFlix(scraperMedia)) return true;
  if (typeof player?.playVidCore === "function" &&
      player.playVidCore(scraperMedia)) return true;

  // Missing embed IDs: retain the already working direct-file discovery path.
  if (typeof player?.play !== "function") return false;
  void player.play({
    ...scraperMedia,
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
