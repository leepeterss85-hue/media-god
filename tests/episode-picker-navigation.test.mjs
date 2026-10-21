import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { episodeHasAired } from "../src/components/mg/episodeExperience.js";

const picker = readFileSync(new URL("../src/components/mg/PlayerEpisodeQuickNav.jsx", import.meta.url), "utf8");
const helpers = picker.slice(picker.indexOf("const positiveInt ="), picker.indexOf("const readContext ="));
const context = {};
vm.runInNewContext(helpers + "\nglobalThis.episodeKey = episodeNavigationKey;", context);
const episodeKey = context.episodeKey;

test("episode context identity is stable when markers, audio, or preload metadata updates", () => {
  const initial = { mediaType: "tv", tmdbId: 123, season: 2, episode: 3, title: "Show" };
  assert.equal(episodeKey(initial), episodeKey({
    ...initial, title: "Show — S02E03", skipMarkers: { intro: 90 },
    nextEpisodeAvailable: true, episodeName: "Part 3", playbackSessionId: "new",
  }));
  assert.notEqual(episodeKey(initial), episodeKey({ ...initial, episode: 4 }));
  assert.notEqual(episodeKey(initial), episodeKey({ ...initial, season: 3 }));
  assert.notEqual(episodeKey(initial), episodeKey({ ...initial, tmdbId: 124 }));
  assert.notEqual(episodeKey(initial), episodeKey({ ...initial, mediaType: "movie" }));
});

test("same-episode context updates cannot close the season selector", () => {
  const begin = picker.indexOf("const onContext = (event) =>");
  const end = picker.indexOf('window.addEventListener("mg:player-context", onContext)', begin);
  const update = picker.slice(begin, end);
  assert.match(update, /if \(nextKey !== episodeKeyRef\.current\)/);
  assert.match(update, /\+\+pickerRequestRef\.current/);
  assert.match(update, /setPickerOpen\(false\)/);
  assert.match(update, /setContext\(next\)/);
  assert.match(picker, /const closePicker = \(\) => \{[\s\S]*?\+\+pickerRequestRef\.current/);
});

test("TMDB season requests ignore late responses and cache previously loaded seasons", () => {
  const start = picker.indexOf("const loadEpisodes = async");
  const end = picker.indexOf("const chooseEpisodes =", start);
  const loaders = picker.slice(start, end);
  assert.match(loaders, /const requestId = \+\+pickerRequestRef\.current/);
  assert.match(loaders, /if \(requestId !== pickerRequestRef\.current\) return;/);
  assert.match(loaders, /seasonCacheRef\.current\.get\(cacheKey\)/);
  assert.match(loaders, /seasonCacheRef\.current\.set\(cacheKey, nextEpisodes\)/);
  assert.match(loaders, /if \(requestId === pickerRequestRef\.current\) setPickerBusy\(false\)/);
  assert.match(loaders, /if \(pickerOpen\) \{\s*closePicker\(\)/);
});

test("episode controls allow previous, next and manual season choice without losing player", () => {
  assert.match(picker, /aria-label="Previous episode"/);
  assert.match(picker, /aria-label="Next episode"/);
  assert.match(picker, /aria-label="Browse seasons and episodes"/);
  assert.match(picker, /new CustomEvent\("mg:play-specific-episode"/);
  assert.match(picker, /new CustomEvent\("mg:play-next-episode"\)/);
  assert.match(picker, /new CustomEvent\("mg:choose-episode"\)/);
  assert.match(picker, /const episodeNumber = positiveInt\(lastEpisode\?\.episode_number\)/);
});

test("unaired episodes stay visible but cannot be played prematurely", () => {
  assert.equal(episodeHasAired({ air_date: "2020-01-01" }), true);
  assert.equal(episodeHasAired({ air_date: "2999-01-01" }), false);
  assert.match(picker, /disabled=\{!hasAired\}/);
  assert.match(picker, /if \(!episodeHasAired\(episodeItem\)\) return;/);
  assert.match(picker, />Coming soon<\/span>/);
});
