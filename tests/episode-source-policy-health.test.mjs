import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  episodeSourceMismatchReason, episodeSourceMatchesRequest,
  flixQuestFirstEpisodeSources, isFlixQuestEpisodeSource, hasUsableEpisodeAddonSource,
} from "../src/components/mg/episodeSourcePolicy.js";
import {
  episodeHealthProvider, episodeProviderHealthSummary,
  episodeSourceHealthScore, recordEpisodeSourceHealth,
} from "../src/components/mg/episodeSourceHealth.js";

test("episode source checker rejects mismatched seasons and single episodes but retains season packs", () => {
  const requested = { season: 1, episode: 3 };
  assert.equal(episodeSourceMismatchReason({ filename: "Series.S01E03.1080p.mkv" }, requested), "");
  assert.equal(episodeSourceMismatchReason({ filename: "Series.S01E04.1080p.mkv" }, requested), "wrong_episode_release");
  assert.equal(episodeSourceMismatchReason({ filename: "Series.S02E03.1080p.mkv" }, requested), "wrong_episode_release");
  assert.equal(episodeSourceMismatchReason({ filename: "Series.1x04.WEB-DL.mkv" }, requested), "wrong_episode_release");
  assert.equal(episodeSourceMismatchReason({ filename: "Series.S01E01-E06.Pack.mkv" }, requested), "");
  assert.equal(episodeSourceMismatchReason({ filename: "Series.S01E01E02.Pack.mkv" }, requested), "wrong_episode_release");
  assert.equal(episodeSourceMismatchReason({ filename: "Series.S01.Complete.Pack" }, requested), "");
  assert.equal(episodeSourceMismatchReason({ season: 1, episode: 4, filename: "Series.S01.Complete" }, requested), "wrong_episode");
  assert.equal(episodeSourceMatchesRequest({ filename: "Series.S01E03.mkv" }, requested), true);
  assert.equal(episodeSourceMatchesRequest({ filename: "Series.S01E04.mkv" }, requested), false);
});

test("Stremio-compatible addon streams lead while FlixQuest stays available as backup", () => {
  const torrentio = { addon: "Torrentio", filename: "Series.S01E03.WEB-DL.mkv", type: "torrent" };
  const comet = { addon: "Comet", type: "torrent" };
  const mediaFusion = { addon: "MediaFusion", type: "torrent" };
  const flixQuest = { provider: "flixquest-showbox", episodeResolver: "flixquest", src: "https://example.test/episode.m3u8" };
  const ordered = flixQuestFirstEpisodeSources([torrentio, comet, flixQuest, mediaFusion]);
  assert.deepEqual(ordered, [torrentio, comet, mediaFusion, flixQuest]);
  assert.equal(isFlixQuestEpisodeSource(ordered.at(-1)), true);
  assert.equal(hasUsableEpisodeAddonSource([torrentio], { season: 1, episode: 3 }), false);
  assert.equal(hasUsableEpisodeAddonSource([
    { addon: "StremSRC", url: "https://video.test/episode.m3u8", season: 1, episode: 3 }
  ], { season: 1, episode: 3 }), true);
  assert.equal(hasUsableEpisodeAddonSource([
    { addon: "StremSRC", url: "https://video.test/episode.m3u8", season: 1, episode: 4 }
  ], { season: 1, episode: 3 }), false);
  assert.deepEqual(flixQuestFirstEpisodeSources([torrentio, comet]), [torrentio, comet]);
  assert.deepEqual(flixQuestFirstEpisodeSources([
    torrentio, { ...flixQuest, audioLanguage: "fr" },
  ])[0], torrentio);
});

function memoryStorage() {
  const store = new Map();
  return {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => store.delete(key),
    stored: store,
  };
}

test("health learns exact episode/source outcome and never saves raw stream URLs", () => {
  const oldWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = { localStorage: storage };
  try {
    const episode = { tmdbId: 9823, season: 2, episode: 3 };
    const source = {
      id: "direct-episode-stream",
      addon: "Comet",
      src: "https://example.test/file.mp4?token=SENSITIVE_SECRET",
    };
    const other = { ...source, id: "different-episode-stream" };
    assert.equal(episodeHealthProvider(source), "Comet");
    assert.equal(episodeSourceHealthScore(source, episode), 0);
    assert.equal(recordEpisodeSourceHealth(source, episode, "good"), true);
    assert.ok(episodeSourceHealthScore(source, episode) > 0);
    assert.equal(episodeSourceHealthScore(other, episode), 0);
    assert.equal(episodeSourceHealthScore(source, { ...episode, episode: 4 }), 0);
    assert.equal(recordEpisodeSourceHealth(source, episode, "good"), false, "no repeated good marks on every render");
    assert.equal(recordEpisodeSourceHealth(source, episode, "no-sound"), true);
    assert.ok(episodeSourceHealthScore(source, episode) < 0);
    assert.equal(recordEpisodeSourceHealth(source, episode, "good"), false, "video alone cannot erase a silence warning");
    const summary = episodeProviderHealthSummary();
    assert.equal(summary.Comet.successes, 1);
    assert.equal(summary.Comet.noSound, 1);
    const serialized = Array.from(storage.stored.values()).join(" ");
    assert.doesNotMatch(serialized, /SENSITIVE_SECRET|https:\/\//);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test("source publication preserves addon-first priority and manual torrent options", () => {
  const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  const player = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
  const selector = readFileSync(new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url), "utf8");
  assert.match(provider, /flixQuestFirstEpisodeSources\(episodeAutoplayCandidates/);
  assert.match(provider, /episodeSourceMatchesRequest\(item, \{ season, episode \}\)/);
  assert.match(provider, /runtimeEpisodeSources\.length > 0\s*\? runtimeEpisodeSources\s*: qualifiedLaunchSources/);
  assert.match(provider, /launchFlixQuestBackup\(\)/);
  assert.match(player, /recordEpisodeSourceHealth\(active, episodeHealthContext, "good"/);
  assert.match(player, /recordEpisodeSourceHealth\(failedItem, episodeHealthContext, "failure"\)/);
  assert.match(selector, /rankEpisodeSourceChoices\(ranked\)/);
  assert.match(selector, /episodeSourceHealthScore\(item, options\?\.episodeContext\)/);
  assert.match(player, /manualSourceLockActive/);
});
