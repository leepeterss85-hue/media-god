import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Real-Debrid normal playback does not force remote traffic", () => {
  const source = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );

  const directBodies = [
    /body:\s*\`link=\$\{encodeURIComponent\(\s*link\s*\)\}\`/,
    /body:\s*\`link=\$\{encodeURIComponent\(\s*targetLink\s*\)\}\`/,
  ];

  for (const pattern of directBodies) {
    assert.match(source, pattern);
  }

  assert.match(
    source,
    /Number\(firstFailure\.upstream_error_code\) === 22[\s\S]*?&remote=1/
  );

  const forcedRemoteBodies =
    source.match(/&remote=1/g) || [];

  assert.equal(
    forcedRemoteBodies.length,
    2,
    "remote=1 must exist only in the two error-code-22 fallback paths"
  );
});
