import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { restoreResumeSource } from "../src/components/mg/resumeSource.js";
import {
  episodeHasAired, episodeSourceExpiresAt, freshEpisodePreparation, playbackContextIdentity, resetEpisodePlaybackState, shouldStartEpisodeCountdown, shouldRefreshEpisodePreparation,
} from "../src/components/mg/episodeExperience.js";

function providerHelpers(invoke = async () => ({ data: {} }), timers = {}) {
  const source = readFileSync(new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url), "utf8");
  const prefix = source.slice(0, source.indexOf("function PlayerAutomationBridge"))
    .replace(/import[\s\S]*?from ["'][^"']+["'];/g, "");
  const context = { createContext: () => null, episodeHasAired, freshEpisodePreparation, resetEpisodePlaybackState, restoreResumeSource,
    base44: { functions: { invoke } }, setTimeout, clearTimeout, ...timers };
  vm.runInNewContext(prefix + "\nglobalThis.helpers = {episodePlaybackRequest,mergeEpisodeSkipMarkers,loadEpisodeSkipMarkers};", context);
  return context.helpers;
}

const plain = value => JSON.parse(JSON.stringify(value));

test("actual next-episode request drops the previous source pools, markers and manual launch locks", () => {
  const current = { id: 42, title: "Series — S01E02", rdTitle: "Series", year: "2026",
    season: 1, episode: 2, startTime: 900, src: "https://old.test/episode.mp4",
    sources: [{ src: "https://old.test" }], completeSources: [{ id: "old" }], discoveredSources: [{ id: "old" }],
    skipMarkers: { intro: { start: 20, end: 90 } }, explicitSkipMarkers: { credits: { start: 1200 } },
    recapStart: 0, recapEnd: 60, intro_start: 60, intro_end: 90, skipCreditsStart: 1200,
    skipMarkerProvenance: { intro: "previous episode" }, preparedEpisodeHandoff: true,
    verifiedPrepared: true, verifiedPlaybackPolicy: "manual", noRd: true, infoHash: "old-hash",
    playbackSessionId: 7 };
  const next = plain(providerHelpers().episodePlaybackRequest({ current, seasonNumber: 1, episodeNumber: 3,
    episodeItem: { name: "New story" } }));
  assert.equal(next.title, "Series — S01E03");
  assert.equal(next.episodeName, "New story");
  assert.equal(next.startTime, 0);
  assert.equal(next.src, "");
  for (const key of ["sources", "completeSources", "discoveredSources"]) assert.deepEqual(next[key], []);
  for (const key of ["skipMarkers", "explicitSkipMarkers", "recapStart", "recapEnd", "intro_start", "intro_end", "skipCreditsStart", "skipMarkerProvenance", "preparedEpisodeHandoff", "infoHash", "playbackSessionId"]) {
    assert.equal(next[key], undefined, `${key} belongs to the previous episode`);
  }
  assert.equal(next.verifiedPlaybackPolicy, "strict");
  assert.equal(next.noRd, false);
  assert.equal(current.skipMarkers.intro.end, 90, "do not mutate the currently playing episode");
});

test("a stalled marker provider settles within its budget and can retry", async () => {
  let attempts = 0;
  const { loadEpisodeSkipMarkers } = providerHelpers(() => {
    attempts += 1;
    return new Promise(() => {});
  }, { setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout: () => {} });
  const request = { tmdbId: 42, title: "Series", mediaType: "tv", season: 1, episode: 3 };
  assert.equal((await loadEpisodeSkipMarkers(request)).skipMarkerLookupFailed, true);
  assert.equal((await loadEpisodeSkipMarkers(request)).skipMarkerLookupFailed, true);
  assert.equal(attempts, 2, "a timed-out lookup must not poison subsequent attempts");
});

test("Stay here prevents browser and native ending autoplay for this session while manual Next still works", () => {
  const source = readFileSync(new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url), "utf8");
  const names = ["onCancelNextEpisode", "onEnded", "onNativePlaybackEnded", "onPlayNextEpisode"];
  const callbacks = names.map(name => {
    const start = source.indexOf(`    const ${name} =`);
    return source.slice(start, source.indexOf("\n    };", start) + 7);
  }).join("\n");
  const launches = [];
  class MediaElement {}
  const context = { autoNext: true, autoNextCancelledRef: { current: false }, advancingRef: { current: false },
    currentRequestRef: { current: { mediaType: "tv", playbackSessionId: 7 } },
    isTvRequest: request => request?.mediaType === "tv", HTMLMediaElement: MediaElement,
    advanceToNext: manual => launches.push(manual) };
  vm.runInNewContext(callbacks + `\nglobalThis.handlers = {${names.join(",")}};`, context);
  const handlers = context.handlers;
  handlers.onCancelNextEpisode({ detail: { playbackSessionId: 6 } });
  handlers.onEnded({ target: new MediaElement() });
  assert.deepEqual(launches, [false], "an old session cannot cancel the active episode");
  handlers.onCancelNextEpisode({ detail: { playbackSessionId: 7 } });
  handlers.onEnded({ target: new MediaElement() });
  handlers.onNativePlaybackEnded({ detail: {} });
  assert.deepEqual(launches, [false]);
  handlers.onPlayNextEpisode();
  assert.deepEqual(launches, [false, true]);
  context.autoNextCancelledRef.current = false;
  handlers.onNativePlaybackEnded({ detail: { autoNextCancelled: true } });
  assert.deepEqual(launches, [false, true], "native cancellation survives the result handoff");
});

