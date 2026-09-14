let nativeCodecInfoCache = null;

const bridge = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = window.MediaGodNative;

  if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) {
    return null;
  }

  return candidate;
};

export const isNativeFireTvPlayerAvailable = () => {
  const native = bridge();
  return Boolean(native && typeof native.play === "function");
};

export const nativeFireTvDisplayInfo = () => {
  const native = bridge();

  if (!native || typeof native.getDisplayInfo !== "function") {
    return null;
  }

  try {
    const value = native.getDisplayInfo();
    return typeof value === "string" ? JSON.parse(value) : value || null;
  } catch {
    return null;
  }
};

export const nativeFireTvAppInfo = () => {
  const native = bridge();

  if (!native || typeof native.getAppInfo !== "function") {
    return null;
  }

  try {
    const value = native.getAppInfo();
    return typeof value === "string" ? JSON.parse(value) : value || null;
  } catch {
    return null;
  }
};

export const nativeFireTvCodecInfo = () => {
  if (nativeCodecInfoCache) {
    return nativeCodecInfoCache;
  }

  const native = bridge();

  if (!native || typeof native.getCodecInfo !== "function") {
    return null;
  }

  try {
    const value = native.getCodecInfo();
    const parsed = typeof value === "string" ? JSON.parse(value) : value || null;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    nativeCodecInfoCache = {
      video: Array.isArray(parsed.video) ? parsed.video.map(String) : [],
      audio: Array.isArray(parsed.audio) ? parsed.audio.map(String) : [],
    };

    return nativeCodecInfoCache;
  } catch {
    return null;
  }
};

export const nativeFireTvSelfUpdateAvailable = () => {
  const native = bridge();
  return Boolean(native && typeof native.startUpdate === "function");
};

export const nativeFireTvExitAvailable = () => {
  const native = bridge();
  return Boolean(native && typeof native.exitApp === "function");
};

export const exitNativeFireTvApp = () => {
  const native = bridge();

  if (!native || typeof native.exitApp !== "function") {
    return false;
  }

  try {
    const result = native.exitApp();
    return result !== false && result !== "false" && result !== "error";
  } catch {
    return false;
  }
};

export const startNativeFireTvUpdate = ({ url, versionName = "" }) => {
  const native = bridge();
  const target = String(url || "").trim();

  if (
    !native ||
    typeof native.startUpdate !== "function" ||
    !/^https?:\/\//i.test(target)
  ) {
    return "error";
  }

  try {
    const result = native.startUpdate(target, String(versionName || ""));
    return String(result || "error").trim().toLowerCase();
  } catch {
    return "error";
  }
};

export const openNativeFireTvExternalUrl = (url) => {
  const native = bridge();
  const target = String(url || "").trim();

  if (!native || typeof native.openExternalUrl !== "function" || !/^https?:\/\//i.test(target)) {
    return false;
  }

  try {
    const result = native.openExternalUrl(target);
    return result !== false && result !== "false" && result !== "error";
  } catch {
    return false;
  }
};

const positiveWholeNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
};

const episodeNumbersFromTitle = (title) => {
  const text = String(title || "");
  const match = text.match(/(?:^|\b)S(\d{1,3})E(\d{1,4})(?:\b|$)/i);

  return {
    season: positiveWholeNumber(match?.[1]),
    episode: positiveWholeNumber(match?.[2]),
  };
};

