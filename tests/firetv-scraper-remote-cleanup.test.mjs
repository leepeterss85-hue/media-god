import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("Fire TV scraper iframe keeps Up for its own player, with Menu always opening source tabs", () => {
  const native = read("firetv-android/app/src/main/java/com/mediagod/firetv/EmbeddedPlayerRemote.kt");
  assert.match(native, /if\(key==='ContextMenu'\)/);
  assert.match(native, /key==='ArrowUp' && tabs\.length && !expanded && current===frame/);
  assert.match(native, /pointerRect\.top<=frameRect\.top\+Math\.max\(28,frameRect\.height\*0\.1\)/);
  assert.match(native, /window\.dispatchEvent\(new KeyboardEvent\('keydown'/);
});

test("Fire TV pointer has fine clicks plus a faster held-D-pad movement", () => {
  const actions = read("src/components/mg/onlyFlixRemoteActions.js");
  const pointer = read("src/components/mg/OnlyFlixRemotePointer.jsx");
  assert.match(actions, /detail: repeat \? \{ direction, fast: true \} : direction/);
  assert.match(pointer, /const fast = Boolean\(event\.detail\?\.fast\)/);
  assert.match(pointer, /const pixelsPerMove = fast \? 62 : 26/);
  assert.match(actions, /nativeFireTvSimulateTap\(x, y\)/);
});

test("Fire TV fullscreen never paints a bottom help panel, without touching phone or live TV", () => {
  const player = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  const css = read("src/fire-tv-player-failsafe.css");
  const stage = read("src/components/mg/SafeEmbedStage.jsx");
  assert.match(player, /\{!isFireTv && <div data-mg-embed-footer="true"/);
  assert.match(css, /bottom: 0 !important;\s*z-index: 2 !important;\s*display: block !important;/);
  assert.match(css, /height: calc\(100vh - 132px\) !important/);
  assert.match(css, /body\.mg-fire-tv \[data-mg-embedded-remote-player="true"\] \[data-mg-embed-footer="true"\]/);
  assert.match(stage, /data-mg-safe-embed-fullscreen=\{fullscreen \? "true" : "false"\}/);
  assert.match(player, /data-mg-embedded-top-fullscreen="true"/);
  assert.match(player, /data-mg-embedded-top-sources="true"/);
  const fireNative = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");
  assert.match(fireNative, /mg-firetv-scraper-footer-repair/);
  assert.match(fireNative, /document\.head\.appendChild\(scraperCss\)/);
  assert.match(read("public/android-mobile-update.json"), /"versionName": "1\.0\.94"/);
});
