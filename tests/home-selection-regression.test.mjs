import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Continue Watching opens promptly and accepts remote activation keys", () => {
  const source = read("src/components/mg/ContinueWatchingRow.jsx");

  assert.match(source, /TMDB_RESOLVE_BUDGET_MS\s*=\s*300/);
  assert.match(source, /resolveTmdbIdQuickly/);
  assert.match(source, /Promise\.race/);
  assert.match(source, /data-mg-card-primary="true"/);
  assert.match(source, /data-mg-focus-key=\{\`continue:/);
  assert.match(source, /code\s*===\s*23/);
  assert.match(source, /code\s*===\s*66/);
});

test("Recently Watched uses the same reliable homepage activation contract", () => {
  const source = read("src/components/mg/RecentlyWatchedRow.jsx");

  assert.match(source, /resolveTmdbIdQuickly/);
  assert.match(source, /data-mg-card-primary="true"/);
  assert.match(source, /data-mg-focus-key=\{\`recent:/);
  assert.match(source, /code\s*===\s*23/);
});

test("homepage content rows expose explicit primary remote targets", () => {
  const mediaCard = read("src/components/mg/MediaCard.jsx");
  const newEpisodes = read("src/components/mg/NewEpisodesRow.jsx");
  const hero = read("src/components/mg/HeroSlider.jsx");
  const stableMode = read("src/components/mg/fireTvStableMode.js");

  assert.match(mediaCard, /data-mg-card-primary="true"/);
  assert.match(newEpisodes, /data-mg-card-primary="true"/);
  assert.match(newEpisodes, /data-mg-focus-key=\{\`new-episode:/);
  assert.match(hero, /hero-watch:/);
  assert.match(hero, /hero-watchlist:/);
  assert.match(hero, /hero-details:/);
  assert.match(stableMode, /querySelectorAll\('\[data-mg-card-primary="true"\]'\)/);
});

test("Fire TV restores a usable card in the same Home row after playback closes", () => {
  const source = read("src/components/mg/FireTvFocusMemory.jsx");

  assert.match(source, /rowContextFor/);
  assert.match(source, /rowFallbackTarget/);
  assert.match(source, /rowCardIndex/);
  assert.match(source, /data-mg-tv-row="true"/);
  assert.match(source, /mg:core-player-closed/);
  assert.match(source, /mg:player-visibility/);
  assert.match(source, /data-mg-card-primary="true"/);
});
