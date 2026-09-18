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
const mediaPlayerProvider = read("src/components/mg/MediaPlayerProvider.jsx");
const assist = read("src/components/mg/MediaGodV2Assist.jsx");
const videoPlayer = read("src/components/mg/VideoPlayer.jsx");
const liveVideo = read("src/components/mg/LiveVideo.jsx");
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
  assist.includes("Next ${nextEpisodeLabel} in ${nextCountdownSeconds}s") &&
    assist.includes("Keep watching current episode") &&
    assist.includes('new CustomEvent("mg:play-next-episode")') &&
    assist.includes("context?.nextEpisodeAvailable !== false") &&
    assist.includes("remaining <= 20") &&
    assist.includes("creditsWindow && !isTv"),
  "web/mobile overlay has phase-aware, finale-aware skip and cancellable next-episode controls"
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
    native.includes("creditsVisible && !tvEpisode") &&
    native.includes("remaining <= 60_000L") &&
    native.includes("remaining <= 20_000L"),
  "Fire TV native player keeps one phase-relevant end action and a conservative auto-next countdown"
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
  videoPlayer.includes('const activeRuntimeReady = Boolean(') &&
    videoPlayer.includes('const activeHasResolvedStream = Boolean(') &&
    videoPlayer.includes('!activeHasResolvedStream && sourceNeedsCaching(active)') &&
    videoPlayer.includes('const qualityBucketFor = (entry) =>') &&
    videoPlayer.includes('qualityBucket === "4k"'),
  "resolved cache streams cannot restart and 4K cache candidates keep their own quality bucket"
);

expect(
  videoPlayer.includes('if (next === "4k" || next === "1080p")') &&
    videoPlayer.includes('? Number(entry.resolution || 0) >= 2000') &&
    videoPlayer.includes('selectSource(match.index, match.item);'),
  "4K and 1080p quality choices switch to a real ready source instead of only sorting the list"
);

expect(
  mediaPlayerProvider.includes('fastMode: false') &&
    mediaPlayerProvider.includes('excludeAddonNames: []') &&
    mediaPlayerProvider.includes('every extra torrent hash is another chance') &&
    mediaPlayerProvider.includes('preservePublishedSourceOrder') &&
    mediaPlayerProvider.includes('publishedSourceSnapshot') &&
    mediaPlayerProvider.includes('if (lockedIndex > 0)') &&
    !mediaPlayerProvider.includes('successfulAddonNames.length >=') &&
    !mediaPlayerProvider.includes('lockedIsKnownUncachedMagnet && cachedAlternativeExists'),
  "fast start always expands into full cache discovery and every published source keeps a stable playback index"
);

expect(
  mediaPlayerProvider.includes('item?.infoHash') &&
    mediaPlayerProvider.includes('item?.info_hash') &&
    mediaPlayerProvider.includes('item?.richMagnet') &&
    mediaPlayerProvider.includes('Boolean(sourceMagnetHash(item))'),
  "cache annotation includes torrent hashes carried as metadata on provider and HTTP source rows"
);

expect(
  mediaPlayerProvider.includes('const combinedSourceCount = cacheAnnotatedCombined.length') &&
    mediaPlayerProvider.includes('cacheCandidateCount,') &&
    mediaPlayerProvider.includes('cachedSourceCount,') &&
    videoPlayer.includes('data-mg-source-health="true"') &&
    videoPlayer.includes('Cache checked') &&
    videoPlayer.includes('Ready {selectableSourceCount}'),
  "player exposes source-health counts for discovery, cache checks, cached hits and ready sources"
);

expect(
  liveVideo.includes("const stableConfigSignature = (value) =>") &&
    liveVideo.includes("const onErrorRef = useRef(onError)") &&
    liveVideo.includes("const headersSignature = stableConfigSignature(headers)") &&
    liveVideo.includes("const drmSignature = stableConfigSignature(drm)") &&
    liveVideo.includes("headersSignature,") &&
    liveVideo.includes("drmSignature,") &&
    !liveVideo.includes("      sourceLabel,\n      isLive,\n      headers,\n      drm,"),
  "LiveVideo keeps one decoder for the same URL instead of restarting playback on incidental React prop changes"
);

expect(
  nativeBridge.includes("const setNativePlaybackOwnership = (active) =>") &&
    nativeBridge.includes('document.querySelectorAll("video, audio")') &&
    nativeBridge.includes("setNativePlaybackOwnership(accepted)") &&
    liveVideo.includes("window.__MG_NATIVE_PLAYBACK_ACTIVE__ === true") &&
    videoPlayer.includes("window.__MG_NATIVE_PLAYBACK_ACTIVE__ = false") &&
    videoPlayer.includes("window.__MG_NATIVE_PLAYBACK_ACTIVE__ === true"),
  "native playback is the sole owner: WebView media is stopped and cannot restart underneath it"
);

expect(
  sourcePreferences.includes("const hasCached = items.some((item) => sourceIsCached(item))") &&
    sourcePreferences.includes("const movieLike =") &&
    sourcePreferences.includes("hasCached && (items.length > 1 || movieLike)"),
  "movies keep the Cached / ready dropdown available even when only one cached source is selectable"
);

expect(
  assist.includes("runClickFallback") &&
    assist.includes("runKeyAction") &&
    assist.includes("episodeNumber > 1") &&
    assist.includes("position <= 65") &&
    assist.includes("position <= 210") &&
    assist.includes("!canSkipRecap") &&
    assist.includes("remaining <= 60") &&
    assist.includes("remaining <= 20") &&
    assist.includes("const showNextAction =") &&
    assist.includes("z-[120]") &&
    provider.includes('availability: "unknown"') &&
    provider.includes('availability: "no"') &&
    provider.includes('availability: "yes"') &&
    provider.includes("nextEpisodeAvailable:") &&
    nativeBridge.includes("nextEpisodeAvailable:") &&
    native.includes("episodeNumber > 1") &&
    native.includes("position in 4_000L..65_000L") &&
    native.includes("fallbackIntroStartMs..210_000L") &&
    native.includes("creditsVisible && !tvEpisode") &&
    mobileNative.includes("episodeNumber > 1") &&
    mobileNative.includes("position in 4_000L..65_000L") &&
    mobileNative.includes("fallbackIntroStartMs..210_000L") &&
    mobileNative.includes("creditsVisible && !tvEpisode"),
  "episode actions move through recap, intro and end phases without broad overlapping fallback prompts"
);

expect(
  mobileNative.includes("private fun buildAssistControls()") &&
    mobileNative.includes("private fun updateAssistControls()") &&
    mobileNative.includes("creditsVisible && !tvEpisode") &&
    mobileNative.includes("remaining <= 60_000L") &&
    mobileNative.includes("remaining <= 20_000L") &&
    mobileNative.includes('finishWithResult("next")') &&
    mobileNative.includes("NEXT_EPISODE_COUNTDOWN_MS"),
  "Android mobile native player keeps the same phase-aware episode skip and next controls"
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
