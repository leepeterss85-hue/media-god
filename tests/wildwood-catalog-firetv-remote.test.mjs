import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Wildwood (2026) is recovered by exact verified TMDB identity, not a fake streaming link', () => {
  const backend = read('base44/functions/getTmdbMovies/entry.ts');
  const start = backend.indexOf('// Newly released LAIKA film: TMDB 791523');
  assert.ok(start > 0);
  const correction = backend.slice(start, backend.indexOf('  {', backend.indexOf('  },', start) + 4));
  assert.match(correction, /'wildwood'/);
  assert.match(correction, /tmdb_id: 791523/);
  assert.match(correction, /imdb_id: 'tt2056785'/);
  assert.match(correction, /accepted_years:[\s\S]*'2026'/);
  assert.doesNotMatch(correction, /watch_link:|watch_providers:|sources:|stream_url:/);
  assert.match(backend, /fetchSearchIdentityCorrections\([\s\S]*?body\.multi_search/);
  assert.match(backend, /fetchWatchProviders\(/);
  assert.match(backend, /\.\.\.corrected,[\s\S]*?\.\.\.overrides,[\s\S]*?\.\.\.items/);
});

test('Fire Stick remote polish stays within navigation and search, not working player', () => {
  const css = read('src/fire-tv-stable.css');
  assert.match(css, /Fire Stick remote navigation polish, catalogue ONLY/);
  assert.match(css, /\.mg-fire-tv-nav nav button/);
  assert.match(css, /min-height: 34px !important/);
  assert.match(css, /\[data-mg-search-dialog="true"\] button:focus/);
  const documented = read('docs/PLAYBACK_KNOWN_GOOD.md');
  assert.match(documented, /1942a7b382c1c4a19d5514f74d89a2bca3740229/);
});
