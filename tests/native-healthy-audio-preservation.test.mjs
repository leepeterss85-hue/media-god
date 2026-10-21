import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (platform, activity) =>
  readFileSync(new URL(`../${platform}/app/src/main/java/com/mediagod/${platform === "android-mobile" ? "mobile" : "firetv"}/${activity}.kt`, import.meta.url), "utf8");

for (const platform of ["android-mobile", "firetv-android"]) {
  test(`${platform}: healthy multichannel audio cannot force compatibility fallback`, () => {
    const player = read(platform, "PlayerActivity");
    const checkStart = player.indexOf("private fun scheduleMissingAudioCheck(");
    const checkEnd = player.indexOf("private fun buildMediaItem(", checkStart);
    assert.ok(checkStart > 0 && checkEnd > checkStart);
    const check = player.slice(checkStart, checkEnd);
    assert.match(check, /if \(audioOutputConfirmed\) return@postDelayed/);
    assert.doesNotMatch(check, /selectedAudioRequiresPcmRescue|channelCount|audio\/ac3|audio\/vnd\.dts/);
    assert.match(check, /!latest\.present/);
    assert.match(check, /!latest\.supported/);
    assert.match(check, /!latest\.selected/);
    assert.match(check, /launchCompatibilityPlayer/);
  });

  test(`${platform}: compatibility controls remain accessible and keep source selection`, () => {
    const compat = read(platform, "CompatibilityPlayerActivity");
    assert.match(compat, /sourcesButton\.contentDescription = "Choose source"/);
    assert.match(compat, /playPauseButton\.contentDescription = "Pause or play video"/);
    assert.match(compat, /audioButton\.contentDescription = "Audio tracks"/);
    assert.match(compat, /subtitleButton\.contentDescription = "Subtitles"/);
    assert.match(compat, /moreButton\.contentDescription = "Player settings"/);
    assert.match(compat, /showSourceMenu\(\)/);
    assert.match(compat, /showAudioTrackMenu\(\)/);
    assert.match(compat, /showSubtitleTrackMenu\(\)/);
    assert.match(compat, /showAdvancedControlsMenu\(\)/);
  });
}