test("duration-adjusted marker data replaces earlier database timing while explicit markers remain authoritative", () => {
  const { mergeEpisodeSkipMarkers } = providerHelpers();
  const first = mergeEpisodeSkipMarkers({ skipMarkers: { recap: { start: 0, end: 40 } } },
    { markers: { intro: { start: 40, end: 90 } } });
  const adjusted = plain(mergeEpisodeSkipMarkers(first,
    { markers: { recap: { start: 0, end: 55 }, intro: { start: 50, end: 100 } } }));
  assert.equal(adjusted.skipMarkers.intro.end, 100);
  assert.equal(adjusted.skipMarkers.recap.end, 40);
});

test("late startup metadata and failed refreshes cannot erase duration-adjusted episode markers", async () => {
  const source = readFileSync(new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url), "utf8");
  const prefix = source.slice(0, source.indexOf("function PlayerAutomationBridge"))
    .replace(/import[\s\S]*?from ["'][^"']+["'];/g, "");
  const start = source.indexOf("  const hydrateEpisodeSkipMarkers = useCallback(");
  const callback = source.slice(start, source.indexOf("\n\n  const preloadNextEpisode", start));
  const request = { mediaType: "tv", tmdbId: 42, imdbId: "tt1234567", season: 1, episode: 3,
    playbackSessionId: 7, skipMarkersPending: true };
  const pending = new Map();
  const context = { createContext: () => null, useCallback: callback => callback, episodeHasAired,
    freshEpisodePreparation, resetEpisodePlaybackState, restoreResumeSource, setTimeout, clearTimeout,
    base44: { functions: { invoke: (name, body) => name === "resolveTvImdb"
      ? Promise.resolve({ data: { imdb_id: "tt1234567" } })
      : new Promise(resolve => pending.set(body.duration || "any", resolve)) } },
    currentRequestRef: { current: { ...request } }, skipMarkerLookupKeysRef: { current: new Map() },
    appliedMarkerDurationRef: { current: { sessionId: null, duration: null } }, publishContext: () => {} };
  vm.runInNewContext(prefix + callback + "\nglobalThis.hydrate = hydrateEpisodeSkipMarkers;", context);
  const startup = context.hydrate(request);
  const adjusted = context.hydrate(request, 1200);
  await new Promise(resolve => setImmediate(resolve));
  pending.get(1200)({ data: { markers: { intro: { start: 50, end: 100 } }, providers: ["SkipDB"] } });
  await adjusted;
  pending.get("any")({ data: { markers: { intro: { start: 40, end: 90 } }, providers: ["SkipDB"] } });
  await startup;
  assert.equal(context.currentRequestRef.current.skipMarkers.intro.end, 100);
  const failedRefresh = context.hydrate(request, 1201);
  await new Promise(resolve => setImmediate(resolve));
  pending.get(1201)({ data: { markers: {}, providers: [] } });
  await failedRefresh;
  assert.equal(context.currentRequestRef.current.skipMarkers.intro.end, 100);
  assert.equal(context.currentRequestRef.current.skipMarkersPending, false);
});

test("native duration metadata hydrates markers only for the active TV episode", () => {
  const source = readFileSync(new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url), "utf8");
  const prefix = source.slice(0, source.indexOf("function PlayerAutomationBridge"))
    .replace(/import[\s\S]*?from ["'][^"']+["'];/g, "");
  const start = source.indexOf("    const onNativePlaybackProgress =");
  const callback = source.slice(start, source.indexOf("\n    };", start) + 7);
  const current = { mediaType: "tv", tmdbId: 42, season: 1, episode: 3, playbackSessionId: 7 };
  const lookups = [];
  const context = { createContext: () => null, episodeHasAired, freshEpisodePreparation, resetEpisodePlaybackState,
    restoreResumeSource, currentRequestRef: { current },
    autoNext: true, advancingRef: { current: false }, preloadNextEpisode: () => {},
    hydrateEpisodeSkipMarkers: (request, duration) => lookups.push({ request, duration }) };
  vm.runInNewContext(prefix + callback + "\nglobalThis.progress = onNativePlaybackProgress;", context);
  for (const patch of [{ tmdbId: 99 }, { episode: 2 }, { season: 2 }, { durationSeconds: NaN }]) {
    context.progress({ detail: { ...current, durationSeconds: 1200, ...patch } });
  }
  assert.equal(lookups.length, 0);
  context.progress({ detail: { tmdbId: "42", season: 1, episode: 3, durationSeconds: 1200 } });
  assert.equal(lookups.length, 1);
  assert.equal(lookups[0].request, current);
  assert.equal(lookups[0].duration, 1200);
});

