import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const native = read('firetv-android/app/src/main/java/com/mediagod/firetv/EmbeddedPlayerRemote.kt');
const match = native.match(/webView\.evaluateJavascript\(\s*"""([\s\S]*?)"""\.trimIndent\(\), null/);
assert.ok(match, 'Embedded player native remote JavaScript must be present');
const js = match[1].replaceAll('${JSONObject.quote(key)}', '"KEY"')
  .replaceAll('${event.repeatCount > 0}', 'false');

function fixture() {
  const doc = { activeElement: null };
  const el = () => ({
    focus() { doc.activeElement = this; },
    scrollIntoView() {},
    getBoundingClientRect() { return { width: 200, height: 42 }; },
    click() { this.clicks = (this.clicks || 0) + 1; },
  });
  const fullscreen = el(), sources = el(), topFullscreen = el(), iframe = el(), first = el(), second = el(), pointer = el();
  let pointerTop = 220;
  iframe.getBoundingClientRect = () => ({ top: 0, bottom: 500, left: 0, right: 1000, width: 1000, height: 500 });
  pointer.getBoundingClientRect = () => ({ top: pointerTop, width: 32, height: 32 });
  const bar = el();
  bar.querySelectorAll = () => [first, second];
  first.getAttribute = () => 'true';
  second.getAttribute = () => 'false';
  const root = el();
  root.matches = () => true;
  root.querySelector = selector => selector.includes('movie-player-backups') ? bar :
    selector.includes('open-sources') ? sources : selector.includes('safe-fullscreen-toggle') ? fullscreen :
    selector.includes('embedded-top-fullscreen') ? topFullscreen :
    selector.includes('embed-iframe') ? iframe : selector.includes('embed-pointer') ? pointer : null;
  root.querySelectorAll = () => [sources, topFullscreen];
  doc.querySelector = selector => selector.includes('fire-tv-update') ? null : root;
  const emits = [];
  const run = key => {
    const source = js.replace('"KEY"', JSON.stringify(key));
    vm.runInNewContext(source, {
      document: doc, window: { dispatchEvent: e => emits.push(e) },
      KeyboardEvent: class { constructor(type, args) { this.type = type; this.key = args.key; } },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    });
  };
  return { doc, first, second, fullscreen, topFullscreen, sources, iframe, emits, run,
    setPointerTop: top => { pointerTop = top; } };
}

test('native Fire Stick remote can reach scraper controls from a black iframe', () => {
  const x = fixture(); x.doc.activeElement = x.iframe;
  x.run('ArrowUp'); assert.equal(x.doc.activeElement, x.iframe,
    'Up inside the video must first move the cursor so playback controls are reachable');
  assert.equal(x.emits.at(-1).key, 'ArrowUp');
  x.setPointerTop(3);
  x.run('ArrowUp'); assert.equal(x.doc.activeElement, x.first,
    'At the top edge, Up moves to the provider bar');
  x.run('ArrowRight'); assert.equal(x.doc.activeElement, x.second);
  x.run('Enter'); assert.equal(x.second.clicks, 1);
  x.run('ContextMenu'); assert.equal(x.doc.activeElement, x.sources);
  x.run('Enter'); assert.equal(x.sources.clicks, 1);
  assert.equal(x.emits.length, 1, 'Only real video-cursor movement reaches the iframe event handler');
});

test('native Fire Stick remote selects top-row Fullscreen and returns to iframe', () => {
  const x = fixture(); x.doc.activeElement = x.iframe;
  x.run('ContextMenu'); assert.equal(x.doc.activeElement, x.first);
  x.run('ArrowUp'); assert.equal(x.doc.activeElement, x.sources);
  x.run('ArrowRight'); assert.equal(x.doc.activeElement, x.topFullscreen);
  x.run('Enter'); assert.equal(x.topFullscreen.clicks, 1);
  x.run('ContextMenu'); assert.equal(x.doc.activeElement, x.topFullscreen);
  x.run('ArrowDown'); assert.equal(x.doc.activeElement, x.first);
  x.run('ArrowDown'); assert.equal(x.doc.activeElement, x.iframe);
});

test('media play remains routed into player; non-VOD controls are unaffected', () => {
  const x = fixture(); x.doc.activeElement = x.iframe;
  x.run('MediaPlay'); assert.equal(x.emits.length, 1);
  assert.equal(x.emits[0].key, 'MediaPlay');
});

test('Fire TV visual control strip exposes fullscreen and sources without phone changes', () => {
  const player = read('src/components/mg/OnlyFlixEmbedPlayer.jsx');
  const stage = read('src/components/mg/SafeEmbedStage.jsx');
  assert.match(player, /isFireTv && \(\s*<button[^>]*data-mg-embedded-top-fullscreen/);
  assert.match(player, /data-mg-embedded-top-sources="true"/);
  assert.match(stage, /mg:embed-toggle-fullscreen/);
  const mobile = read('android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt');
  assert.doesNotMatch(mobile, /embedded-top-fullscreen/);
});
