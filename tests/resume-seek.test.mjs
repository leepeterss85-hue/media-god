import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { safeSeek } from '../src/components/mg/safeSeek.js';

test('seeking clamps rewind and forward without ending playback', () => {
  const video = { duration: 100, currentTime: 95 };
  assert.equal(safeSeek(video, 110), true);
  assert.equal(video.currentTime, 99);
  safeSeek(video, -10);
  assert.equal(video.currentTime, 0);
  assert.equal(safeSeek(video, Infinity), false);
  assert.equal(safeSeek({ duration: Infinity }, 10), false);
  assert.equal(safeSeek({ duration: 100, set currentTime(_) { throw new Error('detached'); } }, 10), false);
});

test('seeking respects disjoint buffered seekable windows', () => {
  const video = { duration: 100, currentTime: 0, seekable: {
    length: 2, start: i => [10, 50][i], end: i => [30, 80][i],
  } };
  safeSeek(video, 45);
  assert.equal(video.currentTime, 50);
  safeSeek(video, 100);
  assert.equal(video.currentTime, 79.9);
});

test('native resume saves the selected source and latest position in one canonical row', async () => {
  const listeners = new Map();
  const rows = [];
  const window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener() {},
    dispatchEvent: event => listeners.get(event.type)?.(event),
  };
  const document = { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] };
  const entity = {
    list: async () => rows,
    filter: async ({ content_key }) => rows.filter(row => row.content_key === content_key),
    create: async data => { await new Promise(resolve => setTimeout(resolve, 10)); const row = { id: 'one', ...data }; rows.push(row); return row; },
    update: async (id, patch) => Object.assign(rows.find(row => row.id === id), patch),
  };
  const code = readFileSync(new URL('../src/components/mg/ContinueWatchingAssist.jsx', import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from "[^"]+";/g, '')
    .replace('export default function', 'function');
  vm.runInNewContext(code + '\nContinueWatchingAssist();', {
    useRef: current => ({ current }), useEffect: effect => effect(), window, document,
    profiledLibrary: { ContinueWatching: entity },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    HTMLVideoElement: class {},
  });
  const context = { mediaType: 'movie', tmdbId: '42', title: 'Test', year: '2026' };
  const emit = (type, detail) => window.dispatchEvent({ type, detail });
  emit('mg:player-context', context);
  const source = { infoHash: 'abc', fileIdx: 2, url: 'https://example.test/temporary', viaRealDebrid: true };
  emit('mg:continue-watching-progress', { context, source, time: 120, duration: 1000, force: true });
  emit('mg:continue-watching-progress', { context, source, time: 240, duration: 1000, force: true });
  // Regression tests run concurrently; allow the real queued async write
  // time to commit rather than racing a hardcoded 40ms host timer.
  const waitFor = async (ready) => {
    for (let attempt = 0; attempt < 60 && !ready(); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    assert.ok(ready(), "Timed out waiting for Continue Watching persistence");
  };
  await waitFor(() => rows.length === 1 && rows[0]?.progress === 240);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].progress, 240);
  assert.equal(rows[0].source_type, 'rd');
  const saved = JSON.parse(decodeURIComponent(rows[0].video_url.slice('mgsource:'.length)));
  assert.equal(saved.infoHash, 'abc');
  assert.equal(saved.fileIdx, 2);
  emit('mg:continue-watching-progress', { context: { ...context, tmdbId: '99' }, source, time: 700, force: true });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(rows[0].progress, 240);

  // Context changes for the same movie must not wipe selected torrent info.
  // Reproduce a seek to 52 minutes followed by a native callback without
  // the original source descriptor.
  emit('mg:player-context', { ...context, autoNext: false });
  emit('mg:continue-watching-progress', {
    context, source: null, time: 52 * 60, duration: 6200,
    url: '', force: true,
  });
  await waitFor(() => rows.length === 1 && rows[0]?.progress === 3120);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].progress, 3120);
  assert.equal(rows[0].source_type, 'rd');
  assert.equal(JSON.parse(decodeURIComponent(rows[0].video_url.slice('mgsource:'.length))).infoHash, 'abc');

  // Transient native stream URLs cannot replace durable torrent identity.
  emit('mg:continue-watching-progress', {
    context, source: { url: 'https://temporary.test/stream', type: 'file' },
    time: 52 * 60 + 5, duration: 6200, force: true,
  });
  await waitFor(() => rows[0]?.progress === 3125);
  assert.equal(rows[0].progress, 3125);
  assert.equal(JSON.parse(decodeURIComponent(rows[0].video_url.slice('mgsource:'.length))).infoHash, 'abc');
});

