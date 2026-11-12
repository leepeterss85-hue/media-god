import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SHA = 'a'.repeat(40);
const archiveTag = 'stable-' + SHA.slice(0, 12);
const assets = [
  { id: 11, name: 'Media-God-Android-Mobile.apk', state: 'uploaded', size: 2000000 },
  { id: 12, name: 'Media-God-Fire-TV.apk', state: 'uploaded', size: 2000000 },
];

const original = (tag, asset) => ({
  id: tag === 'android-mobile-latest' ? 1 : 2,
  tag_name: tag, target_commitish: SHA, draft: false,
  published_at: '2026-11-09T07:59:00Z',
  assets: [asset], body: 'Verified-APK-Commit: ' + SHA,
});

const archive = draft => ({
  id: 99, tag_name: archiveTag, target_commitish: SHA, draft,
  published_at: draft ? null : '2026-11-12T20:00:00Z',
  assets, body: 'Original-APK-Commit: ' + SHA,
});

function fixture(corrupt) {
  const root = mkdtempSync(join(tmpdir(), 'mg-draft-archive-'));
  const scripts = join(root, 'scripts');
  const bin = join(root, 'bin');
  mkdirSync(scripts); mkdirSync(bin);
  for (const name of ['archive-stable-apks.sh', 'verify-apk-archive.sh']) {
    copyFileSync(resolve('scripts', name), join(scripts, name));
  }
  writeFileSync(join(root, 'mobile.json'), JSON.stringify(original('android-mobile-latest', assets[0])));
  writeFileSync(join(root, 'firetv.json'), JSON.stringify(original('firetv-latest', assets[1])));
  writeFileSync(join(root, 'draft.json'), JSON.stringify(archive(true)));
  writeFileSync(join(root, 'published.json'), JSON.stringify(archive(false)));
  writeFileSync(join(scripts, 'github-release-json.sh'), [
    'release_json() {',
    '  case "$1" in',
    '    android-mobile-latest) cat "$FIXTURE_ROOT/mobile.json";;',
    '    firetv-latest) cat "$FIXTURE_ROOT/firetv.json";;',
    '    stable-*) if [[ -f "$FIXTURE_ROOT/published.flag" ]]; then cat "$FIXTURE_ROOT/published.json"; else cat "$FIXTURE_ROOT/draft.json"; fi;;',
    '    *) return 1;;',
    '  esac',
    '}',
    'release_source_sha() { jq -r .target_commitish <<< "$1"; }',
    'download_release_asset() {',
    '  local data="$1" asset="$2" dir="$3" tag',
    '  tag="$(jq -r .tag_name <<< "$data")"',
    '  mkdir -p "$dir"',
    '  if [[ "$tag" == stable-* && "$CORRUPT_ARCHIVE" == "1" ]]; then printf "bad-%s" "$asset" > "$dir/$asset";',
    '  else printf "%s" "$asset" > "$dir/$asset"; fi',
    '}',
  ].join('\n') + '\n');
  writeFileSync(join(bin, 'gh'), [
    '#!/usr/bin/env bash',
    'if [[ "$1" == api && "$2" == --method && "$3" == PATCH && "$4" == "repos/test/repo/releases/99" && "$5" == -F && "$6" == draft=false ]]; then',
    '  touch "$FIXTURE_ROOT/published.flag"; exit 0',
    'fi',
    'echo "Unexpected GitHub mutation" >&2; exit 1',
  ].join('\n') + '\n', { mode: 0o755 });
  const env = { ...process.env, PATH: bin + ':' + process.env.PATH,
    GITHUB_REPOSITORY: 'test/repo', GITHUB_SHA: 'b'.repeat(40),
    RUNNER_TEMP: join(root, 'temp'), FIXTURE_ROOT: root,
    CORRUPT_ARCHIVE: corrupt ? '1' : '0' };
  return { root, scripts, env };
}

test('existing draft is published only after original APK bytes match, then both are verified', () => {
  const f = fixture(false);
  try {
    const result = spawnSync('bash', [join(f.scripts, 'archive-stable-apks.sh')], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(existsSync(join(f.root, 'published.flag')));
    const verification = spawnSync('bash', [join(f.scripts, 'verify-apk-archive.sh')], { env: f.env, encoding: 'utf8' });
    assert.equal(verification.status, 0, verification.stdout + verification.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('mismatched draft APK is never promoted and latest releases stay untouched', () => {
  const f = fixture(true);
  try {
    const result = spawnSync('bash', [join(f.scripts, 'archive-stable-apks.sh')], { env: f.env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Draft .* differs/);
    assert.ok(!existsSync(join(f.root, 'published.flag')));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
