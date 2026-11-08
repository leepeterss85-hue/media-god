import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFireTvFocusRefreshScheduler } from "../src/components/mg/fireTvFocusWork.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("a burst of DOM mutations schedules just one focus inspection per frame", () => {
  const frames = new Map();
  let nextId = 1;
  let inspections = 0;
  const schedule = createFireTvFocusRefreshScheduler(
    () => { inspections++; },
    {
      requestFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
      cancelFrame(id) { frames.delete(id); },
    }
  );
  for (let i = 0; i < 250; i++) schedule();
  assert.equal(frames.size, 1, "250 poster changes must not cause 250 full scans");
  assert.equal(inspections, 0, "Mutations must not block the current key press");
  const frame = [...frames.values()][0];frames.clear();frame();
  assert.equal(inspections, 1);
  schedule();assert.equal(frames.size, 1);
  schedule.cancel();
  assert.equal(frames.size, 0);
  schedule();assert.equal(frames.size, 0);
});

test("late scheduled frames cannot run after Fire TV remote unmount", () => {
  let callback;
  let scans = 0;
  const schedule = createFireTvFocusRefreshScheduler(
    () => { scans++; },
    { requestFrame(fn) { callback = fn; return 9; }, cancelFrame() {} }
  );
  schedule();
  schedule.cancel();
  callback();
  assert.equal(scans, 0);
});

test("Fire TV remote keeps key presses synchronous and coalesces only overlay changes", () => {
  const remote = read("src/components/mg/FireTvRemote.jsx");
  assert.match(remote, /window\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(remote, /const observer = new MutationObserver\(scheduleFocusOverlay\)/);
  assert.match(remote, /const scheduleFocusOverlay = createFireTvFocusRefreshScheduler\(focusOverlay\)/);
  assert.match(remote, /scheduleFocusOverlay\.cancel\(\)/);
  assert.match(remote, /focusOverlay\(\);/);
  assert.match(remote, /if \(!event\.repeat\) current\.click\(\)/);
});

test("keyed controls do not scan every poster during each focus change", () => {
  const memory = read("src/components/mg/FireTvFocusMemory.jsx");
  assert.match(memory, /const fallbackIndex = focusKey \|\| scope === document\.body/);
  assert.match(memory, /\? -1 : focusables\(scope\)\.indexOf\(element\)/);
  assert.match(memory, /const rowContext = focusKey\s*\? \{ rowLabel: "", rowCardIndex: -1 \}/);
  assert.match(memory, /index: fallbackIndex/);
  assert.match(memory, /if \(snapshot\.focusKey\)/);
  assert.match(memory, /const rowTarget = rowFallbackTarget\(snapshot, scope\)/);
  // The existing direct element and named focus key still take precedence
  // over unkeyed legacy fallback positions.
  assert.ok(memory.indexOf("snapshot.element.isConnected") < memory.indexOf("if (snapshot.focusKey)"));
});

test("remote performance change does not alter native player, Live TV, or key pacing", () => {
  const remote = read("src/components/mg/FireTvRemote.jsx");
  const stable = read("src/components/mg/fireTvStableMode.js");
  const limiter = read("src/components/mg/fireTvRepeatLimiter.js");
  assert.match(remote, /tapOnlyFlixForRemote/);
  assert.match(remote, /tvShowsRemoteTarget/);
  assert.match(remote, /liveTvRemoteTarget/);
  assert.match(stable, /shouldIgnoreStableTvMove\(event, now, lastMoveAt/);
  assert.match(limiter, /if \(!event\.repeat\)/);
  assert.match(remote, /event\.stopImmediatePropagation\(\)/);
});
