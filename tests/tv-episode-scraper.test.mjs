import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { episodeAudioState, isEnglishMainTrack, hasUnusableEpisodeAudio, episodeAutoplayCandidates } from "../src/components/mg/episodeAudio.js";
import { flixQuestFirstEpisodeSources } from "../src/components/mg/episodeSourcePolicy.js";
import { episodeAutoplayCanTrustSource } from "../src/components/mg/episodeLaunchTrust.js";
import { preferredAudioTrackScore } from "../src/components/mg/mediaTrackPreferences.js";
import { preservePublishedSourceOrder } from "../src/components/mg/sourcePublication.js";

let sequence = 0;
async function resolver(response) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    const data = response(String(url));
    return { ok: data !== null, json: async () => data };
  };
  const { fetchTvEpisodeSources } = await import(`../src/components/mg/tvEpisodeScraper.js?case=${++sequence}`);
  return { fetchTvEpisodeSources, calls, restore: () => { globalThis.fetch = original; } };
}

test("English main audio wins over foreign defaults and commentary; actual tracks override provider labels", () => {
  assert.equal(isEnglishMainTrack({ lang: "en-US", name: "Main" }), true);
  assert.equal(isEnglishMainTrack({ lang: "eng", name: "Director commentary" }), false);
  assert.equal(episodeAudioState({ language: "English", mediaInfo: { audio_tracks: [{ language: "fra", title: "Main" }] } }), "foreign");
  assert.equal(episodeAudioState({ audioLanguage: "fra", language: "English" }), "foreign");
  assert.equal(episodeAudioState({ mediaInfo: { audio_tracks: [{ language: "fra" }, { language: "eng", title: "Main" }] } }), "english");
  assert.equal(episodeAudioState({ audioLanguage: "und" }), "unknown");
  assert.equal(isEnglishMainTrack({ lang: "fr", name: "English main" }), false);
  assert.equal(isEnglishMainTrack({ attrs: { LANGUAGE: "de", NAME: "English" } }), false);
  assert.equal(isEnglishMainTrack({ lang: "und", name: "English main" }), true);
  assert.equal(episodeAudioState({ audioLanguage: "en", name: "English commentary" }), "commentary");
  assert.equal(episodeAudioState({ audioTracks: [{ lang: "und", name: "Main" }] }), "unknown");
  assert.equal(episodeAudioState({ language: "en", mediaInfo: { audio_tracks: [] }, audioTracks: [{ lang: "fr" }] }), "foreign");
  assert.equal(episodeAudioState({ audioLanguage: "unspecified" }), "unknown");
});

test("HLS and browser recovery choose English or unknown main audio, never mislabeled foreign or commentary", () => {
  const source = readFileSync(new URL("../src/components/mg/LiveVideo.jsx", import.meta.url), "utf8");
  const selection = source.slice(source.indexOf("const audioTrackPreferenceScore ="), source.indexOf("const subtitleTrackText ="));
  const { choose, selectNative } = vm.runInNewContext(`${selection}\n({ choose: choosePreferredHlsAudioTrack, selectNative: selectPreferredNativeAudioTrack });`, {
    preferredAudioTrackScore, hasUnusableEpisodeAudio,
  });
  const tracks = [
    { lang: "fr", name: "English", enabled: true },
    { lang: "eng", name: "Director commentary", enabled: false },
    { lang: "und", name: "Main", enabled: false },
    { lang: "en-US", name: "Main", enabled: false },
  ];
  assert.equal(choose(tracks, "en", -1, [], true), 3);
  assert.equal(choose(tracks, "fr", -1, [], true), 3);
  assert.equal(choose(tracks, "en", 3, [], true), 2);
  assert.equal(choose(tracks, "en", 3, [2], true), -1);
  assert.equal(selectNative({ audioTracks: tracks }, "en", -1, true), true);
  assert.deepEqual(tracks.map(track => track.enabled), [false, false, false, true]);
});

