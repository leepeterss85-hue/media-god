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

  const mediaType = String(playerContext?.mediaType || "")
    .trim()
    .toLowerCase();
  const tmdbId = Number(playerContext?.tmdbId || 0);
  const season = Number(playerContext?.season || 0);
  const episode = Number(playerContext?.episode || 0);
  const canChooseEpisode =
    !live &&
    mediaType === "tv" &&
    Number.isFinite(tmdbId) &&
    tmdbId > 0 &&
    Number.isInteger(season) &&
    season > 0 &&
    Number.isInteger(episode) &&
    episode > 0;

  const payload = {
    requestId: String(requestId || `${Date.now()}`),
    url: streamUrl,
    title: String(title || ""),
    poster: String(poster || ""),
    startPositionMs: Math.max(0, Number(startPositionMs || 0)),
    live: Boolean(live),
    mediaType,
    tmdbId:
      Number.isFinite(tmdbId) && tmdbId > 0
        ? tmdbId
        : 0,
    season:
      Number.isInteger(season) && season > 0
        ? season
        : 0,
    episode:
      Number.isInteger(episode) && episode > 0
        ? episode
        : 0,
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
