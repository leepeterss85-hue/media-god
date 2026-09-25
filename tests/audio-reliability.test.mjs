import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { smartSourceEvidence } from "../src/components/mg/smartSourceSelection.js";
import { prioritiseCompatibleAutoplayEntries } from "../src/components/mg/automaticSourceOrder.js";
import { isAdvancingVodPlayback, updateVodProgress } from "../src/components/mg/playbackHealth.js";
import {
  buildPlaybackAudioDiagnostic,
  sanitizeNativePlaybackDiagnostic,
} from "../src/components/mg/audioDiagnostics.js";

const player = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
const phone = readFileSync(new URL("../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt", import.meta.url), "utf8");
const fire = readFileSync(new URL("../firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt", import.meta.url), "utf8");
const addonBackend = readFileSync(new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url), "utf8");
const addonBrowser = readFileSync(new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url), "utf8");
const sourceSelector = readFileSync(new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url), "utf8");

// Load the real reliability implementation with a controlled device profile.
// Its compatibility dependency is mocked; persistence and scoring are real.
const reliabilityText = readFileSync(new URL("../src/components/mg/playbackReliability.js", import.meta.url), "utf8")
  .replace(/import \{[\s\S]*?\} from "@\/components\/mg\/mediaCompatibility";/,
    'const detectStreamTraits = () => ({}); const getPlaybackDeviceProfile = () => ({});');
const reliability = await import(`data:text/javascript,${encodeURIComponent(reliabilityText)}`);

const memory = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  },
};

const source = (hash, label = "The Simpsons S01E01 ENG") => ({
  infoHash: hash.repeat(40), label, addon: "Torrentio", fileIdx: 2,
});

