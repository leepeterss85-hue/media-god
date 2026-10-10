import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sources = read("src/components/mg/MediaStreamSourcesBox.jsx");
const provider = read("src/components/mg/MediaPlayerProvider.jsx");
const bridge = read("src/components/mg/nativeFireTvBridge.js");
const launcher = read("src/components/mg/reeznTvLauncher.js");
const main = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");
const manifest = read("firetv-android/app/src/main/AndroidManifest.xml");

test("ReeznTV appears as a clearly labelled external app handoff", () => {
  assert.match(sources, /id: "reezntv-external-app"/);
  assert.match(sources, /label: "ReeznTV app"/);
  assert.match(sources, /choose this title inside ReeznTV/);
  assert.match(launcher, /launchNativeFireTvReeznTV\(\)/);
  assert.match(launcher, /https:\/\/reezntvapp\.com\/download/);
  assert.match(sources, /onClick: \(\) => launchReeznTv\(\)/);
  assert.match(sources, /mediaType === "live"/);
  assert.doesNotMatch(sources, /mediaType !== "live" \? \[\{\s*id: "reezntv-external-app"/);
});

test("Fire TV launches the installed ReeznTV app by its launcher label or package name", () => {
  assert.match(bridge, /native\.launchReeznTvApp/);
  assert.match(main, /fun launchReeznTvApp\(\): Boolean/);
  assert.match(main, /label\.contains\("reezn", ignoreCase = true\)/);
  assert.match(main, /packageId\.contains\("reezn", ignoreCase = true\)/);
  assert.match(manifest, /<category android:name="android\.intent\.category\.LAUNCHER" \/>/);
});

test("existing OnlyFlix integration remains wired", () => {
  assert.match(sources, /id: "onlyflix-web-player"/);
  assert.match(provider, /const playOnlyFlix = useCallback/);
});