export const playNativeFireTv = ({
  requestId,
  url,
  title = "",
  poster = "",
  startPositionMs = 0,
  live = false,
  headers = {},
  mimeType = "",
  drm = null,
  audioLanguage = "en",
  subtitleLanguage = "en",
  subtitlesEnabled = true,
  subtitles = [],
  sources = [],
  activeSourceIndex = 0,
}) => {
  const native = bridge();
  const streamUrl = String(url || "").trim();

  if (!native || !/^https?:\/\//i.test(streamUrl)) {
    return false;
  }

  const playerContext =
    typeof window !== "undefined" &&
    window.__MG_PLAYER_CONTEXT__ &&
    typeof window.__MG_PLAYER_CONTEXT__ === "object"
      ? window.__MG_PLAYER_CONTEXT__
      : {};

  const titleEpisode = episodeNumbersFromTitle(title);
  const contextSeason = positiveWholeNumber(
    playerContext?.season ?? playerContext?.rdSeason
  );
  const contextEpisode = positiveWholeNumber(
    playerContext?.episode ?? playerContext?.rdEpisode
  );
  const season = contextSeason || titleEpisode.season;
  const episode = contextEpisode || titleEpisode.episode;

  const rawMediaType = String(
    playerContext?.mediaType || playerContext?.type || ""
  )
    .trim()
    .toLowerCase();

  const looksLikeTvEpisode =
    rawMediaType === "tv" ||
    rawMediaType === "series" ||
    season > 0 ||
    episode > 0 ||
    (titleEpisode.season > 0 && titleEpisode.episode > 0);

  const mediaType = looksLikeTvEpisode ? "tv" : rawMediaType;
  const tmdbId = positiveWholeNumber(
    playerContext?.tmdbId ??
      playerContext?.tmdb_id ??
      playerContext?.id
  );

  /*
   * Do not hide Season / Episode just because one browser-context field is
   * missing. Fire TV already knows how to return to Media God's existing
   * season/episode picker. A clearly identified TV episode is enough to show
   * those two native menu entries; TMDB id is useful metadata, not a gate.
   */
  const canChooseEpisode =
    !live &&
    looksLikeTvEpisode &&
    season > 0 &&
    episode > 0;

  if (typeof window !== "undefined" && canChooseEpisode) {
    window.__MG_PLAYER_CONTEXT__ = {
      ...playerContext,
      mediaType: "tv",
      season,
      episode,
      ...(tmdbId > 0 ? { tmdbId } : {}),
    };
  }

  const payload = {
    requestId: String(requestId || `${Date.now()}`),
    url: streamUrl,
    title: String(title || ""),
    poster: String(poster || ""),
    startPositionMs: Math.max(0, Number(startPositionMs || 0)),
    live: Boolean(live),
    mediaType,
    tmdbId,
    season,
    episode,
    canChooseEpisode,
    headers:
      headers && typeof headers === "object" && !Array.isArray(headers)
        ? headers
        : {},
    mimeType: String(mimeType || "").trim(),
    drm:
      drm && typeof drm === "object" && !Array.isArray(drm)
        ? {
            scheme: String(drm?.scheme || "widevine").trim(),
            licenseUrl: String(drm?.licenseUrl || drm?.license_url || "").trim(),
            headers:
              drm?.headers && typeof drm.headers === "object" && !Array.isArray(drm.headers)
                ? drm.headers
                : {},
          }
        : null,
    audioLanguage: String(audioLanguage || "en"),
    subtitleLanguage: String(subtitleLanguage || "en"),
    subtitlesEnabled: Boolean(subtitlesEnabled),
    subtitles: Array.isArray(subtitles)
      ? subtitles
          .map((track) => ({
            url: String(track?.url || track?.src || "").trim(),
            language: String(track?.language || track?.lang || "").trim(),
            label: String(track?.label || track?.name || "").trim(),
            mimeType: String(track?.mimeType || track?.mime_type || "").trim(),
          }))
          .filter((track) => /^https?:\/\//i.test(track.url))
          .slice(0, 20)
      : [],
    sources: Array.isArray(sources)
      ? sources.map((item, index) => ({
          label: String(
            item?.label || item?.name || item?.sourceName || `Source ${index + 1}`
          )
            .replace(/\s+/g, " ")
            .trim(),
          sourceName: String(item?.sourceName || "").replace(/\s+/g, " ").trim(),
          url: String(item?.url || item?.src || item?.magnet || item?.magnetLink || "").trim(),
          mimeType: String(item?.mimeType || item?.mime_type || "").trim(),
          drm:
            item?.drm && typeof item.drm === "object" && !Array.isArray(item.drm)
              ? {
                  scheme: String(item.drm?.scheme || "widevine").trim(),
                  licenseUrl: String(item.drm?.licenseUrl || item.drm?.license_url || "").trim(),
                  headers:
                    item.drm?.headers &&
                    typeof item.drm.headers === "object" &&
                    !Array.isArray(item.drm.headers)
                      ? item.drm.headers
                      : {},
                }
              : null,
          webIndex: Number.isFinite(Number(item?.webIndex))
            ? Number(item.webIndex)
            : index,
          headers:
            item?.headers &&
            typeof item.headers === "object" &&
            !Array.isArray(item.headers)
              ? item.headers
              : item?.requestHeaders &&
                  typeof item.requestHeaders === "object" &&
                  !Array.isArray(item.requestHeaders)
                ? item.requestHeaders
                : {},
        }))
      : [],
    activeSourceIndex: Math.max(0, Number(activeSourceIndex || 0)),
  };

  try {
    const result = native.play(JSON.stringify(payload));
    const status = String(result ?? "").trim().toLowerCase();

    return (
      result !== false &&
      status !== "" &&
      status !== "false" &&
      status !== "error" &&
      status !== "busy"
    );
  } catch {
    return false;
  }
};
