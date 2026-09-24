import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const player = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");

test("a cache failure tries real media sources and never opens an embedded website", () => {
  const start = player.indexOf("const nextReadySource = findNextPlayableSource(activeIdx, {");
  const end = player.indexOf("setRdPreparation((current) => ({", start);
  assert.ok(start >= 0 && end > start);

  const recovery = player.slice(start, end);
  assert.match(recovery, /switchToSource\(nextReadySource,/);
  assert.match(recovery, /const nextSource = findNextPlayableSource\(activeIdx\)/);
  assert.match(recovery, /switchToSource\(nextSource,/);
  assert.doesNotMatch(recovery, /iframe|embed|window\.open|location\.assign/);
  assert.doesNotMatch(player, /alternateEmbedFallback|vaplayer\.ru/);
});

test("movie and episode provider pages cannot replace the video stage", () => {
  assert.match(provider, /!\["youtube", "provider", "external"\]\.includes\(type\)/);
  assert.match(player, /!isLive && \(isYoutube \|\| isProvider \|\| active\?\.type === "external"\)/);
  assert.match(player, /This link opens a website instead of a video/);
  assert.match(player, /if \(!isLive \|\| !isProvider \|\| !isFireTvRemoteRuntime\(\)\)/);
  assert.doesNotMatch(player, /data-mg-alternate-embed-fallback/);
});
