import test from 'node:test';
import assert from 'node:assert/strict';
import { createRollingSourceChecks } from '../src/components/mg/rollingSourceChecks.js';
import {
  catalogueSourceKey,
  createCatalogueSourceChecker,
} from '../src/components/mg/catalogueSourceAvailability.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

class FakeEvents extends EventTarget {
  constructor() {
    super();
    this.visibilityState = 'visible';
    this.navigator = { onLine: true };
    this.playerOpen = false;
    this.timers = new Map();
    this.nextId = 0;
  }
  querySelector(selector) {
    assert.equal(selector, '[data-mg-player-root="true"]');
    return this.playerOpen ? { nodeType: 1 } : null;
  }
  setInterval(callback, ms) {
    const id = ++this.nextId;
    this.timers.set(id, { callback, ms });
    return id;
  }
  clearInterval(id) { this.timers.delete(id); }
  tick() {
    for (const { callback } of this.timers.values()) callback();
  }
}

test('Android box pauses opportunistic catalogue scans during active VOD', async () => {
  const win = new FakeEvents();
  const doc = new FakeEvents();
  const seen = [];
  const stop = createRollingSourceChecks(
    () => [1, 2, 3],
    item => { seen.push(item); },
    { windowObject: win, documentObject: doc, batchSize: 2 },
  );
  await flush();
  assert.deepEqual(seen, [1, 2]);
  doc.playerOpen = true;
  win.tick();
  win.dispatchEvent(new Event('focus'));
  doc.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.deepEqual(seen, [1, 2], 'Video playback cannot trigger more catalogue requests');
  doc.playerOpen = false;
  win.tick();
  await flush();
  assert.deepEqual(seen, [1, 2, 3, 1], 'Scanning resumes when playback ends');
  stop();
  assert.equal(win.timers.size, 0);
});

test('Android box does not start a queued scan after video opens mid-microtask', async () => {
  const win = new FakeEvents();
  const doc = new FakeEvents();
  const seen = [];
  const stop = createRollingSourceChecks(
    () => [{id: 4}, {id: 5}],
    item => seen.push(item.id),
    { windowObject: win, documentObject: doc, batchSize: 2 },
  );
  // First batch was queued, but not yet sent.
  doc.playerOpen = true;
  await flush();
  assert.deepEqual(seen, []);
  doc.playerOpen = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.deepEqual(seen, [4, 5]);
  stop();
});

test('offline and hidden checks remain paused independent of playback state', async () => {
  const win = new FakeEvents();
  const doc = new FakeEvents();
  const seen = [];
  win.navigator.onLine = false;
  const stop = createRollingSourceChecks(() => [1], item => seen.push(item), {
    windowObject: win, documentObject: doc, batchSize: 1,
  });
  await flush();
  assert.deepEqual(seen, []);
  win.navigator.onLine = true;
  doc.visibilityState = 'hidden';
  win.tick();
  await flush();
  assert.deepEqual(seen, []);
  doc.visibilityState = 'visible';
  doc.playerOpen = true;
  win.tick();
  await flush();
  assert.deepEqual(seen, []);
  doc.playerOpen = false;
  win.tick();
  await flush();
  assert.deepEqual(seen, [1]);
  stop();
});

test('movie source identities accept TMDB field and mediaType aliases without querying TV shows', () => {
  const canonical = {media_type:'movie',tmdb_id:'1234',year:2026};
  const aliases = [
    {mediaType:'movie',tmdbId:1234,year:2026},
    {type:'Movie',id:1234,year:2026},
    {media_type:'MOVIE',tmdb_id:'1234',year:2026},
  ];
  for (const alias of aliases) {
    assert.equal(catalogueSourceKey(alias), catalogueSourceKey(canonical));
  }
  for (const item of [
    {mediaType:'tv',id:1234},
    {type:'episode',id:1234},
    {mediaType:'series',id:1234},
    {id:1234},
  ]) {
    assert.equal(catalogueSourceKey(item), '', 'Only exact films are checked');
  }
});

test('Home movie aliases coalesce into one source check without changing the status result', async () => {
  const calls = [];
  const checker = createCatalogueSourceChecker(async (name, payload) => {
    calls.push({name, payload});
    return {data:{streams:[{debridCached:true, url:'https://cdn.example.test/film.mp4'}]}};
  });
  const [first, second] = await Promise.all([
    checker.check({mediaType:'movie',tmdbId:'1234',year:2026}),
    checker.check({media_type:'movie',tmdb_id:1234,year:2026}),
  ]);
  assert.equal(first, 'found');
  assert.equal(second, 'found');
  assert.equal(calls.length, 1, 'Both catalogue shapes share one pending request');
  assert.equal(calls[0].payload.tmdb_id, '1234');
  assert.equal(calls[0].payload.media_type, 'movie');
  assert.equal(await checker.check({mediaType:'tv',tmdbId:'1234'}), 'unknown');
  assert.equal(calls.length, 1);
});
