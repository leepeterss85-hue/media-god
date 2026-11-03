import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Continue Watching stays under Featured regardless of saved Home visibility preferences", () => {
  const home = read("src/components/mg/HomeDashboard.jsx");
  assert.match(home, /<HeroSlider[\s\S]*?data-mg-home-second="continue-watching"[\s\S]*?<ContinueWatchingRow/);
  assert.equal((home.match(/<ContinueWatchingRow /g) || []).length, 1);
  assert.doesNotMatch(home, /!hiddenHomeSections\.has\("continue-watching"\)/);
});

test("Continue Watching performs its first fetch even if Fire TV reports the document hidden", () => {
  const sync = read("src/components/mg/continueWatchingSync.js");
  assert.match(sync, /const timer = windowObject\.setInterval\(refreshIfVisible, intervalMs\);\s*[\s\S]*?refresh\(\);/);
  assert.match(sync, /if \(!stopped && documentObject\.visibilityState !== 'hidden'\) refresh\(\)/);
});

test("Continue Watching never disappears on empty, loading, blocked, or failed history", () => {
  const row = read("src/components/mg/ContinueWatchingRow.jsx");
  assert.doesNotMatch(row, /if \(loading \|\| \(displayItems\.length === 0 && !syncError\)\) \{\s*return null;/);
  assert.match(row, /<section aria-busy=\{loading\}/);
  assert.match(row, /Loading your Continue Watching history/);
  assert.match(row, /No unfinished titles were returned for this profile/);
  assert.match(row, /Refresh history/);
  assert.match(row, /Retry sync/);
  assert.match(row, /Base44 is limiting history requests/);
});

test("known-good resume buttons and profile-isolated history remain unchanged", () => {
  const row = read("src/components/mg/ContinueWatchingRow.jsx");
  const profiles = read("src/components/mg/householdProfiles.js");
  for (const key of ["resume", "sources", "reviews", "player-options", "download"]) {
    assert.match(row, new RegExp('data-mg-continue-' + key + '="true"'));
  }
  assert.match(row, /profiledLibrary\.ContinueWatching\s*\.list/);
  assert.match(profiles, /created_by_id: ownerId/);
  assert.match(profiles, /profileOwnsRow\(row, profileId\)/);
  assert.doesNotMatch(row, /ContinueWatching\.delete\(/);
});
