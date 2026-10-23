/**
 * Pure ordering for film and exact-episode fallback. Only reached after a
 * confirmed iframe load failure, explicit "Try next", or no ready embed.
 * Loading an iframe does NOT prove that video playback has started.
 */
export const WEB_FALLBACK_LOAD_TIMEOUT_MS = 30000;

export const nextWebFallback = (options, active, allowVyla = false, skipIds = []) => {
  if (active === "vyla") return "torrents";
  const rows = Array.isArray(options) ? options.filter((entry) => entry?.id && entry?.url) : [];
  const skip = new Set(skipIds);
  const index = rows.findIndex((entry) => entry.id === active);
  const next = rows.slice(index < 0 ? 0 : index + 1).find((entry) => !skip.has(entry.id));
  return next?.id || (allowVyla ? "vyla" : "torrents");
};

export const mediaForTorrentFallback = (media = {}) => {
  const type = media.mediaType === "tv" ? "tv" : "movie";
  return {
    ...media,
    mediaType: type,
    type: type === "tv" ? "series" : "movie",
    season: type === "tv" ? media.season ?? media.rdSeason : undefined,
    episode: type === "tv" ? media.episode ?? media.rdEpisode : undefined,
    rdSeason: type === "tv" ? media.season ?? media.rdSeason : undefined,
    rdEpisode: type === "tv" ? media.episode ?? media.rdEpisode : undefined,
    sources: [],
    completeSources: [],
    discoveredSources: [],
    src: "",
    url: "",
    video_url: "",
    skipRdLookup: false,
    skipAddonLookup: false,
    noRd: false,
    preferRd: true,
    verifiedPlaybackPolicy: "strict",
  };
};
