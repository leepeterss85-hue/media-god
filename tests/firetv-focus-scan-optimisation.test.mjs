import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const stable = read('src/components/mg/fireTvStableMode.js');

class Element {
  constructor(parentElement = null, x = 0) {
    this.parentElement = parentElement;
    this.hidden = false;
    this.attributes = {};
    this.style = { display:'block', visibility:'visible', opacity:'1', pointerEvents:'auto' };
    this.rect = { width:100, height:80, left:x, top:0, right:x + 100, bottom:80 };
    this.rectReads = 0;
  }
  hasAttribute(key) { return key in this.attributes; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  getBoundingClientRect() { this.rectReads++; return this.rect; }
}

const fragment = (start, end) => {
  const a = stable.indexOf(start);
  const b = stable.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'production stable focus logic must exist');
  return stable.slice(a, b);
};

const newContext = () => {
  let computed = 0;
  const context = {
    HTMLElement: Element, Array, WeakMap,
    window: { getComputedStyle: node => {computed++; return node.style;} },
    document: { querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(fragment('const visible =', 'const mediaGodAppReady') +
    '\nglobalThis.pick = filterVisible;', context);
  return { context, reads: () => computed };
};

test('120 poster focus scans share ancestor style reads, then re-check changes on the next key', () => {
  const {context,reads} = newContext();
  const root = new Element();
  const row = new Element(root);
  const posters = Array.from({length:120},(_,i)=>new Element(row,i * 101));
  assert.equal(context.pick(posters).length,120);
  assert.ok(reads() <= 124, 'style lookups should scale with children, not child × ancestor count');

  // No cross-key caching: hidden parent must affect the next remote press.
  row.style = {...row.style, display:'none'};
  assert.equal(context.pick(posters).length,0);
  row.style = {...row.style, display:'block'};
  assert.equal(context.pick(posters).length,120);
});

test('Home rows read each geometry once while preserving visual top-to-bottom order', () => {
  const {context} = newContext();
  const root = new Element();
  const rows = [new Element(root), new Element(root), new Element(root)];
  rows[0].rect.top = 400;
  rows[1].rect.top = 150;
  rows[2].rect.top = 280;
  context.document.querySelectorAll = () => rows;
  vm.runInContext(fragment('const rows =', 'const sidebarButtons =') +
    '\nglobalThis.ordered = rows;', context);
  const order = context.ordered();
  assert.deepEqual([...order],[rows[1],rows[2],rows[0]]);
  assert.deepEqual(rows.map(row=>row.rectReads),[2,2,2],
    'each row uses one visibility rect and one positioning rect, not repeated sort measurements');
});

test('focus recovery ignores poster CSS churn but retains modal and route changes', () => {
  const memory = read('src/components/mg/FireTvFocusMemory.jsx');
  assert.match(memory, /const relevant = records\.some/);
  assert.match(memory, /record\.type !== "attributes"/);
  assert.match(memory, /if \(relevant\) inspectScopeChange\(\)/);
  assert.match(memory, /\.mg-fire-tv-card, \.mg-fire-tv-resume-card/);
  assert.match(memory, /\[role="dialog"\], \[aria-modal="true"\]/);
  assert.match(memory, /childList:\s*true/);
  assert.match(memory, /state\.timer !== null/);
  assert.match(memory, /restoreSnapshot/);
  assert.match(stable, /const sharedStyles = new WeakMap\(\)/);
  assert.match(stable, /visible\(element, sharedStyles\)/);
  // Known-good player/remote component is read-only in this pass.
  const remote = read('src/components/mg/FireTvRemote.jsx');
  assert.match(remote, /tapOnlyFlixForRemote/);
  assert.match(remote, /liveTvRemoteTarget/);
  assert.match(remote, /window\.addEventListener\("keydown", onKeyDown, true\)/);
});
