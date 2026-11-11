import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('src/components/mg/FireTvRemote.jsx');

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
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'production focus logic must exist');
  return source.slice(a, b);
};

test('a 120-poster focus scan measures each shared parent style once, not 120 times', () => {
  let computed = 0;
  const root = new Element();
  const row = new Element(root);
  const poster = Array.from({length: 120}, (_,i) => new Element(row,i * 101));
  root.querySelectorAll = () => poster;
  const context = {
    HTMLElement: Element,
    window: { getComputedStyle: node => {computed++; return node.style;} },
    document: { querySelectorAll: () => [] },
    Array, WeakMap,
  };
  vm.createContext(context);
  vm.runInContext(fragment('const visible =', 'const focusElement =') +
    '\nglobalThis.pick = focusables;', context);

  const found = context.pick(root);
  assert.equal(found.length, 120);
  assert.ok(computed <= 124,
    'each child and two shared ancestor styles should be read once during the scan; reads=' + computed);

  // Visibility must be re-read on a new press, not retained across frames.
  row.style = {...row.style, display:'none'};
  assert.equal(context.pick(root).length, 0);
  row.style = {...row.style, display:'block'};
  assert.equal(context.pick(root).length, 120);
});

test('nearest-column navigation measures candidates once and retains tie order', () => {
  const context = { HTMLElement:Element, Array, Math };
  vm.createContext(context);
  vm.runInContext(
    fragment('const centre =', 'const directionalTarget =') +
    fragment('const nearestByX =', 'const activeSidebarTarget =') +
    '\nglobalThis.closest = nearestByX;', context);
  const current = new Element(null, 200);
  const candidates = [new Element(null, -100), new Element(null, 205),
    new Element(null, 210), new Element(null, 500)];
  const nearest = context.closest(current, candidates);
  assert.equal(nearest, candidates[1]);
  assert.equal(current.rectReads, 1);
  assert.ok(candidates.every(item => item.rectReads === 1));
});

test('remote focus memory skips unrelated poster CSS while retaining overlay and route recovery', () => {
  const memory = read('src/components/mg/FireTvFocusMemory.jsx');
  assert.match(memory, /const relevant = records\.some/);
  assert.match(memory, /record\.type !== "attributes"/);
  assert.match(memory, /if \(relevant\) inspectScopeChange\(\)/);
  assert.match(memory, /\.mg-fire-tv-card, \.mg-fire-tv-resume-card/);
  assert.match(memory, /\[role="dialog"\], \[aria-modal="true"\]/);
  assert.match(memory, /childList:\s*true/);
  assert.match(memory, /state\.timer !== null/);
  assert.match(memory, /restoreSnapshot/);
  const remote = read('src/components/mg/FireTvRemote.jsx');
  assert.match(remote, /const sharedStyles = new WeakMap\(\)/);
  assert.match(remote, /visible\(element, sharedStyles\)/);
  assert.match(remote, /candidates\.filter\(candidate => candidate !== current\)/);
  assert.match(remote, /tapOnlyFlixForRemote/);
  assert.match(remote, /liveTvRemoteTarget/);
  assert.match(remote, /window\.addEventListener\("keydown", onKeyDown, true\)/);
});
