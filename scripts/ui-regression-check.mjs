import { readFile } from "node:fs/promises";

const root = process.cwd();

const read = async (path) => readFile(`${root}/${path}`, "utf8");

const expect = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const home = await read("src/pages/Home.jsx");
const navbar = await read("src/components/mg/Navbar.jsx");
const searchDialog = await read("src/components/mg/SearchDialog.jsx");
const roadmap = await read("src/components/mg/RoadmapView.jsx");
const movies = await read("src/components/mg/MoviesView.jsx");
const tvShows = await read("src/components/mg/TvShowsView.jsx");
const homeDashboard = await read("src/components/mg/HomeDashboard.jsx");
const newEpisodesRow = await read("src/components/mg/NewEpisodesRow.jsx");
const streamingServiceRows = await read("src/components/mg/StreamingServiceRows.jsx");
const streamingServices = await read("src/components/mg/streamingServices.js");
const streamingRegion = await read("src/components/mg/streamingRegion.js");
const countryOptions = await read("src/components/mg/countryOptions.js");
const tmdbBackend = await read("base44/functions/getTmdbMovies/entry.ts");
const watchlist = await read("src/components/mg/WatchlistView.jsx");
const watchlistSchema = await read("base44/entities/WatchlistItem.jsonc");
const favorites = await read("src/components/mg/FavoritesView.jsx");
const downloads = await read("src/components/mg/DebridDashboard.jsx");
const rdLibrary = await read("src/components/mg/RdLibraryView.jsx");
const realDebridBackend = await read("base44/functions/realDebrid/entry.ts");
const addonStreamsBackend = await read("base44/functions/fetchAddonStreams/entry.ts");
const addonBrowserFallback = await read("src/components/mg/addonBrowserFallback.js");
const videoPlayer = await read("src/components/mg/VideoPlayer.jsx");
const mediaCompatibility = await read("src/components/mg/mediaCompatibility.js");
const playbackReliabilityCore = await read("src/components/mg/playbackReliability.js");
const playerProvider = await read("src/components/mg/PlayerProvider.jsx");
const mediaPlayerControls = await read("src/components/mg/MediaPlayerControls.jsx");
const nativeFireTvBridge = await read("src/components/mg/nativeFireTvBridge.js");
const fireTvMainActivity = await read(
  "firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt"
);
const fireTvPlayerActivity = await read(
  "firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt"
);
const fireTvAppUpdater = await read(
  "firetv-android/app/src/main/java/com/mediagod/firetv/AppUpdater.kt"
);
const androidPlayerActivity = await read(
  "android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt"
);
const addons = await read("src/components/mg/AddonsView.jsx");
const watchParty = await read("src/components/mg/WatchPartyView.jsx");
const watchPartySchema = await read("base44/entities/WatchParty.jsonc");
const watchPartyPresenceSchema = await read("base44/entities/WatchPartyPresence.jsonc");
const remoteTv = await read("src/components/mg/PlayerQrRemote.jsx");
const remotePhone = await read("src/pages/PlayerRemote.jsx");
const remoteSchema = await read("base44/entities/PlayerRemoteSession.jsonc");
const liveTv = await read("src/components/mg/LiveTVView.jsx");
const evSports = await read("src/components/mg/evSportsScraper.js");
const freeTv = await read("src/components/mg/freeTvPlaylist.js");
const settings = await read("src/components/mg/SettingsView.jsx");
const fireTvUpdateNotice = await read("src/components/mg/FireTvAppUpdateNotice.jsx");
const androidUpdateNotice = await read("src/components/mg/AndroidMobileAppUpdateNotice.jsx");
const fireTvRelease = await read("public/firetv-update.json");
const fireTvReleaseData = JSON.parse(fireTvRelease);

