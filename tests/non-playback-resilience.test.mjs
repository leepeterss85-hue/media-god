import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_UX_PREFERENCES,
  moveHomeSection,
  normaliseUxPreferences,
  setHomeSectionVisible,
} from "../src/components/mg/uxPreferences.js";
import { sanitizeDiagnosticText } from "../src/components/mg/diagnostics.js";

test("UX preferences normalise unknown values and preserve every known Home row", () => {
  const value = normaliseUxPreferences({
    textScale: "huge",
    homeOrder: ["favorites", "favorites", "unknown"],
    homeHidden: ["trending", "unknown"],
  });

  assert.equal(value.textScale, "standard");
  assert.equal(value.homeOrder[0], "favorites");
  assert.equal(new Set(value.homeOrder).size, DEFAULT_UX_PREFERENCES.homeOrder.length);
  assert.deepEqual(value.homeHidden, ["trending"]);
});

test("Home-row movement and visibility helpers are stable and reversible", () => {
  const base = normaliseUxPreferences(DEFAULT_UX_PREFERENCES);
  const moved = moveHomeSection(base, "favorites", "up");
  assert.notDeepEqual(moved.homeOrder, base.homeOrder);

  const hidden = setHomeSectionVisible(moved, "favorites", false);
  assert.equal(hidden.homeHidden.includes("favorites"), true);

  const shown = setHomeSectionVisible(hidden, "favorites", true);
  assert.equal(shown.homeHidden.includes("favorites"), false);
});

test("diagnostic sanitizer removes URLs, magnets and credential-like values", () => {
  const raw =
    "failed https://example.test/private?q=secret magnet:?xt=urn:btih:abc token=123 password=hunter2 Bearer abc.def";
  const safe = sanitizeDiagnosticText(raw);

  assert.match(safe, /\[url\]/);
  assert.match(safe, /\[magnet\]/);
  assert.match(safe, /token=\[redacted\]/i);
  assert.match(safe, /password=\[redacted\]/i);
  assert.match(safe, /Bearer \[redacted\]/);
  assert.doesNotMatch(safe, /hunter2|example\.test|btih:abc|abc\.def/);
});