test("a transient marker lookup failure can retry for the same episode and duration", async () => {
  let segmentAttempts = 0;
  const { loadEpisodeSkipMarkers } = providerHelpers(async name => {
    if (name === "resolveTvImdb") return { data: { imdb_id: "tt1234567" } };
    segmentAttempts += 1;
    if (segmentAttempts === 1) throw new Error("temporary outage");
    return { data: { markers: { intro: { start: 5, end: 35 } }, providers: ["SkipDB"] } };
  });
  const request = { tmdbId: 42, title: "Series", mediaType: "tv", season: 1, episode: 3 };
  const failed = await loadEpisodeSkipMarkers(request, 1200);
  assert.equal(failed.skipMarkerLookupFailed, true);
  const recovered = await loadEpisodeSkipMarkers(request, 1200);
  assert.equal(recovered.skipMarkers.intro.end, 35);
  assert.equal(segmentAttempts, 2);
});

test("metadata updates preserve an episode session identity; replays and next episodes start a new one", () => {
  const current = { mediaType: "tv", tmdbId: 42, season: 1, episode: 2, playbackSessionId: 7 };
  assert.equal(playbackContextIdentity(current), playbackContextIdentity({ ...current, introEnd: 90, nextEpisode: 3 }));
  assert.notEqual(playbackContextIdentity(current), playbackContextIdentity({ ...current, playbackSessionId: 8 }));
  assert.notEqual(playbackContextIdentity(current), playbackContextIdentity({ ...current, episode: 3 }));
});

const countdown = { isTv: true, hasNextEpisode: true, autoNext: true, duration: 1200,
  position: 1100, playing: true, cancelled: false, creditsStart: 1100 };

test("verified credits allow a cancellable countdown only when the next episode is known", () => {
  assert.equal(shouldStartEpisodeCountdown(countdown), true);
  for (const patch of [{ hasNextEpisode: false }, { autoNext: false }, { playing: false }, { cancelled: true }, { isTv: false }]) {
    assert.equal(shouldStartEpisodeCountdown({ ...countdown, ...patch }), false);
  }
});

test("the browser finale Skip credits finishes this episode while normal TV Next advances", () => {
  const source = readFileSync(new URL("../src/components/mg/MediaGodV2Assist.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const skipCredits =");
  const callback = source.slice(start, source.indexOf("\n  };", start) + 5);
  const seeks = [];
  let advances = 0;
  const context = { isTv: true, hasNextEpisode: false, duration: 1200,
    playNext: () => { advances += 1; }, seekVisibleVideo: position => seeks.push(position) };
  vm.runInNewContext(callback + "\nglobalThis.skip = skipCredits;", context);
  context.skip();
  assert.deepEqual(seeks, [1199.25]);
  assert.equal(advances, 0);
  context.hasNextEpisode = true;
  context.skip();
  assert.equal(advances, 1);
  assert.deepEqual(seeks, [1199.25]);
});

test("without credits, the countdown cannot skip the last seconds of story or leak into movies/live TV", () => {
  assert.equal(shouldStartEpisodeCountdown({ ...countdown, creditsStart: null, position: 1185 }), false);
  assert.equal(shouldStartEpisodeCountdown({ ...countdown, creditsStart: null, position: 1190 }), true);
  assert.equal(shouldStartEpisodeCountdown({ ...countdown, position: 1200 }), false);
  assert.equal(shouldStartEpisodeCountdown({ ...countdown, duration: NaN }), false);
});


test("next handoff respects explicit signed URL expiration and public resolver age", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const prepared = { preparedAt: now - 20 * 60_000, verifiedPlaybackPolicy: "strict", verifiedPrepared: true,
    sources: [
      { id: "public", flixQuestSource: true, src: "https://media.test/episode.mp4" },
      { id: "rd", src: "https://rd.test/episode.mp4", infoHash: "a".repeat(40) },
    ] };
  const fresh = freshEpisodePreparation(prepared, now);
  assert.deepEqual(fresh.sources.map(source => source.id), ["rd"]);
  assert.equal(fresh.refreshRequired, true);
  assert.equal(prepared.sources.length, 2, "preserve the prepared catalogue");
  assert.equal(freshEpisodePreparation({ ...prepared, sources: [prepared.sources[0]] }, now), null);
  assert.equal(freshEpisodePreparation({ ...prepared, sources: [{ src: "https://media.test/video.mp4?Expires=" + ((now - 1000) / 1000) }] }, now), null);
  assert.equal(freshEpisodePreparation({ ...prepared, sources: [{ src: "https://media.test/video.mp4", expiresAt: now - 1 }] }, now), null);
  assert.equal(freshEpisodePreparation({ ...prepared, preparedAt: now - 3 * 60 * 60_000 }, now), null);
  assert.equal(episodeSourceExpiresAt({ url: "https://media.test/video.mp4?exp=" + ((now + 60_000) / 1000) }), now + 60_000);
});

