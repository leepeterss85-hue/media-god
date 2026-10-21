import test from "node:test";
import assert from "node:assert/strict";
import { restoreResumeSource } from "../src/components/mg/resumeSource.js";

test("history resolves the original torrent instead of replaying an expired CDN URL", () => {
  const saved = {
    type: "file", src: "https://expired.test/movie.mp4", url: "https://expired.test/movie.mp4",
    infoHash: "a".repeat(40), fileIdx: 3, launchQualified: true, debridCached: true,
  };
  const restored = restoreResumeSource(saved);
  assert.equal(restored.type, "torrent");
  assert.equal(restored.src, `magnet:?xt=urn:btih:${saved.infoHash}`);
  assert.equal(restored.url, restored.src);
  assert.equal(restored.fileIdx, 3);
  assert.equal(restored.launchQualified, undefined);
  assert.equal(saved.src, "https://expired.test/movie.mp4");
});

test("restoration keeps original magnet trackers and file selection", () => {
  const magnet = `magnet:?xt=urn:btih:${"b".repeat(40)}&tr=https%3A%2F%2Ftracker.test`;
  const restored = restoreResumeSource({ magnetLink: magnet, file_idx: 0, src: "https://expired.test" });
  assert.equal(restored.src, magnet);
  assert.equal(restored.file_idx, 0);
});

test("ordinary direct files remain available and invalid records are rejected", () => {
  const direct = { type: "file", src: "https://example.test/video.mp4" };
  assert.deepEqual(restoreResumeSource(direct), direct);
  assert.equal(restoreResumeSource(null), null);
  assert.equal(restoreResumeSource([]), null);
});

test("RD library history without a hash refreshes through its existing torrent ID", () => {
  const restored = restoreResumeSource({ type: "file", rdTorrentId: "RD123", src: "https://expired.test" });
  assert.equal(restored.type, "rd_torrent");
  assert.equal(restored.src, "RD123");
  assert.equal(restored.rdTorrentId, "RD123");
});
