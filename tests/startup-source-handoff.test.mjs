import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAutoHandoffStartup } from "../src/components/mg/startupSourceHandoff.js";

const startup = {
  sortMode: "best",
  mediaType: "movie",
  manuallySelected: false,
  alreadyClaimed: false,
  selectorPinned: false,
  fileSelectorPinned: false,
  fileSwitching: false,
  nativePlaying: false,
};

test("AIOStreams only yields while an automatic startup handoff is available", () => {
  assert.equal(canAutoHandoffStartup(startup), true);

  for (const unavailable of [
    { sortMode: "4k" },
    { sortMode: "1080p" },
    { alreadyClaimed: true },
    { manuallySelected: true },
    { selectorPinned: true },
    { fileSelectorPinned: true },
    { fileSwitching: true },
    { nativePlaying: true },
    { mediaType: "live" },
  ]) {
    assert.equal(
      canAutoHandoffStartup({ ...startup, ...unavailable }),
      false,
      JSON.stringify(unavailable)
    );
  }
});

test("foreground resolution and Fire TV launch use the same handoff decision", () => {
  const player = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(player, /const startupHandoffAvailable = canAutoHandoffStartup\(/);
  assert.match(
    player,
    /const activeAioShouldYieldToAlternative = Boolean\(\s*startupHandoffAvailable/
  );
  assert.match(player, /UNCACHED REAL-DEBRID CACHE ENGINE[\s\S]*?activeAioShouldYieldToAlternative/);
  assert.match(player, /MAIN PLAYBACK RESOLUTION[\s\S]*?activeAioShouldYieldToAlternative/);
  assert.match(player, /const aioStreamsStartupTakeoverPending =\s*startupHandoffAvailable/);
  assert.match(player, /const approvedStartupTakeoverPending =\s*startupHandoffAvailable/);
  assert.match(player, /const englishStartupTakeoverPending =\s*startupHandoffAvailable/);
});
