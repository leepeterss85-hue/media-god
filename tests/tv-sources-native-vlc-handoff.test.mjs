import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  sourceHasPendingCacheSignal,
  sourceIsConfirmedCachedForPlayback,
} from "../src/components/mg/sourceCacheVisibility.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const sourceBox = read("src/components/mg/MediaStreamSourcesBox.jsx");
const provider = read("src/components/mg/MediaPlayerProvider.jsx");
const player = read("src/components/mg/VideoPlayer.jsx");
const phone = read("android-mobile/app/src/main/java/com/mediagod/mobile/PlaybackCompatibilityRouter.kt");
const fire = read("firetv-android/app/src/main/java/com/mediagod/firetv/PlaybackCompatibilityRouter.kt");

/** Execute the real component click handlers with a captured player context. */
function selectedEpisodeSource({
  type = "torrent",
  hasDebrid = true,
  src = "magnet:?xt=urn:btih:0123456789012345678901234567890123456789",
  properties = {},
} = {}) {
  const start = sourceBox.indexOf("  const playCombinedDebrid =");
  const end = sourceBox.indexOf("  const pasteMagnet =", start);
  assert.ok(start >= 0 && end > start);
  const captured = [];
  const visibleAddonStreams = [
    { type, src, label: "Viewer-selected source", ...properties },
    { type: "url", src: "https://example.test/episode-other.mp4", label: "Alternative" },
  ];
  const context = {
    player: { play: async (payload) => { captured.push(payload); return true; } },
    setMessage: () => {}, setRdSearching: () => {},
    hasDebrid, rdSearching: false,
    sourceHasPendingCacheSignal, sourceIsConfirmedCachedForPlayback,
    tmdbId: 1234, resolvedImdb: "tt123456", imdbId: "",
    title: "Example Show", poster: "poster", rdYear: 2026,
    mediaType: "tv", season: 2, episode: 4,
    alternateYears: [], resumeAt: 1800, visibleAddonStreams,
  };
  const handler = vm.runInNewContext(
    sourceBox.slice(start, end) + "\nplayAddonStream;",
    context
  );
  return { run: () => handler(visibleAddonStreams[0]), captured, visibleAddonStreams };
}

