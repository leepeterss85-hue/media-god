import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHomeSections } from '../src/components/mg/progressiveHomeLoading.js';
import { createVisibleRefreshGate } from '../src/components/mg/visibleRefreshGate.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('ready Home rows and library appear despite a slow row and recommendations', async () => {
  const slow = deferred(), recommendation = deferred();
  const rows = {}, library = {};
  let seedStarted = false, seedPublished = false;
  const run = loadHomeSections({
    catalogue: { trending: Promise.resolve(['ready']), topRated: slow.promise },
    library: { history: Promise.resolve(['history']), watchlist: Promise.resolve(['saved']) },
    onCatalogue: (key, items) => { rows[key] = items; },
    onLibrary: (key, items) => { library[key] = items; },
    resolveSeed: values => { seedStarted = true; assert.deepEqual(values.history, ['history']); return recommendation.promise; },
    onSeed: () => { seedPublished = true; },
    isActive: () => true,
  });
  await tick();
  assert.deepEqual(rows, { trending: ['ready'] });
  assert.deepEqual(library.watchlist, ['saved']);
  assert.equal(seedStarted, false, 'optional lookup must not compete with initial catalogue requests');
  slow.resolve(['later']);
  await run.catalogueDone;
  await tick();
  assert.deepEqual(rows.topRated, ['later']);
  assert.equal(seedStarted, true);
  assert.equal(seedPublished, false, 'recommendations still pending but rows have been published');
  recommendation.resolve({ id: 1 });
  await run.done;
  assert.equal(seedPublished, true);
});

test('one failed request cannot hide successful rows and optional recommendation failure is contained', async () => {
  const rows = {}, library = {};
  let seed = 'unset';
  const run = loadHomeSections({
    catalogue: { good: Promise.resolve([1]), failed: Promise.reject(new Error('offline')) },
    library: { watchlist: Promise.reject(new Error('offline')) },
    onCatalogue: (key, items) => { rows[key] = items; },
    onLibrary: (key, items) => { library[key] = items; },
    resolveSeed: () => Promise.reject(new Error('lookup failed')),
    onSeed: value => { seed = value; },
    isActive: () => true,
  });
  await run.done;
  assert.deepEqual(rows, { good: [1], failed: [] });
  assert.deepEqual(library, { watchlist: [] });
  assert.equal(seed, null);
});

test('leaving Home suppresses late row updates and subsequent recommendation work', async () => {
  const pending = deferred();
  let active = true, writes = 0, lookups = 0;
  const run = loadHomeSections({
    catalogue: { movies: pending.promise }, library: { history: pending.promise },
    onCatalogue: () => writes++, onLibrary: () => writes++, onSeed: () => writes++,
    resolveSeed: () => lookups++, isActive: () => active,
  });
  active = false;
  pending.resolve([]);
  await run.done;
  assert.equal(writes, 0);
  assert.equal(lookups, 0);
});

test('leaving during recommendation lookup suppresses its result', async () => {
  const pending = deferred();
  let active = true, writes = 0;
  const run = loadHomeSections({
    catalogue: {}, library: {}, onCatalogue() {}, onLibrary() {},
    resolveSeed: () => pending.promise, onSeed: () => writes++, isActive: () => active,
  });
  await tick(); active = false; pending.resolve({ id: 1 });
  await run.done;
  assert.equal(writes, 0);
});

test('episode refresh coalesces wake events, ignores background/busy loads and permits later refresh', () => {
  let time = 0, visible = true, busy = false, count = 0;
  const gate = createVisibleRefreshGate({ refresh: () => count++, isVisible: () => visible, isBusy: () => busy, now: () => time });
  gate.markStarted();
  assert.equal(gate.request(), false);
  time = 2000;
  assert.equal(gate.request(), true);
  time += 20;
  assert.equal(gate.request(), false);
  time = 120000; visible = false;
  assert.equal(gate.request(), false);
  visible = true; busy = true;
  assert.equal(gate.request(), false);
  busy = false;
  assert.equal(gate.request(), true);
  gate.markStarted(); time += 999;
  assert.equal(gate.request(), false);
  time += 1;
  assert.equal(gate.request(), true);
  assert.equal(count, 3);
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('out-of-order release responses preserve merged movie rows and unrelated catalogue sections', () => {
  const source = readFileSync(new URL('../src/components/mg/HomeDashboard.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('    const catalogueValues = {};');
  const end = source.indexOf('    loadHomeSections({', start);
  for (const todayFirst of [true, false]) {
    let rows = { trending: [{ id: 99 }] };
    const context = vm.createContext({
      todayKey: '2026-11-14',
      releaseDateOf: item => item.release_date,
      dedupeMedia: items => [...new Map(items.map(item => [item.id, item])).values()],
      sortNewestFirst: items => [...items].sort((a, b) => b.release_date.localeCompare(a.release_date)),
      setRows: update => { rows = update(rows); },
    });
    vm.runInContext(source.slice(start, end) + '\nglobalThis.publish = publishCatalogue;', context);
    const today = [{ id: 1, release_date: '2026-11-14' }, { id: 3, release_date: '2026-11-15' }];
    const cinema = [{ id: 2, release_date: '2026-11-13' }, { id: 1, release_date: '2026-11-14' }];
    const entries = [['todayMoviesRaw', today], ['newMoviesRaw', cinema]];
    for (const [key, value] of todayFirst ? entries : entries.reverse()) context.publish(key, value);
    assert.deepEqual(Array.from(rows.todayMovies, item => item.id), [1]);
    assert.deepEqual(Array.from(rows.newMovies, item => item.id), [1, 2]);
    assert.deepEqual(rows.trending, [{ id: 99 }]);
    context.publish('todayTVRaw', today);
    context.publish('newTVRaw', cinema);
    assert.deepEqual(Array.from(rows.tvPremieresToday, item => item.id), [1]);
    assert.deepEqual(Array.from(rows.moreTVToday, item => item.id), [3]);
    assert.deepEqual(Array.from(rows.newTV, item => item.id), [1, 2]);
  }
});
