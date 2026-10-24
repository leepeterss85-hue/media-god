import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/components/mg/FireTvRemote.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('    const focusOverlay = () => {'), source.indexOf('    const keepFocusedControlVisible'));
class Element {
  constructor(query = () => null) { this.querySelector = query; }
}
function setup() {
  const state = { overlay: null, update: null, focused: null };
  state.home = new Element();
  const context = {
    HTMLElement: Element,
    isFireTv: () => true,
    visible: el => !!el && !el.disabled,
    playerOpen: () => false,
    topOverlay: () => state.overlay,
    focusElement: el => { if (!el || el.disabled) return false; state.focused = el; return true; },
    focusables: () => [],
    document: { querySelector: selector => selector.includes('fire-tv-update') ? state.update : state.home },
    window: { setTimeout: callback => callback() },
    lastScopeRef: { current: null },
    initialHomeFocusedRef: { current: false },
  };
  vm.createContext(context);
  vm.runInContext(handler + '\nglobalThis.run = focusOverlay;', context);
  return { state, run: context.run };
}
test('Home receives initial focus once without stealing subsequent navigation', () => {
  const { state, run } = setup();
  run(); assert.equal(state.focused, state.home);
  const other = new Element(); state.focused = other;
  run(); assert.equal(state.focused, other);
});
test('Ready update takes priority over initial Home focus', () => {
  const { state, run } = setup();
  const updateButton = new Element();
  state.update = new Element(() => updateButton);
  run(); assert.equal(state.focused, updateButton);
  state.update = null; run(); assert.equal(state.focused, state.home);
});
test('Play beats earlier Back button; episode action waits until enabled', () => {
  for (const disabled of [false, true]) {
    const { state, run } = setup();
    const primary = new Element(); primary.disabled = disabled;
    const back = new Element();
    state.overlay = new Element(selector => selector === 'button[data-mg-detail-primary="true"]' ? primary : back);
    run();
    if (disabled) {
      assert.equal(state.focused, null);
      primary.disabled = false; run();
    }
    assert.equal(state.focused, primary);
  }
});
