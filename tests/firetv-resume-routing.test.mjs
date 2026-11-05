import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasSeekableHistoryPosition } from "../src/components/mg/resumeHistoryPolicy.js";

const source = path =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const row = source("src/components/mg/ContinueWatchingRow.jsx");

test("a measured film playhead takes priority over an older OnlyFlix bookmark", () => {
  assert.equal(hasSeekableHistoryPosition({
    mediaType: "movie", source_type: "embed", progress: 1574, duration: 7200,
    video_url: "mgembed:old-onlyflix",
  }), true);
  assert.match(row, /if \(!hasSavedSeekPosition && bookmark && player\.playSavedEmbed/);
  assert.match(row, /!hasSavedSeekPosition && explicitOnlyFlixResume/);
  assert.match(row, /startTime:\s*Number\(item\.progress\s*\|\|\s*0\)/);
});

test("a measured TV episode playhead uses a seekable native source", () => {
  assert.equal(hasSeekableHistoryPosition({
    mediaType: "tv", season: 1, episode: 7,
    source_type: "embed", progress: 922, duration: 2400,
  }), true);
  assert.match(row, /type:\s*isTv \? "series" : "movie"/);
  assert.match(row, /resumeFromHistory:\s*true/);
  assert.match(row, /verifiedPlaybackPolicy:\s*"strict"/);
});

test("legacy no-position embedded bookmark remains usable without inventing a playhead", () => {
  assert.equal(hasSeekableHistoryPosition({ source_type: "embed", progress: 0, duration: 0 }), false);
  assert.equal(hasSeekableHistoryPosition({ source_type: "onlyflix", progress: 5, duration: 0 }), false);
  assert.equal(hasSeekableHistoryPosition({ source_type: "embed", progress: 5, duration: 3600 }), true);
  assert.equal(hasSeekableHistoryPosition({ source_type: "embed", progress: 225, duration: 0 }), true);
  assert.equal(hasSeekableHistoryPosition({ progress: NaN, duration: 3600 }), false);
  assert.equal(hasSeekableHistoryPosition({ progress: 3600, duration: 3600 }), false);
});

test("Fire Stick native player still reports final position without changing its decoder", () => {
  const native = source("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");
  assert.match(native, /"mg:native-player-result"/);
  assert.match(native, /"positionMs", data\?\.getLongExtra\(PlayerActivity\.EXTRA_POSITION_MS/);
  assert.match(native, /pendingNativeResultScript = resultScript/);
  const player = source("src/components/mg/VideoPlayer.jsx");
  assert.match(player, /startPositionMs:\s*Math\.round\(resumeSeconds \* 1000\)/);
});
