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

const PUBLISHED_RELEASE_TAGS = {
  "android-mobile": "android-mobile-latest",
  "fire-tv": "firetv-latest",
};
const REPOSITORY = "leepeterss85-hue/media-god";

/**
 * The public manifest is committed before the signed APK release job finishes.
 * Never advertise a future version while the stable GitHub APK URL still
 * points at the previous build. Verify the released commit's manifest matches
 * the announced version, instead of trusting the newer branch file alone.
 * Read-only checks; no change to the existing one-tap install experience.
 */
export const publishedNativeReleaseMatches = async (platform, announced, {
  fetchJson = fetchReleaseJson,
} = {}) => {
  const tag = PUBLISHED_RELEASE_TAGS[String(platform || "")];
  if (!tag || !announced || !Number(announced.versionCode)) return false;

  const release = await fetchJson(
    `https://api.github.com/repos/${REPOSITORY}/releases/tags/${tag}`
  );
  const sha = String(release?.target_commitish || "").trim();
  if (!/^[0-9a-f]{40}$/i.test(sha) || release?.draft === true ||
      !Array.isArray(release?.assets) || release.assets.length === 0) return false;

  const assetName = platform === "android-mobile"
    ? "Media-God-Android-Mobile.apk"
    : "Media-God-Fire-TV.apk";
  if (!release.assets.some(asset =>
    asset?.name === assetName && Number(asset?.size || 0) > 1_000_000
  )) return false;

  const expectedAtRelease = await fetchJson(
    `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/public/${platform === "android-mobile" ? "android-mobile-update" : "firetv-update"}.json`
  );
  return Number(expectedAtRelease?.versionCode || 0) === Number(announced.versionCode) &&
    String(expectedAtRelease?.versionName || "") === String(announced.versionName || "");
};

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
