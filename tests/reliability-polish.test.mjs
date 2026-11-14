import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { downloadProgress } from '../src/components/mg/deviceDownloadProgress.js';
import { invokeIndependentImdbResolver, invokeIndependentMetadata } from '../src/api/independentMetadata.js';
import { recordRequestDiagnostic, readDiagnosticErrors } from '../src/components/mg/diagnostics.js';

function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
}
test('identity matches survive catalogue churn and do not mix movies and TV', async () => {
  const store = storage(); let calls = 0;
  const fetchImpl = async url => { calls++; return { ok: true, json: async () => url.includes('resolve') ? { imdb_id: 'tt12345' } : { results: [] } }; };
  const options = { fetchImpl, storage: store };
  await invokeIndependentImdbResolver('resolveImdb', { tmdb_id: 123 }, options);
  for (let page = 1; page <= 20; page++) await invokeIndependentMetadata({ page }, options);
  const before = calls;
  await invokeIndependentImdbResolver('resolveImdb', { tmdb_id: 123 }, options);
  assert.equal(calls, before);
  await invokeIndependentImdbResolver('resolveTvImdb', { tmdb_id: 123 }, options);
  assert.equal(calls, before + 1);
});
test('download estimates handle unknown size, stalled, paused and completed transfers', () => {
  assert.equal(downloadProgress({ bytes: 50, total: -1 }).percent, null);
  const first = { bytes: 50, time: 1000 };
  const running = downloadProgress({ bytes: 100, total: 200, status: 'downloading' }, first, 6000);
  assert.equal(running.percent, 50); assert.equal(running.eta, 10);
  assert.equal(downloadProgress({ bytes: 50, total: 200, status: 'downloading' }, first, 6000).eta, null);
  assert.equal(downloadProgress({ bytes: 100, total: 200, status: 'paused' }, first, 6000).eta, null);
  assert.equal(downloadProgress({ bytes: 200, total: 200, status: 'complete' }, first, 6000).percent, 100);
});
test('slow request diagnostics respect opt-in and never retain query identity', () => {
  const original = globalThis.window;
  globalThis.window = { localStorage: storage() };
  try {
    recordRequestDiagnostic('imdb:secret-title', 12000, false);
    assert.deepEqual(readDiagnosticErrors(), []);
    window.localStorage.setItem('mg:local-crash-monitoring:v1', '1');
    recordRequestDiagnostic('imdb:secret-title', 12000, false);
    assert.equal(readDiagnosticErrors().length, 1);
    assert.ok(!JSON.stringify(readDiagnosticErrors()).includes('secret-title'));
    recordRequestDiagnostic('imdb:secret-title', 12000, false);
    assert.equal(readDiagnosticErrors().length, 1);
  } finally { if (original === undefined) delete globalThis.window; else globalThis.window = original; }
});
test('release 404 recovers only the exact tag from paginated releases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg-release-'));
  try {
    writeFileSync(join(dir, 'gh'), '#!/bin/bash\nif [[ "$*" == *"releases/tags/"* ]]; then exit 1; fi\nprintf \'[[{"tag_name":"wrong","id":1}],[{"tag_name":"firetv-latest","id":2}]]\'\n', { mode: 0o755 });
    const result = spawnSync('bash', ['-c', 'source "$1"; repo=owner/repo; release_json firetv-latest', 'bash', resolve('scripts/github-release-json.sh')], { encoding: 'utf8', env: { ...process.env, PATH: dir + ':' + process.env.PATH } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).id, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('APK publication preserves old assets and restores both devices after a partial failure', () => {
  const result = spawnSync('python3', ['tests/apk-publisher-behaviour.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});


test('download history respects manual collapse and transient native bridge failures', () => {
  const panel = readFileSync(resolve('src/components/mg/DeviceDownloadsPanel.jsx'), 'utf8');
  assert.match(panel, /detailsRef\.current\.open = snapshot\.items\.some/);
  assert.match(panel, /initialDetailsOpenSet\.current/);
  assert.doesNotMatch(panel, /<details[^>]+open=\{snapshot\.items/);
  assert.match(panel, /setSnapshot\(previous => \(\{ \.\.\.\(previous \|\| \{ items: \[\] \}\), unavailable: true \}\)\)/);
  assert.match(panel, /labelForStatus\(item\.status\)/);
});
