import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceReleaseTier, smartSourceEvidence } from '../src/components/mg/smartSourceSelection.js';

test('CAM, TS telesync, TC telecine and related cinema labels remain recognised and selectable', () => {
  const releaseNames = [
    'Movie.2026.CAMRip.1080p.mkv',
    'Movie.2026.HDCAM.1080p.mkv',
    'Movie.2026.HQCAM.720p.avi',
    'Movie.2026.TS.1080p.mkv',
    'Movie.2026.TC.1080p.mkv',
    'Movie.2026.TS-RIP.avi',
    'Movie.2026.HDTS.1080p.x264',
    'Movie.2026.HCTS.1080p.x265',
    'Movie.2026.HDTC.1080p.x264',
    'Movie.2026.TSRip.720p.avi',
    'Movie.2026.TCRip.720p.avi',
    'Movie.2026.TeleSync.1080p',
    'Movie.2026.TeleCine.1080p',
  ];
  for (const name of releaseNames) {
    const tier = sourceReleaseTier({ filename: name });
    assert.deepEqual(tier, { rank: 9, label: 'CAM/TS/TC' }, name);
  }
});

test('TS as MPEG transport-stream extension and unrelated words are not mistaken for cinema recordings', () => {
  const unrelated = [
    'Film.2026.1080p.WEB-DL.ts',
    'Film.2026.1080p.WEB-DL.TS',
    'Film.2026.1080p.TEST.mkv',
    'Film.2026.1080p.TCCODEC.mkv',
    'Film.2026.1080p.WEB-DL.mkv',
  ];
  for (const name of unrelated) {
    assert.notEqual(sourceReleaseTier({ filename: name }).rank, 9, name);
  }
});

test('a high-quality WEB-DL is still prioritised over CAM/TS/TC while all remain playable candidates', () => {
  for (const name of ['Movie.2026.CAMRip.1080p', 'Movie.2026.TS.1080p', 'Movie.2026.TC.1080p']) {
    const low = smartSourceEvidence({ name, englishAudio: true });
    const high = smartSourceEvidence({ name: 'Movie.2026.WEB-DL.1080p', englishAudio: true });
    assert.equal(low.languageRank, high.languageRank, 'English audio priority remains untouched');
    assert.ok(high.releaseTierRank < low.releaseTierRank, name);
    assert.equal(low.releaseTierLabel, 'CAM/TS/TC');
  }
});
