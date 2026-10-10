import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sources = read("src/components/mg/MediaStreamSourcesBox.jsx");
const bridge = read("src/components/mg/nativeFireTvBridge.js");
const launcher = read("src/components/mg/reeznTvLauncher.js");
const fireTvMain = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");
const mobileMain = read("android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt");
const fireTvManifest = read("firetv-android/app/src/main/AndroidManifest.xml");
const mobileManifest = read("android-mobile/app/src/main/AndroidManifest.xml");

test("ReeznTV appears as a labelled external app source for movies and episodes, not Live TV", () => {
  assert.match(sources, /id: "reezntv-external-app"/);
  assert.match(sources, /label: "ReeznTV app"/);
  assert.match(sources, /mediaType !== "live"/);
  assert.match(sources, /onClick: \(\) => launchReeznTv\(\)/);
  assert.match(sources, /kind === "onlyflix" \|\| kind === "reezn"/);
});

test("ReeznTV launcher prefers the installed app and falls back to the official download page", () => {
  assert.match(launcher, /launchNativeReeznTvApp\(\)/);
  assert.match(launcher, /openNativeFireTvExternalUrl\(REEZN_TV_DOWNLOAD_URL\)/);
  assert.match(launcher, /https:\/\/reezntvapp\.com\/download/);
  assert.match(launcher, /window\.open\(REEZN_TV_DOWNLOAD_URL/);
  assert.doesNotMatch(launcher, /tmdbId.*deeplink|title.*deeplink/i);
});

test("both Android APKs can discover and launch an installed ReeznTV app", () => {
  assert.match(bridge, /native\.launchReeznTvApp/);
  assert.match(fireTvMain, /fun launchReeznTvApp\(\): Boolean/);
  assert.match(mobileMain, /fun launchReeznTvApp\(\): Boolean/);
  for (const source of [fireTvMain, mobileMain]) {
    assert.match(source, /label\.contains\("reezn", ignoreCase = true\)/);
    assert.match(source, /packageId\.contains\("reezn", ignoreCase = true\)/);
    assert.match(source, /packageId != packageName/);
  }
  for (const manifest of [fireTvManifest, mobileManifest]) {
    assert.match(manifest, /<queries>/);
    assert.match(manifest, /android\.intent\.category\.LAUNCHER/);
  }
});

test("the launcher has a backwards-compatible Fire TV export", () => {
  assert.match(bridge, /export const launchNativeFireTvReeznTV = launchNativeReeznTvApp/);
});
