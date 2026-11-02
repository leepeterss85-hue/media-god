import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isManualSourcesClick, sourcePickerMedia } from "../src/components/mg/freshWatchSourceSelection.js";

const read = (file) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("only an explicit fresh-player Sources click opens the manual catalogue", () => {
  assert.equal(isManualSourcesClick({ type: "click" }), true);
  assert.equal(isManualSourcesClick(undefined), false, "automatic iframe failures must remain automatic");
  assert.equal(isManualSourcesClick({ type: "keydown" }), false);
  assert.equal(isManualSourcesClick({ type: "pointermove" }), false);
});

test("fresh movie Sources use the same title and TMDB identity as Continue Watching", () => {
  const result = sourcePickerMedia({
    title: "Film",
    rdTitle: "Film",
    id: 456,
    year: "2025",
    mediaType: "movie",
  });
  assert.equal(result.title, "Film");
  assert.equal(result.tmdbId, 456);
  assert.equal(result.rdYear, "2025");
  assert.equal(result.mediaType, "movie");
  assert.equal(result.season, null);
  assert.equal(result.episode, null);
  assert.equal(result.resumeAt, 0);
});

test("fresh episode Sources search the series title and exact episode rather than a generic show", () => {
  const result = sourcePickerMedia({
    mediaType: "tv",
    type: "series",
    id: 1399,
    title: "Pilot",
    rdTitle: "The Series",
    rdYear: 2026,
    rdSeason: 2,
    rdEpisode: 8,
    imdbId: "tt1234567",
    startTime: 520,
  });
  assert.equal(result.title, "The Series");
  assert.equal(result.mediaType, "tv");
  assert.equal(result.tmdbId, 1399);
  assert.equal(result.imdbId, "tt1234567");
  assert.equal(result.season, 2);
  assert.equal(result.episode, 8);
  assert.equal(result.resumeAt, 520);
});

test("specials keep season zero rather than being treated as a generic TV page", () => {
  const result = sourcePickerMedia({
    mediaType: "tv",
    title: "Special",
    rdTitle: "The Series",
    tmdbId: 151,
    season: 0,
    episode: 1,
  });
  assert.equal(result.season, 0);
  assert.equal(result.episode, 1);
});

test("fresh Sources use the enhanced player context and retain the automatic fallback", () => {
  const portal = read("src/components/mg/PlayerPortalRenderer.jsx");
  const overlay = read("src/components/mg/FreshWatchSourcesOverlay.jsx");
  const enhanced = read("src/components/mg/PlayerProvider.jsx");
  const onlyflix = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  const history = read("src/components/mg/ContinueWatchingRow.jsx");

  assert.match(portal, /isFireTvRuntime\(\) && !isAndroidMobileRuntime\(\)/);
  assert.match(portal, /isManualSourcesClick\(event\)/);
  assert.match(portal, /setSourcePickerRequest\(source\.playRequestId\)/);
  assert.match(portal, /mg:fresh-watch-sources-open/);
  assert.match(portal, /onFallbackSources\?\.\(\)/);
  assert.match(portal, /manualSourcesOpen \? null : magnetPlayer/);
  assert.doesNotMatch(portal, /<StreamSourcesBox/, "the core portal must not render enhanced-only controls");

  assert.match(enhanced, /<FreshWatchSourcesOverlay/);
  assert.match(overlay, /<StreamSourcesBox/);
  assert.match(overlay, /data-mg-player-root="true"/);
  assert.match(overlay, /data-mg-manual-sources="true"/);
  assert.match(overlay, /mediaType=\{lookup\.mediaType\}/);
  assert.match(overlay, /season=\{lookup\.season\}/);
  assert.match(overlay, /episode=\{lookup\.episode\}/);
  assert.match(overlay, /torrentOnly/);
  assert.match(overlay, /mg:fresh-watch-sources-closed/);
  assert.match(onlyflix, /onClick=\{onOpenSources\}/);
  assert.match(onlyflix, /onOpenSources\(\);/);
  assert.match(history, /<StreamSourcesBox/);
  assert.match(history, /torrentOnly/);
});
