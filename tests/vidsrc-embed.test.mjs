import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildVidSrcEmbedUrl } from "../src/components/mg/vidsrcEmbed.js";

test("VidSrc builds a film URL from a validated IMDb or TMDb id", () => {
  assert.equal(
    buildVidSrcEmbedUrl({ mediaType: "movie", imdbId: "tt17048514", tmdbId: 927085 }),
    "https://vidsrc.to/embed/movie/tt17048514"
  );
  assert.equal(
    buildVidSrcEmbedUrl({ mediaType: "movie", tmdbId: 927085 }),
    "https://vidsrc.to/embed/movie/927085"
  );
});

test("VidSrc addresses one exact episode including season zero", () => {
  assert.equal(
    buildVidSrcEmbedUrl({ mediaType: "tv", id: 158876, season: 0, episode: 2 }),
    "https://vidsrc.to/embed/tv/158876/0/2"
  );
  assert.equal(
    buildVidSrcEmbedUrl({ mediaType: "episode", imdbId: "tt18382028", rdSeason: 1, rdEpisode: 5 }),
    "https://vidsrc.to/embed/tv/tt18382028/1/5"
  );
});

test("VidSrc cannot guess an episode or accept a foreign URL/id", () => {
  assert.equal(buildVidSrcEmbedUrl({ mediaType: "tv", id: 158876, season: 1 }), "");
  assert.equal(buildVidSrcEmbedUrl({ mediaType: "tv", id: 158876, season: 1, episode: 0 }), "");
  assert.equal(buildVidSrcEmbedUrl({ mediaType: "movie", id: "tt123/../../other" }), "");
  assert.equal(buildVidSrcEmbedUrl({ mediaType: "movie", id: "https://evil.example" }), "");
  assert.equal(buildVidSrcEmbedUrl({ mediaType: "live", id: 927085 }), "");
});

test("VidSrc stays a manual separate player while normal provider pages remain blocked", () => {
  const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  const player = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
  const movieDetails = readFileSync(new URL("../src/components/mg/MediaStreamSourcesBox.jsx", import.meta.url), "utf8");
  const episodes = readFileSync(new URL("../src/components/mg/EpisodeSelector.jsx", import.meta.url), "utf8");
  const portal = readFileSync(new URL("../src/components/mg/PlayerPortalRenderer.jsx", import.meta.url), "utf8");
  assert.match(movieDetails, /player\.playVidSrc\(/);
  assert.match(episodes, /player\.playVidSrc\(/);
  assert.match(player, /data-mg-vidsrc-open="true"/);
  assert.match(provider, /<PlayerPortalRenderer/);
  assert.match(portal, /vidSrcEmbed \? \(/);
  assert.match(portal, /stopExclusivePlayback\(\);\s*setVidSrcEmbed\(\{/);
  assert.match(player, /!isLive && \(isYoutube \|\| isProvider \|\| active\?\.type === "external"\)/);
  assert.doesNotMatch(provider, /buildMediaSources[\s\S]*vidsrc\.to/);
});
