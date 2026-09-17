const RELEASE_URLS = {
  "fire-tv": [
    "/firetv-update.json",
    "https://raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/firetv-update.json",
  ],
  "android-mobile": [
    "/android-mobile-update.json",
    "https://raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/android-mobile-update.json",
  ],
};

const CACHE_TTL_MS = 4 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

const releaseCache = new Map();
const inFlight = new Map();

const fetchReleaseJson = async (url) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
};

export const clearNativeReleaseCache = (platform) => {
  if (platform) {
    releaseCache.delete(String(platform));
    return;
  }

  releaseCache.clear();
};

export const fetchLatestNativeRelease = async (
  platform,
  { force = false } = {}
) => {
  if (typeof window === "undefined") return null;

  const key = String(platform || "");
  const urls = RELEASE_URLS[key] || [];
  if (!urls.length) return null;

  const now = Date.now();
  const cached = releaseCache.get(key);

  if (!force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const request = (async () => {
    const releases = await Promise.all(urls.map(fetchReleaseJson));
    const latest =
      releases
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(b?.versionCode || 0) - Number(a?.versionCode || 0)
        )[0] || null;

    releaseCache.set(key, {
      value: latest,
      expiresAt:
        Date.now() + (latest ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS),
    });

    return latest;
  })();

  inFlight.set(key, request);

  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
};
