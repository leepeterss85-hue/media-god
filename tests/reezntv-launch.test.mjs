import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sources = read("src/components/mg/MediaStreamSourcesBox.jsx");
const provider = read("src/components/mg/MediaPlayerProvider.jsx");
const bridge = read("src/components/mg/nativeFireTvBridge.js");
const main = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");
const manifest = read("firetv-android/app/src/main/AndroidManifest.xml");

test("ReeznTV appears as a clearly labelled external app handoff", () => {
  assert.match(sources, /id: "reezntv-external-app"/);
  assert.match(sources, /label: "ReeznTV app"/);
  assert.match(sources, /choose this title inside ReeznTV/);
  assert.match(provider, /launchNativeFireTvReeznTV\(\)/);
  assert.match(provider, /https:\/\/reezntvapp\.com\/download/);
});

test("Fire TV only launches a matching installed Reezn app and excludes known discovery-only listings", () => {
  assert.match(bridge, /native\.launchReeznTvApp/);
  assert.match(main, /fun launchReeznTvApp\(\): Boolean/);
  assert.match(main, /label\.contains\("reezn", ignoreCase = true\)/);
  assert.match(main, /com\.reezntv\.movieseriesdiscoveryhub/);
  assert.match(main, /com\.reezntv\.allseriesandmovies/);
  assert.match(main, /com\.reezntvlive\.quantumvisionstudios/);
  assert.match(manifest, /<category android:name="android\.intent\.category\.LAUNCHER" \/>/);
});

test("existing OnlyFlix integration remains wired", () => {
  assert.match(sources, /id: "onlyflix-web-player"/);
  assert.match(provider, /const playOnlyFlix = useCallback/);
});
