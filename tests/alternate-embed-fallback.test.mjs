import test from "node:test";
import assert from "node:assert/strict";

import { buildAlternateEmbedFallback } from "../src/components/mg/alternateEmbedFallback.js";

test("alternate movie fallback mirrors EV by preferring TMDB and preserves resume position", () => {
  const result = buildAlternateEmbedFallback(
    {
      mediaType: "movie",
      imdbId: "tt1234567",
      tmdbId: 98765,
      title: "Example Film",
    },
    { resumeAt: 321.9 }
  );

  assert.ok(result);
  assert.match(result.url, /^https:\/\/vaplayer\.ru\/embed\/movie\/98765\?/);
  assert.match(result.url, /autoplay=1/);
  assert.match(result.url, /resumeAt=321/);
  assert.match(result.url, /title=Example\+Film/);
});

test("alternate TV fallback uses TMDB season and episode", () => {
  const result = buildAlternateEmbedFallback({
    mediaType: "tv",
    tmdbId: 205715,
    season: 2,
    episode: 6,
  });

  assert.ok(result);
  assert.equal(result.mediaType, "tv");
  assert.equal(result.season, 2);
  assert.equal(result.episode, 6);
  assert.match(result.url, /^https:\/\/vaplayer\.ru\/embed\/tv\/205715\/2\/6\?/);
});

test("alternate fallback refuses invalid or missing media identifiers", () => {
  assert.equal(buildAlternateEmbedFallback({ title: "No ID" }), null);
  assert.equal(buildAlternateEmbedFallback({ imdbId: "not-an-imdb-id" }), null);
});
