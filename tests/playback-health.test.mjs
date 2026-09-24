import test from "node:test";
import assert from "node:assert/strict";

import {
  isAdvancingVodPlayback,
  updateVodProgress,
} from "../src/components/mg/playbackHealth.js";

test("a late source error cannot replace a video that is still advancing", () => {
  const video = { currentTime: 12, paused: false, ended: false };
  const initial = updateVodProgress({ video: null, time: 0, advancedAt: 0 }, video, 11, 1000);
  assert.equal(isAdvancingVodPlayback(video, initial, 1000), false);

  const advancing = updateVodProgress(initial, video, 12, 2000);
  assert.equal(isAdvancingVodPlayback(video, advancing, 2100), true);
  assert.equal(isAdvancingVodPlayback({ ...video }, advancing, 2100), false);

  video.paused = true;
  assert.equal(isAdvancingVodPlayback(video, advancing, 2100), false);
  video.paused = false;
  assert.equal(isAdvancingVodPlayback(video, advancing, 6100), false);
});

test("a seek requires new forward progress before it protects a source", () => {
  const video = { currentTime: 4, paused: false, ended: false };
  const old = { video, time: 200, advancedAt: 1000 };
  const seeking = updateVodProgress(old, video, 4, 2000);
  assert.equal(isAdvancingVodPlayback(video, seeking, 2100), false);

  video.currentTime = 5;
  const resumed = updateVodProgress(seeking, video, 5, 2200);
  assert.equal(isAdvancingVodPlayback(video, resumed, 2300), true);
});
