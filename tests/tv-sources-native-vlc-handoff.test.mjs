import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const sourceBox = read("src/components/mg/MediaStreamSourcesBox.jsx");
const provider = read("src/components/mg/MediaPlayerProvider.jsx");
const phone = read("android-mobile/app/src/main/java/com/mediagod/mobile/PlaybackCompatibilityRouter.kt");
const fire = read("firetv-android/app/src/main/java/com/mediagod/firetv/PlaybackCompatibilityRouter.kt");

/** Exercise the actual Sources click handler without mounting the browser UI. */
function selectedEpisodeSource({ type = "torrent", hasDebrid = true, src = "magnet:?xt=urn:btih:0123456789012345678901234567890123456789" } = {}) {
  const start = sourceBox.indexOf("  const playAddonStream =");
  const end = sourceBox.indexOf("  const pasteMagnet =", start);
  assert.ok(start >= 0 && end > start);
  const captured = [];
  const visibleAddonStreams = [
    { type, src, label: "Viewer-selected source" },
    { type: "url", src: "https://example.test/episode-other.mp4", label: "Alternative" },
  ];
  const context = {
    player: { play: async (payload) => { captured.push(payload); return true; } },
    setMessage: () => {}, hasDebrid, rdSearching: false,
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

test("TV Sources selection starts the exact user-picked video, not an empty auto-verification gate", async () => {
  const selection = selectedEpisodeSource();
  await selection.run();
  assert.equal(selection.captured.length, 1);
  const selected = selection.captured[0];
  assert.equal(selected.verifiedPlaybackPolicy, "manual");
  assert.equal(selected.manualSourceSelection, true);
  assert.equal(selected.preparedEpisodeHandoff, true);
  assert.equal(selected.skipAddonLookup, true);
  assert.equal(selected.skipRdLookup, true);
  assert.equal(selected.mediaType, "tv");
  assert.equal(selected.season, 2);
  assert.equal(selected.episode, 4);
  assert.equal(selected.startTime, 1800);
  assert.equal(selected.sources.length, 1);
  assert.equal(selected.sources[0].label, "Viewer-selected source");
  assert.equal(selected.completeSources.length, 2);
  assert.match(provider, /request\?\.verifiedPlaybackPolicy !== "manual"/);
  assert.match(provider, /if \(preparedEpisodeHandoff\) \{\s*return true;/);
});

test("TV Sources direct HTTP choice uses same VLC path; provider pages do not pretend to be native media", async () => {
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

test("manually selected episode source stays pinned before startup handoff", () => {
  const videoPlayer = read("src/components/mg/VideoPlayer.jsx");
  assert.match(videoPlayer, /const manualSourceLockRef = useRef\(\{[\s\S]*?source\?\.manualSourceSelection === true[\s\S]*?stablePlaybackSourceKey\(sources\[0\], 0\)/);
  assert.match(videoPlayer, /const initialManualSourceKey =[\s\S]*?source\?\.manualSourceSelection === true/);
  assert.match(videoPlayer, /sourceKey: initialManualSourceKey/);
  assert.match(videoPlayer, /claimed: Boolean\(initialManualSourceKey\)/);
  assert.match(videoPlayer, /const startupHandoffAvailable = canAutoHandoffStartup\(\{[\s\S]*?manuallySelected: manualSourceLockActive\(\)/);
  assert.match(videoPlayer, /const startupSelectionAllowed =[\s\S]*?!manualSourceLockActive\(\)/);
  const native = read("src/components/mg/nativeFireTvBridge.js");
  assert.match(native, /forceCompatibility: Boolean\(forceCompatibilityReason\)/);
});

test("Unavailable Real-Debrid source is not launched without a debrid connection", async () => {
  const selection = selectedEpisodeSource({ type: "rd", hasDebrid: false });
  await selection.run();
  assert.equal(selection.captured.length, 0);
});

test("Episode Sources remains a selector and orders playable rows above web embeds", () => {
  const episodes = read("src/components/mg/EpisodeSelector.jsx");
  assert.match(episodes, /data-mg-episode-sources="true"/);
  assert.match(episodes, /setSourcesEpisode/);
  assert.match(episodes, /<StreamSourcesBox/);
  assert.match(sourceBox, /mediaType === "tv"[\s\S]{0,320}?rows\.filter\(\(row\) => row\.kind === "rd" \|\| row\.kind === "addon-stream"\)/);
  assert.match(sourceBox, /Web-player links/);
  assert.match(sourceBox, /verifiedPlaybackPolicy: "manual",[\s\S]{0,150}?manualSourceSelection: true,[\s\S]{0,150}?preparedEpisodeHandoff: true/);
});
