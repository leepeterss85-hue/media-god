let nativeCodecInfoCache = null;

const bridge = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = window.MediaGodNative;

  if (!candidate || typeof candidate.play !== "function") {
    return null;
  }

  return candidate;
};

export const isNativeFireTvPlayerAvailable = () => Boolean(bridge());

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

  const payload = {
    requestId: String(requestId || `${Date.now()}`),
    url: streamUrl,
    title: String(title || ""),
    poster: String(poster || ""),
    startPositionMs: Math.max(0, Number(startPositionMs || 0)),
    live: Boolean(live),
    headers:
      headers && typeof headers === "object" && !Array.isArray(headers)
        ? headers
        : {},
    mimeType: String(mimeType || "").trim(),
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
