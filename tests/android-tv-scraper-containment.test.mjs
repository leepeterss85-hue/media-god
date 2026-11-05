import test from 'node:test';
import assert from 'node:assert/strict';
import { tvScraperSandbox, TV_SCRAPER_SANDBOX } from '../src/components/mg/tvScraperSandbox.js';
test('TV scraper containment applies to Android TV and Fire TV, preserving phone attributes', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    for (const userAgent of ['Android TV', 'Android AFTMM MediaGodFireTV/1.0']) {
      Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {userAgent, maxTouchPoints: 0}});
      assert.equal(tvScraperSandbox(), TV_SCRAPER_SANDBOX);
    }
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {userAgent: 'Android MediaGodMobile/1.0', maxTouchPoints: 5}});
    assert.equal(tvScraperSandbox(), undefined);
    assert.match(TV_SCRAPER_SANDBOX, /allow-scripts/);
    assert.doesNotMatch(TV_SCRAPER_SANDBOX, /allow-popups|allow-top-navigation|allow-downloads/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
});