const requiredViews = [
  ["home", "Home"],
  ["movies", "Movies"],
  ["tv", "TV Shows"],
  ["live", "Live TV"],
  ["music", "Music"],
  ["watchlist", "Watchlist"],
  ["favorites", "Favorites"],
  ["settings", "Settings"],
];

for (const [id, label] of requiredViews) {
  expect(
    navbar.includes(`id: "${id}"`) && navbar.includes(`label: "${label}"`),
    `Navbar is missing ${label}`
  );

  expect(
    home.includes(`"${id}" && (`),
    `Home does not render the ${label} view`
  );
}

for (const hiddenLabel of [
  "RD Library",
  "Downloads",
  "Phone Remote",
  "Watch Party",
  "Addons",
  "Sources",
  "Roadmap",
  "Updates",
]) {
  expect(
    !navbar.includes(`label: "${hiddenLabel}"`),
    `Consumer navbar should not expose ${hiddenLabel}`
  );
}

expect(
  navbar.includes("onSearch") &&
    navbar.includes("Sign out") &&
    navbar.includes("Exit app"),
  "Consumer navbar lost Search, sign-out or native exit controls"
);
expect(
  searchDialog.includes("getFreeTvChannels") &&
    searchDialog.includes('media_type: "live"') &&
    searchDialog.includes("liveChannelSearchText") &&
    searchDialog.includes("Search movies, TV shows, live TV channels") &&
    home.includes('rawItem?.media_type === "live"') &&
    home.includes('initialQuickFilter="Radio"'),
  "Global search or Music navigation no longer includes Live TV channels"
);

expect(
  home.includes("<RoadmapView onBack={goBack} />"),
  "Roadmap is not wired into the global back routine"
);

for (const [source, name] of [
  [watchlist, "Watchlist"],
  [favorites, "Favorites"],
]) {
  expect(source.includes(`placeholder="Search ${name}…"`), `${name} search is missing`);
  expect(source.includes(`aria-label="Sort ${name}"`), `${name} sorting is missing`);
  expect(source.includes('value="title"'), `${name} title sorting is missing`);
  expect(source.includes('value="year"'), `${name} year sorting is missing`);
  expect(source.includes("clearAll"), `${name} bulk clear action is missing`);
  expect(source.includes("Clear all"), `${name} bulk clear control is missing`);
  expect(source.includes("DetailModal"), `${name} TV details fallback is missing`);
  expect(source.includes('mediaType="tv"'), `${name} TV details media type is missing`);
  expect(source.includes("mediaFilter"), `${name} movie/TV filter is missing`);
  expect(source.includes('["tv", "TV Shows"]'), `${name} TV filter control is missing`);
}
expect(
  watchlistSchema.includes('"media_type"'),
  "Watchlist schema no longer stores movie/TV media type"
);
expect(
  movies.includes("WatchlistItem.filter") &&
    movies.includes('media_type: "movie"') &&
    movies.includes("Already in Watchlist"),
  "Movies can create duplicate Watchlist rows again"
);
expect(
  roadmap.includes("onClick={() => onBack?.()}"),
  "Roadmap back button is not interactive"
);

expect(
  homeDashboard.includes("StreamingServiceRows") &&
    homeDashboard.includes('mediaType="mixed"') &&
    homeDashboard.includes("onOpenTvService"),
  "Home streaming-service rows are missing"
);

const homeContinueIndex = homeDashboard.indexOf("<ContinueWatchingRow");
const homeNewFilmsIndex = homeDashboard.indexOf('title="New Films"');
const homeNewTvIndex = homeDashboard.indexOf('title="New TV Shows"');
const homeNewEpisodesIndex = homeDashboard.indexOf("<NewEpisodesRow");
const homeBecauseIndex = homeDashboard.indexOf("Because You Watched");
const homeHeroIndex = homeDashboard.indexOf("<HeroSlider", homeContinueIndex);

