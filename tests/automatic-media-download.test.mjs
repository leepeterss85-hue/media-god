import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverMediaDownload, discoverMediaDownloads, rankDownloadSources } from '../src/components/mg/automaticMediaDownload.js';
const context = { title: 'Example', year: 2026, mediaType: 'movie', imdbId: 'tt123456' };
const video = { status: 'ready', filename: 'Example.2026.English.mkv', stream_url: 'https://files.example/video.mkv' };
const torrent = { id: 'one', filename: video.filename, status: 'downloaded' };
const magnet = 'magnet:?xt=urn:btih:' + 'a'.repeat(40);

test('uses existing file without searching addons', async () => {
  const calls = [];
  const file = await discoverMediaDownload(context, { invoke: async (name, payload) => {
    calls.push(payload.action);
    return payload.action === 'torrents_list' ? { torrents: [torrent] } : video;
  }});
  assert.equal(file.filename, video.filename);
  assert.deepEqual(calls, ['torrents_list', 'torrent_info']);
});
test('discovers new sources and retries a failed candidate', async () => {
  const calls = [];
  const file = await discoverMediaDownload(context, { invoke: async (name, payload) => {
    calls.push(name);
    if (payload.action === 'torrents_list') return { torrents: [] };
    if (name === 'fetchAddonStreams') return { streams: [
      { magnet, cached: true, title: 'Example English' },
      { url: 'https://files.example/Example.2026.English.mp4' },
    ] };
    throw new Error('Expired source');
  }});
  assert.match(file.filename, /mp4$/);
  assert.ok(calls.includes('fetchAddonStreams'));
});
test('rejects embed pages and wrong episode returned by resolver', async () => {
  await assert.rejects(discoverMediaDownload({ ...context, mediaType: 'tv', season: 1, episode: 2 }, {
    invoke: async (name, payload) => {
      if (payload.action === 'torrents_list') return { torrents: [] };
      if (name === 'fetchAddonStreams') return { streams: [
        { url: 'https://embed.example/watch', filename: 'Example.S01E02.mp4' },
        { magnet, cached: true },
      ] };
      return { ...video, filename: 'Example.S01E03.mkv' };
    },
  }), /No suitable/);
});
test('cancellation prevents further requests', async () => {
  let cancelled = false;
  let calls = 0;
  await assert.rejects(discoverMediaDownload(context, {
    cancelled: () => cancelled,
    invoke: async () => { calls++; cancelled = true; return { torrents: [torrent] }; },
  }), /cancelled/);
  assert.equal(calls, 1);
});
test('limits uncached additions and reports pending rather than success', async () => {
  let adds = 0;
  await assert.rejects(discoverMediaDownload(context, { pollAttempts: 0, invoke: async (name, payload) => {
    if (payload.action === 'torrents_list') return { torrents: [] };
    if (name === 'fetchAddonStreams') return { streams: ['a', 'b', 'c'].map(char => ({ infoHash: char.repeat(40) })) };
    adds++;
    return { status: 'downloading', torrent_id: 'pending' };
  }}), /still being prepared/);
  assert.equal(adds, 1);
});
test('prefers English and deduplicates candidates', () => {
  const ranked = rankDownloadSources([
    { id: 'unknown', title: 'Example' },
    { id: 'english', title: 'Example English WEB-DL' },
    { id: 'english', title: 'Example English WEB-DL' },
    { id: 'sample', filename: 'Example.sample.mp4' },
  ]);
  assert.deepEqual(ranked.map(item => item.id), ['english', 'unknown']);
});

test('automatically waits for a preparing file and returns it when ready', async () => {
  const file = await discoverMediaDownload(context, { wait: async () => {}, invoke: async (name, payload) => {
    if (payload.action === 'torrents_list') return { torrents: [] };
    if (name === 'fetchAddonStreams') return { streams: [{ magnet }] };
    if (payload.action === 'resolve_best') return { status: 'downloading', torrent_id: 'pending' };
    return video;
  }});
  assert.equal(file.filename, video.filename);
});

test('offers up to three distinct ready files without starting any more automatically', async () => {
  const entries = [1, 2, 3, 4].map(i => ({
    id: String(i), filename: 'Example.2026.English.' + i + '.mkv', status: 'downloaded',
  }));
  const calls = [];
  const results = await discoverMediaDownloads(context, {invoke: async (_name, payload) => {
    calls.push(payload.action);
    return payload.action === 'torrents_list' ? {torrents: entries} : {
      status:'ready', filename: entries[Number(payload.torrent_id)-1].filename,
      stream_url: 'https://files.example/' + payload.torrent_id + '.mkv',
    };
  }});
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map(x => x.url)).size, 3);
  assert.deepEqual(calls, ['torrents_list', 'torrent_info', 'torrent_info', 'torrent_info']);
});
test('returns existing options if addons are temporarily unreachable', async () => {
  const found = await discoverMediaDownloads(context, {invoke: async(name, payload) => {
    if (payload.action === 'torrents_list') return {torrents:[torrent]};
    if (payload.action === 'torrent_info') return video;
    throw Error('Provider unavailable');
  }});
  assert.equal(found.length, 1);
  assert.equal(found[0].filename, video.filename);
});
