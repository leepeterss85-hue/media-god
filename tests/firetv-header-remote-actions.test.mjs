import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/components/mg/FireTvRemote.jsx', import.meta.url), 'utf8');
const start = source.indexOf('    const onKeyDown = (event) => {');
const end = source.indexOf('      if (updateIsOpen &&', start);
const handler = source.slice(start, end) + '\n}; globalThis.run = onKeyDown;';
class Element { click() { this.clicks = (this.clicks || 0) + 1; } }
function setup(fullscreen = false, withProviders = false) {
  const back = new Element(), sources = new Element(), toggle = new Element(), iframe = new Element(), provider = new Element(), topFullscreen = new Element();
  const providerBar = new Element();
  providerBar.querySelectorAll = () => [provider];
  providerBar.contains = el => el === provider;
  provider.getAttribute = name => name === 'aria-pressed' ? 'true' : null;
  const state = { focused: sources };
  const embedded = new Element();
  embedded.querySelectorAll = () => [back, sources, topFullscreen];
  embedded.querySelector = selector => selector.includes('movie-player-backups') ? (withProviders ? providerBar : null) : selector.includes('safe-fullscreen-toggle') ? toggle : selector.includes('safe-embed-fullscreen') ? (fullscreen ? toggle : null) : selector.includes('embed-iframe') ? iframe : selector.includes('open-sources') ? sources : selector.includes('embedded-top-fullscreen') ? topFullscreen : null;
  const context = {
    HTMLElement: Element, isFireTv: () => true, visible: () => true,
    directionFromEvent: e => ({ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up'})[e.key],
    isSelectKey: e => e.key === 'Enter', keyName: e => e.key, keyCode: () => 0,
    focusElement: el => { state.focused = el; },
    document: { get activeElement() { return state.focused; }, querySelector: selector => selector.includes('fire-tv-update') ? null : embedded },
  };
  vm.createContext(context); vm.runInContext(handler, context);
  return { state, back, sources, toggle, topFullscreen, iframe, provider, key: key => context.run({key, preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}}) };
}
test('Header Sources receives Select; Right focuses Fullscreen on SAME top row', () => {
  const x = setup(); x.key('Enter'); assert.equal(x.sources.clicks, 1);
  x.key('ArrowRight'); assert.equal(x.state.focused, x.topFullscreen);
  x.key('Enter'); assert.equal(x.topFullscreen.clicks, 1);
  x.key('ArrowLeft'); assert.equal(x.state.focused, x.sources);
  x.key('ArrowDown'); assert.equal(x.state.focused, x.iframe);
});
test('Fire TV Menu on top row focuses the dedicated Fullscreen button', () => {
  const x = setup();
  x.state.focused = x.sources;
  x.key('ContextMenu'); assert.equal(x.state.focused, x.topFullscreen);
  x.key('Enter'); assert.equal(x.topFullscreen.clicks, 1);
});
test('Fire TV Menu cycles from scraper provider choices into the Sources header', () => {
  const x = setup(false, true);
  x.state.focused = x.iframe;
  x.key('ContextMenu'); assert.equal(x.state.focused, x.provider);
  x.key('ContextMenu'); assert.equal(x.state.focused, x.sources);
  x.key('Enter'); assert.equal(x.sources.clicks, 1);
});
test('Menu in fullscreen focuses Exit fullscreen and arrows cannot escape behind video', () => {
  const x = setup(true); x.state.focused = x.iframe;
  x.key('ContextMenu'); assert.equal(x.state.focused, x.toggle);
  x.key('ArrowUp'); assert.equal(x.state.focused, x.toggle);
  x.key('Enter'); assert.equal(x.toggle.clicks, 1);
});
