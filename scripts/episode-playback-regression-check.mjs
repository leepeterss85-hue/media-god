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
  edition.includes('wanted === "theatrical"') &&
    edition.includes('detected.value === "standard"') &&
    edition.includes("detected.explicit === false"),
  "untagged theatrical/original sources satisfy the current regression contract"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