expect(
  [
    homeContinueIndex,
    homeNewFilmsIndex,
    homeNewTvIndex,
    homeNewEpisodesIndex,
    homeBecauseIndex,
    homeHeroIndex,
  ].every((index) => index >= 0) &&
    homeContinueIndex < homeNewFilmsIndex &&
    homeNewFilmsIndex < homeNewTvIndex &&
    homeNewTvIndex < homeNewEpisodesIndex &&
    homeNewEpisodesIndex < homeBecauseIndex &&
    homeBecauseIndex < homeHeroIndex,
  "Home priority order changed: Continue Watching, New Films, New TV Shows, New Episodes and Because You Watched must stay first"
);
expect(
  newEpisodesRow.includes('data-mg-new-episodes-row="true"') &&
    newEpisodesRow.includes("New & Upcoming Episodes from Your Shows") &&
    newEpisodesRow.includes('media_type: "tv"') &&
    newEpisodesRow.includes("season_number") &&
    newEpisodesRow.includes("rdSeason") &&
    newEpisodesRow.includes("rdEpisode") &&
    newEpisodesRow.includes("disabled={upcoming}"),
  "New/upcoming episodes row is missing watched-show discovery or safe episode playback"
);
expect(
  tvShows.includes("StreamingServiceRows") &&
    tvShows.includes("activeProvider") &&
    tvShows.includes("provider_pages: 10") &&
    tvShows.includes("TV by Streaming Service"),
  "TV streaming-service rows or full provider catalogue are missing"
);
expect(
  streamingServiceRows.includes("provider_catalog") &&
    streamingServiceRows.includes("provider_ids") &&
    streamingServiceRows.includes("See all TV"),
  "Streaming-service row loader is incomplete"
);
expect(
  streamingServices.includes("Netflix") &&
    streamingServices.includes("Prime Video") &&
    streamingServices.includes("BBC iPlayer") &&
    streamingServices.includes("JioHotstar") &&
    streamingServices.includes("Stan") &&
    streamingServices.includes("Crave") &&
    streamingServices.includes("Showmax") &&
    streamingServices.includes("provider-${providerId}"),
  "Global or regional streaming services are missing from the provider catalogue"
);
expect(
  streamingRegion.includes("detectStreamingRegion") &&
    streamingRegion.includes("navigator.languages") &&
    streamingRegion.includes("detectStreamingTimezone") &&
    streamingRegion.includes("getStreamingRegionOverride") &&
    streamingRegion.includes("setStreamingRegionOverride") &&
    streamingServiceRows.includes("activeRegionName") &&
    !streamingServiceRows.includes("available from each service in the UK") &&
    tvShows.includes("streamingRegion") &&
    tvShows.includes("COUNTRY_OPTIONS") &&
    tvShows.includes("setStreamingRegionOverride(nextCountry)") &&
    homeDashboard.includes("streamingTimezone"),
  "Streaming-service discovery is no longer region/timezone aware"
);
expect(
  countryOptions.includes("ISO_ALPHA_2_CODES") &&
    countryOptions.includes('label: "All Countries"') &&
    countryOptions.includes("Intl.DisplayNames") &&
    movies.includes("COUNTRY_OPTIONS") &&
    movies.includes("setStreamingRegionOverride(nextCountry)") &&
    movies.includes('country: ""') &&
    tvShows.includes('country: ""'),
  "Global country dropdown no longer drives movies/TV viewing region independently of title origin"
);
expect(
  movies.includes("include_global_releases: true") &&
    homeDashboard.includes("include_global_releases: true") &&
    roadmap.includes("include_global_releases: true") &&
    roadmap.includes("Released elsewhere") &&
    tmdbBackend.includes("includeGlobalReleases") &&
    tmdbBackend.includes("globalReleasedDates") &&
    tmdbBackend.includes("/movie/now_playing?") &&
    tmdbBackend.includes("global_release_available"),
  "Worldwide cinema-release overlay is missing or local cinema dates can hide already-released titles again"
);
expect(
  tmdbBackend.includes("provider_catalog") &&
    tmdbBackend.includes("with_watch_providers") &&
    tmdbBackend.includes("with_watch_monetization_types") &&
    tmdbBackend.includes("watch_region") &&
    tmdbBackend.includes("requestRegion(req)") &&
    !tmdbBackend.includes("data?.results?.GB ||"),
  "TMDB provider discovery support is missing"
);
expect(
  home.includes("tvProviderRequest") &&
    home.includes("openTvStreamingService") &&
    home.includes("handleTvProviderChange"),
  "Streaming-service navigation between Home and TV is missing"
);

