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

const RELEASE_META = {
  "android-mobile": {
    tag: "android-mobile-latest",
    filename: "Media-God-Android-Mobile.apk",
    manifest: "android-mobile-update.json",
  },
  "fire-tv": {
    tag: "firetv-latest",
    filename: "Media-God-Fire-TV.apk",
    manifest: "firetv-update.json",
  },
};
const REPOSITORY = "leepeterss85-hue/media-god";
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

/**
 * Only a published GitHub APK release may trigger the update pop-up.
 * The manifest on main can become visible long before device tests, signing,
 * and asset upload finish. Read the manifest from the published release's
 * exact commit, not the newer main branch. The installer stays unchanged.
 */
export const fetchPublishedNativeRelease = async (
  platform,
  { fetchJson = fetchReleaseJson } = {}
) => {
  const info = RELEASE_META[String(platform || "")];
  if (!info) return null;

  const release = await fetchJson(
    `https://api.github.com/repos/${REPOSITORY}/releases/tags/${info.tag}`
  );
  const commit = String(release?.target_commitish || "").trim();
  if (
    release?.tag_name !== info.tag ||
    release?.draft !== false ||
    !release?.published_at ||
    !/^[a-f0-9]{40}$/i.test(commit) ||
    !Array.isArray(release?.assets) ||
    !release.assets.some(asset =>
      asset?.name === info.filename &&
      asset?.state === "uploaded" &&
      Number(asset?.size || 0) > 1_000_000
    )
  ) return null;

  const manifest = await fetchJson(
    `https://raw.githubusercontent.com/${REPOSITORY}/${commit}/public/${info.manifest}`
  );
  const versionCode = Number(manifest?.versionCode || 0);
  const versionName = String(manifest?.versionName || "");
  if (
    !Number.isSafeInteger(versionCode) || versionCode < 1 ||
    !/^[0-9][0-9a-z.+-]*$/i.test(versionName) ||
    manifest?.apkUrl !== `https://github.com/${REPOSITORY}/releases/download/${info.tag}/${info.filename}` ||
    manifest?.releaseUrl !== `https://github.com/${REPOSITORY}/releases/tag/${info.tag}`
  ) return null;

  return manifest;
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
  if (!RELEASE_META[key] || !RELEASE_URLS[key]) return null;

  const now = Date.now();
  const cached = releaseCache.get(key);

  if (!force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const request = (async () => {
    // Until the APK asset is uploaded AND its pinned release manifest
    // matches, there is no update to advertise. Never fetch "main" here.
    const latest = await fetchPublishedNativeRelease(key);

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
