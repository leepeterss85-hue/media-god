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
const indexHtml = read("index.html");
const mediaProvider = read("src/components/mg/MediaPlayerProvider.jsx");
const episodeSelector = read("src/components/mg/EpisodeSelector.jsx");
const mobilePlayer = read(
  "android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt"
);
const firePlayer = read(
  "firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt"
);
const reliability = read("src/components/mg/playbackReliability.js");
const realDebridBackend = read("base44/functions/realDebrid/entry.ts");
const rdLibraryBackend = read("base44/functions/findRdLibrary/entry.ts");
const multiDebridBackend = read("base44/functions/multiDebrid/entry.ts");
const mobileCompatibility = read(
  "android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt"
);
const fireCompatibility = read(
  "firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt"
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
    /!\["youtube",\s*"provider",\s*"external"\]\.includes\(type\)/.test(
      mediaProvider
    ) &&
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
  mediaProvider.includes("Watch-provider links") &&
    buildSourcesBlock.includes("return [];") &&
    !/type:\s*["']provider["']/.test(buildSourcesBlock),
  "Netflix and other Where-to-Watch provider pages can never be injected into the VOD player source pool"
);

const fastAddonStart = mediaProvider.indexOf("fastAddonPromise.then");
const fastAddonEnd = mediaProvider.indexOf("const addonPromise", fastAddonStart);
const fastAddonBlock =
  fastAddonStart >= 0 && fastAddonEnd > fastAddonStart
    ? mediaProvider.slice(fastAddonStart, fastAddonEnd)
    : "";

expect(
  /if\s*\(\s*!qualificationMode\s*\)[\s\S]{0,900}?publishEarlySources\(automaticFastCandidates/.test(
    fastAddonBlock
  ) &&
    fastAddonBlock.indexOf("publishEarlySources(automaticFastCandidates") <
      fastAddonBlock.indexOf("qualifyCachedRealDebridLaunchPool"),
  "source-first web VOD must publish discovered torrent/direct rows before strict launch qualification can leave the player spinning"
);

const automaticReadyStart = videoPlayer.indexOf(
  "const automaticReadySourceIndex"
);
const automaticReadyEnd = videoPlayer.indexOf(
  "const autoplayEntryApproved",
  automaticReadyStart
);
const automaticReadyBlock =
  automaticReadyStart >= 0 && automaticReadyEnd > automaticReadyStart
    ? videoPlayer.slice(automaticReadyStart, automaticReadyEnd)
    : "";

expect(
  automaticReadyBlock.includes(
    '!["provider", "external", "youtube"].includes(type)'
  ),
  "desktop ready-source fallback cannot auto-open provider, external or YouTube pages"
);

const browserRdStart = videoPlayer.indexOf(
  "const prefersBrowserRdCompatibility"
);
const browserRdEnd = videoPlayer.indexOf("const magnetHash", browserRdStart);
const browserRdBlock =
  browserRdStart >= 0 && browserRdEnd > browserRdStart
    ? videoPlayer.slice(browserRdStart, browserRdEnd)
    : "";

expect(
  browserRdBlock.includes("if (isNativeFireTvPlayerAvailable()) return false;") &&
    browserRdBlock.includes("return true;") &&
    !videoPlayer.includes("prefersMobileBrowserRdCompatibility") &&
    videoPlayer.includes(
      "preferBrowserTranscode: prefersBrowserRdCompatibility()"
    ) &&
    videoPlayer.includes(
      "prefer_browser_transcode: prefersBrowserRdCompatibility()"
    ),
  "desktop browsers request Real-Debrid HLS/MP4 compatibility while native Android/Fire TV keeps original files"
);

const mainRdUnrestrictCount =
  (realDebridBackend.match(/\/unrestrict\/link/g) || []).length;
const mainRdRemoteCount =
  (realDebridBackend.match(/&remote=1/g) || []).length;

expect(
  mainRdUnrestrictCount === 2 &&
    mainRdRemoteCount >= mainRdUnrestrictCount &&
    rdLibraryBackend.includes("&remote=1") &&
    multiDebridBackend.includes('["remote", "1"]') &&
    realDebridBackend.includes('"RD_IP_NOT_ALLOWED"') &&
    realDebridBackend.includes("Number(upstreamErrorCode) === 22") &&
    videoPlayer.includes('error?.code === "RD_IP_NOT_ALLOWED"'),
  "Real-Debrid playback always requests remote-safe links and treats IP rejection as an account/network condition instead of poisoning sources"
);

const desktopFullscreenStart = videoPlayer.indexOf(
  "const goFullscreen = async () =>"
);
const desktopFullscreenEnd = videoPlayer.indexOf(
  "const syncFullscreenState",
  desktopFullscreenStart
);
const desktopFullscreenBlock =
  desktopFullscreenStart >= 0 && desktopFullscreenEnd > desktopFullscreenStart
    ? videoPlayer.slice(desktopFullscreenStart, desktopFullscreenEnd)
    : "";
const cssExitGuard = desktopFullscreenBlock.indexOf(
  'stage.dataset.mgFullscreen === "true"'
);
const browserFullscreenRequest = desktopFullscreenBlock.indexOf(
  "requestBrowserFullscreen(document.documentElement)"
);

expect(
  cssExitGuard >= 0 &&
    browserFullscreenRequest > cssExitGuard &&
    !indexHtml.includes(
      "wantsFullscreenFromTarget(event.target) ||\n              cssFullscreenIsActive()"
    ) &&
    indexHtml.includes(
      "if (fullscreenKey && !cssFullscreenIsActive())"
    ) &&
    indexHtml.includes(
      "!cssFullscreenIsActive() &&\n              target instanceof Element"
    ),
  "desktop CSS fullscreen can exit cleanly without capture-phase handlers forcing browser fullscreen back on"
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
    startupWatchdogBlock.includes("hasBufferedData") &&
    startupWatchdogBlock.includes("setVodStartupNotice(") &&
    !startupWatchdogBlock.includes("markSourceFailed(") &&
    !startupWatchdogBlock.includes("setRdError("),
  "startup timeout can show a nonblocking notice but cannot mark a source failed or unmount its video"
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
  videoPlayer.includes("Audio recovery is deliberately MANUAL ONLY.") &&
    videoPlayer.includes("const handleNoSound =") &&
    videoPlayer.includes("async () =>") &&
    videoPlayer.includes("handleNoSound();") &&
    !videoPlayer.includes("handleNoSoundRef") &&
    !videoPlayer.includes("browserConfirmedNoAudio") &&
    !videoPlayer.includes("automatic: true") &&
    !videoPlayer.includes("rejectAutomaticAioAudioFailure"),
  "browser VOD audio recovery is manual-only and can never interrupt playback automatically"
);

expect(
  videoPlayer.includes("const hardFailure =") &&
    videoPlayer.includes("if (!hardFailure)") &&
    videoPlayer.includes("Video compatibility rescue · switching to a safer source"),
  "video compatibility rescue switches sources only after an actual media/source failure"
);

expect(
  !videoPlayer.includes("nativeDiagnostics?.audioCodec,") &&
    videoPlayer.includes(
      "/no usable audio track|audio decoder could not recover|audio (?:decoder|renderer|sink) (?:failed|stopped)"
    ),
  "only an explicit terminal native audio error can reject a source for missing audio"
);

expect(
  [mobilePlayer, firePlayer].every(
    (nativePlayer) =>
      nativePlayer.includes("strictEnglishStartupRequired(): Boolean = false") &&
      nativePlayer.includes("group.isTrackSelected(index) && group.isTrackSupported(index)") &&
      nativePlayer.includes("activePlayer.currentPosition < 5000L") &&
      nativePlayer.includes("launchCompatibilityPlayer(activePlayer, null, reason)") &&
      nativePlayer.includes("error.errorCode in 5001..5004") &&
      nativePlayer.includes("onAudioPositionAdvancing(") &&
      nativePlayer.includes("EXTENSION_RENDERER_MODE_ON") &&
      nativePlayer.includes("EXTENSION_RENDERER_MODE_PREFER") &&
      nativePlayer.includes("selectedAudioRequiresPcmRescue") &&
      nativePlayer.includes("!selectedAudioRequiresPcmRescue(latestTracks)") &&
      nativePlayer.includes("native audio output never started") &&
      !nativePlayer.includes("if (!initial.present || (initial.supported && initial.selected))")
  ),
  "Android mobile and Fire TV keep Live TV device-first while repairing silent VOD on the same file"
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

const noSoundStart = reliability.indexOf(
  "export const hasRecentNoSoundHistory"
);
const noSoundEnd = reliability.indexOf(
  "export const clearPlaybackReliability",
  noSoundStart
);
const noSoundBlock =
  noSoundStart >= 0 && noSoundEnd > noSoundStart
    ? reliability.slice(noSoundStart, noSoundEnd)
    : "";

expect(
  noSoundBlock.includes("sourceDeviceKey(label, profile)") &&
    !noSoundBlock.includes("traitKeysFor(label, profile)"),
  "automatic no-sound recovery learns only the exact source/device, never a whole codec/provider trait"
);

const goodStart = reliability.indexOf('kind === "good"');
const goodEnd = reliability.indexOf("return current;", goodStart);
const goodBlock =
  goodStart >= 0 && goodEnd > goodStart
    ? reliability.slice(goodStart, goodEnd)
    : "";

expect(
  goodBlock.includes("current.failures = 0") &&
    goodBlock.includes("current.buffers = 0") &&
    goodBlock.includes("current.lastFailure = 0") &&
    goodBlock.includes("current.lastBuffer = 0") &&
    goodBlock.includes("if (value?.audioConfirmed === true)") &&
    goodBlock.indexOf("current.noSound = 0") > goodBlock.indexOf("if (value?.audioConfirmed === true)") &&
    goodBlock.indexOf("current.lastNoSound = 0") > goodBlock.indexOf("if (value?.audioConfirmed === true)"),
  "video progress clears failures and stalls; confirmed decoded audio can also clear exact no-sound history"
);

expect(
  videoPlayer.includes(
    "currentTime >= SUCCESSFUL_VOD_PLAYBACK_SECONDS"
  ) &&
    videoPlayer.includes(
      'sourceDisplayLabel(active, activeIdx),\n        "good"'
    ) &&
    videoPlayer.includes(
      "positionSeconds >= SUCCESSFUL_VOD_PLAYBACK_SECONDS"
    ),
  "20-second proven playback records success for both web and native VOD"
);

const nativeResultStart = videoPlayer.indexOf("const onNativeResult =");
const nativeResultBlock = videoPlayer.slice(nativeResultStart, nativeResultStart + 2500);
expect(
  nativeResultStart >= 0 &&
    nativeResultBlock.indexOf('String(detail.requestId || "") !== activeRequest.requestId') <
      nativeResultBlock.indexOf("if (detail?.diagnostics)"),
  "stale native callbacks cannot penalise the currently selected source"
);

const staleGuardMatches = [
  "current.playRequestId !== playId",
  "streamActionGenerationRef.current === actionGeneration",
  "String(detail.requestId || \"\") !== activeRequest.requestId",
];

expect(
  staleGuardMatches.every(
    (token) => mediaProvider.includes(token) || videoPlayer.includes(token)
  ),
  "stale discovery/native/async results cannot overwrite a newer playback request"
);

for (const [name, compatibility] of [
  ["Android mobile", mobileCompatibility],
  ["Fire TV", fireCompatibility],
]) {
  const audioRecoveryStart = compatibility.indexOf(
    "private val audioRecoveryRunnable"
  );
  const thermalStart = compatibility.indexOf(
    "private val thermalRunnable",
    audioRecoveryStart
  );
  const audioRecoveryBlock =
    audioRecoveryStart >= 0 && thermalStart > audioRecoveryStart
      ? compatibility.slice(audioRecoveryStart, thermalStart)
      : "";

  expect(
    audioRecoveryBlock.includes("audioRecoveryRunnable = Runnable { }") &&
      !audioRecoveryBlock.includes("recoverAudioTrack()") &&
      !audioRecoveryBlock.includes("player.isPlaying") &&
      !audioRecoveryBlock.includes("finishWithResult("),
    `${name} compatibility audio recovery remains inert until the viewer uses Audio`
  );

  expect(
    compatibility.includes(
      "MediaPlayer.Event.EncounteredError -> {\n                            confirmCompatibilityError(player)"
    ) &&
      compatibility.includes(
        "val stillProgressing =\n                currentTime > observedAt + 250L"
      ) &&
      compatibility.includes(
        "if (stillProgressing) {\n                showStatus(\"Compatibility decoder\")"
      ),
    `${name} confirms stopped progress before treating a LibVLC error event as fatal`
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