for (const marker of [
  'data-mg-downloads-view="true"',
  '["active", "Active"]',
  '["ready", "Ready"]',
  '["errors", "Errors"]',
  '["all", "All"]',
  'skipAddonLookup: true',
  'skipRdLookup: true',
  "retryFailed",
  "retryAllErrors",
  'action: "retry_torrent"',
  "clearReady",
  "Clear completed",
  "Retry errors",
  "formatEta",
]) {
  expect(downloads.includes(marker), `Downloads regression marker missing: ${marker}`);
}

for (const marker of [
  'data-mg-rd-library-view="true"',
  'useState("ready")',
  'placeholder="Search your Real-Debrid library…"',
  'skipAddonLookup: true',
  'skipRdLookup: true',
  "timerRef",
  "retryFailed",
  "retryAllErrors",
  "clearReady",
  "Clear completed",
  "Retry errors",
  "formatEta",
]) {
  expect(rdLibrary.includes(marker), `RD Library regression marker missing: ${marker}`);
}

for (const marker of [
  'action === "retry_torrent"',
  "original_filename:",
  "hash:",
  "seeders:",
  "speed:",
  "added:",
  'stream.error_code === "RD_TORRENT_INFO_FAILED"',
  'status: "preparing"',
  'warning: stream.error',
  "torrentSelectionMetadataPending(info)",
  "metadata_pending: true",
]) {
  expect(
    realDebridBackend.includes(marker),
    `Real-Debrid download metadata regression marker missing: ${marker}`
  );
}

