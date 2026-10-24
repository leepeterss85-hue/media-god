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
  const fullscreen = el(), sources = el(), iframe = el(), first = el(), second = el();
  const bar = el();
  bar.querySelectorAll = () => [first, second];
  first.getAttribute = () => 'true';
  second.getAttribute = () => 'false';
  const root = el();
  root.matches = () => true;
  root.querySelector = selector => selector.includes('movie-player-backups') ? bar :
    selector.includes('open-sources') ? sources : selector.includes('safe-fullscreen-toggle') ? fullscreen :
    selector.includes('embed-iframe') ? iframe : null;
  root.querySelectorAll = () => [sources];
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
  return { doc, first, second, fullscreen, sources, iframe, emits, run };
}

test('native Fire Stick remote can reach scraper controls from a black iframe', () => {
  const x = fixture(); x.doc.activeElement = x.iframe;
  x.run('ArrowUp'); assert.equal(x.doc.activeElement, x.first);
  x.run('ArrowRight'); assert.equal(x.doc.activeElement, x.second);
  x.run('Enter'); assert.equal(x.second.clicks, 1);
  x.run('ContextMenu'); assert.equal(x.doc.activeElement, x.sources);
  x.run('Enter'); assert.equal(x.sources.clicks, 1);
  assert.equal(x.emits.length, 0, 'Native focus keys never pass into black iframe');
});

test('native Fire Stick remote can select fullscreen and return to iframe', () => {
  const x = fixture(); x.doc.activeElement = x.iframe;
  x.run('ContextMenu'); assert.equal(x.doc.activeElement, x.first);
  x.run('ArrowDown'); assert.equal(x.doc.activeElement, x.fullscreen);
  x.run('Enter'); assert.equal(x.fullscreen.clicks, 1);
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
