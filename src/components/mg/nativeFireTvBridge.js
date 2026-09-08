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

export const playNativeFireTv = ({
  requestId,
  url,
  title = "",
  poster = "",
  startPositionMs = 0,
  live = false,
  headers = {},
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
  };

  try {
    const result = native.play(JSON.stringify(payload));

    return result !== false && result !== "false" && result !== "error";
  } catch {
    return false;
  }
};
