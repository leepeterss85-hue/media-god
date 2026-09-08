export const LIVE_TV_PLAYBACK_LEARNING_KEY = "mg:live-tv-playback-learning-v1";

const WARM_TTL = 2 * 60 * 1000;
const MAX_RECORDS = 500;
const warmed = new Map();

const cleanUrl = (value) => String(value || "").trim();

const readStore = () => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(LIVE_TV_PLAYBACK_LEARNING_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store) => {
  if (typeof window === "undefined") return;

  try {
    const entries = Object.entries(store || {})
      .sort((a, b) => Number(b?.[1]?.updatedAt || 0) - Number(a?.[1]?.updatedAt || 0))
      .slice(0, MAX_RECORDS);

    window.localStorage.setItem(
      LIVE_TV_PLAYBACK_LEARNING_KEY,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch {
    // Runtime learning is optional.
  }
};

const keyFor = (url) => cleanUrl(url).slice(0, 900);

export const recordLiveTvPlaybackResult = (
  url,
  { success = false, startupMs = 0, stalled = false } = {}
) => {
  const key = keyFor(url);
  if (!key) return;

  const store = readStore();
  const current = store[key] && typeof store[key] === "object" ? store[key] : {};
  const failed = !success && !stalled;
  const successes = Number(current.successes || 0) + (success ? 1 : 0);
  const failures = Number(current.failures || 0) + (failed ? 1 : 0);
  const stalls = Number(current.stalls || 0) + (stalled ? 1 : 0);
  const previousAverage = Number(current.avgStartupMs || 0);
  const measuredStartup = Math.max(0, Math.min(60000, Number(startupMs || 0)));
  const avgStartupMs =
    success && measuredStartup > 0
      ? previousAverage > 0
        ? Math.round(previousAverage * 0.72 + measuredStartup * 0.28)
        : Math.round(measuredStartup)
      : previousAverage;

  store[key] = {
    successes,
    failures,
    stalls,
    avgStartupMs,
    lastGood: success ? Date.now() : Number(current.lastGood || 0),
    lastFailure: failed ? Date.now() : Number(current.lastFailure || 0),
    updatedAt: Date.now(),
  };

  writeStore(store);
};

export const liveTvUrlScore = (url) => {
  const key = keyFor(url);
  if (!key) return 0;

  const record = readStore()?.[key];
  if (!record || typeof record !== "object") return 0;

  const now = Date.now();
  let score = 0;
  const successes = Number(record.successes || 0);
  const failures = Number(record.failures || 0);
  const stalls = Number(record.stalls || 0);
  const avgStartupMs = Number(record.avgStartupMs || 0);

  score += Math.min(9000, successes * 1300);
  score -= Math.min(14000, failures * 2600);
  score -= Math.min(7000, stalls * 1600);

  if (avgStartupMs > 0) {
    if (avgStartupMs <= 1800) score += 7000;
    else if (avgStartupMs <= 3500) score += 4200;
    else if (avgStartupMs <= 6000) score += 1800;
    else if (avgStartupMs >= 12000) score -= 4500;
    else if (avgStartupMs >= 8000) score -= 2200;
  }

  if (Number(record.lastGood || 0) > now - 7 * 24 * 60 * 60 * 1000) {
    score += 2200;
  }

  if (Number(record.lastFailure || 0) > now - 12 * 60 * 60 * 1000) {
    score -= 5500;
  }

  return score;
};

const ensurePreconnect = (url) => {
  if (typeof document === "undefined") return;

  try {
    const origin = new URL(url).origin;
    if (!origin || origin === "null") return;

    const existing = Array.from(
      document.querySelectorAll('link[data-mg-live-preconnect]')
    ).some((link) => link?.dataset?.mgLivePreconnect === origin);

    if (!existing) {
      const preconnect = document.createElement("link");
      preconnect.rel = "preconnect";
      preconnect.href = origin;
      preconnect.crossOrigin = "anonymous";
      preconnect.dataset.mgLivePreconnect = origin;
      document.head.appendChild(preconnect);
    }
  } catch {
    // Invalid or non-web URL.
  }
};

export const prewarmLiveTvUrl = async (value) => {
  const url = cleanUrl(value);
  if (!/^https?:\/\//i.test(url)) return false;

  ensurePreconnect(url);

  const lastWarm = Number(warmed.get(url) || 0);
  if (lastWarm > Date.now() - WARM_TTL) {
    return true;
  }
  warmed.set(url, Date.now());

  if (!/\.m3u8(?:[?#]|$)/i.test(url)) {
    return true;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "default",
      credentials: "omit",
      signal: controller.signal,
    });

    if (!response.ok) return false;
    await response.text();
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
};