test("Simpsons S01E01 advancing after a few seconds is protected from generic failure", () => {
  const video = { currentTime: 3.5, paused: false, ended: false };
  const prior = { video, time: 3.0, advancedAt: 0 };
  const progress = updateVodProgress(prior, video, 3.5, 10_000);
  assert.equal(isAdvancingVodPlayback(video, progress, 10_500), true);
  assert.match(player, /!userReportedNoSound &&\s*vodPlaybackIsAdvancing\(stageRef\.current\?\.querySelector\("video"\)\)/);
  assert.match(player, /if \(vodPlaybackIsAdvancing\(video\)\)\s*\{[\s\S]*?return false;/);
});

test("no-sound stays with the exact torrent file and device, even when labels match", () => {
  reliability.clearPlaybackReliability();
  const a = reliability.exactPlaybackSourceLabel(source("a"));
  const b = reliability.exactPlaybackSourceLabel(source("b"));
  const otherFile = reliability.exactPlaybackSourceLabel(source("a"), "Other episode.mkv");
  const fireTv = { fireTv: true };
  const android = { nativeAndroidMobile: true };
  assert.notEqual(a, b);
  assert.equal(a, reliability.exactPlaybackSourceLabel(source("a"), "2"));
  assert.notEqual(a, otherFile);
  reliability.recordPlaybackReliability(a, "no-sound", null, fireTv);
  assert.equal(reliability.hasRecentNoSoundHistory(a, fireTv), true);
  assert.equal(reliability.hasRecentNoSoundHistory(b, fireTv), false);
  assert.equal(reliability.hasRecentNoSoundHistory(otherFile, fireTv), false);
  assert.equal(reliability.hasRecentNoSoundHistory(a, android), false);
  assert.equal(reliability.hasRecentNoSoundHistory("The Simpsons S01E01 ENG", fireTv), false);
  assert.ok(reliability.devicePlaybackReliabilityAdjustment(a, fireTv) < 0);
  assert.equal(reliability.devicePlaybackReliabilityAdjustment(b, fireTv), 0);
});

test("only an explicit audible confirmation clears a reported no-sound penalty", () => {
  const fireTv = { fireTv: true };
  const exact = reliability.exactPlaybackSourceLabel(source("a"));
  reliability.recordPlaybackReliability(exact, "failure", null, fireTv);
  reliability.recordPlaybackReliability(exact, "buffer", null, fireTv);
  reliability.recordPlaybackReliability(exact, "good", { audioConfirmed: false }, fireTv);
  assert.equal(reliability.hasRecentNoSoundHistory(exact, fireTv), true);
  reliability.recordPlaybackReliability(exact, "good", { audioConfirmed: true }, fireTv);
  assert.equal(reliability.hasRecentNoSoundHistory(exact, fireTv), false);
  assert.ok(reliability.devicePlaybackReliabilityAdjustment(exact, fireTv) > 0);
  assert.match(player, /positionSeconds >= SUCCESSFUL_VOD_PLAYBACK_SECONDS/);
  const nativeResult = player.slice(player.indexOf('const reason = String(detail.reason || "back")'), player.indexOf("/*\n       * IMPORTANT: native Media3", player.indexOf('const reason = String(detail.reason || "back")')));
  assert.match(nativeResult, /!hasRecentNoSoundHistory\(activeExactReliabilityLabel\(\)\)/);
  assert.doesNotMatch(nativeResult, /audioConfirmed: true/);
});

test("unknown and late audio metadata never reject a source before real silent playback is observed", () => {
  const unknown = smartSourceEvidence({ label: "The Simpsons S01E01", mediaInfo: { audio_tracks: [] } });
  assert.equal(unknown.languageRank, 3);
  assert.equal(unknown.languageVerified, false);
  assert.equal(reliability.exactPlaybackSourceLabel({ label: "unresolved" }), "");
  assert.equal(reliability.hasRecentNoSoundHistory(""), false);
  assert.match(player, /const rejectResolvedForeignAutoplay = \([\s\S]*?\) => \{[\s\S]*?return false;\s*\}/);
  for (const native of [phone, fire]) {
    assert.match(native, /activePlayer\.currentPosition < 5000L/);
    assert.match(native, /if \(audioOutputConfirmed\) return@postDelayed/);
    assert.match(native, /Video is playing but no audio track became available/);
    assert.match(native, /native audio output never started/);
  }
});

test("English main wins over commentary and descriptive tracks", () => {
  const commentaryOnly = smartSourceEvidence({
    label: "Simpsons S01E01", mediaInfo: { audio_tracks: [
      { language: "eng", title: "Director commentary" },
      { language: "en", title: "Audio description" },
      { language: "fra", title: "Main" },
    ] },
  });
  const main = smartSourceEvidence({
    label: "Simpsons S01E01", mediaInfo: { audio_tracks: [
      { language: "fra", title: "Main" }, { language: "eng", title: "Main" },
    ] },
  });
  assert.equal(commentaryOnly.languageRank, 4);
  assert.equal(main.languageRank, 0);
  for (const native of [phone, fire]) {
    assert.match(native, /if \(!commentary\) score \+= 400/);
    assert.match(native, /trackSelectionParameters\.overrides\.values\.any/);
  }
});

test("manual source and audio locks remain respected; same-file recovery precedes replacement", () => {
  const start = player.indexOf("const handleNoSound =");
  const end = player.indexOf("Audio recovery is deliberately MANUAL ONLY", start);
  const recovery = player.slice(start, end);
  assert.ok(recovery.indexOf("selectedRdFile?.link") < recovery.indexOf('action: "resolve_best"'));
  assert.match(recovery, /const activeTorrentHash = sourceTorrentHash\(active\)/);
  assert.match(recovery, /magnet:\?xt=urn:btih:\$\{activeTorrentHash\}/);
  assert.match(recovery, /active\?\.fileIdx/);
  assert.ok(recovery.indexOf("force_audio_rescue: true") < recovery.indexOf('tryNextSource("No usable audio'));
  assert.ok(recovery.indexOf("manualSourceLockActive()") < recovery.indexOf('tryNextSource("No usable audio'));
  assert.ok(recovery.indexOf("forgetSuccessfulPlaybackSource(active)") > recovery.indexOf("force_audio_rescue: true"));
  assert.match(player, /String\(detail.requestId \|\| ""\) !== activeRequest.requestId/);
  for (const native of [phone, fire]) {
    assert.match(native, /releasePlayer\(\)[\s\S]*?startActivityForResult\(/);
  }
});

test("addon descriptions survive discovery and unproven AAC outranks generic EAC3", () => {
  for (const sourceText of [addonBackend, addonBrowser]) {
    const preservedDescriptions =
      sourceText.match(/description:\s*clean\(stream\?\.description\)/g) || [];
    assert.ok(
      preservedDescriptions.length >= 4,
      "all cached, magnet and direct addon rows should preserve description metadata"
    );
  }

  assert.match(sourceSelector, /audioSafetyRank:\s*sourceAutoplayAudioSafetyRank\(item\)/);
  assert.match(sourceSelector, /if \(audio === "aac"/);
  assert.match(sourceSelector, /if \(audio === "eac3" \|\| audio === "ac4"\)/);

  const ordered = prioritiseCompatibleAutoplayEntries([
    {
      id: "generic-eac3",
      index: 0,
      smartRankingEnabled: true,
      autoplayReady: true,
      languageRank: 0,
      compatibilityTier: 0,
      cached: true,
      releaseTierRank: 3,
      audioTierRank: 1,
      audioSafetyRank: 2,
    },
    {
      id: "english-aac",
      index: 1,
      smartRankingEnabled: true,
      autoplayReady: true,
      languageRank: 0,
      compatibilityTier: 0,
      cached: true,
      releaseTierRank: 3,
      audioTierRank: 3,
      audioSafetyRank: 0,
    },
  ]);

  assert.deepEqual(ordered.map((entry) => entry.id), [
    "english-aac",
    "generic-eac3",
  ]);
});

test("audio diagnostics keep track and decoder evidence without private links", () => {
  const native = sanitizeNativePlaybackDiagnostic({
    engine: "media3", sourceName: "Torrentio", videoCodec: "video/avc",
    audioOutputMode: "stereo",
    audioTracks: [{ index: 1, language: "en", name: "Main", codec: "audio/eac3", selected: true, supported: true }],
    audioOutputConfirmed: true, streamUrl: "https://private.example/token=secret",
  });
  const diagnostic = buildPlaybackAudioDiagnostic({ source: source("f"), native });
  assert.equal(diagnostic.audioCodec, "audio/eac3");
  assert.equal(diagnostic.audioLanguage, "en");
  assert.equal(diagnostic.playbackPath, "native");
  assert.equal(diagnostic.audioOutput, "audio timeline advanced; sound unverified");
  assert.equal(native.audioTracks[0].supported, true);
  assert.equal(native.audioOutputMode, "stereo");
  assert.doesNotMatch(JSON.stringify({ native, diagnostic }), /private\.example|token=secret/);
  const browser = buildPlaybackAudioDiagnostic({
    source: source("a"), player: "browser HLS",
    resolved: { mediaInfo: { audio_tracks: [
      { index: 0, language: "fr", name: "French", selected: false },
      { index: 1, language: "en", name: "English main", selected: true },
    ] } },
  });
  assert.equal(browser.audioLanguage, "en");
  assert.equal(browser.tracks.find((track) => track.selected)?.index, 1);
  assert.match(player, /window\.addEventListener\("mg:hls-audio-tracks", onHlsTracks\)/);
});

test("trailers are excluded while torrent alternatives remain in the chooser", () => {
  assert.match(provider, /const stripVodTrailerSources =/);
  assert.match(provider, /!\["youtube", "provider", "external"\]\.includes\(type\)/);
  assert.match(player, /const selectableSourceCount = selectableSourceEntries\.length/);
  assert.match(player, /sourceIsUserSelectable\(/);
});
