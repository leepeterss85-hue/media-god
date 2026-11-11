import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_DOWNLOAD_CHOICES, discoverDownloadChoices, resolveDownloadChoice,
  downloadQuality, downloadSizeBytes, formatDownloadSize, sortDownloadChoices,
} from '../src/components/mg/downloadSourceChoices.js';

const context = { title: 'Example', year: '2026', imdbId: 'tt1234567', mediaType: 'movie' };
const library = Array.from({length: 20}, (_, i) => ({
  id: 'ready-' + i, filename: 'Example.2026.1080p.WEB-DL.' + (i + 1) + '.mkv',
  status: 'downloaded', bytes: (i + 1) * 1024 ** 3,
}));
const streams = Array.from({length: 70}, (_, i) => ({
  src: 'https://files.example/Example.2026.720p.' + i + '.mkv',
  filename: 'Example.2026.720p.' + (i + 1) + 'GB.mkv',
  title: 'Example 2026 720p ' + (i + 1) + ' GB',
}));

test('video quality and file size labels distinguish 4K, 1080p, 720p, SD and unknown', () => {
  assert.deepEqual(downloadQuality({ filename: 'Film.2026.2160p.UHD.mkv' }), { label: '4K', resolution: 2160 });
  assert.deepEqual(downloadQuality({ filename: 'Film.2026.1080p.mkv' }), { label: '1080p', resolution: 1080 });
  assert.equal(downloadQuality({ filename: 'Film.720p.mkv' }).resolution, 720);
  assert.equal(downloadQuality({ filename: 'Film.480p.mkv' }).resolution, 480);
  assert.equal(downloadQuality({ filename: 'Film.unknown.mkv' }).resolution, 0);
  assert.equal(downloadSizeBytes({ filename: 'Film.2026.2.5.GB.1080p.mkv' }), 2_500_000_000);
  assert.equal(downloadSizeBytes({ behaviorHints: { videoSize: 3 * 1024 ** 3 } }), 3 * 1024 ** 3);
  assert.equal(downloadSizeBytes({ bytes: 4 * 1024 ** 3 }), 0, 'torrent aggregate is not presented as exact file size without explicit opt-in');
  assert.equal(downloadSizeBytes({ bytes: 4 * 1024 ** 3 }, { allowTorrentSize: true }), 4 * 1024 ** 3);
  assert.equal(formatDownloadSize(2 * 1024 ** 3), '2.00 GB');
  assert.equal(formatDownloadSize(0), 'Size unknown');
});

test('discovery offers up to 60 choices without pre-resolving every torrent', async () => {
  const calls = [];
  const choices = await discoverDownloadChoices(context, {
    invoke: async (name, payload) => {
      calls.push(name === 'realDebrid' ? payload.action : name);
      if (payload.action === 'torrents_list') return { torrents: library };
      if (name === 'fetchAddonStreams') return { streams };
      throw Error('Unexpected eager resolution');
    },
  });
  assert.equal(MAX_DOWNLOAD_CHOICES, 60);
  assert.equal(choices.length, 60);
  assert.equal(choices.filter(x => x.ready).length, 20);
  assert.equal(choices.filter(x => x.kind === 'addon').length, 40);
  assert.deepEqual(calls, ['torrents_list', 'fetchAddonStreams']);
  assert.ok(choices.some(x => x.sizeBytes && x.quality === '1080p'));
  assert.ok(choices.some(x => x.quality === '720p'));
});

test('sorts by smallest, largest and quality without pushing unknown sizes to the top', () => {
  const list = [
    { index:0, languageRank:1, ready:false,cached:true, releaseRank:3, resolution:2160, sizeBytes:0 },
    { index:1, languageRank:1, ready:true,cached:true, releaseRank:3, resolution:1080, sizeBytes:1e9 },
    { index:2, languageRank:1, ready:true,cached:true, releaseRank:3, resolution:720, sizeBytes:5e9 },
  ];
  assert.deepEqual(sortDownloadChoices(list,'smallest').map(x => x.index), [1,2,0]);
  assert.deepEqual(sortDownloadChoices(list,'largest').map(x => x.index), [2,1,0]);
  assert.deepEqual(sortDownloadChoices(list,'quality').map(x => x.index), [0,1,2]);
});

test('resolves only the selected ready torrent and reports its chosen file size', async () => {
  const calls = [];
  const choices = await discoverDownloadChoices(context, {
    maxChoices:1, invoke:async (name, payload) => {
      if (payload.action === 'torrents_list') return { torrents:library };
      throw Error('No other call expected for discovery');
    },
  });
  const file = await resolveDownloadChoice(choices[0], context, {invoke:async(name,payload)=>{
    calls.push(payload.action);
    return { status:'ready', filename:'Example.2026.1080p.mkv',
      stream_url:'https://files.example/Example.2026.1080p.mkv',
      files:[{path:'Example.2026.1080p.mkv',bytes:2 * 1024 ** 3,selected:true}] };
  }});
  assert.equal(file.sizeBytes, 2 * 1024 ** 3);
  assert.equal(file.quality, '1080p');
  assert.deepEqual(calls, ['torrent_info']);
});

test('direct video download is resolved only on selection, without trusting an embed page', async () => {
  const choice = {
    kind:'addon', filename:'Example.2026.4K.mkv',
    source:{src:'https://files.example/Example.2026.4K.mkv',filename:'Example.2026.4K.mkv'},
  };
  const file = await resolveDownloadChoice(choice, context, {invoke:async()=>{throw Error('No resolver required');}});
  assert.equal(file.quality,'4K');
  assert.match(file.url,/\.mkv$/);
  await assert.rejects(resolveDownloadChoice({
    ...choice, source:{url:'https://embed.example/watch',filename:'Example.2026.4K.mkv'},
  },context,{invoke:async()=>{throw Error('Not reached');}}), /not a direct downloadable file/);
});

test('selection rejects the wrong TV episode after Real-Debrid resolves the actual file', async () => {
  const tv = { title:'Example', year:'2026', imdbId:'tt1234567',
    mediaType:'tv',season:1,episode:3 };
  const option = { kind:'ready', torrentId:'ep3', filename:'Example.S01E03.1080p.mkv' };
  await assert.rejects(resolveDownloadChoice(option, tv, {invoke: async () => ({
    status:'ready',filename:'Example.S01E04.1080p.mkv',
    stream_url:'https://files.example/Example.S01E04.1080p.mkv',
  })}), /not the expected downloadable movie or episode/);
});

test('main picker supports quality filtering, sorting, paging and deliberate user selection', () => {
  const source = readFileSync(new URL('../src/components/mg/MediaDownloadPicker.jsx',import.meta.url),'utf8');
  assert.match(source,/data-mg-download-quality-filter="true"/);
  assert.match(source,/data-mg-download-sort="true"/);
  assert.match(source,/data-mg-download-show-more="true"/);
  assert.match(source,/data-mg-download-recommended="true"/);
  assert.match(source,/data-mg-main-page-save="true"/);
  assert.match(source,/formatDownloadSize\(option\.sizeBytes\)/);
  assert.match(source,/resolveDownloadChoice\(option, context/);
  assert.match(source,/startDeviceDownload\(file\)/);
  assert.ok(!source.includes('up to three verified'), 'old three-choice messaging removed');
});
