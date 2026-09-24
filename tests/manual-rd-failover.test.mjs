import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("a manually chosen torrent keeps its Real-Debrid error when automatic failover is refused", () => {
  const player = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const failureStart = player.indexOf(
    "const nextReadySource = findNextPlayableSource(activeIdx, {"
  );
  const errorEnd = player.indexOf(
    '"Real-Debrid could not prepare this uncached torrent."',
    failureStart
  );
  const failureHandler = player.slice(failureStart, errorEnd);

  assert.ok(failureStart > 0 && errorEnd > failureStart);
  assert.match(player, /if \(!manualSelection && manualSourceLockActive\(\)\)\s*\{\s*return false;/);
  assert.match(failureHandler, /nextReadySource !== -1 &&\s*switchToSource\(nextReadySource,/);
  assert.match(failureHandler, /nextSource !== -1 &&\s*switchToSource\(nextSource,/);
  assert.doesNotMatch(failureHandler, /setRdError\(""\)/);
  assert.match(failureHandler, /setRdError\(\s*result\.message/);
});
