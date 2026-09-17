import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const expect = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
};

const provider = read("src/components/mg/PlayerProvider.jsx");
const assist = read("src/components/mg/MediaGodV2Assist.jsx");
const videoPlayer = read("src/components/mg/VideoPlayer.jsx");
const takeover = read("src/components/mg/FireTvPlayerTakeover.jsx");
const native = read("firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt");
const edition = read("src/components/mg/mediaEdition.js");
const sourcePreferences = read("src/components/mg/sourceSelectorPreferences.js");
const controls = read("src/components/mg/MediaPlayerControls.jsx");
const mobileNative = read("android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt");
const trackPreferences = read("src/components/mg/mediaTrackPreferences.js");
const nativeBridge = read("src/components/mg/nativeFireTvBridge.js");
const fireCompatibility = read("firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt");
const mobileCompatibility = read("android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt");

expect(
  provider.includes("currentTime < 60") &&
    provider.includes("await queueContinueWatching(next)") &&
    provider.includes("2 * 60 * 60 * 1000") &&
    !provider.includes("const preloadWindow = Math.min(150"),
  "next episode starts preparing after one minute and remains reusable for long episodes"
);

expect(
  assist.includes("Next episode in ${nextCountdownSeconds}s") &&
    assist.includes("Cancel automatic next episode") &&
    assist.includes('new CustomEvent("mg:play-next-episode")') &&
    assist.includes("exactCreditsCountdownWindow"),
  "web/mobile overlay has marker-aware skip and cancellable next-episode countdown"
);

expect(
  videoPlayer.includes('reason === "next"') &&
    videoPlayer.includes('new CustomEvent("mg:play-next-episode")'),
  "native Fire TV Next returns through the shared episode playback pipeline"
);

expect(
  videoPlayer.includes('__episode_handoff__') &&
    videoPlayer.includes('playRequestId: currentPlayRequestId') &&
    videoPlayer.includes('current.playRequestId === currentPlayRequestId'),
  "ended native episodes cannot relaunch the just-finished URL during next-episode handoff"
);

expect(
  videoPlayer.includes("hostedErrorProvider") &&
    videoPlayer.includes("hostedErrorDuration") &&
    videoPlayer.includes("AIOStreams / ElfHosted") &&
    videoPlayer.includes("loadedDuration >= 115") &&
    videoPlayer.includes("loadedDuration <= 125") &&
    videoPlayer.includes("{ immediate: true }"),
  "AIOStreams and ElfHosted short error clips fail over immediately instead of playing as the title"
);

expect(
  takeover.includes('reason === "ended" || reason === "next"'),
  "Fire TV keeps the inter-episode native handoff visually seamless"
);

expect(
  native.includes("private fun buildAssistControls()") &&
    native.includes("private fun updateAssistControls()") &&
    native.includes("private fun payloadMarkerMs") &&
    native.includes('finishWithResult("next")') &&
    native.includes("NEXT_EPISODE_COUNTDOWN_MS") &&
    native.includes("Skip credits → Next"),
  "Fire TV native player has skip controls and a cancellable auto-next countdown"
);


expect(
  sourcePreferences.includes("availableSourceSortOptions") &&
    sourcePreferences.includes('mediaType !== "tv"') &&
    sourcePreferences.includes("editionValues.has(option.value)") &&
    videoPlayer.includes("availableSortOptions") &&
    controls.includes("availableSortOptions"),
  "source picker only exposes filters and editions present for the current title and suppresses movie editions for TV"
);

expect(
  videoPlayer.includes('({ item }) => sourceIsUserSelectable(item)') &&
    videoPlayer.includes('failedSourcesRef.current.has(index)') &&
    videoPlayer.includes('Unavailable • ${visibleLabel}') &&
    videoPlayer.includes('const automaticReadySourceIndex') &&
    videoPlayer.includes('Opening a ready source while Media God prepares the other torrents in the background') &&
    videoPlayer.includes('rdCacheEngineOwnsPollingRef.current = false') &&
    videoPlayer.includes('}, 1_500);'),
  "cached source search keeps the full ready list, retries failed rows manually and continues hidden background caching"
);

expect(
  assist.includes("runClickFallback") &&
    assist.includes("runKeyAction") &&
    assist.includes("!(recapEnd > 0)") &&
    assist.includes("position <= 90") &&
    assist.includes("!(introEnd > 0)") &&
    assist.includes("position <= 420") &&
    assist.includes("const showNextAction =") &&
    assist.includes("nextEpisodeWindow || autoNextCountdownWindow") &&
    assist.includes("z-[120]") &&
    native.includes("recapEndMs <= 0L") &&
    native.includes("position in 0L..90_000L") &&
    native.includes("introEndMs <= 0L") &&
    native.includes("position in 30_000L..420_000L") &&
    native.includes("val showNext = nextEpisodeWindow") &&
    mobileNative.includes("recapEndMs <= 0L") &&
    mobileNative.includes("introEndMs <= 0L") &&
    mobileNative.includes("position in 30_000L..420_000L") &&
    mobileNative.includes("val showNext = nextEpisodeWindow"),
  "zero or missing opening markers keep Skip Recap and Skip Intro available while Play Next stays end-only"
);

expect(
  mobileNative.includes("private fun buildAssistControls()") &&
    mobileNative.includes("private fun updateAssistControls()") &&
    mobileNative.includes("Skip credits → Next") &&
    mobileNative.includes('finishWithResult("next")') &&
    mobileNative.includes("NEXT_EPISODE_COUNTDOWN_MS"),
  "Android mobile native player keeps the TV episode skip and next controls"
);

expect(
  trackPreferences.includes("subtitlesEnabled: false") &&
    trackPreferences.includes("SUBTITLE_PREFERENCE_VERSION = 2") &&
    nativeBridge.includes("subtitlesEnabled = false") &&
    native.includes('optBoolean("subtitlesEnabled", false)') &&
    mobileNative.includes('optBoolean("subtitlesEnabled", false)') &&
    fireCompatibility.includes('optBoolean("subtitlesEnabled", false)') &&
    mobileCompatibility.includes('optBoolean("subtitlesEnabled", false)'),
  "subtitles default off across web, Fire TV, Android mobile and compatibility playback"
);

expect(
  edition.includes('wanted === "theatrical"') &&
    edition.includes('detected.value === "standard"') &&
    edition.includes("detected.explicit === false"),
  "untagged theatrical/original sources satisfy the current regression contract"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
