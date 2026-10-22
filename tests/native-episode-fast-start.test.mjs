import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const player = readFileSync(new URL('../src/components/mg/VideoPlayer.jsx', import.meta.url), 'utf8');
const start = player.indexOf('    const sourceDiscoveryPending =');
const end = player.indexOf('    const current = nativePlaybackRef.current;', start);
// Execute the actual native effect's arbitration and launch gates.
function gate(overrides = {}) {
  const context = {
    isLive: false, playbackMediaType: 'tv',
    source: { sourceDiagnostics: { phase: 'fast-start' } },
    active: { launchQualified: true }, activeIdx: 0,
    sortedSourceEntries: [{ index: 0 }], startupHandoffAvailable: true,
    bestApprovedAutoplaySourceIndex: 0, bestEnglishAutoplayCandidateIndex: -1,
    bestNonAioTorrentAutoplayCandidateIndex: -1,
    sourceIsAioStreamsCandidate: () => false,
    useNativePlayback: true, nativePlaybackUrl: 'https://media.test/episode.mp4',
    rdOverride: null, rdResolving: false, rdPolling: false, rdPreparation: null,
    window: { __MG_PLAYER_CONTEXT__: { skipMarkersPending: true } },
    ...overrides,
  };
  return vm.runInNewContext(`(function(){${player.slice(start, end)}; return 'launch';})()`, context);
}

test('qualified Android episode launches during discovery even with skip markers pending', () => {
  assert.equal(gate(), 'launch');
});
test('resolved RD episode launches without waiting for unrelated source searches', () => {
  assert.equal(gate({ active: {}, rdOverride: { src: 'https://media.test/resolved.mp4' } }), 'launch');
});
test('unproven or still-resolving episode cannot bypass discovery gate', () => {
  assert.equal(gate({ active: {} }), undefined);
  assert.equal(gate({ active: {}, rdOverride: { src: 'https://media.test/resolved.mp4' }, rdResolving: true }), undefined);
});
test('movie search behaviour is preserved and native launch still requires a URL', () => {
  assert.equal(gate({ playbackMediaType: 'movie' }), undefined);
  assert.equal(gate({ nativePlaybackUrl: '' }), undefined);
});
test('pending better-source selection retains ownership before native launch', () => {
  assert.equal(gate({ active: {}, bestApprovedAutoplaySourceIndex: 1 }), undefined);
});
test('Android manual Sources reads updated choices after launch', () => {
  const native = readFileSync(new URL('../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt', import.meta.url), 'utf8');
  assert.match(native, /MainActivity.fetchCurrentSourceChoices\(requestId\)/);
  assert.match(main, /Choose from all playback sources/);
  assert.match(main, /if \(!playerOpen\) webView.pauseTimers\(\)/);
});
