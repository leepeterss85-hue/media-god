import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isLowCapacityTvDevice } from "../src/components/mg/deviceCapacity.js";

const withNavigator = (userAgent, run, maxTouchPoints = 0) => {
  // Newer Node exposes navigator as a getter-only global, so swap the
  // property descriptor rather than assigning to it.
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent, maxTouchPoints },
    configurable: true,
    writable: true,
  });
  try {
    return run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete globalThis.navigator;
  }
};

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a phone or desktop is never treated as a low-capacity television", () => {
  // A touchscreen phone must never inherit the television limits.
  withNavigator(
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile",
    () => {
      assert.equal(isLowCapacityTvDevice({ nav: { deviceMemory: 1, hardwareConcurrency: 2 } }), false);
    },
    5
  );
  withNavigator("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120", () => {
    assert.equal(isLowCapacityTvDevice({ nav: { deviceMemory: 1, hardwareConcurrency: 2 } }), false);
  });
});

test("an Android TV box is low capacity from reported memory", () => {
  withNavigator("Mozilla/5.0 (Linux; Android 9; Android TV) Chrome/120", () => {
    assert.equal(isLowCapacityTvDevice({ nav: { deviceMemory: 1, hardwareConcurrency: 4 } }), true);
    assert.equal(isLowCapacityTvDevice({ nav: { deviceMemory: 2, hardwareConcurrency: 4 } }), true);
  });
});

test("an Android TV box with unreported memory is judged by its cores", () => {
  withNavigator("Mozilla/5.0 (Linux; Android 9; Android TV) Chrome/120", () => {
    assert.equal(isLowCapacityTvDevice({ nav: { hardwareConcurrency: 4 } }), true);
    assert.equal(isLowCapacityTvDevice({ nav: { hardwareConcurrency: 8 } }), false);
    assert.equal(isLowCapacityTvDevice({ nav: { deviceMemory: 8, hardwareConcurrency: 8 } }), false);
  });
});

test("capacity limits are applied to caches, scans and poster decoding", () => {
  const client = read("src/components/mg/catalogueSourceCheckerClient.js");
  assert.match(client, /isLowCapacityTvDevice\(\)/);
  assert.match(client, /maxStatusEntries: 48, maxWaitingChecks: 24/);

  const rolling = read("src/components/mg/rollingSourceChecks.js");
  assert.match(rolling, /intervalMs = isLowCapacityTvDevice\(\)/);
  assert.match(rolling, /batchSize = isLowCapacityTvDevice\(\) \? 2/);

  const image = read("src/components/ui/image.jsx");
  assert.match(image, /const lowCapacity = fireTv && isLowCapacityTvDevice\(\)/);
  assert.match(image, /maxDpr = lowCapacity \? 1\.5/);
});