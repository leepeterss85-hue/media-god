import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOnlyFlixEmbedUrl } from "../src/components/mg/onlyFlixEmbed.js";
import { buildVidCoreEmbedUrl } from "../src/components/mg/vidCoreEmbed.js";
import { buildVidSrcEmbedUrl } from "../src/components/mg/vidsrcEmbed.js";
import {
  buildVidRiftEpisodeEmbedUrl,
  buildStellarEpisodeEmbedUrl,
  buildTwoEmbedEmbedUrl,
  buildCineSrcEmbedUrl,
  buildMultiEmbedEmbedUrl,
} from "../src/components/mg/extraEmbedProviders.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("TV source tabs expose only exact-episode embeds and preserve movie VidCore player", () => {
  const episode = { mediaType: "tv", tmdbId: 1399, season: 3, episode: 5 };
  const builders = [
    buildOnlyFlixEmbedUrl, buildVidCoreEmbedUrl, buildVidSrcEmbedUrl,
    buildVidRiftEpisodeEmbedUrl, buildStellarEpisodeEmbedUrl,
    buildTwoEmbedEmbedUrl, buildCineSrcEmbedUrl, buildMultiEmbedEmbedUrl,
  ];
  for (const build of builders) {
    const url = build(episode);
    assert.ok(url.startsWith("https://"), `missing episode player: ${build.name}`);
    assert.equal(build({ ...episode, episode: null }), "", `must reject generic TV page: ${build.name}`);
  }
  assert.equal(buildVidCoreEmbedUrl({ ...episode, mediaType: "movie" }), "https://vidcore.org/embed/movie/1399");
  const tabs = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  for (const id of ["onlyflix", "vidcore", "vidrift", "stellar", "vidsrc", "twoembed", "cinesrc", "multiembed"]) {
    assert.match(tabs, new RegExp(`id: "${id}", label: `));
  }
  assert.match(tabs, /const tvBackups = media\?\.mediaType === "tv"/);
  assert.match(tabs, /data-mg-vyla-test-player="true"/);
  assert.match(tabs, /initialEpisodeProvider = "onlyflix"/);
  assert.match(tabs, /initialEpisodeProvider === "vidcore"/);
  assert.match(tabs, /const movieBackups = media\?\.mediaType === "movie"/);
  const portal = read("src/components/mg/PlayerPortalRenderer.jsx");
  assert.match(portal, /vidSrcEmbed\?\.media\?\.mediaType === "tv" \? \(/);
  assert.match(portal, /initialEpisodeProvider="vidcore"/);
  assert.match(portal, /<VidCoreEmbedPlayer/);
});

test("episode cards offer source lists without replacing Resume, Review or Play", () => {
  const selector = read("src/components/mg/EpisodeSelector.jsx");
  assert.match(selector, /data-mg-episode-sources="true"/);
  assert.match(selector, /data-mg-episode-source-panel="true"/);
  assert.match(selector, /<StreamSourcesBox/);
  assert.match(selector, /mediaType="tv"/);
  assert.match(selector, /season=\{seasonNumber\}/);
  assert.match(selector, /episode=\{episodeNumber\}/);
  assert.match(selector, /resumeAt=\{hasResume \? Number\(progressRecord\?\.progress \|\| 0\) : 0\}/);
  assert.match(selector, /asPositiveInt\(item\?\.tmdb_id\) \|\|/);
  assert.match(selector, /if \(!startTime && player\.playOnlyFlix\?\.\(baseRequest\)\) return/);
  assert.match(selector, /if \(!startTime && player\.playVidCore\?\.\(baseRequest\)\) return/);
  assert.match(selector, /onClick=\{\(\) =>\s*playEpisode\(/);
  assert.match(selector, /<MediaReviews/);
  const newEpisodes = read("src/components/mg/NewEpisodesRow.jsx");
  assert.match(newEpisodes, /player\.playVidCore\?\.\(\{/);
  const details = read("src/components/mg/DetailModal.jsx");
  assert.match(details, /player\.playOnlyFlix\s*&&/);
  // User-approved movie routing is deliberately not modified.
  const core = read("src/components/mg/MediaPlayerProvider.jsx");
  assert.match(core, /const playVidCore = useCallback/);
});
