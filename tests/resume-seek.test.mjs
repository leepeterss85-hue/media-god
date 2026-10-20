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
    base44: { entities: { ContinueWatching: entity } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    HTMLVideoElement: class {},
  });
  const context = { mediaType: 'movie', tmdbId: '42', title: 'Test', year: '2026' };
  const emit = (type, detail) => window.dispatchEvent({ type, detail });
  emit('mg:player-context', context);
  const source = { infoHash: 'abc', fileIdx: 2, url: 'https://example.test/temporary', viaRealDebrid: true };
  emit('mg:continue-watching-progress', { context, source, time: 120, duration: 1000, force: true });
  emit('mg:continue-watching-progress', { context, source, time: 240, duration: 1000, force: true });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].progress, 240);
  assert.equal(rows[0].source_type, 'rd');
  const saved = JSON.parse(decodeURIComponent(rows[0].video_url.slice('mgsource:'.length)));
  assert.equal(saved.infoHash, 'abc');
  assert.equal(saved.fileIdx, 2);
  emit('mg:continue-watching-progress', { context: { ...context, tmdbId: '99' }, source, time: 700, force: true });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(rows[0].progress, 240);
});
