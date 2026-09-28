import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("phone VOD keeps Back visible until a frame renders, then cancels its startup limit", () => {
  const activity = read("android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt");
  assert.match(activity, /VOD_FIRST_FRAME_TIMEOUT_MS = 25_000L/);
  assert.match(activity, /if \(!live && !firstVideoFrameRendered\) return@Runnable/);
  assert.match(activity, /override fun onRenderedFirstFrame\(\) \{\s*firstVideoFrameRendered = true\s*playerView\.removeCallbacks\(firstFrameWatchdogRunnable\)/);
  assert.match(activity, /if \(!resultSent && !live && !compatibilityPlayerOpen &&\s*!firstVideoFrameRendered && shouldPlayWhenReady && player != null\s*\)/);
  assert.match(activity, /finishWithResult\(\s*"startup_timeout"/);
  assert.match(activity, /playerView\.postDelayed\(firstFrameWatchdogRunnable, VOD_FIRST_FRAME_TIMEOUT_MS\)/);
  assert.match(activity, /private fun releasePlayer\(\)[\s\S]*?playerView\.removeCallbacks\(firstFrameWatchdogRunnable\)/);
});

test("a phone startup timeout offers another ready source without marking the file broken", () => {
  const player = read("src/components/mg/VideoPlayer.jsx");
  const start = player.indexOf('if (reason === "startup_timeout" && !isLive)');
  const end = player.indexOf('if (reason === "error")', start);
  assert.ok(start > 0 && end > start);
  const branch = player.slice(start, end);
  assert.match(branch, /findNextPlayableSource\(activeIdx, \{ allowCaching: false \}\)/);
  assert.match(branch, /switchToSource\(nextIndex/);
  assert.match(branch, /setNativeFallbackUrl\(nativePlaybackUrl\)/);
  assert.doesNotMatch(branch, /recordPlaybackReliability|markSourceFailed|tryNextSource/);

  const build = read("android-mobile/app/build.gradle.kts");
  const update = JSON.parse(read("public/android-mobile-update.json"));
  assert.match(build, /versionCode = 75\s*versionName = "1\.0\.74"/);
  assert.equal(update.versionCode, 75);
  assert.equal(update.versionName, "1.0.74");
});
