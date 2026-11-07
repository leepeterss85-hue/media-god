import test from "node:test";
import assert from "node:assert/strict";
import { classifyTvBoxSource } from "../src/components/mg/tvBoxSourceGate.js";

test("Android TV boxes route common scraper webpages away from VLC", () => {
  for (const url of [
    "https://onlyflix.to/embed/movie/123",
    "https://www.onlyflix.to/watch/123",
    "https://share.cdnm.ink/movie/123",
    "https://www.vidcore.org/embed/123",
    "https://vidsrc.to/embed/movie/123",
    "https://example.org/embed/abc",
    "https://example.org/player?id=3",
    "https://example.org/watch.html",
  ]) {
    assert.equal(classifyTvBoxSource({ type: "url", url }).kind, "webpage", url);
  }
});

test("Android TV boxes preserve genuine direct media and signed links", () => {
  for (const url of [
    "https://cdn.example.org/movie.mp4",
    "https://cdn.example.org/master.m3u8",
    "https://cdn.example.org/manifest.mpd",
    "https://cdn.example.org/player/master.m3u8",
    "https://cdn.example.org/download/abc?token=123",
  ]) {
    assert.equal(classifyTvBoxSource({ type: "url", url }).kind, "media", url);
  }
});

test("Source classification keeps provider identity for in-app scraper routing", () => {
  assert.equal(classifyTvBoxSource({ url: "https://onlyflix.to/watch/abc" }).provider, "onlyflix");
  assert.equal(classifyTvBoxSource({ url: "https://www.vidcore.org/watch/abc" }).provider, "vidcore");
  assert.equal(classifyTvBoxSource({ type: "iframe", url: "https://example.org/anything" }).kind, "webpage");
});
