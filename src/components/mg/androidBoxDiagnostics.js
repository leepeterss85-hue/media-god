/**
 * Privacy-safe, device-local support counters. No tokens, private URLs,
 * titles, error messages, user IDs or stack traces are collected or stored.
 * Nothing is uploaded: counters exist only in the current page memory and
 * appear only when the viewer chooses "Copy support report".
 */
const counts = {
  playerStatusEvents: 0,
  playbackErrorNotices: 0,
  scriptErrors: 0,
  resourceErrors: 0,
  unhandledRejections: 0,
  offlineTransitions: 0,
};
const installed = new WeakMap();
const cappedIncrement = name => {
  counts[name] = Math.min(9999, counts[name] + 1);
};

export const snapshotAndroidBoxDiagnostics = () => ({ ...counts });

export function installAndroidBoxDiagnostics(win = typeof window !== "undefined" ? window : null) {
  if (!win || typeof win.addEventListener !== "function") return () => {};
  if (installed.has(win)) return installed.get(win);

  const onPlayerStatus = event => {
    cappedIncrement("playerStatusEvents");
    // Classify only; never retain the message, source, title or stream URL.
    if (/\b(?:error|fail(?:ed|ure)?|timed? out|cannot play|could not play|unavailable)\b/i.test(
      String(event?.detail?.message || "").slice(0, 500),
    )) cappedIncrement("playbackErrorNotices");
  };
  const onError = event => {
    if (event?.error || event?.message) cappedIncrement("scriptErrors");
    else cappedIncrement("resourceErrors");
  };
  const onRejection = () => cappedIncrement("unhandledRejections");
  const onOffline = () => cappedIncrement("offlineTransitions");

  win.addEventListener("mg:player-status", onPlayerStatus);
  win.addEventListener("error", onError, true);
  win.addEventListener("unhandledrejection", onRejection);
  win.addEventListener("offline", onOffline);

  const stop = () => {
    win.removeEventListener("mg:player-status", onPlayerStatus);
    win.removeEventListener("error", onError, true);
    win.removeEventListener("unhandledrejection", onRejection);
    win.removeEventListener("offline", onOffline);
    installed.delete(win);
  };
  installed.set(win, stop);
  return stop;
}

const safeNumber = (value, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= max ? number : null;
};

/** Return only broad hardware/browser categories, never the raw user agent. */
export function getAndroidBoxSupportLines({
  nav = typeof navigator !== "undefined" ? navigator : {},
  win = typeof window !== "undefined" ? window : {},
  doc = typeof document !== "undefined" ? document : {},
  counters = snapshotAndroidBoxDiagnostics(),
} = {}) {
  const ua = String(nav?.userAgent || "");
  const android = /\bAndroid[ /]([0-9]+)(?:\.[0-9]+)?/i.exec(ua);
  const chrome = /\b(?:Chrome|CriOS)\/([0-9]+)/i.exec(ua);
  const firefox = /\bFirefox\/([0-9]+)/i.exec(ua);
  const webview = /(?:;\s*wv\)|\bVersion\/4\.0\b|\bMediaGodFireTV\b|\bMediaGodMobile\b)/i.test(ua);
  const engine = chrome
    ? `${webview ? "Android WebView / Chromium" : "Chromium"} ${chrome[1]}`
    : firefox ? `Firefox ${firefox[1]}` : "Unknown";
  const memory = safeNumber(nav?.deviceMemory, 256);
  const cores = safeNumber(nav?.hardwareConcurrency, 256);
  const effectiveType = String(nav?.connection?.effectiveType || "");
  const connection = /^(?:slow-2g|2g|3g|4g)$/.test(effectiveType) ? effectiveType : "not reported";
  let pointer = "unknown";
  try {
    if (win?.matchMedia?.("(any-pointer: fine)").matches) pointer = "fine";
    else if (win?.matchMedia?.("(any-pointer: coarse)").matches) pointer = "coarse";
  } catch { /* Restricted WebViews may lack matchMedia. */ }

  const lines = [
    `Android major version: ${android?.[1] || "not reported"}`,
    `Browser / WebView engine: ${engine}`,
    `Browser-reported device memory: ${memory ? memory + " GB (estimate)" : "not available"}`,
    `Logical processor cores: ${cores || "not available"}`,
    `Connection class: ${connection}`,
    `Input pointer type: ${pointer}`,
    `Page visibility: ${doc?.visibilityState === "hidden" ? "background" : "foreground"}`,
    `Playback status notices: ${Number(counters.playerStatusEvents) || 0}`,
    `Playback error notices: ${Number(counters.playbackErrorNotices) || 0}`,
    `Script errors (count only): ${Number(counters.scriptErrors) || 0}`,
    `Resource errors (count only): ${Number(counters.resourceErrors) || 0}`,
    `Unhandled rejections (count only): ${Number(counters.unhandledRejections) || 0}`,
    `Offline transitions: ${Number(counters.offlineTransitions) || 0}`,
  ];
  return lines;
}