for (const [source, label] of [
  [addonStreamsBackend, "server addon lookup"],
  [addonBrowserFallback, "browser addon fallback"],
]) {
  expect(
    source.includes("effectiveTrackers") &&
      source.includes("PUBLIC_FALLBACK_TRACKERS") &&
      source.includes('torrentMetadataSource') &&
      source.includes('"public_fallback"') &&
      source.includes("cometPlaybackUrl") &&
      source.includes('providedTrackers.length > 0 ? "rd_magnet" : "comet_uncached"'),
    `Uncached Comet fallback routing is missing from ${label}`
  );
  expect(
    !source.includes('reason: "comet_uncached_missing_torrent_metadata"'),
    `Opaque Comet uncached rows can still be discarded by ${label}`
  );
}
expect(
  addonStreamsBackend.includes("uncachedRowsMissingTorrentSources"),
  "Comet Torrent Mode metadata recovery no longer targets incomplete uncached rows"
);
expect(
  videoPlayer.includes("chooseDebridResolutionStrategy") &&
    videoPlayer.includes("debridTorrentHasMetadata") &&
    videoPlayer.includes("const hasTorrentTrackers = debridTorrentHasMetadata") &&
    videoPlayer.includes("const hasAuthoritativeTorrentMetadata =") &&
    videoPlayer.includes('active?.torrentMetadataSource !== "public_fallback"') &&
    videoPlayer.includes('resolutionStrategy === "comet_uncached" &&') &&
    videoPlayer.includes("!hasAuthoritativeTorrentMetadata"),
  "Uncached sources can no longer distinguish exact torrent metadata from synthetic public fallback trackers"
);
expect(
  playerProvider.includes('window.addEventListener(\n      "mg:native-playback-ended"') &&
    playerProvider.includes("advanceToNext(false);") &&
    videoPlayer.includes('reason === "ended"') &&
    videoPlayer.includes('new CustomEvent("mg:native-playback-ended"'),
  "Native Android/Fire TV episode completion no longer feeds the TV auto-next pipeline"
);
expect(
  mediaPlayerControls.includes("const scheduleHide = (delay = 2400) =>") &&
    mediaPlayerControls.includes("scheduleHide(2400);") &&
    mediaPlayerControls.includes("revealControls(2600);") &&
    mediaPlayerControls.includes("scheduleHide(isLive ? 1800 : 2800)") &&
    !mediaPlayerControls.includes("selectPinsControls") &&
    videoPlayer.includes("isLive={\n                  isLive\n                }") &&
    fireTvPlayerActivity.includes("controllerShowTimeoutMs = 2500") &&
    fireTvPlayerActivity.includes("sourceSpinner.postDelayed(hideSourceSelectorRunnable, 2500L)") &&
    fireTvPlayerActivity.includes("hideControllerNow()") &&
    androidPlayerActivity.includes("controllerShowTimeoutMs = 2500"),
  "Player buttons/source chrome, including Live TV and the Fire TV source selector, can remain pinned instead of auto-hiding after a couple of seconds"
);
expect(
  fireTvPlayerActivity.includes('payload.optBoolean("canChooseEpisode", false)') &&
    fireTvPlayerActivity.includes("choose season") &&
    fireTvPlayerActivity.includes("choose episode") &&
    fireTvPlayerActivity.includes('finishWithResult(reason = "episode")') &&
    nativeFireTvBridge.includes("canChooseEpisode") &&
    nativeFireTvBridge.includes("window.__MG_PLAYER_CONTEXT__") &&
    fireTvMainActivity.includes("mg:choose-episode") &&
    fireTvMainActivity.includes("__MG_NATIVE_EPISODE_PICKER_KEY__"),
  "Fire TV TV playback no longer exposes the existing season/episode picker from the native source menu"
);

expect(
  videoPlayer.includes("sourceSelectorPinnedRef = useRef(false)") &&
    videoPlayer.includes("rdFileSelectorPinnedRef = useRef(false)") &&
    videoPlayer.includes("Pause polling completely while the user is choosing a") &&
    videoPlayer.includes("sourceSelectorPinnedAtRef = useRef(0)") &&
    videoPlayer.includes("now - sourceSelectorPinnedAtRef.current > 12000") &&
    videoPlayer.includes("expectedOnePercentMs") &&
    videoPlayer.includes("activeDownloadFlatlineMs") &&
    videoPlayer.includes("const activeResolutionKey =") &&
    videoPlayer.includes("stablePlaybackSourceKey(active, activeIdx)") &&
    videoPlayer.includes("rdMediaContextKey") &&
    /\[\s*rdTorrentId,\s*rdOverride,\s*\]\s*\n\s*\);/.test(videoPlayer) &&
    !/\[\s*rdTorrentId,\s*rdOverride,\s*source,\s*\]\s*\n\s*\);/.test(videoPlayer) &&
    videoPlayer.includes("Never move the active source underneath an open native selector") &&
    !videoPlayer.includes("setSourceSelectorPinned(") &&
    !videoPlayer.includes("setRdFileSelectorPinned(") &&
    !videoPlayer.includes("onFocus={pinSourceSelector}") &&
    !videoPlayer.includes("onFocus={pinRdFileSelector}") &&
    videoPlayer.includes("const selectorOpenKey = (event) =>") &&
    videoPlayer.includes("if (selectorOpenKey(event)) pinSourceSelector();") &&
    videoPlayer.includes("if (selectorOpenKey(event)) pinRdFileSelector();") &&
    videoPlayer.includes("const sourceSelectionKey = (item, fallbackIndex = -1) =>") &&
    videoPlayer.includes("manualSelection: !selectingLive") &&
    videoPlayer.includes("selectSource(value, selectedEntry?.item || null);") &&
    videoPlayer.includes('data-mg-rd-cache-source={sourceNeedsCaching(active) ? "true" : "false"}'),
  "Torrent/source selectors can replay, reject a refreshed manual choice, or Android can mistake a real uncached RD job for Comet placeholder media"
);

