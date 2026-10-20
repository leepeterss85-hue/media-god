import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sender = readFileSync(new URL("../src/components/mg/CastButton.jsx", import.meta.url), "utf8");

test("never uses HTML Remote Playback as a fallback for Google Cast", () => {
  assert.doesNotMatch(sender, /\.remote\.prompt\s*\(/);
  assert.doesNotMatch(sender, /remote\.state\s*===\s*["']connected/);
  assert.match(sender, /no Google Cast sender available/i);
});

test("requires receiver media state before reporting a successful cast", () => {
  assert.match(sender, /await waitForCastPlayback\(session, targetUrl\)/);
  assert.match(sender, /media\.playerState === "PLAYING"/);
  assert.match(sender, /media\.playerState === "IDLE" && media\.idleReason === "ERROR"/);
  assert.match(sender, /getMediaSession/);
  assert.match(sender, /if \(loadResult\) throw/);
});

test("rejects known unsupported video containers before launching the receiver", () => {
  assert.match(sender, /mkv\|avi\|wmv\|flv/);
  assert.match(sender, /casting cannot convert MKV\/AVI video/i);
  assert.ok(
    sender.indexOf('const mimeType = mediaContentType(targetUrl, contentType, source);') <
    sender.indexOf('await ctx.requestSession();'),
    "Reject incompatible media before displaying a Cast receiver splash"
  );
});
