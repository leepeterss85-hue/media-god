import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../android-mobile/app/src/main/java/com/mediagod/mobile/${name}.kt`, import.meta.url), "utf8");

test("native VOD starts at the saved position before preparation and first-frame validation", () => {
  const player = read("PlayerActivity");
  const initialPosition = player.indexOf("exoPlayer.setMediaItem(mediaItem, restorePositionMs)");
  const prepare = player.indexOf("exoPlayer.prepare()");
  assert.ok(initialPosition > 0 && initialPosition < prepare);
  assert.doesNotMatch(player.slice(prepare, prepare + 650), /seekTo\(restorePositionMs\)/);
});

test("VLC startup timeout requires video output as well as Playing", () => {
  const player = read("CompatibilityPlayerActivity");
  const playing = player.slice(player.indexOf("MediaPlayer.Event.Playing ->"), player.indexOf("MediaPlayer.Event.Paused ->"));
  assert.match(playing, /if \(videoStartupReadiness\.onPlaying\(\)\) \{\s*compatibilityPlaybackStarted = true\s*clearStartupTimeout\(\)\s*\}/);
  assert.equal(playing.match(/clearStartupTimeout\(\)/g)?.length, 1);
  assert.match(player, /MediaPlayer\.Event\.Vout ->[\s\S]*?onVideoOutput\(event\.voutCount\)/);
  assert.match(player, /requireVideoOutput = !payload\.optBoolean\("live", false\)/);
  assert.match(player, /if \(resultSent \|\| vlcPlayer !== player\) return@post/);
  assert.match(player, /videoStartupReadiness\.reset\(\)/);
});


test("VLC VOD configures the saved position before playback instead of seeking after Playing", () => {
  const player = read("CompatibilityPlayerActivity");
  const option = player.indexOf('addOption(":start-time=${pendingStartPositionMs / 1000.0}")');
  const assign = player.indexOf("player.media = media");
  const play = player.indexOf("player.play()", assign);
  assert.ok(option > 0 && option < assign && assign < play);
  assert.match(player.slice(option - 120, option), /!payload\.optBoolean\("live", false\) && pendingStartPositionMs > 0L/);
  assert.match(player.slice(assign, play), /if \(!payload\.optBoolean\("live", false\)\) pendingStartPositionMs = 0L/);
  const playing = player.slice(player.indexOf("MediaPlayer.Event.Playing ->"), player.indexOf("MediaPlayer.Event.Paused ->"));
  assert.match(playing, /if \(payload\.optBoolean\("live", false\) && pendingStartPositionMs > 0L\) \{\s*val target = pendingStartPositionMs; pendingStartPositionMs = 0L; player\.time = target/);
});
