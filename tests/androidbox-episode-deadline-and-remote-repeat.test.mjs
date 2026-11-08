import test from "node:test";
import assert from "node:assert/strict";
import { fetchEpisodeScraperJson } from "../src/components/mg/tvEpisodeScraper.js";
import { createFireTvRepeatLimiter } from "../src/components/mg/fireTvRepeatLimiter.js";

const stalled = () => new Promise(() => {});

test("Android TV scraper timeout resolves even when native WebView ignores abort", async () => {
  let signal;
  const start = Date.now();
  const result = await fetchEpisodeScraperJson("https://scraper.example.test/watch-tv", {
    timeoutMs: 15,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return stalled();
    },
  });
  assert.equal(result, null);
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - start < 500, "A hung fetch must not pin the episode source search");
});

test("Android TV scraper timeout also bounds a stuck JSON body reader", async () => {
  let signal;
  const data = await fetchEpisodeScraperJson("https://scraper.example.test/watch-tv", {
    timeoutMs: 15,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return { ok: true, status: 200, json: stalled };
    },
  });
  assert.equal(data, null);
  assert.equal(signal.aborted, true);
});

test("legacy 404 route quarantine still receives the missing-route marker", async () => {
  const data = await fetchEpisodeScraperJson("https://scraper.example.test/watch-tv", {
    timeoutMs: 100,
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.deepEqual(data, { __missingRoute: true });
});

test("scraper errors do not masquerade as usable episode sources", async () => {
  assert.equal(await fetchEpisodeScraperJson("https://scraper.example.test/watch-tv", {
    timeoutMs: 100,
    fetchImpl: async () => ({ ok: false, status: 429 }),
  }), null);
  assert.equal(await fetchEpisodeScraperJson("https://scraper.example.test/watch-tv", {
    timeoutMs: 100,
    fetchImpl: async () => { throw new Error("Offline"); },
  }), null);
});

test("normal fast scraper response remains unchanged", async () => {
  const expected = { streams: [{ url: "https://cdn.example.test/episode.m3u8" }] };
  let options;
  const data = await fetchEpisodeScraperJson("https://scraper.example.test/watch-tv", {
    timeoutMs: 100,
    fetchImpl: async (_url, init) => {
      options = init;
      return { ok: true, status: 200, json: async () => expected };
    },
  });
  assert.deepEqual(data, expected);
  assert.equal(options.method, "GET");
  assert.equal(options.headers.Accept, "application/json");
});

test("native Android DPAD keyCodes are repeat-limited without missing first presses", () => {
  const throttle = createFireTvRepeatLimiter(72);
  assert.equal(throttle({ key: "Unidentified", keyCode: 19, repeat: false }, 1000), false);
  assert.equal(throttle({ key: "Unidentified", keyCode: 19, repeat: true }, 1005), true);
  assert.equal(throttle({ key: "Unidentified", keyCode: 19, repeat: true }, 1075), false);
  assert.equal(throttle({ key: "Unidentified", keyCode: 20, repeat: true }, 1076), false, "Direction changes must never disappear");
  assert.equal(throttle({ key: "Unidentified", keyCode: 20, repeat: true }, 1080), true);
});

test("browser DPAD keyCodes and real Arrow keys share throttle identity", () => {
  const throttle = createFireTvRepeatLimiter(72);
  assert.equal(throttle({ key: "ArrowLeft", keyCode: 37, repeat: false }, 3000), false);
  assert.equal(throttle({ key: "Unidentified", keyCode: 21, repeat: true }, 3010), true);
  assert.equal(throttle({ key: "Unidentified", which: 39, repeat: false }, 3011), false);
  assert.equal(throttle({ key: "ArrowRight", keyCode: 39, repeat: true }, 3015), true);
});

test("TV remote action keys, Back, Menu and media controls are not throttled", () => {
  const throttle = createFireTvRepeatLimiter(72);
  for (const keyCode of [4, 23, 13, 82, 85, 89, 90, 126, 127]) {
    assert.equal(throttle({ key: "Unidentified", keyCode, repeat: true }, 1000), false, String(keyCode));
  }
  assert.equal(throttle({ key: "ArrowDown", keyCode: 40, repeat: false }, 2000), false);
  assert.equal(throttle({ key: "ArrowDown", keyCode: 40, repeat: true }, 2001), true);
});
