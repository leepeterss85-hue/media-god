import assert from "node:assert/strict";
import test from "node:test";
import { sourcesForNativeHandoff } from "../src/components/mg/nativePlaybackSourceHandoff.js";

test("phone handoff keeps only the selected source and its exact web index", () => {
  const sources = Array.from({ length: 500 }, (_, index) => ({
    webIndex: index * 2,
    url: `https://example.test/${index}.mp4`,
    preferredAudioTrackLanguage: index === 417 ? "en" : "unknown",
  }));

  assert.deepEqual(
    sourcesForNativeHandoff(sources, 834, sources[417].url, true),
    [sources[417]]
  );
  assert.equal(sourcesForNativeHandoff(sources, 834, sources[417].url)[0], sources[0]);
  assert.equal(sourcesForNativeHandoff(sources, 834, sources[417].url).length, 500);
});

test("phone handoff falls back to the matching URL when indexes are stale", () => {
  const sources = [{ webIndex: 8, url: "https://example.test/movie.mp4" }];
  assert.deepEqual(
    sourcesForNativeHandoff(sources, 99, sources[0].url, true),
    sources
  );
  assert.deepEqual(sourcesForNativeHandoff(sources, 99, "https://example.test/other.mp4", true), []);
  assert.deepEqual(sourcesForNativeHandoff([], 0, "", true), []);
});