test("actual stale next handoff re-resolves durable torrent identity and preserves next-episode markers", async () => {
  const source = readFileSync(new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url), "utf8");
  const prefix = source.slice(0, source.indexOf("function PlayerAutomationBridge"))
    .replace(/import[\s\S]*?from ["'][^"']+["'];/g, "");
  const start = source.indexOf("  const advanceToNext = useCallback(");
  const callback = source.slice(start, source.indexOf("\n\n  useEffect(", start));
  const now = Date.now();
  const current = { mediaType: "tv", tmdbId: 42, season: 1, episode: 2 };
  const next = { ...current, episode: 3, skipAddonLookup: false, skipRdLookup: false,
    skipMarkers: { intro: { start: 30, end: 90 } } };
  const stale = { preparedAt: now - 20 * 60_000, verifiedPlaybackPolicy: "strict", verifiedPrepared: true,
    sources: [{ flixQuestSource: true, src: "https://media.test/stale.mp4" }],
    completeSources: [{ src: "https://rd.test/old-signed.mp4", infoHash: "a".repeat(40), expiresAt: now - 1 }] };
  const launches = [];
  const context = { createContext: () => null, useCallback: callback => callback, episodeHasAired,
    freshEpisodePreparation, resetEpisodePlaybackState, restoreResumeSource, base44: {},
    setTimeout, clearTimeout, advancingRef: { current: false }, currentRequestRef: { current },
    nextEpisodePreloadRef: { current: { currentKey: "42:s1:e2", next, prepared: stale } },
    publishStatus: () => {}, play: async request => { launches.push(request); } };
  vm.runInNewContext(prefix + callback + "\nglobalThis.advance = advanceToNext;", context);
  await context.advance();
  assert.equal(launches.length, 1);
  const request = plain(launches[0]);
  assert.equal(request.sources.length, 1);
  assert.equal(request.sources[0].src, `magnet:?xt=urn:btih:${"a".repeat(40)}`);
  assert.equal(request.sources[0].expiresAt, undefined);
  assert.equal(request.skipAddonLookup, false);
  assert.equal(request.skipRdLookup, false);
  assert.equal(request.skipMarkers.intro.end, 90);
  assert.equal(stale.completeSources[0].src, "https://rd.test/old-signed.mp4");
});


test("up next excludes unaired episodes but permits older entries without release metadata", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  assert.equal(episodeHasAired({ air_date: "2026-10-20" }, now), true);
  assert.equal(episodeHasAired({ airDate: "2026-11-01" }, now), false);
  assert.equal(episodeHasAired({ episode_number: 3 }, now), true);
});


test("empty next-episode preparation retries after cooldown instead of sticking forever", () => {
  const now = 1_800_000_000_000;
  const state = { next: { episode: 2 }, availability: "yes", prepared: { sources: [] }, attemptedAt: now - 61_000 };
  assert.equal(shouldRefreshEpisodePreparation(state, now), true);
  assert.equal(shouldRefreshEpisodePreparation({ ...state, attemptedAt: now - 10_000 }, now), false);
  assert.equal(shouldRefreshEpisodePreparation({ ...state, promise: Promise.resolve() }, now), false);
  assert.equal(shouldRefreshEpisodePreparation({ ...state, availability: "no" }, now), false);
});

test("refresh next-episode signed URLs ahead of expiry without redoing healthy preparation", () => {
  const now = 1_800_000_000_000;
  const state = { attemptedAt: now - 61_000, prepared: {
    preparedAt: now - 61_000, verifiedPrepared: true, verifiedPlaybackPolicy: "strict",
    sources: [{ src: "https://media.test/episode.mp4", expiresAt: now + 90_000 }],
  } };
  assert.equal(shouldRefreshEpisodePreparation(state, now), true);
  state.prepared.sources[0].expiresAt = now + 600_000;
  assert.equal(shouldRefreshEpisodePreparation(state, now), false);
});
