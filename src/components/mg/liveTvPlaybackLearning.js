export const LIVE_TV_PLAYBACK_LEARNING_KEY = "mg:live-tv-playback-learning-v1";

const WARM_TTL = 2 * 60 * 1000;
const MAX_RECORDS = 500;
const warmed = new Map();
let storeCacheRaw = null;
let storeCacheValue = null;

const cleanUrl = (value) => String(value || "").trim();

const readStore = () => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(LIVE_TV_PLAYBACK_LEARNING_KEY) || "";

    if (raw === storeCacheRaw && storeCacheValue) {
      return storeCacheValue;
    }

    const parsed = raw ? JSON.parse(raw) : {};
    const safe = parsed && typeof parsed === "object" ? parsed : {};
    storeCacheRaw = raw;
    storeCacheValue = safe;
    return safe;
  } catch {
    storeCacheRaw = null;
    storeCacheValue = {};
    return storeCacheValue;
  }
};

const writeStore = (store) => {
  if (typeof window === "undefined") return;

  try {
    const entries = Object.entries(store || {})
      .sort((a, b) => Number(b?.[1]?.updatedAt || 0) - Number(a?.[1]?.updatedAt || 0))
      .slice(0, MAX_RECORDS);
    const safe = Object.fromEntries(entries);
    const serialized = JSON.stringify(safe);

    window.localStorage.setItem(
      LIVE_TV_PLAYBACK_LEARNING_KEY,
      serialized
    );
    storeCacheRaw = serialized;
    storeCacheValue = safe;
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

  /*
   * Keep the learning responsive instead of letting months-old failures poison
   * a URL forever. A successful play actively rehabilitates a source by
   * reducing its old failure/stall weight and resetting the consecutive-bad
   * streak. Repeated current failures still push it out of the way quickly.
   */
  const successes = Math.min(
    12,
    Number(current.successes || 0) + (success ? 1 : 0)
  );
  const failures = success
    ? Math.max(0, Number(current.failures || 0) - 1)
    : Math.min(12, Number(current.failures || 0) + (failed ? 1 : 0));
  const stalls = success
    ? Math.max(0, Number(current.stalls || 0) - 1)
    : Math.min(12, Number(current.stalls || 0) + (stalled ? 1 : 0));
  const consecutiveBad = success
    ? 0
    : Math.min(12, Number(current.consecutiveBad || 0) + 1);
  const previousAverage = Number(current.avgStartupMs || 0);
  const measuredStartup = Math.max(0, Math.min(60000, Number(startupMs || 0)));
  const avgStartupMs =
    success && measuredStartup > 0
      ? previousAverage > 0
        ? Math.round(previousAverage * 0.72 + measuredStartup * 0.28)
        : Math.round(measuredStartup)
      : previousAverage;
  const now = Date.now();

  store[key] = {
    successes,
    failures,
    stalls,
    consecutiveBad,
    avgStartupMs,
    lastGood: success ? now : Number(current.lastGood || 0),
    lastFailure: failed ? now : Number(current.lastFailure || 0),
    lastStall: stalled ? now : Number(current.lastStall || 0),
    lastOutcome: success ? "success" : stalled ? "stall" : "failure",
    updatedAt: now,
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

  const consecutiveBad = Number(record.consecutiveBad || 0);

  score += Math.min(9000, successes * 1100);
  score -= Math.min(14000, failures * 2400);
  score -= Math.min(7500, stalls * 1300);
  score -= Math.min(14000, consecutiveBad * 3500);

  if (avgStartupMs > 0) {
    if (avgStartupMs <= 1800) score += 7000;
    else if (avgStartupMs <= 3500) score += 4200;
    else if (avgStartupMs <= 6000) score += 1800;
    else if (avgStartupMs >= 12000) score -= 4500;
    else if (avgStartupMs >= 8000) score -= 2200;
  }

  if (Number(record.lastGood || 0) > now - 7 * 24 * 60 * 60 * 1000) {
    score += 3000;
  }

  const lastFailure = Number(record.lastFailure || 0);
  if (lastFailure > now - 60 * 60 * 1000) {
    score -= 7000;
  } else if (lastFailure > now - 12 * 60 * 60 * 1000) {
    score -= 2800;
  }

  const lastStall = Number(record.lastStall || 0);
  if (lastStall > now - 60 * 60 * 1000) {
    score -= 4200;
  } else if (lastStall > now - 6 * 60 * 60 * 1000) {
    score -= 1800;
  }

  return score;
};

export const liveTvUrlQuarantined = (url) => {
  const key = keyFor(url);
  if (!key) return false;

  const record = readStore()?.[key];
  if (!record || typeof record !== "object") return false;

  const lastGood = Number(record.lastGood || 0);
  const lastBad = Math.max(
    Number(record.lastFailure || 0),
    Number(record.lastStall || 0)
  );
  const consecutiveBad = Number(record.consecutiveBad || 0);
  const quarantineMs = consecutiveBad >= 4
    ? 45 * 60 * 1000
    : consecutiveBad >= 3
      ? 25 * 60 * 1000
      : 10 * 60 * 1000;
  const recentBad = lastBad > Date.now() - quarantineMs;

  // Two consecutive current failures are enough to move a URL to the back.
  // A successful play resets consecutiveBad immediately, so recovered feeds
  // can promote themselves again without waiting for old history to expire.
  return recentBad && consecutiveBad >= 2 && lastBad > lastGood;
};

const ensurePreconnect = (url) => {
  if (typeof document === "undefined") return;

  try {
    const origin = new URL(url).origin;
    if (!origin || origin === "null") return;

    const existing = Array.from(
      document.querySelectorAll('link[data-mg-live-preconnect]')
    ).some(
      (link) =>
        link instanceof HTMLElement &&
        link.dataset?.mgLivePreconnect === origin
    );

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
