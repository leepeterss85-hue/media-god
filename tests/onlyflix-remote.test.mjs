import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/components/mg/onlyFlixRemoteActions.js");
const native = read("firetv-android/app/src/main/java/com/mediagod/firetv/EmbeddedPlayerRemote.kt");
const main = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");

const fixture = (accepted = true) => {
  class Frame {
    getBoundingClientRect() { return { left: 20, top: 100, width: 920, height: 320 }; }
  }
  const iframe = new Frame();
  const pointer = { getBoundingClientRect: () => ({ left: 116, top: 344, width: 28, height: 28 }) };
  iframe.parentElement = { querySelector: () => pointer };
  const document = { querySelector: () => iframe, activeElement: iframe };
  const taps = [];
  const movements = [];
  const tap = runInNewContext(
    source.replace(/^import[^\n]+\n/, "").replace("export const", "const") + "\ntapOnlyFlixForRemote;",
    { document, HTMLIFrameElement: Frame, nativeFireTvSimulateTap: (...xy) => { taps.push(xy); return accepted; }, window: { dispatchEvent: (event) => movements.push(event.detail) }, CustomEvent: class { constructor(type, { detail }) { this.detail = detail; } } }
  );
  return { tap, taps, document, iframe, movements };
};

test("Select taps the visible pointer, not the iframe centre", () => {
  const { tap, taps } = fixture();
  assert.equal(tap({ selectKey: true }), true);
  assert.deepEqual(taps, [[130, 358]]);
});

test("D-pad moves the pointer only when the stage is focused", () => {
  const { tap, taps, document, movements } = fixture();
  assert.equal(tap({ direction: "left" }), true);
  assert.deepEqual(movements, ["left"]);
  assert.equal(taps.length, 0);
  document.activeElement = {};
  assert.equal(tap({ direction: "right" }), false);
});

test("an absent pointer never falls back to a blind centre tap", () => {
  const { tap, taps, iframe } = fixture();
  iframe.parentElement.querySelector = () => null;
  assert.equal(tap({ selectKey: true }), false);
  assert.equal(taps.length, 0);
});

test("physical Play works even while the parent toolbar has focus", () => {
  const { tap, taps, document } = fixture();
  document.activeElement = {};
  assert.equal(tap({ mediaAction: "playpause" }), true);
  assert.equal(tap({ mediaAction: "play" }), true);
  assert.equal(tap({ selectKey: true }), false);
  assert.equal(taps.length, 2);
});

test("held Select does not tap twice and a missing native bridge is not treated as success", () => {
  const { tap, taps } = fixture();
  assert.equal(tap({ selectKey: true, repeat: true }), true);
  assert.equal(taps.length, 0);
  assert.equal(fixture(false).tap({ selectKey: true }), false);
});

test("no embed and unrelated remote keys leave other playback untouched", () => {
  const { tap, taps, document } = fixture();
  assert.equal(tap({ mediaAction: "rewind" }), false);
  document.querySelector = () => null;
  assert.equal(tap({ mediaAction: "play" }), false);
  assert.equal(taps.length, 0);
});

test("Fire TV captures keys before child-frame dispatch and owns both event halves", () => {
  assert.match(main, /override fun dispatchKeyEvent\(event: KeyEvent\)/);
  assert.match(main, /!playerOpen && embeddedPlayerRemote\.dispatchKeyEvent\(event\)/);
  assert.match(native, /if \(!enabled \|\| !allowed\(\)\) return false/);
  assert.match(native, /KEYCODE_MEDIA_PLAY_PAUSE/);
  assert.match(native, /window\.dispatchEvent\(new KeyboardEvent/);
  assert.match(native, /event\.repeatCount == 0 \|\| key\.startsWith\("Arrow"\)/);
  assert.match(read("src/components/mg/OnlyFlixEmbedPlayer.jsx"), /setNativeFireTvEmbedRemoteActive\(false\)/);
});

test("taps use viewport scale and real delayed touch release, not display density", () => {
  assert.match(native, /window\.innerWidth,window\.innerHeight/);
  assert.match(native, /cssX \* webView\.width \/ width/);
  assert.match(native, /cssY \* webView\.height \/ height/);
  assert.match(native, /postDelayed/);
  assert.match(native, /SOURCE_TOUCHSCREEN/);
  assert.doesNotMatch(native, /displayMetrics\.density|now \+ 60/);
});