test("uncached episode torrent automatically uses Combined Debrid ready-file lookup", async () => {
  const selection = selectedEpisodeSource({
    properties: { debridCacheChecked: true, debridCached: false },
  });
  await selection.run();
  assert.equal(selection.captured.length, 1);
  const selected = selection.captured[0];
  assert.equal(selected.skipEpisodeAutoPrepare, true);
  assert.equal(selected.skipAddonLookup, undefined);
  assert.equal(selected.skipRdLookup, undefined);
  assert.equal(selected.preferRd, true);
  assert.equal(selected.mediaType, "tv");
  assert.equal(selected.season, 2);
  assert.equal(selected.episode, 4);
  assert.equal(selected.startTime, 1800);
  assert.equal(selected.sources.length, 0, "do not submit same uncached torrent immediately");
  assert.equal(selected.completeSources.length, 2, "retain the full manual source list");
  assert.match(provider, /request\?\.skipEpisodeAutoPrepare/);
  assert.match(provider, /findRdLibrarySource\(/);
});

test("unknown-cache episode torrent checks ready sources first", async () => {
  const selection = selectedEpisodeSource();
  await selection.run();
  assert.equal(selection.captured.length, 1);
  assert.equal(selection.captured[0].skipEpisodeAutoPrepare, true);
  assert.equal(selection.captured[0].sources.length, 0);
});

test("addon-labeled URL still uses Combined Debrid when cache is pending", async () => {
  const selection = selectedEpisodeSource({
    type: "url",
    src: "https://example.test/uncached-torrent-playback",
    properties: { cacheRequired: true, debridCacheChecked: true, debridCached: false },
  });
  await selection.run();
  assert.equal(selection.captured.length, 1);
  assert.equal(selection.captured[0].skipEpisodeAutoPrepare, true);
  assert.equal(selection.captured[0].sources.length, 0);
});

test("confirmed cached episode torrent still opens exact selected VLC media route", async () => {
  const selection = selectedEpisodeSource({ properties: { debridCached: true } });
  await selection.run();
  const selected = selection.captured[0];
  assert.equal(selected.verifiedPlaybackPolicy, "manual");
  assert.equal(selected.manualSourceSelection, true);
  assert.equal(selected.preparedEpisodeHandoff, true);
  assert.equal(selected.skipAddonLookup, true);
  assert.equal(selected.skipRdLookup, true);
  assert.equal(selected.sources.length, 1);
  assert.equal(selected.sources[0].label, "Viewer-selected source");
  assert.equal(selected.completeSources.length, 2);
  assert.match(provider, /request\?\.verifiedPlaybackPolicy !== "manual"/);
  assert.match(provider, /if \(preparedEpisodeHandoff\) \{\s*return true;/);
});

test("direct HTTP TV stream uses VLC route; provider webpages keep web players", async () => {
  const direct = selectedEpisodeSource({ type: "url", src: "https://example.test/episode.mp4" });
  await direct.run();
  assert.equal(direct.captured[0].preparedEpisodeHandoff, true);
  assert.equal(direct.captured[0].manualSourceSelection, true);
  const webpage = selectedEpisodeSource({ type: "provider", src: "https://example.test/watch" });
  await webpage.run();
  assert.equal(webpage.captured[0].preparedEpisodeHandoff, false);
  assert.equal(webpage.captured[0].manualSourceSelection, false);
  assert.equal(webpage.captured[0].allowNonPlaybackFallback, true);
  for (const router of [phone, fire]) {
    assert.match(router, /!payload\.optBoolean\("live", false\)[\s\S]{0,430}?return Decision\(true, "default-libvlc-vod"\)/);
  }
});

test("manual episode source stays pinned before automatic startup handoff", () => {
  assert.match(player, /const manualSourceLockRef = useRef\(\{[\s\S]*?source\?\.manualSourceSelection === true[\s\S]*?stablePlaybackSourceKey\(sources\[0\], 0\)/);
  assert.match(player, /const initialManualSourceKey =[\s\S]*?source\?\.manualSourceSelection === true/);
  assert.match(player, /sourceKey: initialManualSourceKey/);
  assert.match(player, /claimed: Boolean\(initialManualSourceKey\)/);
  assert.match(player, /const startupHandoffAvailable = canAutoHandoffStartup\(\{[\s\S]*?manuallySelected: manualSourceLockActive\(\)/);
  assert.match(player, /const startupSelectionAllowed =[\s\S]*?!manualSourceLockActive\(\)/);
});

test("HTTP 429 is described as a Real-Debrid rate limit, not a VLC failure", () => {
  assert.match(player, /const rdRateLimited =/);
  assert.match(player, /Playback lookup returned HTTP 429 \(too many requests\)/);
  assert.match(player, /This torrent is not ready to play/);
});

test("HTTP 429 attempts only already-ready TV fallback, never another uncached download", () => {
  assert.match(player, /rdRateLimited &&[\s\S]{0,140}?playbackMediaType === "tv" &&[\s\S]{0,140}?!manualSourceLockActive\(\)/);
  assert.match(player, /const readyBackup = findNextPlayableSource\(activeIdx, \{[\s\S]{0,90}?allowCaching: false/);
  assert.match(player, /Real-Debrid is rate limited\. Trying a ready episode source/);
});

test("unconnected Real-Debrid source does not launch", async () => {
  const selection = selectedEpisodeSource({ type: "rd", hasDebrid: false });
  await selection.run();
  assert.equal(selection.captured.length, 0);
});

test("TV Sources retain episode identity and web backups", () => {
  const episodes = read("src/components/mg/EpisodeSelector.jsx");
  assert.match(episodes, /data-mg-episode-sources="true"/);
  assert.match(episodes, /setSourcesEpisode/);
  assert.match(episodes, /<StreamSourcesBox/);
  assert.match(sourceBox, /mediaType === "tv"[\s\S]{0,320}?rows\.filter\(\(row\) => row\.kind === "rd" \|\| row\.kind === "addon-stream"\)/);
  assert.match(sourceBox, /Web-player links/);
  assert.match(sourceBox, /verifiedPlaybackPolicy: "manual",[\s\S]{0,150}?manualSourceSelection: true,[\s\S]{0,150}?preparedEpisodeHandoff: true/);
});
