import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("Fire TV VLC outputs only positive measured pixel dimensions", () => {
  const fire = read("firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt");
  assert.match(fire, /private fun syncVideoSurfacePixels\(player: MediaPlayer\)/);
  assert.match(fire, /val width = videoLayout\.width/);
  assert.match(fire, /val height = videoLayout\.height/);
  assert.match(fire, /if \(width < 2 \|\| height < 2\) return/);
  assert.match(fire, /player\.vlcVout\.setWindowSize\(width, height\)/);
  assert.match(fire, /addOnLayoutChangeListener/);
  assert.match(fire, /videoLayout\.post \{ syncVideoSurfacePixels\(player\) \}/);
  assert.match(fire, /MediaPlayer\.Event\.Vout -> \{\s*syncVideoSurfacePixels\(player\)/);
  const phone = read("android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt");
  assert.doesNotMatch(phone, /syncVideoSurfacePixels/);
});

test("The embedded Fire TV player no longer hides top source buttons or allows zero-height video", () => {
  const css = read("src/fire-tv-player-failsafe.css");
  const scope = css.slice(css.indexOf("Fire TV embedded-video recovery (1.4.105)"));
  assert.ok(scope.length > 1500, "Fire TV-only video recovery must exist");
  assert.match(scope, /\[data-mg-player-root="true"\]\[data-mg-embedded-remote-player="true"\] > div > \[data-mg-player-topbar="true"\]:first-child/);
  assert.match(scope, /\[data-mg-player-topbar="true"\] button:not\(\[data-mg-player-exit="true"\]\)/);
  assert.match(scope, /display: inline-flex !important/);
  assert.match(scope, /\[data-mg-episode-player-backups="true"\]/);
  assert.match(scope, /\[data-mg-movie-player-backups="true"\]/);
  assert.match(scope, /height: calc\(100vh - 132px\) !important/);
  assert.match(scope, /min-height: 2px !important/);
  assert.match(scope, /\[data-mg-safe-fullscreen-toggle="true"\]/);
  assert.match(scope, /\[data-mg-safe-embed-fullscreen="true"\]/);
});

test("Fire TV Menu reaches source choices and Fullscreen; Back restores picture without exiting episode", () => {
  const remote = read("src/components/mg/FireTvRemote.jsx");
  const stage = read("src/components/mg/SafeEmbedStage.jsx");
  assert.match(remote, /const fullscreenToggle = embedded\?\.querySelector/);
  assert.match(remote, /fullScreenFocused && \(direction \|\| selectKey\)/);
  assert.match(remote, /focusElement\(embedIsFullscreen \? fullscreenToggle : iframe\)/);
  assert.match(remote, /currentFocus\.click\(\)/);
  assert.match(stage, /data-mg-safe-fullscreen-toggle="true"/);
  assert.match(stage, /window\.addEventListener\("mg:native-back", onFireTvBack, true\)/);
  assert.match(stage, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(read("public/firetv-update.json"), /"versionName": "1\.4\.117"/);
  assert.match(read("public/android-mobile-update.json"), /"versionName": "1\.0\.94"/);
});
