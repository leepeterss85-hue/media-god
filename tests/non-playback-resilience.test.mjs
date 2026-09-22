import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_UX_PREFERENCES,
  moveHomeSection,
  normaliseUxPreferences,
  setHomeSectionVisible,
} from "../src/components/mg/uxPreferences.js";
import { sanitizeDiagnosticText } from "../src/components/mg/diagnostics.js";
import { movedOrder } from "../src/components/mg/liveTvPersonalisation.js";

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

test("saved addon profiles are owner-scoped at the Base44 entity layer", () => {
  const schema = readFileSync(
    new URL("../base44/entities/Addon.jsonc", import.meta.url),
    "utf8"
  );

  for (const operation of ["read", "create", "update", "delete"]) {
    assert.match(
      schema,
      new RegExp(
        `"${operation}"\\s*:\\s*\\{[\\s\\S]*?"created_by_id"\\s*:\\s*"\\{\\{user\\.id\\}\\}"`
      )
    );
  }
});

test("addon backend blocks unsafe network targets, redirects and oversized JSON", () => {
  const source = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /Addon requests must use HTTPS/);
  assert.match(source, /local or private network addresses are blocked/);
  assert.match(source, /redirect:\s*"manual"/);
  assert.match(source, /ADDON_REDIRECT_LIMIT/);
  assert.match(source, /ADDON_RESPONSE_LIMIT_BYTES/);
  assert.match(source, /response exceeded the safety size limit/i);
});

test("Sky Sport Now account fields are declared in the User schema", () => {
  const schema = readFileSync(
    new URL("../base44/entities/User.jsonc", import.meta.url),
    "utf8"
  );

  for (const field of [
    "ssn_auth_token",
    "ssn_refresh_token",
    "ssn_token_expires_at",
    "ssn_connected_at",
  ]) {
    assert.match(schema, new RegExp(`"${field}"\\s*:`));
  }
});
