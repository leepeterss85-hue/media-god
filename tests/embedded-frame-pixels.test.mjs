import test from "node:test";
import assert from "node:assert/strict";
import { syncEmbeddedFramePixels } from "../src/components/mg/embeddedFramePixels.js";

function fixture(width, height) {
  const styles = new Map();
  const attributes = new Map([["src", "https://provider.example/player"]]);
  const frame = {
    style: { getPropertyValue: key => styles.get(key)?.value || "", setProperty: (key, value, priority) => styles.set(key, { value, priority }) },
    setAttribute: (key, value) => attributes.set(key, value),
  };
  const rect = { width, height };
  return { styles, attributes, rect, stage: { querySelector: () => frame, getBoundingClientRect: () => rect } };
}

test("measured Fire TV pixels replace percentages without replacing the provider", () => {
  const f = fixture(960.8, 378.5);
  assert.equal(syncEmbeddedFramePixels(f.stage), true);
  assert.deepEqual(f.styles.get("height"), { value: "378px", priority: "important" });
  assert.equal(f.attributes.get("width"), "960");
  assert.equal(f.attributes.get("src"), "https://provider.example/player");
  f.rect.height = 540;
  syncEmbeddedFramePixels(f.stage);
  assert.equal(f.attributes.get("height"), "540");
  f.rect.height = 378;
  syncEmbeddedFramePixels(f.stage);
  assert.equal(f.attributes.get("height"), "378");
});

test("transient collapsed or invalid stages never erase a usable video viewport", () => {
  const f = fixture(960, 400);
  syncEmbeddedFramePixels(f.stage);
  for (const height of [0, 1, NaN, Infinity, -10]) {
    f.rect.height = height;
    assert.equal(syncEmbeddedFramePixels(f.stage), false);
    assert.equal(f.attributes.get("height"), "400");
  }
  assert.equal(syncEmbeddedFramePixels(null), false);
  assert.equal(syncEmbeddedFramePixels({ querySelector: () => null }), false);
});
