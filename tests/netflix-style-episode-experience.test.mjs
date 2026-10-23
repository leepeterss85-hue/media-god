import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { freshEpisodePreparation } from "../src/components/mg/episodeExperience.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const providerSource = read("src/components/mg/PlayerProvider.jsx");

function preloadHarness({ skipMarkers = async req => req, prepare = async () => null } = {}) {
  const start = providerSource.indexOf("  const preloadNextEpisode = useCallback(");
  const end = providerSource.indexOf("\n  const play = useCallback(", start);
  assert.ok(start > 0 && end > start);
  const current = { mediaType: "tv", tmdbId: 123, season: 1, episode: 1, playbackSessionId: 9 };
  const state = { currentKey: "", next: null, prepared: null, promise: null, availability: "unknown" };
  const reference = { current: state };
  let prefetched = 0;
  const context = {
    useCallback: fn => fn,
    Promise, Date,
    console: { warn: () => {} },
    nextEpisodePreloadRef: reference,
    currentRequestRef: { current },
    isTvRequest: req => req?.mediaType === "tv",
    episodeIdentityForRequest: req => [req?.tmdbId, req?.season, req?.episode].join(":"),
    shouldRefreshEpisodePreparation: () => false,
    findNextEpisodeRequest: async () => ({
      mediaType: "tv", tmdbId: 123, season: 1, episode: 2,
      episodeName: "A new beginning", title: "Test Series",
    }),
    queueContinueWatching: async () => {},
    publishContext: () => {},
    loadEpisodeSkipMarkers: skipMarkers,
    applyReliableVodPolicy: request => request,
    core: { prepare: req => { prefetched += 1; return prepare(req); } },
  };
  const preload = vm.runInNewContext(providerSource.slice(start,end) + "\npreloadNextEpisode;", context);
  return { preload, current, reference, getCount: () => prefetched };
}

test("the next episode sources survive a failed intro/credits metadata provider", async () => {
  const ready = { preparedAt: Date.now(), verifiedPrepared: true, verifiedPlaybackPolicy: "strict",
    sources: [{type:"url", src:"https://media.test/ready.mp4"}] };
  const harness = preloadHarness({
    skipMarkers: async () => { throw Error("skip metadata unavailable"); },
    prepare: async () => ready,
  });
  const prepared = await harness.preload(harness.current);
  assert.equal(prepared.preparedAt, ready.preparedAt);
  assert.equal(harness.reference.current.prepared.preparedAt, ready.preparedAt);
  assert.equal(harness.reference.current.next.episode, 2);
  assert.equal(harness.reference.current.availability, "yes");
  assert.equal(harness.getCount(), 1);
  assert.equal(freshEpisodePreparation(harness.reference.current.prepared)?.sources.length, 1);
});

test("source prefetch becomes available while episode marker lookup is still pending", async () => {
  let releaseMarkers;
  const markerWait = new Promise(resolve => { releaseMarkers = resolve; });
  const ready = { preparedAt: Date.now(), sources:[{type:"url", src:"https://media.test/a.mp4"}] };
  const harness = preloadHarness({skipMarkers: () => markerWait,prepare: async () => ready});
  const loading = harness.preload(harness.current);
  for(let i=0;i<14;i++) await Promise.resolve();
  assert.equal(harness.reference.current.prepared?.preparedAt, ready.preparedAt);
  assert.equal(harness.getCount(), 1);
  releaseMarkers({ ...harness.current, episode:2 });
  await loading;
});

test("both VLC builds show contextual Netflix-style episode actions and respect cancellation", () => {
  for(const [app,pkg] of [["android-mobile","mobile"],["firetv-android","firetv"]]) {
    const native=read(`${app}/app/src/main/java/com/mediagod/${pkg}/CompatibilityPlayerActivity.kt`);
    assert.match(native,/controlButton\("Skip recap"\) \{ skipEpisodeSegment\("recapEnd"\) \}/);
    assert.match(native,/controlButton\("Skip intro"\) \{ skipEpisodeSegment\("introEnd"\) \}/);
    assert.match(native,/contentDescription = "Skip the opening titles"/);
    assert.match(native,/if \(nextEpisodeConfirmed\(\)\) finishWithResult\("next"\)[\s\S]{0,130}?else skipEpisodeSegment\("creditsEnd"/);
    assert.match(native,/skipCreditsButton\.visibility = if \(credits\) View\.VISIBLE else View\.GONE/);
    assert.match(native,/nextEpisodeButton\.text = buildNextEpisodeLabel\(\)/);
    assert.match(native,/Up next •/);
    assert.match(native,/val name = payload\.optString\("nextEpisodeName"\)/);
    assert.match(native,/nextEpisodeCountdownCancelled = true/);
    assert.match(native,/nextEpisodeCountdownStartedAtMs = -1L/);
    assert.match(native,/if \(remaining <= 0L\) \{[\s\S]*?finishWithResult\("next"\)/);
    assert.match(native,/NativeEpisodePolicy\.segmentWindow\(/);
    assert.match(native,/NativeEpisodePolicy\.creditsWindow\(/);
  }
});

test("next-episode prefetch and handoff never reuse previous-episode torrent or skip metadata", () => {
  assert.match(providerSource,/void preloadNextEpisode\(reliableRequest\)/);
  assert.doesNotMatch(providerSource,/void preloadNextEpisode\(reliableRequest\);\s*void preloadNextEpisode\(reliableRequest\)/);
  assert.match(providerSource,/const prepared = freshEpisodePreparation\(cachedPreload\?\.prepared\)/);
  assert.match(providerSource,/await play\(nextRequest\)/);
  assert.match(providerSource,/resetEpisodePlaybackState\(/);
  assert.match(providerSource,/onNativePlaybackEnded/);
  assert.match(providerSource,/autoNextCancelledRef\.current/);
  assert.match(providerSource,/window\.setTimeout\(resolve, 1400\)/);
  assert.match(providerSource,/loadEpisodeSkipMarkers\(next\)/);
  assert.match(providerSource,/core\.prepare\(applyReliableVodPolicy\(next\)\)/);
});
