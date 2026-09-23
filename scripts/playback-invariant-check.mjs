import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const expect = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: ${message}`);
};

const videoPlayer = read("src/components/mg/VideoPlayer.jsx");
const mediaProvider = read("src/components/mg/MediaPlayerProvider.jsx");
const episodeSelector = read("src/components/mg/EpisodeSelector.jsx");
const mobilePlayer = read(
  "android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt"
);
const firePlayer = read(
  "firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt"
);

const buildSourcesStart = mediaProvider.indexOf(
  "export function buildMediaSources"
);
const buildSourcesBlock =
  buildSourcesStart >= 0 ? mediaProvider.slice(buildSourcesStart) : "";

expect(
  buildSourcesStart >= 0 &&
    !/type:\s*["']youtube["']/.test(buildSourcesBlock) &&
    !/label:\s*["']Trailer["']/.test(buildSourcesBlock) &&
    mediaProvider.includes("stripVodTrailerSources") &&
    mediaProvider.includes('toLowerCase() !== "youtube"') &&
    !episodeSelector
      .slice(
        episodeSelector.indexOf("buildMediaSources({"),
        episodeSelector.indexOf(
          "}).map(",
          episodeSelector.indexOf("buildMediaSources({")
        )
      )
      .includes("trailerUrl"),
  "trailers can never enter film or episode playback source pools"
);

expect(
  !mobilePlayer.includes("isHostedProviderErrorClip") &&
    !firePlayer.includes("isHostedProviderErrorClip") &&
    !mobilePlayer.includes("durationMs <= 15_000L") &&
    !firePlayer.includes("durationMs <= 15_000L") &&
    !mobilePlayer.includes("115_000L..125_000L") &&
    !firePlayer.includes("115_000L..125_000L") &&
    !videoPlayer.includes("hostedErrorDuration") &&
    !videoPlayer.includes("loadedDuration >= 115"),
  "reported duration alone can never classify AIOStreams, ElfHosted or Comet as broken"
);

const tryNextStart = videoPlayer.indexOf("const tryNextSource =");
const tryNextBlock =
  tryNextStart >= 0
    ? videoPlayer.slice(tryNextStart, tryNextStart + 9000)
    : "";
const healthyGuardIndex = tryNextBlock.indexOf("const currentVideoHealthy");
const failedIndex = tryNextBlock.indexOf("markSourceFailed(");

expect(
  tryNextStart >= 0 &&
    healthyGuardIndex >= 0 &&
    failedIndex > healthyGuardIndex &&
    tryNextBlock.includes(
      "currentVideoHealthy &&\n      !hardFailureMessage"
    ),
  "a visibly healthy current stream is protected before generic failover can mark it failed"
);

const startupWatchdogStart = videoPlayer.indexOf("VOD STARTUP WATCHDOG");
const startupWatchdogEnd = videoPlayer.indexOf(
  "const onNativeResult",
  startupWatchdogStart
);
const startupWatchdogBlock =
  startupWatchdogStart >= 0 && startupWatchdogEnd > startupWatchdogStart
    ? videoPlayer.slice(startupWatchdogStart, startupWatchdogEnd)
    : "";

expect(
  startupWatchdogBlock.includes("STARTUP_GRACE_MS = 12000") &&
    startupWatchdogBlock.includes("realProgress") &&
    !startupWatchdogBlock.includes("markSourceFailed("),
  "startup timeout may try another ready source but cannot blacklist the current source"
);

expect(
  mediaProvider.includes("const nonAio = list.filter") &&
    mediaProvider.includes("const aio = list.filter") &&
    mediaProvider.includes("...nonAio") &&
    mediaProvider.includes("...aio") &&
    !mediaProvider.includes(
      "return list.filter(\n    (item) => !sourceIsAioStreamsCandidate(item)"
    ),
  "AIOStreams remains last-resort automatic recovery instead of being removed from the candidate pool"
);

expect(
  videoPlayer.includes("const establishedPlayback =") &&
    videoPlayer.includes("!establishedPlayback &&") &&
    videoPlayer.includes("browserConfirmedNoAudio ||"),
  "historical codec/no-sound risk cannot interrupt established browser playback"
);

expect(
  videoPlayer.includes("const hardFailure =") &&
    videoPlayer.includes("if (!hardFailure)") &&
    videoPlayer.includes("Video compatibility rescue · switching to a safer source"),
  "video compatibility rescue switches sources only after an actual media/source failure"
);

expect(
  mobilePlayer.includes("override fun onPlayerError") &&
    firePlayer.includes("override fun onPlayerError") &&
    !mobilePlayer.includes(
      'AIOStreams / ElfHosted returned a short error clip instead of the requested release.'
    ) &&
    !firePlayer.includes(
      'AIOStreams / ElfHosted returned a short error clip instead of the requested release.'
    ),
  "native players rely on real player errors instead of provider-duration guesses"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
