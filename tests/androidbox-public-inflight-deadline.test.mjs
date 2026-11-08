import test from "node:test";
import assert from "node:assert/strict";
import { sharePendingPublicLookup } from "../src/api/publicRequestCoalescing.js";
import { readFileSync } from "node:fs";

const never = () => new Promise(() => {});
const defer = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test("Android-box public lookup releases stalled pending slot even if fetch ignores AbortSignal", async () => {
  let starts = 0;
  const fetchImpl = () => {};
  const request = { title: "A Film" };
  const operation = () => { starts++; return never(); };
  const first = sharePendingPublicLookup(fetchImpl, "public-addon", request, operation, {timeoutMs: 12});
  const same = sharePendingPublicLookup(fetchImpl, "public-addon", request, operation, {timeoutMs: 12});
  assert.equal(first, same);
  await assert.rejects(first, /Public lookup timed out/);
  assert.equal(starts, 1);
  const retry = await sharePendingPublicLookup(fetchImpl, "public-addon", request, async () => {
    starts++;
    return {streams:[{name:"Recovered"}]};
  }, {timeoutMs: 20});
  assert.equal(starts, 2);
  assert.equal(retry.streams[0].name, "Recovered");
});

test("late completion of an expired lookup cannot replace a fresh retry", async () => {
  const firstGate = defer();
  const laterGate = defer();
  let calls = 0;
  const fetchImpl = () => {};
  const payload = { tmdb_id: 1234 };
  const first = sharePendingPublicLookup(fetchImpl, "imdb:resolveImdb", payload, async () => {
    calls++;
    return firstGate.promise;
  }, {timeoutMs: 12});
  await assert.rejects(first, /Public lookup timed out/);
  const second = sharePendingPublicLookup(fetchImpl, "imdb:resolveImdb", payload, async () => {
    calls++;
    return laterGate.promise;
  }, {timeoutMs: 200});
  firstGate.resolve({ imdb_id: "tt9999999" });
  laterGate.resolve({ imdb_id: "tt1234567" });
  const result = await second;
  assert.equal(result.imdb_id, "tt1234567");
  assert.equal(calls, 2);
});

test("public deduplication does not retain results once settled", async () => {
  let count = 0;
  const fetchImpl = () => {};
  const request = { title: "Fresh" };
  const invoke = () => sharePendingPublicLookup(fetchImpl, "public-addon", request, async () => {
    count++;
    return count;
  }, {timeoutMs: 100});
  assert.equal(await invoke(), 1);
  assert.equal(await invoke(), 2);
});

test("different public lookup kinds do not share the same response", async () => {
  const gate = defer();
  let starts = 0;
  const fetchImpl = () => {};
  const request = { tmdb_id: 1396 };
  const movie = sharePendingPublicLookup(fetchImpl, "imdb:resolveImdb", request,
    async () => { starts++; await gate.promise; return "movie"; }, {timeoutMs: 100});
  const tv = sharePendingPublicLookup(fetchImpl, "imdb:resolveTvImdb", request,
    async () => { starts++; await gate.promise; return "tv"; }, {timeoutMs: 100});
  gate.resolve();
  assert.deepEqual(await Promise.all([movie,tv]), ["movie","tv"]);
  assert.equal(starts, 2);
});

test("public catalogue, IMDb and addon lookups each use a bounded in-flight deadline", () => {
  const code = readFileSync(new URL("../src/api/independentMetadata.js", import.meta.url), "utf8");
  assert.match(code, /timeoutMs: timeoutMs \+ 1_000/);
  assert.match(code, /timeoutMs: 16_000/g);
  assert.equal((code.match(/timeoutMs: 16_000/g) || []).length, 2);
});
