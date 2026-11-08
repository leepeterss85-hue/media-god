import test from "node:test";
import assert from "node:assert/strict";
import { invokeIndependentPublicFeature as invoke } from "../src/api/independentMetadata.js";

const never = () => new Promise(() => {});
const timedOut = error => error.code === "PUBLIC_FEATURE_TIMEOUT";
const drain = () => new Promise(resolve => setImmediate(resolve));

for (const name of ["getFireTvApkLink", "getSkipSegments", "getEntertainmentNews"]) {
  test(`${name} settles when Android WebView ignores fetch cancellation`, async () => {
    let signal;
    await assert.rejects(invoke(name, {}, {
      timeoutMs: 15,
      fetchImpl: (_url, options) => { signal = options.signal; return never(); },
    }), timedOut);
    assert.equal(signal.aborted, true);
  });

  test(`${name} bounds a stalled JSON body and allows a fresh retry`, async () => {
    await assert.rejects(invoke(name, {}, {
      timeoutMs: 15,
      fetchImpl: async () => ({ ok: true, json: never }),
    }), timedOut);
    const result = await invoke(name, {}, {
      timeoutMs: 100,
      fetchImpl: async () => ({ ok: true, json: async () => ({ available: true }) }),
    });
    assert.deepEqual(result, { data: { available: true } });
  });
}

test("late APK response is not decoded after the hard deadline", async () => {
  let finish;
  let decoded = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  await assert.rejects(invoke("getFireTvApkLink", {}, {
    timeoutMs: 15, fetchImpl: () => pending,
  }), timedOut);
  finish({ ok: true, json: async () => { decoded++; return { url: "https://example.test/app.apk" }; } });
  await drain();
  assert.equal(decoded, 0);
});

test("public feature failures retain HTTP and invalid-response errors", async () => {
  await assert.rejects(invoke("getSkipSegments", {}, {
    timeoutMs: 100, fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /returned 503/);
  await assert.rejects(invoke("getSkipSegments", {}, {
    timeoutMs: 100, fetchImpl: async () => ({ ok: true, json: async () => ({ error: "unavailable" }) }),
  }), /Invalid getSkipSegments response/);
});
