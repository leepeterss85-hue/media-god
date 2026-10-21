import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const phone = read("android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt");
const fire = read("firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt");
const phoneCompat = read("android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt");
const fireCompat = read("firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt");

test("phone does not accept advancing audio as proof of actual video playback", () => {
  assert.match(phone, /override fun onRenderedFirstFrame\(\)/);
  assert.match(phone, /private val firstFrameWatchdogRunnable = Runnable/);
  assert.match(phone, /audioOutputConfirmed &&\s*activePlayer\.currentPosition > 0L/);
  assert.match(phone, /launchCompatibilityPlayer\([\s\S]*?"video-no-first-frame"/);
  assert.match(phone, /forceSoftwareVideoDecode"[\s\S]*?compatibilityReason == "video-no-first-frame"/);
  assert.match(phone, /playerView\.removeCallbacks\(firstFrameWatchdogRunnable\)/);
  assert.match(phone, /playerView\.postDelayed\(firstFrameWatchdogRunnable, VOD_FIRST_FRAME_TIMEOUT_MS\)/);
});

test("Fire TV VOD validates the first video frame while leaving Live TV recovery alone", () => {
  assert.match(fire, /private const val VOD_FIRST_FRAME_TIMEOUT_MS = 25_000L/);
  assert.match(fire, /override fun onRenderedFirstFrame\(\)/);
  assert.match(fire, /firstVideoFrameRendered = true/);
  assert.match(fire, /if \(resultSent \|\| live \|\| compatibilityPlayerOpen/);
  assert.match(fire, /audioOutputConfirmed &&\s*activePlayer\.currentPosition > 0L/);
  assert.match(fire, /launchCompatibilityPlayer\(activePlayer, null, "video-no-first-frame"\)/);
  assert.match(fire, /playerView\.postDelayed\(firstFrameWatchdogRunnable, VOD_FIRST_FRAME_TIMEOUT_MS\)/);
  assert.match(fire, /playerView\.removeCallbacks\(firstFrameWatchdogRunnable\)/);
});

test("Fire TV keeps current resolution/refresh rate stable for VOD surfaces", () => {
  assert.match(fire, /if \(live\) \{\s*DisplayRateMatcher\.apply/);
  assert.match(fire, /DisplayRateMatcher\.clear\(this\)/);
  assert.match(fire, /if \(live && selectedFrameRate > 0f\)/);
  assert.match(fireCompat, /if \(payload\.optBoolean\("live", false\)\)/);
  assert.match(fireCompat, /DisplayRateMatcher\.clear\(this\)/);
});

test("VLC fallback starts in software video decode when native video has no visible frame", () => {
  for (const compat of [phoneCompat, fireCompat]) {
    assert.match(compat, /forceSoftwareVideoDecode =\s*!payload\.optBoolean\("live", false\) &&\s*payload\.optBoolean\("forceSoftwareVideoDecode", false\)/);
    assert.match(compat, /setHWDecoderEnabled\(!forceSoftwareVideoDecode, false\)/);
    assert.match(compat, /player\.attachViews\(videoLayout, null, true, false\)/);
  }
});

test("decoder fallback retains source chooser and playback position", () => {
  for (const native of [phone, fire]) {
    assert.match(native, /put\("startPositionMs", positionMs\)/);
    assert.match(native, /put\("requestId", requestId\)/);
    assert.match(native, /put\("forceSoftwareVideoDecode"/);
    assert.match(native, /put\("compatibilityReason", compatibilityReason\)/);
  }
});
