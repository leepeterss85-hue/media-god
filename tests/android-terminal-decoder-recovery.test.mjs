import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("terminal Android VOD failures release only the failed manual source lock", () => {
  const player = read("src/components/mg/VideoPlayer.jsx");

  assert.match(player, /if \(reason === "startup_timeout" && !isLive\)/);
  assert.match(
    player,
    /manualSourceLockRef\.current = \{\s*sourceKey: "",\s*playRequestId: currentPlayRequestId,/s
  );
  assert.match(
    player,
    /Selected source failed in Android — trying another ready source/
  );
  assert.doesNotMatch(player, /__audio_recovery_hold__/);

  // Normal speculative/background failover still respects a deliberate manual
  // source choice. Only a terminal native result releases that failed lock.
  assert.match(
    player,
    /if \(!activeIsLive && manualSourceLockActive\(\) && !userReportedNoSound\)/
  );
});
