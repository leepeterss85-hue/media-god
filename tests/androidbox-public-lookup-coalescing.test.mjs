import test from "node:test";
import assert from "node:assert/strict";
import {
  invokeIndependentMetadata,
  invokeIndependentAddonSources,
} from "../src/api/independentMetadata.js";
import { sharePendingPublicLookup } from "../src/api/publicRequestCoalescing.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (body, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
const memoryStorage = () => {
  const entries = new Map();
  return {
    getItem: k => entries.get(k) ?? null,
    setItem: (k, v) => entries.set(k, v),
    removeItem: k => entries.delete(k),
    key: i => [...entries.keys()][i],
    get length() { return entries.size; },
  };
};

test("Android box concurrent identical catalogue requests share one HTTP call", async () => {
  const gate = deferred();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    await gate.promise;
    return response({ rows: [{ id: 123, title: "Show" }] });
  };
  const payload = { category: "trending", page: 1 };
  const storage = memoryStorage();
  const first = invokeIndependentMetadata(payload, { fetchImpl, storage });
  const second = invokeIndependentMetadata({ ...payload }, { fetchImpl, storage });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.credentials, "omit");
  assert.doesNotMatch(JSON.stringify(calls[0].options.headers), /authorization/i);
  gate.resolve();
  const values = await Promise.all([first, second]);
  assert.deepEqual(values, [
    { data: { rows: [{ id: 123, title: "Show" }] } },
    { data: { rows: [{ id: 123, title: "Show" }] } },
  ]);
  assert.ok(storage.length > 0);
  await invokeIndependentMetadata(payload, { fetchImpl, storage });
  assert.equal(calls.length, 2, "coalescing is in-flight only, not an indefinite cache");
});

test("different catalogue pages never share a network lookup", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response({ page: calls }); };
  await Promise.all([
    invokeIndependentMetadata({ page: 2 }, { fetchImpl, storage: null }),
    invokeIndependentMetadata({ page: 3 }, { fetchImpl, storage: null }),
  ]);
  assert.equal(calls, 2);
});

test("public addon source discovery collapses simultaneous same-title lookups without persisting URLs", async () => {
  const gate = deferred();
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.ok(url.includes("/functions/fetchAddonStreams"));
    const input = JSON.parse(options.body);
    assert.equal(input.title, "Episode");
    assert.equal(input.season, 1);
    assert.equal("rd_token" in input, false);
    assert.equal("guest_device_key" in input, false);
    assert.equal(options.credentials, "omit");
    await gate.promise;
    return response({ streams: [{ url: "https://cdn.test/video.m3u8?sig=expiring" }] });
  };
  const request = { title: "Episode", season: 1, rd_token: "private", guest_device_key: "secret" };
  const first = invokeIndependentAddonSources(request, { fetchImpl });
  const second = invokeIndependentAddonSources({ ...request }, { fetchImpl });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.data.streams[0].url, b.data.streams[0].url);
  await invokeIndependentAddonSources(request, { fetchImpl });
  assert.equal(calls, 2, "signed provider URLs must not be retained after settlement");
});

test("a failed source query releases its in-flight key for immediate retry", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return calls === 1 ? response({ error: "Busy" }, 503) : response({ streams: [] });
  };
  const [a, b] = await Promise.allSettled([
    invokeIndependentAddonSources({ tmdb_id: 42 }, { fetchImpl }),
    invokeIndependentAddonSources({ tmdb_id: 42 }, { fetchImpl }),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.status, "rejected");
  assert.equal(b.status, "rejected");
  const retry = await invokeIndependentAddonSources({ tmdb_id: 42 }, { fetchImpl });
  assert.deepEqual(retry.data.streams, []);
  assert.equal(calls, 2);
});

test("different transports cannot share an authenticated or unrelated browser context", async () => {
  const a = deferred();
  const b = deferred();
  let callsA = 0, callsB = 0;
  const transportA = () => { callsA++; return a.promise; };
  const transportB = () => { callsB++; return b.promise; };
  const first = sharePendingPublicLookup(transportA, "identity", { id: 1 }, transportA);
  const second = sharePendingPublicLookup(transportB, "identity", { id: 1 }, transportB);
  await Promise.resolve();
  assert.equal(callsA, 1);
  assert.equal(callsB, 1);
  a.resolve("A");
  b.resolve("B");
  assert.deepEqual(await Promise.all([first, second]), ["A", "B"]);
});

test("per-caller stale public cache remains usable during a shared Railway failure", async () => {
  const saved = memoryStorage();
  const payload = { section: "new", page: 7 };
  await invokeIndependentMetadata(payload, {
    storage: saved,
    fetchImpl: async () => response({ rows: ["cached"] }),
  });
  const gate = deferred();
  let calls = 0;
  const failFetch = async () => { calls++; await gate.promise; return response({error:"blocked"}, 403); };
  const one = invokeIndependentMetadata(payload, {storage: saved, fetchImpl: failFetch});
  const two = invokeIndependentMetadata(payload, {storage: memoryStorage(), fetchImpl: failFetch});
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve();
  const results = await Promise.allSettled([one, two]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[0].value.stale, true);
  assert.deepEqual(results[0].value.data.rows, ["cached"]);
  assert.equal(results[1].status, "rejected");
});
