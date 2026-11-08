import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const memory = readFileSync(
  new URL("../src/components/mg/FireTvFocusMemory.jsx", import.meta.url), "utf8",
);
const remote = readFileSync(
  new URL("../src/components/mg/FireTvRemote.jsx", import.meta.url), "utf8",
);

class Element {
  constructor(attributes = {}) {
    this.attributes = attributes;
    this.tagName = "BUTTON";
    this.textContent = "Example movie";
  }
  getAttribute(name) { return this.attributes[name] || ""; }
}

const snapshotContext = () => {
  const body = new Element();
  let scans = 0;
  const context = {
    HTMLElement: Element,
    document: { body },
    focusables: () => { scans++; return []; },
    normaliseText: value => String(value || "").trim(),
    rowContextFor: () => ({ rowLabel: "Example row", rowCardIndex: 7 }),
    captureScroll: () => ({ windowX: 2, windowY: 3, ancestors: [] }),
  };
  const snippet = memory.slice(
    memory.indexOf("const snapshotFocus ="),
    memory.indexOf("const resolveSnapshot ="),
  );
  vm.createContext(context);
  vm.runInContext(snippet + "\nglobalThis.snapshot = snapshotFocus;", context);
  return { body, scans: () => scans, snapshot: context.snapshot };
};

test("Fire Stick D-pad focus on the main catalogue avoids full-body poster enumeration", () => {
  const setup = snapshotContext();
  const button = new Element();
  const result = setup.snapshot(button, setup.body);
  assert.equal(result.index, -1);
  assert.equal(setup.scans(), 0, "Focus changes must not inspect every poster");
  assert.equal(result.element, button, "Live focus identity is preserved");
  assert.equal(result.rowLabel, "Example row");
  assert.equal(result.rowCardIndex, 7);
  assert.equal(result.text, "Example movie");
  assert.equal(result.scroll.windowX, 2);
});

test("The existing positional fallback is preserved inside small modal dialogs", () => {
  const setup = snapshotContext();
  const dialog = new Element();
  const result = setup.snapshot(new Element(), dialog);
  assert.equal(setup.scans(), 1);
  assert.equal(result.index, -1);
});

test("Keyed catalogue buttons bypass full scans, preserving named focus restoration", () => {
  const setup = snapshotContext();
  const button = new Element({ "data-mg-focus-key": "movie:123" });
  const result = setup.snapshot(button, setup.body);
  assert.equal(result.focusKey, "movie:123");
  assert.equal(result.index, -1);
  assert.equal(result.rowLabel, "");
  assert.equal(setup.scans(), 0);
});

test("Unkeyed controls retain accessible labels and text for main-page focus recovery", () => {
  const setup = snapshotContext();
  const button = new Element({
    "aria-label": "Open Settings",
    "title": "Settings",
  });
  button.textContent = "Settings button";
  const result = setup.snapshot(button, setup.body);
  assert.equal(result.ariaLabel, "Open Settings");
  assert.equal(result.title, "Settings");
  assert.equal(result.text, "Settings button");
  assert.equal(setup.scans(), 0);
  assert.match(memory, /if \(\s*snapshot\.ariaLabel/);
  assert.match(memory, /if \(\s*snapshot\.title/);
  assert.match(memory, /if \(\s*snapshot\.text/);
});

test("Fire TV player and remote action handling remain unchanged by focus-memory optimisation", () => {
  // The separately enforced known-good hash guard verifies exact bytes.
  assert.match(remote, /tapOnlyFlixForRemote/);
  assert.match(remote, /data-mg-embedded-remote-player/);
  assert.match(remote, /window\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(memory, /const fallbackIndex = focusKey \|\| scope === document\.body/);
});