expect(
  addons.includes("autoHealthCheckedRef") && addons.includes("testActiveAddons();"),
  "Addons no longer run their automatic first-load health check"
);

for (const marker of [
  'data-mg-watch-party-view="true"',
  'data-mg-watch-party-room="true"',
  "validWatchUrl",
  "refreshRoom",
  "endRoom",
  "navigator.share",
  "WatchPartyPresence",
  "activeParticipants",
  "Live presence",
  "recoverRoom",
  "messageEndRef",
  "networkOnline",
  'addEventListener("offline"',
  "formatChatTime",
  "transferHost",
  "Make host",
  "host_user_id",
]) {
  expect(watchParty.includes(marker), `Watch Party regression marker missing: ${marker}`);
}
expect(
  watchPartyPresenceSchema.includes('"room_code"') &&
    watchPartyPresenceSchema.includes('"user_id"') &&
    watchPartyPresenceSchema.includes('"last_seen_at"'),
  "Watch Party presence schema is incomplete"
);
expect(
  watchPartySchema.includes('"host_user_id"') &&
    watchPartySchema.includes('"data.host_user_id"'),
  "Watch Party host transfer schema/RLS is incomplete"
);

for (const marker of [
  "remote_last_seen_at",
  "Phone connected",
  "Waiting for phone",
  "Copy remote link",
  "shouldRenewExpiry",
]) {
  expect(remoteTv.includes(marker), `TV remote status regression marker missing: ${marker}`);
}
expect(
  remotePhone.includes("heartbeatTimer") &&
    remotePhone.includes("refreshTimer") &&
    remotePhone.includes("remote_last_seen_at") &&
    remotePhone.includes("Reconnecting…"),
  "Phone remote heartbeat/reconnect fallback is missing"
);
expect(
  remoteSchema.includes('"remote_last_seen_at"'),
  "Phone remote heartbeat schema field is missing"
);

expect(
  evSports.includes("EV_SPORTS_SOURCE_PRIORITY = 220"),
  "EV SPORTS priority changed from the locked value"
);
expect(
  liveTv.includes("const evSportsFallback = evSportsDestinationForChannel"),
  "EV SPORTS matching fallback is no longer active"
);
expect(
  liveTv.includes("!evSportsFallback && channelUsesAntSportsFallback(channel)"),
  "ANT SPORTS can bypass the EV SPORTS priority rule"
);
expect(
  freeTv.includes('sourceName === "BBC CDN Direct"') &&
    freeTv.includes('sourceName === "ITVX Official"'),
  "BBC/ITV locked primary rules are missing"
);

expect(
  settings.includes('data-mg-app-version="true"') &&
    settings.includes("Installed:") &&
    settings.includes("Check for update") &&
    settings.includes('new CustomEvent("mg:check-fire-tv-update")') &&
    settings.includes('new CustomEvent("mg:check-android-mobile-update")'),
  "Settings no longer shows the installed Media God app version or manual update check"
);
expect(
  fireTvUpdateNotice.includes("raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/firetv-update.json") &&
    fireTvUpdateNotice.includes('window.addEventListener("mg:check-fire-tv-update"') &&
    fireTvUpdateNotice.includes("60000") &&
    androidUpdateNotice.includes('window.addEventListener("mg:check-android-mobile-update"'),
  "Native update checks no longer re-check reliably or expose the manual Settings trigger"
);
expect(
  fireTvAppUpdater.includes("currentSigners.isNotEmpty()") &&
    fireTvAppUpdater.includes("archiveSigners.isNotEmpty()") &&
    fireTvAppUpdater.includes("signingCertificateHistory") &&
    fireTvAppUpdater.includes('"signature_migration"') &&
    fireTvUpdateNotice.includes("legacySignatureCheckError") &&
    fireTvUpdateNotice.includes("Do not uninstall Media God Fire TV."),
  "Fire TV can again mistake unavailable signer metadata for a real signing-key migration"
);
expect(
  Number.isInteger(Number(fireTvReleaseData?.versionCode)) &&
    Number(fireTvReleaseData.versionCode) > 0 &&
    /^\d+\.\d+\.\d+$/.test(String(fireTvReleaseData?.versionName || "")) &&
    String(fireTvReleaseData?.apkUrl || "").includes("Media-God-Fire-TV.apk") &&
    String(fireTvReleaseData?.channel || "") === "fire-tv",
  "Fire TV update manifest is missing valid version or APK metadata"
);

