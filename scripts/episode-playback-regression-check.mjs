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
  assist.includes("runClickFallback") &&
    assist.includes("runKeyAction") &&
    assist.includes("position >= 1") &&
    assist.includes("z-[120]") &&
    native.includes("position in 1_000L..420_000L") &&
    native.includes("val showNext = tvEpisode && position >= 1_000L"),
  "episode controls respond on first interaction and keep Play Next available during TV playback"
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
  edition.includes('wanted === "theatrical"') &&
    edition.includes('detected.value === "standard"') &&
    edition.includes("detected.explicit === false"),
  "untagged theatrical/original sources satisfy the current regression contract"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
