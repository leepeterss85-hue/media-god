import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bridgeSource = readFileSync(
  new URL("../src/components/mg/nativeFireTvBridge.js", import.meta.url),
  "utf8"
);
const playerSource = readFileSync(
  new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
  "utf8"
);
const sourceHandoffHelper = readFileSync(
  new URL("../src/components/mg/nativePlaybackSourceHandoff.js", import.meta.url),
  "utf8"
).replace("export const sourcesForNativeHandoff", "const sourcesForNativeHandoff");

let moduleText = bridgeSource
  .replace(
    'import { stopExclusivePlayback } from "@/components/mg/exclusivePlayback";',
    "const stopExclusivePlayback = () => { globalThis.__testExclusiveStops += 1; };"
  )
  .replace(
    'import { readPlaybackPreferences } from "@/components/mg/playbackPreferences";',
    'const readPlaybackPreferences = () => ({ audioOutputMode: "auto", lipSyncMs: 0, dialogueBoost: "off", volumeNormalization: false });'
  )
  .replace(
    'import { sourcesForNativeHandoff } from "@/components/mg/nativePlaybackSourceHandoff";',
    sourceHandoffHelper
  );
assert.ok(!moduleText.includes('from "@/components/mg/'));
const { playNativeFireTv } = await import(`data:text/javascript,${encodeURIComponent(moduleText)}`);

globalThis.__testExclusiveStops = 0;
globalThis.document = { querySelectorAll: () => [] };
globalThis.window = {
  MediaGodNative: { play: () => "true" },
  __MG_NATIVE_PLAYBACK_ACTIVE__: false,
  __MG_PLAYER_CONTEXT__: { mediaType: "movie" },
  localStorage: { getItem: () => "[]", setItem: () => {} },
};
if (typeof globalThis.navigator === "undefined") globalThis.navigator = {};

const request = () => ({
  requestId: "one-player-request",
  url: "https://media.example.test/film.mp4",
  title: "Example film",
  sources: [],
  activeSourceIndex: 0,
  live: false,
});

test("Android busy response keeps native ownership until its actual result", () => {
  window.MediaGodNative.play = () => "busy";
  window.__MG_NATIVE_PLAYBACK_ACTIVE__ = true;
  globalThis.__testExclusiveStops = 0;
  assert.equal(playNativeFireTv(request()), false);
  assert.equal(window.__MG_NATIVE_PLAYBACK_ACTIVE__, true);
  assert.equal(globalThis.__testExclusiveStops, 1);
});

test("accepted and rejected phone handoffs update ownership explicitly", () => {
  window.MediaGodNative.play = () => "true";
  assert.equal(playNativeFireTv(request()), true);
  assert.equal(window.__MG_NATIVE_PLAYBACK_ACTIVE__, true);

  window.MediaGodNative.play = () => "error";
  assert.equal(playNativeFireTv(request()), false);
  assert.equal(window.__MG_NATIVE_PLAYBACK_ACTIVE__, false);
});

test("phone native bridge sends one selected source without losing audio metadata", () => {
  let payload;
  window.MediaGodNative.play = (json) => {
    payload = JSON.parse(json);
    return "true";
  };
  const sources = Array.from({ length: 500 }, (_, index) => ({
    webIndex: index,
    url: `https://media.example.test/${index}.mp4`,
    mediaInfo: { audio_tracks: [{ codec: "aac", language: index === 417 ? "en" : "und" }] },
  }));
  assert.equal(playNativeFireTv({
    ...request(), url: sources[417].url, activeSourceIndex: 417,
    sources, selectedSourceOnly: true,
  }), true);
  assert.equal(payload.sources.length, 1);
  assert.equal(payload.sources[0].webIndex, 417);
  assert.equal(payload.sources[0].preferredAudioTrackLanguage, "en");

  playNativeFireTv({ ...request(), sources, selectedSourceOnly: false });
  assert.equal(payload.sources.length, 500);
});

test("an accepted VOD handoff has no WebView fallback timer", () => {
  assert.doesNotMatch(playerSource, /nativeLaunchTimerRef/);
  assert.match(playerSource, /nativeBusyRequestRef/);
  assert.match(playerSource, /An accepted native request may still be running its network preflight/);
});
