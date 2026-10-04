import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { buildEmbedSuEmbedUrl, hostedEmbedPage } from "../src/components/mg/webEmbedProviders.js";
import { extractEmbedSuServers } from "../base44/functions/discoverEmbedSuServers/embedServers.mjs";

test("Embed.su uses a TMDb film ID or an exact television episode", () => {
  assert.equal(buildEmbedSuEmbedUrl({ mediaType: "movie", tmdbId: 550 }), "https://embed.su/embed/movie/550");
  assert.equal(buildEmbedSuEmbedUrl({ mediaType: "tv", tmdbId: 1399, season: 0, episode: 1 }), "https://embed.su/embed/tv/1399/0/1");
  assert.equal(buildEmbedSuEmbedUrl({ mediaType: "tv", tmdbId: 1399, season: 1 }), "");
  assert.equal(buildEmbedSuEmbedUrl({ mediaType: "movie", imdbId: "tt0137523" }), "");
  assert.equal(buildEmbedSuEmbedUrl({ mediaType: "live", tmdbId: 550 }), "");
  assert.equal(buildEmbedSuEmbedUrl({ mediaType: "movie", tmdbId: "550/../../x" }), "");
});

test("Only concrete UpStream, MixDrop, and VidCloud embed links are accepted", () => {
  assert.deepEqual(hostedEmbedPage("https://mixdrop.ag/f/AbC123?download=1"), {
    provider: "mixdrop", url: "https://mixdrop.ag/e/AbC123",
  });
  assert.equal(hostedEmbedPage("https://upstream.to/embed-AbC123.html")?.provider, "upstream");
  assert.equal(hostedEmbedPage("https://vidcloud.org/embed/video/AbC123")?.provider, "vidcloud");
  for (const value of [
    "http://mixdrop.ag/e/AbC123",
    "https://mixdrop.ag.evil.test/e/AbC123",
    "https://upstream.to@evil.test/e/AbC123",
    "https://mixdrop.ag/admin",
    "https://vidcloud.org/",
    "javascript:alert(1)",
    "https://127.0.0.1/e/AbC123",
  ]) assert.equal(hostedEmbedPage(value), null, value);
});

test("Cheerio discovery returns only verified server pages and deduplicates", () => {
  const html = [
    '<iframe src="https://mixdrop.ag/e/AbC123"></iframe>',
    '<a href="https://upstream.to/e/Def456.html">UpStream</a>',
    '<div data-src="https://vidcloud.org/embed/video/Ghi789"></div>',
    '<script>const x = {"url":"https:\\/\\/mixdrop.ag\\/e\\/AbC123"};</script>',
    '<a href="https://evil.test/e/Bad123">VidCloud</a>',
    '<a href="https://mixdrop.ag.evil.test/e/Bad123">MixDrop</a>',
    '<a href="https://mixdrop.ag/private">MixDrop</a>',
  ].join("");
  const found = extractEmbedSuServers(html, load);
  assert.deepEqual(found.map(({ provider }) => provider), ["mixdrop", "upstream", "vidcloud"]);
  assert.equal(found.length, 3);
});

test("Cheerio reads JSON-escaped server links without inventing a URL", () => {
  const html = '<script>window.servers = [{"url":"https:\\/\\/mixdrop.ag\\/e\\/AbC123"}]</script>';
  assert.deepEqual(extractEmbedSuServers(html, load), [{
    provider: "mixdrop", label: "MixDrop", url: "https://mixdrop.ag/e/AbC123",
  }]);
  assert.deepEqual(extractEmbedSuServers("<script>window.servers = []</script>", load), []);
});

test("Embed.su remains a manual web path with an optional browser fallback", () => {
  const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  const player = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
  const details = readFileSync(new URL("../src/components/mg/MediaStreamSourcesBox.jsx", import.meta.url), "utf8");
  const episodes = readFileSync(new URL("../src/components/mg/EpisodeSelector.jsx", import.meta.url), "utf8");
  const discovery = readFileSync(new URL("../base44/functions/discoverEmbedSuServers/entry.ts", import.meta.url), "utf8");
  const portal = readFileSync(new URL("../src/components/mg/PlayerPortalRenderer.jsx", import.meta.url), "utf8");
  assert.match(details, /player\.playEmbedSu\(/);
  assert.match(episodes, /player\.playEmbedSu\(/);
  assert.match(player, /data-mg-embedsu-open="true"/);
  assert.match(provider, /<PlayerPortalRenderer/);
  assert.match(portal, /stopExclusivePlayback\(\);\s*setVidSrcEmbed\(\{[\s\S]*?provider: "embedsu"/);
  assert.match(discovery, /npm:cheerio/);
  assert.match(discovery, /npm:puppeteer-core/);
  assert.doesNotMatch(provider, /buildMediaSources[\s\S]*embed\.su/);
});
