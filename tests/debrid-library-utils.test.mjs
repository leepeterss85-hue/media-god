import test from "node:test";
import assert from "node:assert/strict";

import {
  debridBucket,
  debridProgress,
  formatDebridBytes,
  formatDebridEta,
  formatDebridSpeed,
  isDebridActive,
  isDebridError,
  isDebridReady,
  isDebridRetryableError,
  normaliseDebridStatus,
} from "../src/components/mg/debridLibraryUtils.js";

test("debrid library classifies ready, active and failed torrents consistently", () => {
  const ready = { status: "downloaded", ready: true };
  const active = { status: "downloading", progress: 42 };
  const failed = { status: "files_error" };

  assert.equal(isDebridReady(ready), true);
  assert.equal(isDebridActive(ready), false);
  assert.equal(debridBucket(ready), "ready");

  assert.equal(isDebridActive(active), true);
  assert.equal(isDebridError(active), false);
  assert.equal(debridBucket(active), "active");

  assert.equal(isDebridError(failed), true);
  assert.equal(isDebridActive(failed), false);
  assert.equal(isDebridRetryableError(failed), true);
  assert.equal(isDebridRetryableError({ status: "virus" }), false);
  assert.equal(isDebridRetryableError({ status: "invalid" }), false);
  assert.equal(debridBucket(failed), "errors");
  assert.equal(normaliseDebridStatus({ status: "  MAGNET_ERROR " }), "magnet_error");
});

test("debrid progress and transfer formatting stay bounded and readable", () => {
  assert.equal(debridProgress({ progress: -20 }), 0);
  assert.equal(debridProgress({ progress: 51.5 }), 51.5);
  assert.equal(debridProgress({ progress: 180 }), 100);
  assert.equal(debridProgress({ progress: "not-a-number" }), 0);

  assert.equal(formatDebridBytes(1_500_000_000), "1.5 GB");
  assert.equal(formatDebridBytes(250_000_000), "250 MB");
  assert.equal(formatDebridSpeed(2_500_000), "2.5 MB/s");
  assert.equal(formatDebridSpeed(0), "");
  assert.equal(
    formatDebridEta({ bytes: 1_000_000_000, speed: 10_000_000, progress: 50 }),
    "<1 min"
  );
  assert.equal(
    formatDebridEta({ bytes: 10_000_000_000, speed: 1_000_000, progress: 50 }),
    "1h 24m"
  );
  assert.equal(formatDebridEta({ bytes: 1000, speed: 0, progress: 50 }), "");
});
