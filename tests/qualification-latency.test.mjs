import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { firstAcceptedQualificationBatch } from "../src/components/mg/qualificationBatch.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function qualificationPool(probe) {
  const source = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("const qualifyCachedRealDebridLaunchPool ="), source.indexOf("const restoreQualifiedLaunchRows ="));
  const timers = new Map();
  let nextTimer = 0;
  return vm.runInNewContext(`${body}\nqualifyCachedRealDebridLaunchPool;`, {
    firstAcceptedQualificationBatch,
    // Deadlines remain pending until explicitly tested; no wall-clock delay
    // is needed to prove that a ready result bypasses its slow siblings.
    window: {
      setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout: timer => timers.delete(timer),
    },
    prioritiseEnglishAutoplayCandidates: items => items,
    sourceIsConfirmedCachedForPlayback: item => item.cached === true,
    sourceTargetsRealDebrid: item => item.viaRealDebrid === true,
    stableDiscoveredSourceKey: item => item.id,
    qualifyCachedRealDebridLaunchSource: ({ item }) => probe(item),
  });
}

test("foreground cached-source qualification returns a verified video before slow sibling probes finish", async () => {
  const blocked = deferred();
  const probes = [];
  const sources = Array.from({ length: 6 }, (_, index) => ({ id: String(index), cached: true, viaRealDebrid: true }));
  const winner = { ...sources[2], launchQualified: true, url: "https://media.test/inspected.mp4" };
  const pool = qualificationPool(item => {
    probes.push(item.id);
    return item.id === winner.id ? Promise.resolve(winner) : blocked.promise;
  });
  let result;
  const lookup = pool({ items: sources, targetCount: 1 }).then(value => { result = value; });
  await flush();
  assert.deepEqual(probes, ["0", "1", "2", "3", "4", "5"]);
  assert.equal(result?.[0], winner, "A ready inspected movie must not wait for the other 2.4-second probe deadlines");
  assert.equal(sources.length, 6, "Launching one result must not truncate the source pool");
  blocked.resolve(null);
  await lookup;
  await flush();
  assert.equal(result.length, 1, "Late probes must not mutate the selected result snapshot");
});

test("an unqualified HTTP result cannot win the foreground race", async () => {
  const valid = deferred();
  let settled = false;
  const lookup = firstAcceptedQualificationBatch([
    Promise.resolve({ url: "https://media.test/uninspected.mp4", launchQualified: false }),
    valid.promise,
  ], item => item?.launchQualified === true).then(value => { settled = true; return value; });
  await flush();
  assert.equal(settled, false);
  valid.resolve({ launchQualified: true, url: "https://media.test/inspected.mp4" });
  const result = await lookup;
  assert.equal(result[1].launchQualified, true);
});

test("failed first qualification batch still tries the remaining cached candidates", async () => {
  const sources = Array.from({ length: 7 }, (_, index) => ({ id: String(index), cached: true, viaRealDebrid: true }));
  const pool = qualificationPool(item => item.id === "6"
    ? Promise.resolve({ ...item, launchQualified: true })
    : Promise.reject(new Error("No usable video/audio")));
  const result = await pool({ items: sources, targetCount: 1 });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "6");
});

test("background preparation keeps full-batch quality ranking", async () => {
  const slow = deferred();
  const sources = Array.from({ length: 3 }, (_, index) => ({ id: String(index), cached: true, viaRealDebrid: true }));
  const pool = qualificationPool(item => item.id === "2" ? slow.promise : Promise.resolve({
    ...item, launchQualified: true, launchCompatibilityScore: Number(item.id),
  }));
  let result;
  const lookup = pool({ items: sources, targetCount: 2 }).then(value => { result = value; });
  await flush();
  assert.equal(result, undefined);
  slow.resolve({ ...sources[2], launchQualified: true, launchCompatibilityScore: 100 });
  await lookup;
  assert.deepEqual(Array.from(result, item => item.id), ["2", "1"]);
});
