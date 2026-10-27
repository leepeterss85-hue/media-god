import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFireTvRepeatLimiter } from "../src/components/mg/fireTvRepeatLimiter.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("only surplus held navigation repeats are coalesced; first tap and direction changes stay instant", () => {
  const skip = createFireTvRepeatLimiter(72);
  assert.equal(skip({ key: "ArrowRight", repeat: false }, 0), false);
  assert.equal(skip({ key: "ArrowRight", repeat: true }, 30), true);
  assert.equal(skip({ key: "ArrowRight", repeat: true }, 75), false);
  assert.equal(skip({ key: "ArrowLeft", repeat: true }, 80), false);
  assert.equal(skip({ key: "ArrowLeft", repeat: true }, 130), true);
  assert.equal(skip({ key: "ArrowLeft", repeat: true }, 155), false);
  assert.equal(skip({ key: "Enter", repeat: true }, 158), false);
  assert.equal(skip({ key: "ContextMenu", repeat: true }, 159), false);
  assert.equal(skip({ key: "Backspace", repeat: true }, 160), false);
});

test("Fire TV optimisations do not intercept keyboard text entry, player surfaces or first press", () => {
  const main = read("src/main.jsx");
  assert.match(main, /createFireTvRepeatLimiter/);
  assert.match(main, /if \(!event\.repeat\) return/);
  assert.match(main, /\[data-mg-player-root="true"\]/);
  assert.match(main, /textInputFocused/);
  assert.match(main, /stopImmediatePropagation\(\)/);
  assert.match(main, /new MutationObserver\(scheduleGuardCheck\)/);
  assert.match(main, /window\.requestAnimationFrame\(\(\) => \{/);
  const remote = read("src/components/mg/FireTvRemote.jsx");
  assert.match(remote, /data-mg-embedded-remote-player/);
  assert.match(remote, /tapOnlyFlixForRemote/);
});

test("voice search provides a bounded request, recogniser cleanup and a Fire TV keyboard fallback", () => {
  const search = read("src/components/mg/SearchDialog.jsx");
  assert.match(search, /voiceTimeoutRef/);
  assert.match(search, /15000/);
  assert.match(search, /voiceRecognitionRef\.current\?\.abort/);
  assert.match(search, /nativeBridge\.startVoiceSearch/);
  assert.match(search, /event\?\.detail\?\.text \|\| event\?\.detail\?\.transcript/);
  assert.match(search, /Fire TV keyboard/);
  assert.match(search, /if \(voiceListening\) return/);
});
