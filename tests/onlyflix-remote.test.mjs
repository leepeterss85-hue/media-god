import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/components/mg/onlyFlixRemoteActions.js");
const native = read("firetv-android/app/src/main/java/com/mediagod/firetv/EmbeddedPlayerRemote.kt");
const main = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");

const fixture = (accepted = true, hitIframe = true) => {
  class Frame {
    getBoundingClientRect() { return { left: 20, top: 100, width: 920, height: 320, right: 940, bottom: 420 }; }
    focus() {}
  }
  const iframe = new Frame();
  const pointer = { getBoundingClientRect: () => ({ left: 116, top: 344, width: 28, height: 28 }) };
  const player = {
    querySelector: (selector) => selector.includes("embed-iframe") ? iframe : selector.includes("embed-pointer") ? pointer : null,
  };
  const sourceSelector = {};
  const document = {
    querySelector: (selector) => selector.includes("onlyflix-player") ? player : null,
    elementFromPoint: () => hitIframe ? iframe : sourceSelector,
    activeElement: iframe,
  };
  const taps = [];
  const movements = [];
  const tap = runInNewContext(
    source.replace(/^import[^\n]+\n/, "").replace("export const", "const") + "\ntapOnlyFlixForRemote;",
    { document, HTMLIFrameElement: Frame, nativeFireTvSimulateTap: (...xy) => { taps.push(xy); return accepted; }, window: { dispatchEvent: (event) => movements.push(event.detail) }, CustomEvent: class { constructor(type, { detail }) { this.detail = detail; } } }
  );
  return { tap, taps, document, iframe, player, movements };
};

test("Select taps the visible pointer, not the iframe centre", () => {
  const { tap, taps } = fixture();
  assert.equal(tap({ selectKey: true }), true);
  assert.deepEqual(taps, [[130, 358]]);
});

test("D-pad stays with OnlyFlix even if WebView focus drifts to app controls", () => {
  const { tap, taps, document, movements } = fixture();
  document.activeElement = {};
  assert.equal(tap({ direction: "left" }), true);
  assert.deepEqual(movements, ["left"]);
  assert.equal(taps.length, 0);
  assert.equal(tap({ selectKey: true }), true);
  assert.deepEqual(taps, [[130, 358]]);
});

test("an absent pointer consumes Select instead of activating the background source picker", () => {
  const { tap, taps, player, iframe } = fixture();
  // Keep the OnlyFlix iframe mounted while its pointer overlay is unavailable.
  player.querySelector = (selector) => selector.includes("embed-iframe") ? iframe : null;
  assert.equal(tap({ selectKey: true }), true);
  assert.equal(taps.length, 0);
});

test("physical Play works even while the parent toolbar has focus", () => {
  const { tap, taps, document } = fixture();
  document.activeElement = {};
  assert.equal(tap({ mediaAction: "playpause" }), true);
  assert.equal(tap({ mediaAction: "play" }), true);
  assert.equal(tap({ selectKey: true }), true);
  assert.equal(taps.length, 3);
});

test("held Select does not tap twice and failed native taps stay isolated from app controls", () => {
  const { tap, taps } = fixture();
  assert.equal(tap({ selectKey: true, repeat: true }), true);
  assert.equal(taps.length, 0);
  const rejected = fixture(false);
  assert.equal(rejected.tap({ selectKey: true }), true);
  assert.equal(rejected.taps.length, 1);
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

test("a tap over the app source picker is swallowed and never dispatched", () => {
  const { tap, taps } = fixture(true, false);
  assert.equal(tap({ selectKey: true }), true);
  assert.deepEqual(taps, []);
});

test("taps scale layout CSS coordinates through the layout viewport and release the mouse", () => {
  assert.match(native, /return \[window\.innerWidth,window\.innerHeight,0,0,1\]/);
  assert.doesNotMatch(native, /window\.visualViewport/);
  assert.match(native, /document\.elementFromPoint\(x,y\)!==frame/);
  assert.match(native, /viewport\.optInt\(4, 0\) != 1/);
  assert.match(native, /cssX \* webView\.width \/ width/);
  assert.match(native, /cssY \* webView\.height \/ height/);
  assert.match(native, /postDelayed/);
  assert.match(native, /80L/);
  assert.match(native, /SOURCE_MOUSE/);
  assert.match(native, /BUTTON_PRIMARY/);
  assert.match(native, /private fun obtainMouseButtonEvent\(/);
  assert.doesNotMatch(native, /\.buttonState\s*=/);
  assert.match(native, /ACTION_HOVER_MOVE/);
  assert.match(native, /MotionEvent\\.ACTION_BUTTON_PRESS/);
  assert.match(native, /MotionEvent\\.ACTION_BUTTON_RELEASE/);
  assert.match(native, /dispatchGenericMotionEvent\\(down\\)/);
  assert.match(native, /dispatchGenericMotionEvent\\(up\\)/);
  assert.match(native, /if \(action == MotionEvent\.ACTION_DOWN\)/);
  assert.doesNotMatch(native, /dispatchTouchEvent\\(down\\)|dispatchTouchEvent\\(up\\)/);
  assert.doesNotMatch(native, /displayMetrics\.density|now \+ 60/);
});

