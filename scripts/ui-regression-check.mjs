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
const roadmap = await read("src/components/mg/RoadmapView.jsx");
const movies = await read("src/components/mg/MoviesView.jsx");
const watchlist = await read("src/components/mg/WatchlistView.jsx");
const watchlistSchema = await read("base44/entities/WatchlistItem.jsonc");
const favorites = await read("src/components/mg/FavoritesView.jsx");
const downloads = await read("src/components/mg/DebridDashboard.jsx");
const rdLibrary = await read("src/components/mg/RdLibraryView.jsx");
const realDebridBackend = await read("base44/functions/realDebrid/entry.ts");
const addonStreamsBackend = await read("base44/functions/fetchAddonStreams/entry.ts");
const addonBrowserFallback = await read("src/components/mg/addonBrowserFallback.js");
const videoPlayer = await read("src/components/mg/VideoPlayer.jsx");
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

const requiredViews = [
  ["home", "Home"],
  ["movies", "Movies"],
  ["tv", "TV Shows"],
  ["live", "Live TV"],
  ["watchlist", "Watchlist"],
  ["favorites", "Favorites"],
  ["watchparty", "Watch Party"],
  ["rdlib", "RD Library"],
  ["downloads", "Downloads"],
  ["addons", "Addons"],
  ["sources", "Sources"],
  ["roadmap", "Roadmap"],
  ["updates", "Updates"],
  ["remote", "Phone Remote"],
  ["settings", "Settings"],
];

for (const [id, label] of requiredViews) {
  expect(
    navbar.includes(`id: "${id}"`) && navbar.includes(`label: "${label}"`),
    `Navbar is missing ${label}`
  );

  if (id !== "remote") {
    expect(
      home.includes(`"${id}" && (`),
      `Home does not render the ${label} view`
    );
  }
}

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
      source.includes('"public_fallback"'),
    `Uncached torrent fallback trackers are missing from ${label}`
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
    videoPlayer.includes("const hasTorrentTrackers = debridTorrentHasMetadata"),
  "Tracker-bearing uncached sources can no longer use the direct Real-Debrid path"
);
expect(
  videoPlayer.includes("sourceSelectorPinnedRef = useRef(false)") &&
    videoPlayer.includes("rdFileSelectorPinnedRef = useRef(false)") &&
    videoPlayer.includes("Pause polling completely while the user is choosing a") &&
    videoPlayer.includes("Never move the active source underneath an open native selector") &&
    !videoPlayer.includes("setSourceSelectorPinned(") &&
    !videoPlayer.includes("setRdFileSelectorPinned(") &&
    videoPlayer.includes('data-mg-rd-cache-source={sourceNeedsCaching(active) ? "true" : "false"}'),
  "Torrent/source selectors can replay on focus or Android can mistake a real uncached RD job for Comet placeholder media"
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

console.log("ok UI/navigation/download/watch-party/locked-source structural checks complete");
