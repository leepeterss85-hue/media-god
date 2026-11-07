import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("generic Android TV box startup can try the same source in LibVLC before failing", () => {
  const player = read("firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt");
  assert.match(player, /genericAndroidBox = !android\.os\.Build\.MANUFACTURER\.equals\("Amazon", ignoreCase = true\)/);
  assert.match(player, /nativeStartupStalled = activePlayer\.playbackState == Player\.STATE_READY \|\|/);
  assert.match(player, /audioOnlyRender \|\| \(genericAndroidBox && nativeStartupStalled\)/);
  assert.match(player, /currentSourceDrm\(\) == null/);
  assert.match(player, /launchCompatibilityPlayer\(activePlayer, null, "video-no-first-frame"\)/);
});

test("Fire TV video startup keeps original audio-only recovery and does not change live playback", () => {
  const player = read("firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt");
  assert.match(player, /val audioOnlyRender =\s*activePlayer\.isPlaying &&\s*audioOutputConfirmed/);
  assert.match(player, /if \(resultSent \|\| live \|\| compatibilityPlayerOpen \|\|/);
  assert.match(player, /if \(compatibilityPlayerOpen \|\| resultSent\)/);
  assert.match(player, /forceSoftwareVideoDecode",\s*!live && compatibilityReason == "video-no-first-frame"/);
});
