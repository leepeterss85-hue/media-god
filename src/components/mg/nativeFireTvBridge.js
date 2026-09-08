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
  };

  try {
    const result = native.play(JSON.stringify(payload));

    return result !== false && result !== "false" && result !== "error";
  } catch {
    return false;
  }
};
