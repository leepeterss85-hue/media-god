import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchPublishedNativeRelease,
  fetchLatestNativeRelease,
  clearNativeReleaseCache,
} from "../src/components/mg/nativeReleaseInfo.js";

const REPO = "leepeterss85-hue/media-god";
const SHA = "82b3c736a64cabac2943da2050f25abac96e9c77";
const targets = {
  "android-mobile": {
    tag: "android-mobile-latest",
    asset: "Media-God-Android-Mobile.apk",
    manifest: "android-mobile-update.json",
    versionCode: 94,
    versionName: "1.0.93",
  },
  "fire-tv": {
    tag: "firetv-latest",
    asset: "Media-God-Fire-TV.apk",
    manifest: "firetv-update.json",
    versionCode: 108,
    versionName: "1.4.103",
  },
};

function mockedRelease(platform, edits = {}) {
  const item = targets[platform];
  const release = {
    tag_name: item.tag,
    target_commitish: SHA,
    body: `Verified-APK-Commit: ${SHA}`,
    draft: false,
    published_at: "2026-10-23T17:16:10Z",
    assets: [{ name: item.asset, size: 180000000, state: "uploaded" }],
    ...edits,
  };
  const manifest = {
    channel: platform,
    versionCode: item.versionCode,
    versionName: item.versionName,
    apkUrl: `https://github.com/${REPO}/releases/download/${item.tag}/${item.asset}`,
    releaseUrl: `https://github.com/${REPO}/releases/tag/${item.tag}`,
  };
  return { release, manifest };
}

for (const platform of ["android-mobile", "fire-tv"]) {
  test(`${platform} offers the release only after signed APK asset publication`, async () => {
    const { release, manifest } = mockedRelease(platform);
    const read = async url => url.includes("/releases/tags/")
      ? release
      : url.includes(`/${SHA}/public/`)
        ? manifest
        : assert.fail("Must only read the release's commit-specific manifest: " + url);
    assert.deepEqual(
      await fetchPublishedNativeRelease(platform, { fetchJson: read }),
      manifest
    );
  });
  test(`${platform} suppresses pop-up before the actual APK is ready`, async () => {
    const { release, manifest } = mockedRelease(platform);
    const invalid = [
      { ...release, draft: true },
      { ...release, published_at: null },
      { ...release, body: "Build still running" },
      { ...release, body: "Verified-APK-Commit: " + "0".repeat(40) },
      { ...release, target_commitish: "main" },
      { ...release, assets: [] },
      { ...release, assets: [{ ...release.assets[0], state: "starter" }] },
      { ...release, assets: [{ ...release.assets[0], size: 0 }] },
      { ...release, assets: [{ ...release.assets[0], name: "wrong.apk" }] },
      { ...release, tag_name: "a-different-release" },
    ];
    for (const variant of invalid) {
      const result = await fetchPublishedNativeRelease(platform, {
        fetchJson: async () => variant,
      });
      assert.equal(result, null);
    }

    // A release's manifest must match the APK download link, not an
    // imaginary future build sitting in the main branch.
    const mismatch = { ...manifest, apkUrl: "https://wrong.example/old.apk" };
    assert.equal(await fetchPublishedNativeRelease(platform, {
      fetchJson: async url => url.includes("/releases/tags/") ? release : mismatch,
    }), null);
    assert.equal(await fetchPublishedNativeRelease(platform, {
      fetchJson: async url => url.includes("/releases/tags/") ? release : null,
    }), null);
  });
}

test("update pop-up derives the advertised version from the published commit, not main", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const { release, manifest } = mockedRelease("android-mobile");
  const fetched = [];
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = async url => {
    fetched.push(url);
    const value = String(url).includes("/releases/tags/") ? release : manifest;
    return { ok: true, json: async () => value };
  };
  try {
    clearNativeReleaseCache();
    const latest = await fetchLatestNativeRelease("android-mobile", { force: true });
    assert.deepEqual(latest, manifest);
    assert.equal(fetched.length, 2);
    assert.ok(fetched[1].includes(`/${SHA}/public/android-mobile-update.json`));
    assert.equal(fetched.some(url => url.includes("/main/public/")), false);
    assert.equal(await fetchLatestNativeRelease("android-mobile"), latest);
    assert.equal(fetched.length, 2, "Do not repeatedly hammer GitHub once verified");
  } finally {
    clearNativeReleaseCache();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});

test("a Github release check failure suppresses the pop-up, never guesses a version", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  try {
    clearNativeReleaseCache();
    assert.equal(await fetchLatestNativeRelease("fire-tv", { force: true }), null);
  } finally {
    clearNativeReleaseCache();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
