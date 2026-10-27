import test from 'node:test';
import assert from 'node:assert/strict';
import { embedHistoryEntry, readEmbedBookmark, saveEmbedBookmark } from '../src/components/mg/embedWatchingHistory.js';

const movie = { id: 42, title: 'A film', mediaType: 'movie', year: 2026, poster: 'poster.jpg' };
const embed = { url: 'https://player.example/movie/42', provider: 'onlyflix' };
function library(initial = []) {
  const rows = structuredClone(initial);
  return { rows, filter: async ({ content_key }) => rows.filter(row => row.content_key === content_key),
    create: async entry => { const row = { id: 'saved', ...entry }; rows.push(row); return row; },
    update: async (id, patch) => Object.assign(rows.find(row => row.id === id), patch) };
}
test('opening and leaving an embedded film saves a reopenable entry without fake progress', async () => {
  const entity = library();
  const entry = embedHistoryEntry(movie, embed);
  await saveEmbedBookmark(entity, entry);
  assert.equal(entity.rows.length, 1);
  assert.equal(entity.rows[0].progress, 0);
  assert.equal(entity.rows[0].poster_url, 'poster.jpg');
  assert.deepEqual(readEmbedBookmark(entity.rows[0]), embed);
});
test('switching embedded sources updates the bookmark without duplicate titles', async () => {
  const entity = library();
  await saveEmbedBookmark(entity, embedHistoryEntry(movie, embed));
  await saveEmbedBookmark(entity, embedHistoryEntry(movie, { ...embed, url: 'https://backup.example/42' }));
  assert.equal(entity.rows.length, 1);
  assert.equal(readEmbedBookmark(entity.rows[0]).url, 'https://backup.example/42');
});
test('an embedded bookmark never overwrites a real saved source or its exact playhead', async () => {
  const entry = embedHistoryEntry(movie, embed);
  const entity = library([{ ...entry, id: 'native', progress: 3120, duration: 7000, source_type: 'rd', video_url: 'mgsource:original' }]);
  await saveEmbedBookmark(entity, entry);
  assert.equal(entity.rows[0].progress, 3120);
  assert.equal(entity.rows[0].video_url, 'mgsource:original');
  assert.equal(entity.rows[0].source_type, 'rd');
});
test('episodes have distinct history keys; live streams and unsafe bookmarks are rejected', () => {
  const episode = { ...movie, mediaType: 'tv', season: 1, episode: 2 };
  assert.notEqual(embedHistoryEntry(episode, embed).content_key, embedHistoryEntry({ ...episode, episode: 3 }, embed).content_key);
  assert.equal(embedHistoryEntry({ ...movie, mediaType: 'live' }, embed), null);
  assert.equal(embedHistoryEntry(movie, { url: 'javascript:alert(1)' }), null);
  assert.equal(readEmbedBookmark({ source_type: 'embed', video_url: 'mgembed:invalid' }), null);
});
