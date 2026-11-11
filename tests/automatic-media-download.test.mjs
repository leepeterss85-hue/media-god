import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverMediaDownload, matchingDownloadFile, rankedDownloadSources } from '../src/components/mg/automaticMediaDownload.js';

const movie = { title: 'The Matrix', year: 1999, mediaType: 'movie', imdbId: 'tt0133093' };
const ready = { status: 'ready', filename: 'The.Matrix.1999.1080p.mkv', stream_url: 'https://download.example/video.mkv' };
const source = n => ({ infoHash: String(n).repeat(40), filename: 'The.Matrix.1999.1080p.ENG.mkv' });

test('automatically discovers and resolves a file when the library is empty', async () => {
  const calls = [];
  const file = await discoverMediaDownload(movie, { invoke: async (name, body) => {
    calls.push([name, body]);
    if (body.action === 'torrents_list') return { data: { torrents: [] } };
    if (name === 'fetchAddonStreams') return { streams: [source(1)] };
    return ready;
  } });
  assert.equal(file.filename, ready.filename);
  assert.deepEqual(calls.map(([name, body]) => body.action || name), ['torrents_list', 'fetchAddonStreams', 'resolve_best']);
  assert.equal(calls[2][1].title, movie.title);
});

test('uses matching ready files before searching addons', async () => {
  const file = await discoverMediaDownload(movie, { invoke: async (name, body) => {
    assert.equal(name, 'realDebrid');
    return body.action === 'torrents_list' ? { torrents: [{ id: 'a', status: 'downloaded', filename: ready.filename }] } : ready;
  } });
  assert.equal(file.filename, ready.filename);
});

test('a broken or wrong file falls through to the next candidate', async () => {
  let resolves = 0;
  const file = await discoverMediaDownload(movie, { invoke: async (name, body) => {
    if (body.action === 'torrents_list') return { torrents: [] };
    if (name === 'fetchAddonStreams') return { streams: [source(1), source(2)] };
    return ++resolves === 1 ? { ...ready, filename: 'Other.Movie.1999.mkv' } : ready;
  } });
  assert.equal(resolves, 2);
  assert.equal(file.filename, ready.filename);
});

test('cancellation during discovery prevents resolution', async () => {
  let cancelled = false;
  await assert.rejects(discoverMediaDownload(movie, {
    isCancelled: () => cancelled,
    invoke: async (name, body) => {
      if (body.action === 'torrents_list') return { torrents: [] };
      assert.equal(name, 'fetchAddonStreams');
      cancelled = true;
      return { streams: [source(1)] };
    },
  }), /cancelled/);
});

test('preparation polls the same job until ready, without adding another', async () => {
  let polls = 0, additions = 0;
  const file = await discoverMediaDownload(movie, { wait: async () => {}, invoke: async (name, body) => {
    if (body.action === 'torrents_list') return { torrents: [] };
    if (name === 'fetchAddonStreams') return { streams: [source(1), source(2)] };
    if (body.action === 'resolve_best') { additions++; return { status: 'preparing', torrent_id: 'job' }; }
    assert.equal(body.torrent_id, 'job');
    return ++polls === 1 ? { status: 'preparing' } : ready;
  } });
  assert.equal(additions, 1);
  assert.equal(polls, 2);
  assert.equal(file.filename, ready.filename);
});

test('unfinished preparation reports pending and does not fill RD with alternatives', async () => {
  let additions = 0;
  await assert.rejects(discoverMediaDownload(movie, { pollLimit: 1, wait: async () => {}, invoke: async (name, body) => {
    if (body.action === 'torrents_list') return { torrents: [] };
    if (name === 'fetchAddonStreams') return { streams: [source(1), source(2)] };
    if (body.action === 'resolve_best') additions++;
    return { status: 'preparing', torrent_id: 'job' };
  } }), /still preparing/);
  assert.equal(additions, 1);
});

test('rejects trailers, wrong episodes, non-video and foreign-only files', () => {
  const episode = { title: 'Show', mediaType: 'tv', season: 2, episode: 3 };
  assert.equal(matchingDownloadFile({ ...ready, filename: 'Show.S02E04.mkv' }, episode), null);
  assert.ok(matchingDownloadFile({ ...ready, filename: 'Show.S02E03.mkv' }, episode));
  assert.equal(matchingDownloadFile({ ...ready, filename: 'The.Matrix.1999.Trailer.mkv' }, movie), null);
  assert.equal(matchingDownloadFile({ ...ready, stream_url: 'https://example.com/player.html' }, movie), null);
  assert.equal(matchingDownloadFile({ ...ready, filename: 'The.Matrix.1999.FRENCH.mkv' }, movie), null);
});

test('English ranks ahead of unknown and CAM remains a fallback', () => {
  const rows = [
    { id: 'unknown', filename: 'The.Matrix.1999.2160p.mkv' },
    { id: 'cam', filename: 'The.Matrix.1999.ENG.CAM.mkv' },
    { id: 'web', filename: 'The.Matrix.1999.ENG.WEB-DL.1080p.mkv' },
  ];
  assert.deepEqual(rankedDownloadSources(rows).map(x => x.id), ['web', 'cam', 'unknown']);
});
