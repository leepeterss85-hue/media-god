import { redactSupportErrorMessage } from "./supportErrorRedaction.js";
import { createTvRemoteFocusTiming } from "./tvRemoteFocusTiming.js";
import { isFireTvRuntime } from "./runtimePlatform.js";

/**
 * Device-local, bounded diagnostics. Preserve short redacted error messages
 * because they distinguish decoder failures, rate limits and unavailable
 * providers; never retain raw errors, source URLs, stacks or account details.
 * Nothing is uploaded or saved: the user opts in by copying a report.
 */
export const MAX_RECENT_SUPPORT_ERRORS = 6;
const recentErrors = [];
const recordError = (category, rawMessage) => {
  const message = redactSupportErrorMessage(rawMessage);
  if (!message) return;
  // Only a few recent errors, no accumulation while browsing for hours.
  recentErrors.push({ category, message });
  if (recentErrors.length > MAX_RECENT_SUPPORT_ERRORS) recentErrors.shift();
};
const counts = {
  playerStatusEvents: 0,
  playbackErrorNotices: 0,
  scriptErrors: 0,
  resourceErrors: 0,
  unhandledRejections: 0,
  offlineTransitions: 0,
};
const installed = new WeakMap();
let tvFocusTiming = null;
const cappedIncrement = name => {
  counts[name] = Math.min(9999, counts[name] + 1);
};

export const snapshotAndroidBoxDiagnostics = () => ({
  ...counts,
  recentErrors: recentErrors.map(entry => ({ ...entry })),
  tvRemoteFocus: tvFocusTiming?.snapshot() || null,
});

export function installAndroidBoxDiagnostics(win = typeof window !== "undefined" ? window : null) {
  if (!win || typeof win.addEventListener !== "function") return () => {};
  if (installed.has(win)) return installed.get(win);

  const onPlayerStatus = event => {
    cappedIncrement("playerStatusEvents");
    const message = typeof event?.detail?.message === "string" ? event.detail.message : "";
    const errorLevel = /^(?:error|failed)$/i.test(String(event?.detail?.level || event?.detail?.status || ""));
    if (errorLevel ||
        /\b(?:error|fail(?:ed|ure)?|timed?\s*out|cannot|could not|unavailable|denied|not playable|decoder|unsupported|stalled|http\s*[45]\d\d)\b/i.test(message)) {
      cappedIncrement("playbackErrorNotices");
      recordError("playback", message || "Playback error (no message provided)");
    }
  };
  const onError = event => {
    if (event?.error || event?.message) {
      cappedIncrement("scriptErrors");
      const message = typeof event?.message === "string" ? event.message :
        typeof event?.error?.message === "string" ? event.error.message : "Script error (no message provided)";
      recordError("script", message);
    } else {
      cappedIncrement("resourceErrors");
      // Keep a safe element category, never the failing resource URL.
      const tag = String(event?.target?.tagName || "").toLowerCase();
      const kind = ["script", "link", "img", "video", "audio", "iframe"].includes(tag) ? tag : "resource";
      recordError("resource", kind + " failed to load");
    }
  };
  const onRejection = event => {
    cappedIncrement("unhandledRejections");
    const reason = event?.reason;
    const message = typeof reason === "string" ? reason :
      typeof reason?.message === "string" ? reason.message : "Unhandled promise rejection";
    recordError("promise", message);
  };
  const onOffline = () => cappedIncrement("offlineTransitions");

  // Android TV diagnostics are passive. The original remote event is never
  // blocked, delayed, modified or stored; player screens remain untouched.
  const remoteTiming = isFireTvRuntime() ? createTvRemoteFocusTiming() : null;
  if (remoteTiming) tvFocusTiming = remoteTiming;
  const onRemoteKey = event => {
    if (win.document?.querySelector?.('[data-mg-player-root="true"]')) return;
    remoteTiming?.onKeyDown(event);
  };
  const onRemoteFocus = () => remoteTiming?.onFocusIn();
  const clearRemoteFocus = () => remoteTiming?.clearPending();

  win.addEventListener("mg:player-status", onPlayerStatus);
  win.addEventListener("error", onError, true);
  win.addEventListener("unhandledrejection", onRejection);
  win.addEventListener("offline", onOffline);
  if (remoteTiming) {
    win.addEventListener("keydown", onRemoteKey, true);
    win.document?.addEventListener?.("focusin", onRemoteFocus, true);
    win.document?.addEventListener?.("visibilitychange", clearRemoteFocus);
  }

  const stop = () => {
    win.removeEventListener("mg:player-status", onPlayerStatus);
    win.removeEventListener("error", onError, true);
    win.removeEventListener("unhandledrejection", onRejection);
    win.removeEventListener("offline", onOffline);
    if (remoteTiming) {
      win.removeEventListener("keydown", onRemoteKey, true);
      win.document?.removeEventListener?.("focusin", onRemoteFocus, true);
      win.document?.removeEventListener?.("visibilitychange", clearRemoteFocus);
      if (tvFocusTiming === remoteTiming) tvFocusTiming = null;
    }
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
  const remote = counters?.tvRemoteFocus;
  if (remote) {
    lines.push(`Remote arrow presses received: ${Number(remote.arrowKeys) || 0}`);
    lines.push(`Remote focus changes: ${Number(remote.focusMoves) || 0}`);
    lines.push(`Slow focus changes (250ms+): ${Number(remote.slowFocusMoves) || 0}`);
    lines.push(`WebView focus delay: ${remote.averageFocusMs == null ? 'not measured' :
      String(remote.averageFocusMs) + 'ms average; ' + String(remote.longestFocusMs) + 'ms longest'}`);
    lines.push('Remote timing starts when WebView receives a key; wireless/CEC delay is not measured.');
  }
  const entries = Array.isArray(counters.recentErrors) ? counters.recentErrors.slice(-MAX_RECENT_SUPPORT_ERRORS) : [];
  lines.push("Recent errors (redacted; newest last):");
  if (!entries.length) lines.push("  None recorded this session");
  for (const item of entries) {
    const category = ["playback", "script", "resource", "promise"].includes(item?.category)
      ? item.category : "error";
    const message = redactSupportErrorMessage(item?.message);
    if (message) lines.push(`  [${category}] ${message}`);
  }
  return lines;
}