expect(
  videoPlayer.includes("const activeRecoveryTraits = detectStreamTraits") &&
    videoPlayer.includes("qualityRank: qualityRecoveryRank") &&
    videoPlayer.includes("hdrRescueRank: hdrRecoveryRank"),
  "quality-preserving 4K failover or HDR rescue ordering is missing"
);
expect(
  videoPlayer.includes("__MG_NATIVE_PLAYBACK_DIAGNOSTICS__") &&
    videoPlayer.includes("mg:native-playback-diagnostic"),
  "native playback diagnostics history is missing"
);
expect(
  mediaCompatibility.includes("nativePlayerAvailable\n      ? nativeFireTvCodecInfo()") &&
    mediaCompatibility.includes("!deviceProfile?.nativePlayerAvailable || !codec"),
  "phone/tablet native codec registry is not used for compatibility scoring"
);
expect(
  playbackReliabilityCore.includes("android-mobile:") &&
    playbackReliabilityCore.includes("hdr:dolby-vision") &&
    playbackReliabilityCore.includes("bitdepth:10"),
  "per-device mobile HDR/codec reliability learning is missing"
);

const playbackAdvancedSettings = await read("src/components/mg/PlaybackAdvancedSettings.jsx");
const playbackPreferences = await read("src/components/mg/playbackPreferences.js");
const playerAutomation = await read("src/components/mg/PlayerProvider.jsx");

for (const marker of [
  "Audio output",
  "Lip sync",
  "Dialogue boost",
  "Volume normalization",
  "Automatic no-sound recovery",
  "Network-aware 4K",
  "Thermal / performance protection",
  "Playback diagnostics",
  "Clear playback learning",
]) {
  expect(playbackAdvancedSettings.includes(marker), `Advanced playback setting missing: ${marker}`);
}
expect(
  playbackPreferences.includes('audioOutputMode: "auto"') &&
    playbackPreferences.includes("lipSyncMs: 0") &&
    playbackPreferences.includes("automaticNoSoundRecovery: true") &&
    playbackPreferences.includes("networkAware4K: true") &&
    playbackPreferences.includes("thermalProtection: true"),
  "Advanced playback preference defaults are incomplete"
);
expect(
  settings.includes("<PlaybackAdvancedSettings />"),
  "Advanced playback settings are not mounted in Settings"
);
expect(
  playerAutomation.includes("nextEpisodePreloadRef") &&
    playerAutomation.includes('typeof core.prepare === "function"') &&
    playerAutomation.includes("preparedFresh"),
  "Next-episode source pre-resolution is no longer active"
);
expect(
  videoPlayer.includes("preservePosition: true") &&
    videoPlayer.includes("trackPreferences.audioLanguage") &&
    videoPlayer.includes("automaticNetworkScore") &&
    videoPlayer.includes("hdrRecoveryScore"),
  "Seamless/network/HDR automatic recovery markers are incomplete"
);

console.log("ok UI/navigation/download/watch-party/locked-source/version-update structural checks complete");