test('Continue Watching never silently selects OnlyFlix for a missing source', () => {
  const rowCode = readFileSync(
    new URL('../src/components/mg/ContinueWatchingRow.jsx', import.meta.url), 'utf8'
  );
  assert.match(rowCode, /const explicitOnlyFlixResume\s*=\s*savedSourceType === "onlyflix"/);
  assert.match(rowCode, /\/onlyflix\/i\.test\(savedUrl\)/);
  assert.doesNotMatch(rowCode, /if \(!isTv && !hasPreviouslySelectedAlternateSource && player\.playOnlyFlix\)/);
  assert.match(rowCode, /verifiedPlaybackPolicy: "strict",\s*sources: \[\]/);
});

test('a second device reuses the same TMDB history despite different metadata and never resets a saved playhead to five seconds', async () => {
  const listeners = new Map();
  const oldSource = { infoHash: 'reliable-42', fileIdx: 0, viaRealDebrid: true };
  const video_url = `mgsource:${encodeURIComponent(JSON.stringify(oldSource))}`;
  const rows = [{ id: 'same-account', content_key: 'mg2|42|movie|2025|||Test',
    title: 'Test', year: '2025', source_type: 'rd', video_url,
    progress: 3120, duration: 6200, updated_date: '2026-10-27T13:00:00Z' }];
  const win = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener() {},
    dispatchEvent: event => listeners.get(event.type)?.(event),
  };
  const doc = { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] };
  const entity = {
    list: async () => rows,
    filter: async ({ content_key }) => rows.filter(row => row.content_key === content_key),
    create: async data => { const row={ id: 'duplicate', ...data }; rows.push(row); return row; },
    update: async (id, patch) => Object.assign(rows.find(row => row.id === id), patch),
  };
  const code = readFileSync(new URL('../src/components/mg/ContinueWatchingAssist.jsx', import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from "[^"]+";/g, '')
    .replace('export default function', 'function');
  vm.runInNewContext(code + '\nContinueWatchingAssist();', {
    useRef: current => ({current}), useEffect: effect => effect(),
    window: win, document: doc, EMBED_HISTORY_CHANGED: 'mg:continue-watching-saved',
    profiledLibrary: {ContinueWatching: entity},
    CustomEvent: class { constructor(type, options) { this.type=type; this.detail=options?.detail; } },
    HTMLVideoElement: class {},
  });
  const context = {mediaType: 'movie', tmdbId: '42', title: 'Test', year: '2026'};
  win.dispatchEvent({type:'mg:player-context',detail:context});
  win.dispatchEvent({type:'mg:continue-watching-source', detail:{source:oldSource}});
  const until = async condition => {
    for (let i=0; i<60 && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(condition(), 'history write not received');
  };
  await until(() => rows[0].year === '2026');
  assert.equal(rows.length,1);
  assert.equal(rows[0].progress,3120,'starting a different device must not reset the saved playhead');
  assert.equal(rows[0].duration,6200);
  win.dispatchEvent({type:'mg:continue-watching-progress',detail:{context,source:oldSource,time:3300,duration:6200,force:true}});
  await until(() => rows[0].progress === 3300);
  assert.equal(rows.length,1);
  assert.equal(rows[0].source_type,'rd');
  assert.equal(JSON.parse(decodeURIComponent(rows[0].video_url.slice(9))).infoHash,'reliable-42');
});
