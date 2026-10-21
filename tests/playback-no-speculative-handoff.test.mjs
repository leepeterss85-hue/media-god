import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("supported native audio never triggers a speculative backup-player handoff", () => {
  for (const path of [
    "android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt",
    "firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt",
  ]) {
    const source = read(path);
    const start = source.indexOf("private fun scheduleMissingAudioCheck(");
    const end = source.indexOf("private fun buildMediaItem(", start);
    assert.ok(start >= 0 && end > start, path);
    const block = source.slice(start, end);
    const healthy = block.indexOf("if (latest.present && latest.supported && latest.selected)");
    const handoff = block.indexOf("launchCompatibilityPlayer(activePlayer, null, reason)");
    assert.ok(healthy > 0 && handoff > healthy, path);
    assert.match(block, /player !== activePlayer/);
    assert.match(block, /generation != audioPresenceCheckGeneration/);
    assert.match(block, /10000L/);
    assert.match(source, /error\.errorCode in 5001\.\.5004/);
  }
});

test("browser guard does not treat uncertain decoder counters as silence or black video", () => {
  const guard = read("src/components/mg/useSilentAudioGuard.js");
  assert.match(guard, /ADVANCE_SECONDS = 8/);
  assert.match(guard, /REQUIRED_PICTURE_CHECKS = 2/);
  assert.match(guard, /video\.videoWidth === 0 && video\.videoHeight === 0/);
  assert.match(guard, /video\.paused \|\| video\.ended/);
  assert.match(guard, /onUnusableRef\.current\?\./);
  assert.doesNotMatch(guard, /webkitAudioDecodedByteCount|mozHasAudio|audioIsKnownNonEnglish/);
  assert.doesNotMatch(guard, /webkitDecodedFrameCount/);
});

test("player offers separate accessible icon menus without losing manual source choice", () => {
  const controls = read("src/components/mg/MediaPlayerControls.jsx");
  assert.match(controls, /aria-label="Sources and quality"/);
  assert.match(controls, /aria-label="Playback settings"/);
  assert.match(controls, /aria-label="Audio track"/);
  assert.match(controls, /aria-label="Subtitles"/);
  assert.match(controls, /data-mg-source-menu="true"/);
  assert.match(controls, /data-mg-settings-menu="true"/);
  assert.match(controls, /onSelectSource\?\.\(value, selectedEntry\?\.item \|\| null\)/);
  assert.match(controls, /aria-label="Seek through video"/);
  assert.match(controls, /MobileCenterControls/);
});
