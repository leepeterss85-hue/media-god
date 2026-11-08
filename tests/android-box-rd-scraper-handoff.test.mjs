import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyTvBoxSource } from "../src/components/mg/tvBoxSourceGate.js";
import { resolveAccountToken } from "../src/api/accountSessionToken.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const pending = () => new Promise(() => {});

test("Android TV recognises supported webpage scraper domains even when labelled direct", () => {
  const cases = [
    ["https://onlyflix.to/watch/123", "onlyflix"],
    ["https://share.cdnm.ink/embed/tmdb/123", "onlyflix"],
    ["https://www.vidcore.org/embed/123", "vidcore"],
    ["https://vidsrc.to/embed/tv/123/1/2", "vidsrc"],
    ["https://www.2embed.cc/embed/123", "twoembed"],
    ["https://cinesrc.st/embed/movie/123", "cinesrc"],
    ["https://multiembed.mov/?video_id=123&tmdb=1", "multiembed"],
  ];
  for (const [url, provider] of cases) {
    assert.deepEqual(classifyTvBoxSource({type: "url", url}), {kind: "webpage", provider}, url);
  }
});

test("typed iframe on known provider keeps its identity and never enters native player", () => {
  assert.deepEqual(
    classifyTvBoxSource({type:"iframe", src:"https://www.vidcore.org/watch/123"}),
    {kind:"webpage", provider:"vidcore"},
  );
  assert.deepEqual(
    classifyTvBoxSource({type:"web", url:"https://vidsrc.to/embed/movie/123"}),
    {kind:"webpage", provider:"vidsrc"},
  );
  assert.equal(classifyTvBoxSource({type:"provider", url:"https://example.org/path"}).kind, "webpage");
  assert.equal(classifyTvBoxSource({type:"iframe"}).kind, "webpage");
});

test("generic scraper pages cannot masquerade as media while signed and extensionless CDN files remain eligible", () => {
  for (const url of [
    "https://example.org/player.php?id=123",
    "https://example.org/e/abc123",
    "https://example.org/embedtv/123",
    "https://example.org/watch/123?season=1",
  ]) {
    assert.equal(classifyTvBoxSource({type:"url", url}).kind, "webpage", url);
  }
  for (const url of [
    "https://cdn.example.org/player/master.m3u8?token=abc",
    "https://cdn.example.org/movie.mp4?Expires=123",
    "https://cdn.example.org/download/abc?token=xyz",
    "https://cdn.example.org/manifest.mpd",
  ]) {
    assert.equal(classifyTvBoxSource({type:"url", url}).kind, "media", url);
  }
});

test("the known-good source selector still blocks webpages before native launch", () => {
  const code = read("src/components/mg/MediaStreamSourcesBox.jsx");
  const begin = code.indexOf("const playAddonStream =");
  const gate = code.indexOf("const webScraperPage =", begin);
  const player = code.indexOf("await player.play({", begin);
  assert.ok(begin >= 0 && gate > begin && gate < player);
  assert.match(code, /isTvBox && mediaType !== "live" && webScraperPage/);
  assert.match(code, /player\.playOnlyFlix\?\.\(embedMedia\)/);
  assert.match(code, /player\.playVidCore\?\.\(embedMedia\)/);
  assert.match(code, /Choose OnlyFlix, VidCore or another web provider above/);
});

test("Real-Debrid SDK session reads finish promptly on Android-box auth hangs", async () => {
  const start = Date.now();
  const result = await resolveAccountToken({getToken: pending, timeoutMs: 12});
  assert.equal(result, "");
  assert.ok(Date.now() - start < 1000);
});

test("Real-Debrid token lookup keeps working credentials and an already-known fallback", async () => {
  assert.equal(await resolveAccountToken({
    getToken: async () => "  account-session  ", fallbackToken: "bootstrap"
  }), "account-session");
  assert.equal(await resolveAccountToken({
    getToken: () => {throw new Error("SDK unavailable");}, fallbackToken: "  bootstrap  "
  }), "bootstrap");
  assert.equal(await resolveAccountToken({
    getToken: pending, timeoutMs: 12, fallbackToken: "bootstrap"
  }), "bootstrap");
});

test("a late stale Android SDK token cannot replace the fallback after timeout", async () => {
  let finish;
  const late = new Promise((resolve) => {finish = resolve;});
  const result = await resolveAccountToken({
    getToken: () => late, fallbackToken: "bootstrap", timeoutMs: 10
  });
  finish("late-token");
  await Promise.resolve();
  assert.equal(result, "bootstrap");
});

test("real-debrid network wrapper still sends only verified account sessions", () => {
  const code = read("src/api/independentRealDebrid.js");
  assert.match(code, /resolveAccountToken/);
  assert.match(code, /timeoutMs = 1_800/);
  assert.match(code, /"Authorization": `Bearer \$\{session\}`/);
  assert.doesNotMatch(code, /localStorage\.setItem/);
});