test("final episode publication keeps foreign sources available manually without giving them the automatic lead", () => {
  const source = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  const finalPublication = source.slice(source.indexOf("        const eligibleEpisodeLeads ="), source.indexOf("        const primary = playerSources[0]"));
  assert.ok(finalPublication.includes("const playerSources ="));
  const french = { id: "fr", type: "url", url: "https://media.test/fr.mp4", audioLanguage: "fr" };
  const unknown = { id: "unknown", type: "url", url: "https://media.test/unknown.mp4" };
  const english = { id: "en", type: "url", url: "https://media.test/en.mp4", audioLanguage: "en" };
  const publish = (orderedSources, qualificationMode = false, playbackLeadSources = []) => vm.runInNewContext(`${finalPublication}\nplayerSources;`, {
    isLive: false, mediaType: "tv", orderedSources, qualificationMode, playbackLeadSources,
    onlyEpisodeFallbacksRemain: false, episodeSourceMissingStatus: {},
    waitingForVerifiedSource: { type: "status", diagnostic: true },
    episodeAutoplayCandidates, flixQuestFirstEpisodeSources, episodeAutoplayCanTrustSource, preservePublishedSourceOrder,
    stableDiscoveredSourceKey: source => source.id,
    isDirectSource: source => source.type === "url", isMagnetSource: () => false,
  });
  assert.deepEqual(Array.from(publish([french, unknown, english]), item => item.id), ["en", "unknown", "fr"]);
  assert.equal(publish([french, unknown])[0], unknown);
  const foreignOnly = publish([french]);
  assert.equal(foreignOnly[0].type, "status");
  assert.equal(foreignOnly[1], french);
  const fullPool = Array.from({ length: 12 }, (_, index) => ({
    ...french, id: `fr-${index}`, url: `https://media.test/fr-${index}.mp4`,
  })).concat(unknown, english);
  const complete = publish(fullPool);
  assert.equal(complete.length, fullPool.length);
  assert.equal(complete[0], english);
  assert.deepEqual(new Set(Array.from(complete, item => item.id)), new Set(fullPool.map(item => item.id)));
  // Qualification still owns launch eligibility: an unqualified unknown row
  // cannot displace the waiting status just because the qualified lead is foreign.
  assert.equal(publish([french, unknown], true, [french])[0].type, "status");
});

test("uninspected direct episode sources keep runtime validation instead of becoming a permanent RD waiting screen", () => {
  const source = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  const leadSelection = source.slice(source.indexOf("        const runtimeEpisodeSources ="), source.indexOf("        const onlyEpisodeFallbacksRemain ="));
  const unknown = { type: "url", url: "https://media.test/episode.m3u8", episodeResolver: "flixquest", runtimeQualificationFallback: true, launchQualified: false };
  const foreign = { ...unknown, audioLanguage: "fr" };
  const lead = vm.runInNewContext(`${leadSelection}\nplaybackLeadSources;`, {
    isLive: false, mediaType: "tv", orderedSources: [foreign, unknown],
    qualificationMode: true, qualifiedLaunchSources: [], nativeRuntimeAudioValidationAvailable: false,
    runtimeFallbackSources: [], episodeAutoplayCandidates, isDirectSource: source => source.type === "url",
  });
  assert.equal(lead.length, 1);
  assert.equal(lead[0], unknown);
  assert.equal(lead[0].launchQualified, false);
});

test("episode scraper rejects wrong episodes, foreign/commentary audio and non-video links", async () => {
  const r = await resolver(url => url.includes('/showbox/') ? { data: { sources: [
    { url: "https://media.test/french.mp4", audioLanguage: "fr" },
    { url: "https://media.test/commentary.mp4", name: "English commentary" },
    { url: "https://media.test/wrong.mp4", language: "en", season: 1, episode: 9 },
    { url: "https://media.test/wrong-show.mp4", language: "en", tmdb_id: 99, season: 1, episode: 2 },
    { url: "https://media.test/audio.mp3", language: "en" },
    { url: "https://media.test/embed.html", language: "en" },
    { url: "https://media.test/unknown.m3u8" },
    { url: "https://media.test/english.m3u8", language: "en-GB", season: 1, episode: 2 },
  ] } } : null);
  try {
    const sources = await r.fetchTvEpisodeSources({ tmdbId: 42, season: 1, episode: 2 });
    assert.deepEqual(sources.map(source => source.url), ["https://media.test/english.m3u8", "https://media.test/unknown.m3u8"]);
    assert.ok(sources.every(source => source.launchQualified === false));
    assert.ok(sources.every(source => source.season === 1 && source.episode === 2 && source.format === "hls"));
    assert.ok(r.calls.every(url => new URL(url).searchParams.get("episode") === "2"));
  } finally { r.restore(); }
});

test("episode lookup deduplicates simultaneous requests and caches only successful results", async () => {
  let available = false;
  const r = await resolver(() => available ? { streams: [{ file: "https://media.test/episode.mp4", lang: "eng" }] } : null);
  try {
    assert.deepEqual(await r.fetchTvEpisodeSources({ tmdbId: 42, season: 1, episode: 1 }), []);
    available = true;
    const [first, second] = await Promise.all([r.fetchTvEpisodeSources({ tmdbId: 42, season: 1, episode: 1 }), r.fetchTvEpisodeSources({ tmdbId: 42, season: 1, episode: 1 })]);
    assert.equal(first.length, 1); assert.equal(second.length, 1);
    assert.equal(r.calls.length, 6);
    await r.fetchTvEpisodeSources({ tmdbId: 42, season: 1, episode: 1 });
    assert.equal(r.calls.length, 6);
    await r.fetchTvEpisodeSources({ tmdbId: 42, season: 1, episode: 2 });
    assert.equal(r.calls.length, 9);
  } finally { r.restore(); }
});
