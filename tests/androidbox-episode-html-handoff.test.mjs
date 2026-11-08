import test from "node:test";
import assert from "node:assert/strict";
import { classifyTvBoxSource } from "../src/components/mg/tvBoxSourceGate.js";

let sequence = 0;
const withScraper = async (response, run) => {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const item = response(String(url));
    return {
      ok: item !== null,
      status: item === null ? 404 : 200,
      json: async () => item,
    };
  };
  try {
    const { fetchTvEpisodeSources } = await import(
      `../src/components/mg/tvEpisodeScraper.js?androidbox-handoff=${++sequence}`
    );
    return await run(fetchTvEpisodeSources);
  } finally {
    globalThis.fetch = priorFetch;
  }
};

test("mislabeled webpage scraper cannot win an Android-box episode source race", async () => {
  const fake = "https://vidsrc.to/embed/tv/1396/1/1";
  const real = "https://stream.example.test/episode.m3u8?token=temporary";
  await withScraper(url => {
    if (url.includes("/showbox/")) return {
      links: [{ url: fake, type: "url", language: "en", season: 1, episode: 1 }],
    };
    if (url.includes("/vidsrc/")) return {
      links: [{ url: real, type: "url", season: 1, episode: 1, language: "en" }],
    };
    return null;
  }, async resolve => {
    const links = await resolve({ tmdbId: 1396, season: 1, episode: 1 });
    assert.deepEqual(links.map(x => x.url), [real]);
    assert.equal(links[0].type, "url");
    assert.equal(links[0].launchQualified, false);
  });
});

test("unknown HTML player routes cannot replace a real signed media file", async () => {
  const real = "https://cdn.example.test/download/abc123?token=temporary";
  await withScraper(url => {
    if (!url.includes("/showbox/")) return null;
    return { streams: [
      { url: "https://unrelated.example.test/player.php?episode=1", type: "url" },
      { url: "https://unrelated.example.test/e/abcd123", type: "url" },
      { url: "https://unrelated.example.test/watch/episode-1", type: "url" },
      { url: real, type: "url", language: "en" },
    ] };
  }, async resolve => {
    const links = await resolve({ tmdbId: 1396, season: 1, episode: 2 });
    assert.deepEqual(links.map(x => x.url), [real]);
    assert.equal(classifyTvBoxSource(links[0]).kind, "media");
  });
});

test("verified extensions and explicit HLS/DASH links stay available", async () => {
  const links = [
    "https://cdn.example.test/path/movie.mp4?sig=abc",
    "https://cdn.example.test/hls/master.m3u8?sig=abc",
    "https://cdn.example.test/dash/manifest.mpd?sig=abc",
  ];
  await withScraper(url => url.includes("/showbox/") ? {
    links: links.map(url => ({ url, type: "url", audioLanguage: "en" })),
  } : null, async resolve => {
    const sources = await resolve({ tmdbId: 42, season: 2, episode: 3 });
    assert.deepEqual(new Set(sources.map(x => x.url)), new Set(links));
  });
});

test("all-webpage provider responses publish zero playable source rows", async () => {
  await withScraper(url => url.includes("/showbox/") ? {
    links: [
      {url: "https://onlyflix.to/watch/1396", type: "url"},
      {url: "https://multiembed.mov/?video_id=1396", type: "url"},
      {url: "https://somehost.test/embed/1396", type: "iframe"},
    ],
  } : null, async resolve => {
    const sources = await resolve({ tmdbId: 1396, season: 5, episode: 2 });
    assert.deepEqual(sources, []);
  });
});
