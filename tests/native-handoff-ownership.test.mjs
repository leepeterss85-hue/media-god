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
const mobileMainSource = readFileSync(
  new URL("../android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt", import.meta.url),
  "utf8"
);
const fireTvMainSource = readFileSync(
  new URL("../firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt", import.meta.url),
  "utf8"
);
const nativePlayerFiles = ["android-mobile", "firetv-android"].flatMap((platform) => {
  const packageName = platform === "android-mobile" ? "mobile" : "firetv";
  return ["PlayerActivity", "CompatibilityPlayerActivity"].map((player) =>
    readFileSync(
      new URL(`../${platform}/app/src/main/java/com/mediagod/${packageName}/${player}.kt`, import.meta.url),
      "utf8"
    )
  );
});

let moduleText = bridgeSource
  .replace(
    'import { stopExclusivePlayback } from "@/components/mg/exclusivePlayback";',
    "const stopExclusivePlayback = () => { globalThis.__testExclusiveStops += 1; };"
  )
  .replace(
    'import { readPlaybackPreferences } from "@/components/mg/playbackPreferences";',
    'const readPlaybackPreferences = () => ({ audioOutputMode: "auto", lipSyncMs: 0, dialogueBoost: "off", volumeNormalization: false });'
  );
assert.ok(!moduleText.includes('from "@/components/mg/'));
const { playNativeFireTv } = await import(`data:text/javascript,${encodeURIComponent(moduleText)}`);

globalThis.__testExclusiveStops = 0;
globalThis.document = { querySelectorAll: () => [] };
globalThis.window = {
  MediaGodNative: {
    play: () => "true",
    getAppInfo: () => JSON.stringify({ platform: "android-mobile" }),
  },
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

test("an accepted VOD handoff has no WebView fallback timer", () => {
  assert.doesNotMatch(playerSource, /nativeLaunchTimerRef/);
  assert.match(playerSource, /nativeBusyRequestRef/);
  assert.match(playerSource, /An accepted native request may still be running its network preflight/);
});

test("Android phone and Fire TV VOD never serialise a hundreds-source catalogue into the player Intent", () => {
  let captured = null;
  window.MediaGodNative.play = (value) => {
    captured = JSON.parse(value);
    return "true";
  };
  window.__MG_PLAYER_CONTEXT__ = { mediaType: "movie" };

  const sources = Array.from({ length: 355 }, (_, index) => ({
    label: `Source ${index} ${"metadata ".repeat(80)}`,
    sourceName: index % 2 === 0 ? "Torrentio" : "Comet",
    url: `https://media.example.test/source-${index}.mkv?token=${"x".repeat(256)}`,
    webIndex: index,
    mediaInfo: {
      videoCodec: "hevc",
      audioCodec: "eac3",
      description: "y".repeat(4000),
    },
    headers: { Authorization: `Bearer ${"z".repeat(512)}` },
  }));

  const selectedIndex = 300;
  const selectedUrl = sources[selectedIndex].url;
  assert.equal(
    playNativeFireTv({
      ...request(),
      url: selectedUrl,
      sources,
      activeSourceIndex: selectedIndex,
    }),
    true
  );

  assert.ok(captured);
  assert.equal(captured.sources.length, 1);
  assert.equal(captured.sources[0].webIndex, selectedIndex);
  assert.equal(captured.sources[0].url, selectedUrl);
  assert.equal(captured.sourceChoices.length, sources.length);
  assert.equal(captured.sourceChoices[selectedIndex].webIndex, selectedIndex);
  assert.equal(captured.sourceChoices[0].url, undefined);
  assert.equal(captured.sourceChoices[0].headers, undefined);
  assert.ok(JSON.stringify(captured).length < 100_000);

  window.MediaGodNative.getAppInfo = () => JSON.stringify({ platform: "fire-tv" });
  captured = null;
  assert.equal(
    playNativeFireTv({
      ...request(),
      url: selectedUrl,
      sources,
      activeSourceIndex: selectedIndex,
    }),
    true
  );
  assert.ok(captured);
  assert.equal(captured.sources.length, 1);
  assert.equal(captured.sources[0].webIndex, selectedIndex);
  assert.equal(captured.sources[0].url, selectedUrl);
  assert.equal(captured.sourceChoices.length, sources.length);
  assert.equal(captured.sourceChoices[0].url, undefined);
  assert.ok(JSON.stringify(captured).length < 100_000);

  for (const nativeMainSource of [mobileMainSource, fireTvMainSource]) {
    assert.match(nativeMainSource, /compactNativeActivityPayload\(payload\)/);
    assert.match(nativeMainSource, /putExtra\(PlayerActivity\.EXTRA_PAYLOAD, compactPlayerPayload\)/);
    assert.match(nativeMainSource, /encoded\.toByteArray\(Charsets\.UTF_8\)\.size > 256 \* 1024/);
    assert.match(nativeMainSource, /if \(payload\.optBoolean\("live", false\)\) \{\s*return payload\.toString\(\)/);
  }
});

test("both native engines expose the compact chooser and a path to sources discovered later", () => {
  for (const nativePlayer of nativePlayerFiles) {
    assert.match(nativePlayer, /sourceChoices/);
    assert.match(nativePlayer, /Browse all sources in Media God/);
    assert.match(nativePlayer, /browse_sources/);
  }
  assert.match(playerSource, /reason === "browse_sources" && !isLive/);
  assert.match(playerSource, /setNativeFallbackUrl\(nativePlaybackUrl\)/);
  assert.match(playerSource, /sourceChooserRef\.current\?\.focus/);
});

test("Live TV keeps the complete native source payload on phone and Fire TV", () => {
  const sources = Array.from({ length: 12 }, (_, index) => ({
    label: `Source ${index}`,
    url: `https://media.example.test/source-${index}.m3u8`,
    webIndex: index,
  }));

  let captured = null;
  window.MediaGodNative.play = (value) => {
    captured = JSON.parse(value);
    return "true";
  };

  for (const platform of ["fire-tv", "android-mobile"]) {
    window.MediaGodNative.getAppInfo = () => JSON.stringify({ platform });
    captured = null;
    assert.equal(
      playNativeFireTv({
        ...request(),
        live: true,
        sources,
        activeSourceIndex: 3,
      }),
      true
    );
    assert.equal(captured.sources.length, sources.length);
  }
});
