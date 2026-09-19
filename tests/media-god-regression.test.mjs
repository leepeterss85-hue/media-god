import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  dedupeMergedChannels,
  LIVE_TV_SOURCES,
  normaliseCountryCode,
  parseFreeTvPlaylist,
  PUBLIC_DIRECT_CHANNELS,
} from "../src/components/mg/freeTvPlaylist.js";
import {
  liveTvUrlQuarantined,
  liveTvUrlScore,
  recordLiveTvPlaybackResult,
} from "../src/components/mg/liveTvPlaybackLearning.js";
import {
  chooseDebridResolutionStrategy,
  debridTorrentHasMetadata,
} from "../src/components/mg/debridResolutionStrategy.js";
import { compareLiveTvRankRecords } from "../src/components/mg/liveTvRankingCore.js";
import {
  ANT_SPORTS_LIVE_PRIORITY,
  ANT_SPORTS_UPCOMING_PRIORITY,
} from "../src/components/mg/antSportsScraper.js";
import {
  EV_SPORTS_BASE_SCORE,
  EV_SPORTS_SOURCE_PRIORITY,
} from "../src/components/mg/evSportsScraper.js";
import {
  chooseRequestedTorrentFileForPlayback,
  chooseVideoFileForPlayback,
  mapTorrentLinksByFileId,
  normaliseRequestedFileIndex,
  torrentSelectionMetadataPending,
} from "../base44/functions/realDebrid/regressionHelpers.js";
import {
  guideNameAliases,
  normaliseGuideName,
} from "../base44/functions/getLiveEpg/nameMatching.js";
import {
  detectMediaEdition,
  detectMediaExtra,
  mediaEditionSortScore,
  sourceHasEdition,
} from "../src/components/mg/mediaEdition.js";
import {
  sourceHasAuthoritativeCachedSignal,
  sourceHasPendingCacheSignal,
  sourceIsConfirmedCachedForPlayback,
} from "../src/components/mg/sourceCacheVisibility.js";
import { mergeCompleteSourcePool } from "../src/components/mg/sourcePoolCompleteness.js";
import {
  classifyDebridCacheCheck,
  mergeDebridCacheCheckState,
} from "../src/components/mg/debridCacheCheck.js";
import {
  COMPATIBLE_AUTOPLAY_LIMIT,
  prioritiseCompatibleAutoplayEntries,
} from "../src/components/mg/automaticSourceOrder.js";
import {
  claimExclusivePlayback,
  hasExclusivePlaybackOwner,
  releaseExclusivePlayback,
  stopExclusivePlayback,
} from "../src/components/mg/exclusivePlayback.js";
import {
  preferredAudioTrackScore,
  rememberedAudioTrackScore,
  trackLanguage,
} from "../src/components/mg/mediaTrackPreferences.js";
import { preservePublishedSourceOrder } from "../src/components/mg/sourcePublication.js";

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    },
    clear() {
      data.clear();
    },
  };
};

globalThis.window = {
  localStorage: memoryStorage(),
};

test("Fire TV Home cards preserve movie vs TV identity", () => {
  const mediaCardSource = readFileSync(
    new URL("../src/components/mg/MediaCard.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    mediaCardSource,
    /media_type:\s*mediaType,[\s\S]*mediaType,[\s\S]*type:\s*mediaType\s*===\s*"tv"\s*\?\s*"tv"\s*:\s*"movie"/
  );

  assert.doesNotMatch(
    mediaCardSource,
    /if\s*\(\(isFireTvRuntime\(\)[\s\S]{0,500}?media_type:\s*"tv"/
  );
});

test("Fire TV Home keeps a dedicated vertical scroll container", () => {
  const fireTvCss = readFileSync(
    new URL("../src/fire-tv-stable.css", import.meta.url),
    "utf8"
  );

  assert.match(fireTvCss, /\[data-mg-home-dashboard="true"\][\s\S]{0,700}?height:\s*100vh\s*!important/);
  assert.match(fireTvCss, /\[data-mg-home-dashboard="true"\][\s\S]{0,900}?overflow-y:\s*auto\s*!important/);
  assert.match(fireTvCss, /\[data-mg-home-dashboard="true"\][\s\S]{0,1100}?scroll-padding-bottom:\s*40px\s*!important/);
});

test("source health never counts uncached Real-Debrid preparation rows as cached", () => {
  const pendingRd = {
    type: "rd",
    viaRealDebrid: true,
    cacheRequired: true,
    cometUncached: true,
    debridCacheChecked: true,
    debridCached: false,
  };
  const readyLibrary = {
    type: "url",
    viaRealDebrid: true,
    url: "https://example.test/ready.mkv",
  };
  const confirmedCached = {
    type: "rd",
    cacheRequired: true,
    cometUncached: true,
    debridCached: true,
  };

  assert.equal(sourceHasPendingCacheSignal(pendingRd), true);
  assert.equal(sourceIsConfirmedCachedForPlayback(pendingRd), false);
  assert.equal(sourceIsConfirmedCachedForPlayback(readyLibrary), true);
  assert.equal(sourceIsConfirmedCachedForPlayback(confirmedCached), true);

  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    providerSource,
    /cachedSourceCount\s*=\s*confirmedCachedPlaybackSources\.length/
  );
  assert.doesNotMatch(
    providerSource,
    /cachedSourceCount[\s\S]{0,180}?viaRealDebrid\s*===\s*true/
  );
  assert.match(providerSource, /pendingSourceCount/);
  assert.match(playerSource, /Waiting \{Number\(source\?\.sourceDiagnostics\?\.pendingSourceCount/);
});

test("partial debrid cache failures stay unknown instead of becoming uncached", () => {
  const hash = "a".repeat(40);
  const result = classifyDebridCacheCheck(
    {
      providersChecked: ["realdebrid"],
      cached: {
        realdebrid: {
          [hash]: false,
        },
      },
      providerStats: {
        realdebrid: {
          latencyMs: 1200,
          error: "Temporary Real-Debrid timeout",
        },
      },
    },
    [hash]
  );

  assert.equal(result[hash].state, "unknown");
});

test("complete debrid cache misses are confirmed uncached", () => {
  const hash = "b".repeat(40);
  const result = classifyDebridCacheCheck(
    {
      providersChecked: ["realdebrid"],
      cached: {
        realdebrid: {
          [hash]: false,
        },
      },
      providerStats: {
        realdebrid: {
          latencyMs: 80,
          error: "",
        },
      },
    },
    [hash]
  );

  assert.equal(result[hash].state, "uncached");
});

test("positive cache hits survive partial provider errors", () => {
  const hash = "c".repeat(40);
  const result = classifyDebridCacheCheck(
    {
      providersChecked: ["realdebrid", "torbox"],
      cached: {
        realdebrid: {
          [hash]: true,
        },
        torbox: {
          [hash]: false,
        },
      },
      providerStats: {
        realdebrid: {
          latencyMs: 75,
          error: "",
        },
        torbox: {
          latencyMs: 900,
          error: "Temporary provider error",
        },
      },
    },
    [hash]
  );

  assert.equal(result[hash].state, "cached");
  assert.deepEqual(result[hash].cachedProviders, ["realdebrid"]);
  assert.equal(
    mergeDebridCacheCheckState(result[hash], { state: "unknown", cachedProviders: [] }).state,
    "cached"
  );
});

test("player retries only unknown cache hashes and never records them as a miss", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(providerSource, /const unknownHashes = hashes\.filter/);
  assert.match(providerSource, /await checkBatches\(unknownHashes\)/);
  assert.match(providerSource, /debridCacheChecked:\s*false/);
  assert.match(providerSource, /debridCacheCheckState:\s*"unknown"/);
});

test("full addon discovery merges year-qualified sources after a non-empty primary result", () => {
  const serverSource = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );
  const browserSource = readFileSync(
    new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url),
    "utf8"
  );

  for (const source of [serverSource, browserSource]) {
    assert.match(source, /yearQualifiedSearchIds/);
    assert.match(source, /rawStreams\.length > 0/);
    assert.match(source, /alternateStreamId === alternateIdUsed/);
    assert.doesNotMatch(
      source,
      /!rawStreams\.some\(streamHasPreferredEnglishAudio\)/
    );
    assert.match(
      source,
      /rawStreams\s*=\s*dedupe\(\[[\s\S]{0,220}?\.\.\.rawStreams,[\s\S]{0,220}?\.\.\.alternateStreams/
    );
  }
});

test("torrent source merging preserves different file indexes from the same hash", () => {
  const serverSource = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );
  const browserSource = readFileSync(
    new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url),
    "utf8"
  );

  for (const source of [serverSource, browserSource]) {
    assert.match(source, /const fileIdx\s*=/);
    assert.match(source, /const fileKey\s*=/);
    assert.match(source, /hash:\$\{hash\}\$\{fileKey\}/);
    assert.doesNotMatch(source, /hash:\$\{hash\}(?!\$\{fileKey\})/);
  }
});

test("TV playback publishes the episode-list destination before closing", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const providerSource = readFileSync(
    new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const homeSource = readFileSync(
    new URL("../src/pages/Home.jsx", import.meta.url),
    "utf8"
  );

  const playerDispatch = playerSource.indexOf(
    'new CustomEvent("mg:return-to-episode-selector"'
  );
  const playerClose = playerSource.indexOf("onClose?.();", playerDispatch);
  assert.ok(playerDispatch >= 0);
  assert.ok(playerClose > playerDispatch);

  const providerChoose = providerSource.indexOf("const onChooseEpisode =");
  const providerDispatch = providerSource.indexOf(
    'new CustomEvent("mg:return-to-episode-selector"',
    providerChoose
  );
  const providerClose = providerSource.indexOf("close();", providerDispatch);
  assert.ok(providerChoose >= 0);
  assert.ok(providerDispatch > providerChoose);
  assert.ok(providerClose > providerDispatch);

  assert.match(homeSource, /button\[data-mg-player-exit="true"\]/);
  assert.match(homeSource, /button\[aria-label="Exit player"\]/);
});

test("uncached v2 engine owns Real-Debrid slot preflight and preserves blocked source", () => {
  const cacheEngineSource = readFileSync(
    new URL("../src/components/mg/realDebridCacheEngine.js", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(cacheEngineSource, /action:\s*"uncached_preflight"/);
  assert.match(cacheEngineSource, /errorCode:\s*"RD_ACTIVE_SLOTS_FULL"/);
  assert.match(cacheEngineSource, /accountBlocked:\s*true/);
  assert.match(playerSource, /const preserveUncachedSource\s*=[\s\S]{0,260}?RD_ACTIVE_SLOTS_FULL/);
  assert.match(playerSource, /RD_CACHE_STATUS_UNAVAILABLE/);
  assert.match(playerSource, /if \(!preserveUncachedSource\) \{\s*markSourceFailed\(activeIdx\)/);
});

test("Real-Debrid selected-file links map to the requested episode instead of link zero", () => {
  const files = [
    { id: 1, path: "/Show.S01E01.mkv", selected: 1 },
    { id: 2, path: "/Show.S01E02.mkv", selected: 1 },
    { id: 3, path: "/Show.S01E03.mkv", selected: 0 },
    { id: 4, path: "/readme.txt", selected: 0 },
  ];
  const links = ["https://rd.test/e01", "https://rd.test/e02"];
  const map = mapTorrentLinksByFileId(files, links);

  assert.equal(map.get(1), "https://rd.test/e01");
  assert.equal(map.get(2), "https://rd.test/e02");
  assert.equal(map.has(3), false);
});

test("new uncached RD jobs are owned before file selection and terminal selection failures clean up", () => {
  const rdBackend = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );
  const ownershipIndex = rdBackend.indexOf("await rememberRdTorrentAssociation({");
  const initialInfoIndex = rdBackend.indexOf("const initialInfoRes =", ownershipIndex);

  assert.ok(ownershipIndex >= 0);
  assert.ok(initialInfoIndex > ownershipIndex);
  assert.match(
    rdBackend,
    /RD_NO_VIDEO_FILE[\s\S]{0,500}?|deleteNewTorrentBestEffort/
  );
  assert.ok(
    rdBackend.includes("await deleteNewTorrentBestEffort(torrentId, authHeaders, base44);")
  );
});

test("uncached player exposes the full RD cache lifecycle and marks completed sources ready", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /Step \{cachePhase\.step\}\/5/);
  assert.match(playerSource, /Selecting file/);
  assert.match(playerSource, /Finalising stream/);
  assert.match(playerSource, /Cached \/ Ready •/);
  assert.match(playerSource, /markTorrentHashReady\(active\)/);
});

test("uncached retry reuses the exact RD torrent and final-link failures retry at 100 percent", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const cacheEngineSource = readFileSync(
    new URL("../src/components/mg/realDebridCacheEngine.js", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /retryExistingTorrentIdRef\.current\s*=\s*String/);
  assert.match(cacheEngineSource, /preferredTorrentId/);
  assert.match(cacheEngineSource, /torrent_id:\s*preferredTorrentId/);
  assert.match(cacheEngineSource, /phase:\s*"finalizing"/);
  assert.match(cacheEngineSource, /RD_CACHE_FINAL_LINK_UNAVAILABLE/);
  assert.match(cacheEngineSource, /lastProgress\s*>=\s*99\.999/);
});

test("uncached torrent rows can never bypass the RD cache engine as direct streams", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /const activeTorrentHash = sourceTorrentHash\(active\)/);
  assert.match(playerSource, /const activeRuntimeReady = Boolean\(/);
  assert.match(playerSource, /const activeHasResolvedStream = Boolean\(/);
  assert.match(
    playerSource,
    /!activeHasResolvedStream && sourceNeedsCaching\(active\)/
  );
  assert.match(
    playerSource,
    /const isRdSource =[\s\S]{0,600}?Boolean\(activeTorrentHash\)[\s\S]{0,120}?activeNeedsCaching/
  );
  assert.match(
    playerSource,
    /const isDirectFile =[\s\S]{0,120}?!activeNeedsCaching[\s\S]{0,120}?!isRdSource/
  );
});

test("uncached cache stalls stay on the same torrent and use generous RD timing", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const cacheEngineSource = readFileSync(
    new URL("../src/components/mg/realDebridCacheEngine.js", import.meta.url),
    "utf8"
  );

  assert.match(
    playerSource,
    /if \(preserveUncachedSource\) \{[\s\S]{0,900}?Retry will reconnect/
  );
  assert.match(
    playerSource,
    /if \(sourceNeedsCaching\(active\)\) \{[\s\S]{0,700}?same cached source has been kept selected/
  );
  assert.match(cacheEngineSource, /Math\.max\(10 \* 60_000, expectedRemainingMs \* 6\)/);
  assert.match(cacheEngineSource, /if \(speed > 0\) return 15 \* 60_000/);
  assert.match(cacheEngineSource, /if \(seeders > 0\) return 12 \* 60_000/);
  assert.match(cacheEngineSource, /retrySameSource:\s*true[\s\S]{0,220}?RD_CACHE_RESTART_STALLED/);
});

test("browser addon fallback retries alternate identifiers after an initial 404", () => {
  const browserFallbackSource = readFileSync(
    new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url),
    "utf8"
  );

  assert.match(
    browserFallbackSource,
    /!result\.ok\s*&&\s*result\.status\s*===\s*404[\s\S]{0,1200}?alternateStreamIds/
  );
  assert.match(
    browserFallbackSource,
    /Browser fallback found no indexed source for this title after trying the available identifiers\./
  );
});

test("movie and TV edition detection covers common official cuts without DC false positives", () => {
  assert.equal(
    detectMediaEdition({ name: "Blade.Runner.1982.Directors.Cut.2160p.mkv" }).value,
    "directors_cut"
  );
  assert.equal(
    detectMediaEdition({ name: "The.Lord.of.the.Rings.Extended.Edition.1080p.mkv" }).value,
    "extended"
  );
  assert.equal(
    detectMediaEdition({ name: "Episode.S02E03.Extended.Episode.1080p.mkv" }).value,
    "extended"
  );
  assert.equal(
    detectMediaEdition({ name: "Movie.IMAX.Expanded.2160p.mkv" }).value,
    "imax"
  );
  assert.equal(
    detectMediaEdition({ name: "Film.Broadcast.TV.Cut.720p.mkv" }).value,
    "broadcast_cut"
  );
  assert.equal(
    detectMediaEdition({ name: "DC.League.of.Super-Pets.2022.1080p.mkv" }).value,
    "standard"
  );
});

test("bonus and extras detection labels common disc/file content", () => {
  assert.equal(
    detectMediaExtra({ path: "/Extras/Deleted.Scene.03.mkv" }).value,
    "deleted_scene"
  );
  assert.equal(
    detectMediaExtra({ path: "/Bonus/Behind.The.Scenes.mp4" }).value,
    "behind_scenes"
  );
  assert.equal(
    detectMediaExtra({ path: "/Featurettes/Making.Of.The.Movie.mkv" }).value,
    "featurette"
  );
  assert.equal(
    detectMediaExtra({ path: "/Main.Movie.Extended.Uncut.2160p.mkv" }).value,
    "main_feature"
  );
});

test("edition preference prioritises the requested cut and theatrical accepts untagged originals", () => {
  const directors = { name: "Movie.Directors.Cut.1080p.mkv" };
  const extended = { name: "Movie.Extended.Edition.2160p.mkv" };
  const standard = { name: "Movie.1080p.mkv" };

  assert.ok(
    mediaEditionSortScore(directors, "directors_cut") >
      mediaEditionSortScore(extended, "directors_cut")
  );
  assert.equal(sourceHasEdition(directors, "directors_cut"), true);
  assert.equal(sourceHasEdition(extended, "directors_cut"), false);
  assert.equal(sourceHasEdition(standard, "theatrical"), true);
});

test("edition choices are wired into source labels and player selectors", () => {
  const labels = readFileSync(
    new URL("../src/components/mg/playbackSourceLabels.js", import.meta.url),
    "utf8"
  );
  const sourcePreferences = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );
  const player = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(labels, /detectMediaEdition/);
  assert.match(sourcePreferences, /availableSourceSortOptions/);
  assert.match(sourcePreferences, /mediaType !== "tv"/);
  assert.match(sourcePreferences, /editionValues\.has\(option\.value\)/);
  assert.match(player, /Available quality/);
  assert.match(player, /Available filters \/ editions/);
  assert.match(player, /availableSortOptions\.map/);
  assert.match(player, /sourceHasEdition\(entry\.item, edition\)/);
});

test("country normalisation keeps UK/GB and USA/US consistent", () => {
  assert.equal(normaliseCountryCode("UK"), "GB");
  assert.equal(normaliseCountryCode("GBR"), "GB");
  assert.equal(normaliseCountryCode("USA"), "US");
  assert.equal(normaliseCountryCode("United States"), "US");
  assert.equal(normaliseCountryCode("United Kingdom"), "GB");
  assert.equal(normaliseCountryCode("GB;IE"), "GB");
});

test("new FAST catalogues remain enabled with the intended regions", () => {
  const expected = new Map([
    ["rakuten-tv-gb-buddy", "GB"],
    ["tcl-tv-plus-buddy", "US"],
    ["airy-tv-buddy", "US"],
  ]);

  for (const [id, country] of expected) {
    const source = LIVE_TV_SOURCES.find((item) => item.id === id);

    assert.ok(source, `${id} should be configured`);
    assert.notEqual(source.disabled, true, `${id} should be enabled`);
    assert.equal(source.country, country);
    assert.match(source.url, /^https:\/\/raw\.githubusercontent\.com\//);
  }
});

test("M3U parser handles quoted commas and normalises UK metadata", () => {
  const playlist = `#EXTM3U\n#EXTINF:-1 tvg-id="BBC.One.Lon.HD.uk" tvg-name="BBC One, London" tvg-country="UK" group-title="United Kingdom",BBC One HD\nhttps://example.test/bbc-one.m3u8\n`;
  const [channel] = parseFreeTvPlaylist(playlist, {
    id: "test-uk",
    name: "Test UK",
    priority: 100,
    category: "United Kingdom",
  });

  assert.ok(channel);
  assert.equal(channel.name, "BBC One HD");
  assert.equal(channel.country, "GB");
  assert.equal(channel.tvgId, "BBC.One.Lon.HD.uk");
  assert.equal(channel.url, "https://example.test/bbc-one.m3u8");
});

test("M3U parser rejects placeholder and dummy stream URLs", () => {
  const playlist = `#EXTM3U\n#EXTINF:-1,No public stream\n[NO PUBLIC STREAM]\n#EXTINF:-1,Dummy host\nhttp://x.x\n#EXTINF:-1,Valid channel\nhttps://example.test/live.m3u8\n`;
  const channels = parseFreeTvPlaylist(playlist, {
    id: "placeholder-test",
    name: "Placeholder Test",
    priority: 100,
    category: "General",
  });

  assert.equal(channels.length, 1);
  assert.equal(channels[0].name, "Valid channel");
  assert.equal(channels[0].url, "https://example.test/live.m3u8");
});

test("Airy TV test-only row stays out of the visible catalogue", () => {
  const playlist = `#EXTM3U\n#EXTINF:-1 group-title="TV Shows",Test\nhttps://example.test/test.m3u8\n#EXTINF:-1 group-title="Movies",Cinema Star\nhttps://example.test/cinema-star.m3u8\n`;
  const channels = parseFreeTvPlaylist(playlist, {
    id: "airy-tv-buddy",
    name: "Airy TV",
    priority: 92,
    category: "United States",
    country: "US",
  });

  assert.deepEqual(channels.map((channel) => channel.name), ["Cinema Star"]);
});

test("BBC core channels keep curated direct video and official iPlayer fallbacks", () => {
  const wanted = [
    "BBC One",
    "BBC Two",
    "BBC Three",
    "BBC Four",
    "BBC News",
    "CBBC",
    "CBeebies",
  ];

  for (const name of wanted) {
    const direct = PUBLIC_DIRECT_CHANNELS.find(
      (channel) => channel?.name === name && channel?.kind === "direct"
    );

    assert.ok(direct, `${name} direct stream should exist`);
    assert.equal(direct.sourceName, "BBC CDN Direct");
    assert.ok(Number(direct.priority || 0) >= 143);
    assert.match(String(direct.url || ""), /^https:\/\/.*akamaized\.net\/.*\.m3u8/i);

    const official = PUBLIC_DIRECT_CHANNELS.find(
      (channel) => channel?.name === name && channel?.kind === "external"
    );

    assert.ok(official, `${name} iPlayer fallback should exist`);
    assert.equal(official.sourceName, "BBC iPlayer Official");
    assert.match(
      String(official.officialUrl || official.url || ""),
      /bbc\.co\.uk\/iplayer\/live\//i
    );
  }
});

test("dead ITV relays are removed and spaced ITV names merge with ITVX cards", () => {
  const stalePlaylist = `#EXTM3U\n#EXTINF:-1 tvg-id="ITV1.uk" tvg-country="GB" group-title="UK",ITV 1\nhttp://45.14.84.37/itv1/index.m3u8\n#EXTINF:-1 tvg-id="ITV2.uk" tvg-country="GB" group-title="UK",ITV2\nhttps://xemzi.short.gy/1000012\n`;
  const stale = parseFreeTvPlaylist(stalePlaylist, {
    id: "free-tv",
    name: "Free-TV",
    priority: 100,
    category: "United Kingdom",
  });

  assert.equal(stale.length, 0);

  const expectedItvx = new Map([
    ["ITV1", "https://www.itv.com/watch?channel=itv"],
    ["ITV2", "https://www.itv.com/watch?channel=itv2"],
    ["ITV3", "https://www.itv.com/watch?channel=itv3"],
    ["ITV4", "https://www.itv.com/watch?channel=itv4"],
    ["ITVBe", "https://www.itv.com/watch?channel=itvbe"],
  ]);

  for (const [name, url] of expectedItvx) {
    const official = PUBLIC_DIRECT_CHANNELS.find(
      (channel) => channel?.name === name && channel?.kind === "external"
    );
    assert.ok(official, `${name} ITVX entry should exist`);
    assert.equal(official.sourceName, "ITVX Official");
    assert.equal(official.officialUrl || official.url, url);
    assert.ok(Number(official.priority || 0) >= 126);
  }

  const merged = dedupeMergedChannels([
    {
      id: "itv-direct",
      name: "ITV 1",
      country: "GB",
      group: "United Kingdom",
      url: "http://example.test/itv1.m3u8",
      kind: "direct",
      browserPlayable: false,
      geoRestricted: false,
      score: 999999,
      sourceName: "Old direct mirror",
      sourcePriority: 999,
      tags: ["United Kingdom"],
    },
    {
      id: "itv-official",
      name: "ITV1",
      country: "GB",
      group: "United Kingdom",
      url: "https://www.itv.com/watch?channel=itv",
      kind: "external",
      browserPlayable: true,
      geoRestricted: false,
      score: 1000,
      sourceName: "ITVX Official",
      sourcePriority: 132,
      tags: ["United Kingdom", "Official"],
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].url, "https://www.itv.com/watch?channel=itv");
  assert.equal(merged[0].sourceName, "ITVX Official");
  assert.equal(merged[0].alternatives.length, 1);
});

test("locked BBC and ITV primaries cannot be displaced by higher-scored mirrors", () => {
  const bbcLocked = PUBLIC_DIRECT_CHANNELS.find(
    (channel) => channel?.name === "BBC One" && channel?.sourceName === "BBC CDN Direct"
  );
  const itvLocked = PUBLIC_DIRECT_CHANNELS.find(
    (channel) => channel?.name === "ITV1" && channel?.sourceName === "ITVX Official"
  );

  const merged = dedupeMergedChannels([
    {
      id: "bbc-random",
      name: "BBC One",
      country: "GB",
      group: "United Kingdom",
      url: "https://example.test/bbc-one-super-high-score.m3u8",
      kind: "direct",
      browserPlayable: true,
      geoRestricted: false,
      score: 999999,
      sourceName: "Random high-score mirror",
      sourcePriority: 999,
      tags: ["United Kingdom"],
    },
    {
      ...bbcLocked,
      browserPlayable: true,
      geoRestricted: false,
      score: 1,
      sourcePriority: Number(bbcLocked?.priority || 0),
      tags: ["United Kingdom"],
    },
    {
      id: "itv-random",
      name: "ITV1",
      country: "GB",
      group: "United Kingdom",
      url: "https://example.test/itv1-super-high-score.m3u8",
      kind: "direct",
      browserPlayable: true,
      geoRestricted: false,
      score: 999999,
      sourceName: "Random high-score ITV mirror",
      sourcePriority: 999,
      tags: ["United Kingdom"],
    },
    {
      ...itvLocked,
      browserPlayable: true,
      geoRestricted: false,
      score: 1,
      sourcePriority: Number(itvLocked?.priority || 0),
      tags: ["United Kingdom", "Official"],
    },
  ]);

  const bbc = merged.find((channel) => channel?.name === "BBC One");
  const itv = merged.find((channel) => channel?.name === "ITV1");

  assert.equal(bbc?.sourceName, "BBC CDN Direct");
  assert.equal(bbc?.url, bbcLocked?.url);
  assert.equal(itv?.sourceName, "ITVX Official");
  assert.equal(itv?.url, itvLocked?.url);
});

test("EV SPORTS remains above ANT SPORTS in source priority", () => {
  assert.ok(EV_SPORTS_SOURCE_PRIORITY > ANT_SPORTS_LIVE_PRIORITY);
  assert.ok(EV_SPORTS_SOURCE_PRIORITY > ANT_SPORTS_UPCOMING_PRIORITY);
  assert.ok(EV_SPORTS_BASE_SCORE > 5200);
});

test("UK playlist category supplies GB when rows omit country metadata", () => {
  const playlist = `#EXTM3U\n#EXTINF:-1 tvg-id="opaque-id" group-title="Entertainment",UK Test Channel\nhttps://example.test/uk-test.m3u8\n`;
  const [channel] = parseFreeTvPlaylist(playlist, {
    id: "uk-category-test",
    name: "UK Category Test",
    priority: 100,
    category: "United Kingdom",
  });

  assert.ok(channel);
  assert.equal(channel.country, "GB");
});

test("FAST country groups and Formula 1 names become correctly tagged motorsport", () => {
  const playlist = `#EXTM3U\n#EXTINF:-1 tvg-id="US600011Q2" group-title="United States",Formula 1 Channel\nhttps://example.test/formula-one.m3u8\n`;
  const [channel] = parseFreeTvPlaylist(playlist, {
    id: "fast-global-test",
    name: "FAST Global Test",
    priority: 80,
    category: "Worldwide",
  });

  assert.ok(channel);
  assert.equal(channel.country, "US");
  assert.ok(channel.tags.includes("Sports"));
  assert.ok(channel.tags.includes("Motorsport"));
});

test("duplicate UK feeds merge and prefer an open source over a geo-restricted mirror", () => {
  const merged = dedupeMergedChannels([
    {
      id: "bbc-a",
      name: "BBC One HD",
      tvgId: "BBC.One.Lon.HD.uk",
      country: "GB",
      group: "United Kingdom",
      url: "https://geo.example.test/bbc.m3u8",
      kind: "direct",
      browserPlayable: true,
      geoRestricted: true,
      score: 5000,
      sourceName: "Geo mirror",
      sourcePriority: 120,
      tags: ["United Kingdom"],
    },
    {
      id: "bbc-b",
      name: "BBC One",
      tvgId: "BBC.One.Lon.HD.uk@backup",
      country: "UK",
      group: "United Kingdom",
      url: "https://open.example.test/bbc.m3u8",
      kind: "direct",
      browserPlayable: true,
      geoRestricted: false,
      score: 1000,
      sourceName: "Open mirror",
      sourcePriority: 90,
      tags: ["United Kingdom"],
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].url, "https://open.example.test/bbc.m3u8");
  assert.equal(merged[0].country, "GB");
  assert.equal(merged[0].alternatives.length, 1);
});

test("provider-decorated FAST aliases collapse into one visible channel", () => {
  const merged = dedupeMergedChannels([
    {
      id: "masterchef-a",
      name: "MasterChef UK Powered by Banijay",
      country: "GB",
      group: "Entertainment",
      url: "https://one.example.test/masterchef.m3u8",
      kind: "direct",
      browserPlayable: true,
      score: 100,
      sourceName: "One",
      sourcePriority: 80,
      tags: ["United Kingdom"],
    },
    {
      id: "masterchef-b",
      name: "MasterChef UK",
      country: "GB",
      group: "Entertainment",
      url: "https://two.example.test/masterchef.m3u8",
      kind: "direct",
      browserPlayable: true,
      score: 200,
      sourceName: "Two",
      sourcePriority: 90,
      tags: ["United Kingdom"],
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].alternatives.length, 1);
  assert.equal(merged[0].name, "MasterChef UK");
});

test("Live TV learning quarantines repeated failures and rehabilitates after success", () => {
  window.localStorage.clear();
  const url = "https://health.example.test/channel.m3u8";

  recordLiveTvPlaybackResult(url, { success: false });
  recordLiveTvPlaybackResult(url, { success: false });
  assert.equal(liveTvUrlQuarantined(url), true);
  assert.ok(liveTvUrlScore(url) < 0);

  recordLiveTvPlaybackResult(url, { success: true, startupMs: 1200 });
  assert.equal(liveTvUrlQuarantined(url), false);
  assert.ok(liveTvUrlScore(url) > -10000);
});

test("debrid strategy preserves tracker-backed torrents as rd_magnet", () => {
  const trackerBackedComet = {
    cometUncached: true,
    resolutionStrategy: "comet_uncached",
    torrentTrackers: ["udp://tracker.example.test:80/announce"],
  };

  assert.equal(debridTorrentHasMetadata(trackerBackedComet), true);
  assert.equal(
    chooseDebridResolutionStrategy(trackerBackedComet),
    "rd_magnet"
  );
  assert.equal(
    chooseDebridResolutionStrategy(trackerBackedComet, { debridCached: true }),
    "cached_debrid"
  );
});

test("tracker-bearing Comet magnets use direct Real-Debrid download strategy", () => {
  const item = {
    cometUncached: true,
    resolutionStrategy: "comet_uncached",
    magnet:
      "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&tr=udp%3A%2F%2Ftracker.example.test%3A80%2Fannounce",
  };

  assert.equal(debridTorrentHasMetadata(item), true);
  assert.equal(chooseDebridResolutionStrategy(item), "rd_magnet");
});

test("opaque Comet uncached rows remain comet_uncached", () => {
  assert.equal(
    chooseDebridResolutionStrategy({ cometUncached: true }),
    "comet_uncached"
  );
});

test("cache metadata still identifies uncached provider URLs without hiding them", () => {
  const providerRow = {
    type: "provider",
    url: "https://comet.example.test/playback/hash/0",
    label: "Comet: [RD⬇️] 1080p",
  };

  assert.equal(sourceHasPendingCacheSignal(providerRow), true);
  assert.equal(
    sourceHasPendingCacheSignal({
      ...providerRow,
      runtimeReadyCached: true,
    }),
    false
  );
  assert.equal(
    sourceHasAuthoritativeCachedSignal({
      ...providerRow,
      runtimeReadyCached: true,
    }),
    true
  );
});

test("source selector shows pending and uncached rows with no readiness gate", () => {
  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );

  const start = selectorSource.indexOf(
    "export const sourceIsUserSelectable"
  );
  const end = selectorSource.indexOf(
    "const sourceReportedSeeders",
    start
  );
  const selectableBlock = selectorSource.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(selectableBlock, /!item\?\.diagnostic/);
  assert.match(selectableBlock, /type \|\| ""/);
  assert.doesNotMatch(
    selectableBlock,
    /sourceHasPendingCacheSignal|sourceHasAuthoritativeCachedSignal|debridCached|cacheRequired/
  );

  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /Shown \{selectableSourceCount\}/);
  assert.doesNotMatch(playerSource, /Ready \{selectableSourceCount\}/);
});

test("source selector recognises every uncached Real-Debrid payload shape", () => {
  assert.equal(
    sourceHasPendingCacheSignal({
      type: "provider",
      url: "https://example.test/status",
      resolution_strategy: "comet_uncached",
    }),
    true
  );
  assert.equal(
    sourceHasPendingCacheSignal({
      viaRealDebrid: true,
      url: "https://example.test/file",
      debridCacheChecked: true,
      debridCached: false,
    }),
    true
  );
  assert.equal(
    sourceHasPendingCacheSignal({
      rd_status: "waiting_files_selection",
    }),
    true
  );
  assert.equal(
    sourceHasPendingCacheSignal({
      label: "Real-Debrid downloading 42%",
    }),
    true
  );
});

test("cache state never controls manual source visibility", () => {
  const unknown = {
    type: "torrent",
    infoHash: "d".repeat(40),
    debridCacheChecked: false,
    debridCached: undefined,
    debridCacheCheckState: "unknown",
  };

  assert.equal(sourceHasPendingCacheSignal(unknown), false);

  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );
  const controlsSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerControls.jsx", import.meta.url),
    "utf8"
  );

  const start = selectorSource.indexOf(
    "export const sourceIsUserSelectable"
  );
  const end = selectorSource.indexOf(
    "const sourceReportedSeeders",
    start
  );
  const selectableBlock = selectorSource.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.doesNotMatch(
    selectableBlock,
    /sourceHasPendingCacheSignal|sourceHasAuthoritativeCachedSignal|debridCached|cacheRequired|debridCacheChecked/
  );
  assert.match(
    controlsSource,
    /complete discovered source list/
  );
  assert.doesNotMatch(
    controlsSource,
    /sourceIsUserSelectable\(item\)\s*&&\s*!\(/
  );
});

test("authoritative cached state wins over stale uncached discovery metadata", () => {
  const ready = {
    debridCached: true,
    cacheRequired: true,
    cometUncached: true,
    resolutionStrategy: "comet_uncached",
    rd_status: "downloading",
    label: "Comet: [RD⬇] 4K",
  };

  assert.equal(sourceHasAuthoritativeCachedSignal(ready), true);
  assert.equal(sourceHasPendingCacheSignal(ready), false);
});

test("Comet rows with only synthetic public trackers still use the Comet start path", () => {
  const item = {
    cometUncached: true,
    cometPlaybackUrl:
      "https://comet.example.test/playback/0123456789abcdef0123456789abcdef01234567/0",
    resolutionStrategy: "comet_uncached",
    torrentMetadataSource: "public_fallback",
    torrentTrackers: ["udp://tracker.example.test:80/announce"],
    magnet:
      "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&tr=udp%3A%2F%2Ftracker.example.test%3A80%2Fannounce",
  };

  assert.equal(debridTorrentHasMetadata(item), true);
  assert.equal(chooseDebridResolutionStrategy(item), "comet_uncached");
});

test("Real-Debrid waiting-selection race with no files remains preparing", () => {
  assert.equal(
    torrentSelectionMetadataPending({
      status: "waiting_files_selection",
      files: [],
    }),
    true
  );
  assert.equal(
    torrentSelectionMetadataPending({
      status: "waiting_files_selection",
      files: [{ id: 1, path: "/Movie.1080p.mkv" }],
    }),
    false
  );
  assert.equal(
    torrentSelectionMetadataPending({
      status: "downloading",
      files: [],
    }),
    false
  );
});

test("missing Real-Debrid file index never becomes file zero", () => {
  assert.equal(normaliseRequestedFileIndex(null), null);
  assert.equal(normaliseRequestedFileIndex(undefined), null);
  assert.equal(normaliseRequestedFileIndex(""), null);
  assert.equal(normaliseRequestedFileIndex("   "), null);
  assert.equal(normaliseRequestedFileIndex(-1), null);
  assert.equal(normaliseRequestedFileIndex("abc"), null);
  assert.equal(normaliseRequestedFileIndex(0), 0);
  assert.equal(normaliseRequestedFileIndex("3"), 3);
});

test("Real-Debrid season packs select the requested episode instead of the largest file", () => {
  const files = [
    { id: 1, path: "/Show.S01E01.1080p.mkv", bytes: 3_000_000_000 },
    { id: 2, path: "/Show.S01E02.1080p.mkv", bytes: 2_900_000_000 },
    { id: 3, path: "/Show.S01E03.1080p.mkv", bytes: 3_100_000_000 },
  ];

  const selected = chooseVideoFileForPlayback(files, {
    season: 1,
    episode: 2,
    title: "Show",
  });

  assert.equal(selected?.id, 2);
});

test("Real-Debrid explicit file index wins when it points to a playable video", () => {
  const files = [
    { id: 1, path: "/Episode.One.mkv", bytes: 2_000_000_000 },
    { id: 2, path: "/Episode.Two.mkv", bytes: 2_100_000_000 },
  ];

  const selected = chooseRequestedTorrentFileForPlayback(files, {
    file_idx: 1,
  });

  assert.equal(selected?.id, 2);
});

test("Real-Debrid automatic file selection never forces a trailer/sample over the main feature", () => {
  const files = [
    { id: 1, path: "/Oasis.Dont.Look.Back.In.Anger.1080p.mkv", bytes: 2_900_000_000 },
    { id: 2, path: "/Oasis.Dont.Look.Back.In.Anger.Trailer.1080p.mp4", bytes: 73_400_000 },
  ];

  const selected = chooseRequestedTorrentFileForPlayback(files, {
    file_idx: 1,
    title: "Oasis Dont Look Back In Anger",
  });

  assert.equal(selected?.id, 1);
});

test("Real-Debrid manual file selection honours the exact extra or bonus video", () => {
  const files = [
    { id: 1, path: "/Movie.1080p.mkv", bytes: 3_900_000_000 },
    { id: 7, path: "/Extras/Deleted.Scene.Extended.mkv", bytes: 420_000_000 },
    { id: 8, path: "/Extras/Behind.The.Scenes.mp4", bytes: 610_000_000 },
  ];

  const byId = chooseRequestedTorrentFileForPlayback(files, {
    file_id: 7,
    manual_file_selection: true,
  });
  assert.equal(byId?.id, 7);

  const byPath = chooseRequestedTorrentFileForPlayback(files, {
    file_path: "/Extras/Behind.The.Scenes.mp4",
    manual_file_selection: true,
  });
  assert.equal(byPath?.id, 8);
});

test("manual Real-Debrid extras use an isolated exact-file job and player polling", () => {
  const backend = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );
  const player = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(backend, /action === "select_torrent_file"/);
  assert.match(backend, /main movie\/episode job remains untouched/);
  assert.match(backend, /manual_file_selection:\s*true/);
  assert.match(player, /action:\s*"select_torrent_file"/);
  assert.match(player, /rdManualFileSelection/);
  assert.match(player, /manual_file_selection:\s*true/);
});

test("Real-Debrid movie selection penalises samples and prefers the titled main feature", () => {
  const files = [
    { id: 1, path: "/Sample.mkv", bytes: 12_000_000_000 },
    { id: 2, path: "/Coyote.vs.Acme.2026.1080p.mkv", bytes: 4_000_000_000 },
    { id: 3, path: "/Behind.The.Scenes.mkv", bytes: 5_000_000_000 },
  ];

  const selected = chooseVideoFileForPlayback(files, {
    title: "Coyote vs Acme",
    year: 2026,
  });

  assert.equal(selected?.id, 2);
});

test("EPG aliases handle BBC, ITV, U&, provider suffixes and keep +1 distinct", () => {
  const bbc = guideNameAliases("BBC 1 HD");
  assert.ok(bbc.includes("bbc one"));

  const itv = guideNameAliases("ITV 1 FHD");
  assert.ok(itv.includes("itv1"));

  const alibi = guideNameAliases("U&Alibi HD");
  assert.ok(alibi.includes("u and alibi"));
  assert.ok(alibi.includes("alibi"));

  const masterchef = guideNameAliases("MasterChef UK Powered by Banijay");
  assert.ok(masterchef.includes("masterchef"));

  const greatMovies = guideNameAliases("GREAT! movies on Pluto TV");
  assert.ok(greatMovies.includes("great movies"));

  const plusOne = guideNameAliases("Channel 4 +1 HD");
  assert.ok(plusOne.includes("channel 4 plus one"));
  assert.equal(plusOne.includes("channel 4"), false);

  assert.equal(
    normaliseGuideName("BBC News Channel HD"),
    "bbc news channel"
  );
});

test("Live TV ranking keeps favourites first, then UK, then recent/reliability", () => {
  const favouriteIntl = {
    favourite: true,
    uk: false,
    recentIndex: 99,
    reliability: -5000,
    sourcePriority: 10,
    quality: 480,
  };
  const healthyUk = {
    favourite: false,
    uk: true,
    recentIndex: 10,
    reliability: 9000,
    sourcePriority: 120,
    quality: 1080,
  };
  assert.ok(
    compareLiveTvRankRecords(favouriteIntl, healthyUk, "International", "BBC") < 0
  );

  const uk = { favourite: false, uk: true, recentIndex: 99, reliability: -1000 };
  const intl = { favourite: false, uk: false, recentIndex: 0, reliability: 20000 };
  assert.ok(compareLiveTvRankRecords(uk, intl, "UK", "Intl") < 0);

  const recent = { favourite: false, uk: false, recentIndex: 1, reliability: 0 };
  const reliable = { favourite: false, uk: false, recentIndex: 99, reliability: 9000 };
  assert.ok(compareLiveTvRankRecords(recent, reliable, "Recent", "Reliable") < 0);

  const evSports = {
    favourite: false,
    uk: false,
    recentIndex: 99,
    reliability: 0,
    sourcePriority: 220,
    quality: 0,
  };
  const antSports = {
    favourite: false,
    uk: false,
    recentIndex: 99,
    reliability: 0,
    sourcePriority: 110,
    quality: 0,
  };
  assert.ok(
    compareLiveTvRankRecords(evSports, antSports, "EV SPORTS", "ANT SPORTS") < 0
  );
});

test("exclusive playback retires the old surface and keeps only the active stream visible", () => {
  const fakeSurface = () => {
    const attributes = new Map();
    const styles = new Map();

    return {
      attributes,
      dataset: {},
      pauseCalls: 0,
      loadCalls: 0,
      pause() {
        this.pauseCalls += 1;
      },
      load() {
        this.loadCalls += 1;
      },
      querySelectorAll() {
        return [];
      },
      setAttribute(name, value) {
        attributes.set(String(name), String(value));
      },
      removeAttribute(name) {
        attributes.delete(String(name));
      },
      style: {
        setProperty(name, value) {
          styles.set(String(name), String(value));
        },
        removeProperty(name) {
          styles.delete(String(name));
        },
        getPropertyValue(name) {
          return styles.get(String(name)) || "";
        },
      },
    };
  };

  const firstOwner = {};
  const secondOwner = {};
  const firstSurface = fakeSurface();
  const secondSurface = fakeSurface();
  let firstStops = 0;
  let secondStops = 0;

  stopExclusivePlayback();
  assert.equal(hasExclusivePlaybackOwner(), false);

  assert.equal(
    claimExclusivePlayback(
      firstOwner,
      () => {
        firstStops += 1;
      },
      { element: firstSurface, poster: "https://img.test/first.jpg" }
    ),
    true
  );
  assert.equal(firstSurface.attributes.get("poster"), "https://img.test/first.jpg");
  assert.equal(hasExclusivePlaybackOwner(), true);

  claimExclusivePlayback(
    secondOwner,
    () => {
      secondStops += 1;
    },
    { element: secondSurface, poster: "https://img.test/second.jpg" }
  );

  assert.equal(firstStops, 1);
  assert.equal(secondStops, 0);
  assert.equal(firstSurface.pauseCalls > 0, true);
  assert.equal(firstSurface.attributes.has("poster"), false);
  assert.equal(firstSurface.style.getPropertyValue("display"), "none");
  assert.equal(firstSurface.dataset.mgPlaybackRetired, "true");
  assert.equal(secondSurface.attributes.get("poster"), "https://img.test/second.jpg");
  assert.equal(secondSurface.style.getPropertyValue("display"), "");

  releaseExclusivePlayback(firstOwner);
  assert.equal(hasExclusivePlaybackOwner(), true);

  stopExclusivePlayback();
  assert.equal(secondStops, 1);
  assert.equal(secondSurface.style.getPropertyValue("display"), "none");
  assert.equal(hasExclusivePlaybackOwner(), false);
});

test("source chooser ignores a stale native snapshot when the live list grows", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const controlsSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerControls.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /const sourceSelectorSnapshotIsStale\s*=/);
  assert.match(
    playerSource,
    /selectableSourceEntries\.length > sourceSelectorEntriesRef\.current\.length/
  );
  assert.match(
    playerSource,
    /sourceSelectorPinnedRef\.current[\s\S]{0,180}?!sourceSelectorSnapshotIsStale[\s\S]{0,180}?sourceSelectorEntriesRef\.current/
  );
  assert.doesNotMatch(playerSource, /setSourceSelectorPinned\(/);

  assert.match(controlsSource, /const sourceChoiceSnapshotIsStale\s*=/);
  assert.match(
    controlsSource,
    /selectableSourceEntries\.length > sourceChoiceEntriesRef\.current\.length/
  );
  assert.match(
    controlsSource,
    /sourceChoicePinned[\s\S]{0,150}?!sourceChoiceSnapshotIsStale[\s\S]{0,150}?sourceChoiceEntriesRef\.current/
  );
});

test("Ready count is exactly the source chooser entry count", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    playerSource,
    /const selectableSourceCount\s*=\s*selectableSourceEntries\.length/
  );
  assert.doesNotMatch(
    playerSource,
    /const selectableSourceCount\s*=\s*selectableSourceEntries\.filter/
  );
  assert.match(playerSource, /visibleSourceSelectorEntries\.map/);
});

test("a six-row fast-start snapshot cannot replace 117 cached sources", () => {
  const ready = Array.from({ length: 117 }, (_, index) => {
    const hash = (index + 1).toString(16).padStart(40, "0");

    return {
      id: `ready-${index}`,
      label: `Cached source ${index + 1}`,
      type: "rd",
      src: `magnet:?xt=urn:btih:${hash}`,
      magnet: `magnet:?xt=urn:btih:${hash}`,
      infoHash: hash,
      debridCached: true,
      debridCacheChecked: true,
    };
  });
  const waiting = Array.from({ length: 19 }, (_, index) => {
    const hash = (index + 1000).toString(16).padStart(40, "0");

    return {
      id: `waiting-${index}`,
      label: `Uncached source ${index + 1}`,
      type: "rd",
      src: `magnet:?xt=urn:btih:${hash}`,
      magnet: `magnet:?xt=urn:btih:${hash}`,
      infoHash: hash,
      debridCached: false,
      debridCacheChecked: true,
      cacheRequired: true,
    };
  });
  const staleFastStart = ready.slice(0, 6).map((item) => ({
    ...item,
    debridCached: false,
    cacheRequired: true,
  }));

  const restored = mergeCompleteSourcePool(
    staleFastStart,
    [...ready, ...waiting]
  );

  assert.equal(restored.length, 136);
  assert.equal(
    restored.filter(sourceIsConfirmedCachedForPlayback).length,
    117
  );
  assert.equal(
    restored.slice(0, 6).every((item) => item.debridCached === true),
    true
  );
  assert.deepEqual(
    new Set(restored.map((item) => item.infoHash)),
    new Set([...ready, ...waiting].map((item) => item.infoHash))
  );
});

test("background caching runs multiple candidates and retries temporary slot blocks", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /backgroundCacheControllersRef\s*=\s*useRef\(new Map\(\)\)/);
  assert.match(playerSource, /BACKGROUND_CACHE_CONCURRENCY\s*=\s*3/);
  assert.match(
    playerSource,
    /const freeWorkerCount\s*=\s*Math\.max\([\s\S]{0,260}?BACKGROUND_CACHE_CONCURRENCY[\s\S]{0,260}?backgroundCacheControllersRef\.current\.size/
  );
  assert.match(playerSource, /const batch\s*=\s*candidates\.slice\(0, freeWorkerCount\)/);
  assert.match(playerSource, /batch\.forEach\(\(candidate, batchIndex\)/);
  assert.match(
    playerSource,
    /result\.accountBlocked\s*===\s*true[\s\S]{0,260}?backgroundCacheAttemptedRef\.current\.delete\(candidate\.hash\)/
  );
  assert.match(playerSource, /BACKGROUND_CACHE_SLOT_RETRY_MS\s*=\s*5_000/);
  assert.match(playerSource, /state:\s*"waiting-slot"/);
});

test("background caching does not stop after five ready alternatives", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(playerSource, /entry\.cachedCount\s*<\s*5/);
  assert.match(
    playerSource,
    /const candidates\s*=\s*sortedSourceEntries[\s\S]{0,1800}?sourceNeedsCaching\(entry\.original\)[\s\S]{0,1800}?const batch\s*=\s*candidates\.slice\(0, freeWorkerCount\)/
  );
});

test("final player source pool comes directly from the full cache-annotated result", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    providerSource,
    /const confirmedCachedPlaybackSources\s*=\s*cacheAnnotatedCombined\.filter\([\s\S]{0,260}?sourceIsConfirmedCachedForPlayback\(item\)/
  );
  assert.match(
    providerSource,
    /const completePlaybackSourcePool\s*=\s*cacheAnnotatedCombined\.filter/
  );
  const poolStart = providerSource.indexOf(
    "const completePlaybackSourcePool"
  );
  const poolEnd = providerSource.indexOf(
    "const completePlaybackSources",
    poolStart
  );
  const poolBlock = providerSource.slice(poolStart, poolEnd);

  assert.ok(poolStart >= 0);
  assert.ok(poolEnd > poolStart);
  assert.match(poolBlock, /cacheAnnotatedCombined\.filter/);
  assert.match(poolBlock, /!item\?\.diagnostic/);
  assert.match(poolBlock, /item\?\.type !== "status"/);
  assert.doesNotMatch(
    poolBlock,
    /sourceIsConfirmedCachedForPlayback|sourceHasPendingCacheSignal|isDirectSource|isMagnetSource|cacheRequired|debridCached/
  );
  assert.match(
    providerSource,
    /const completePlaybackSources\s*=\s*orderSources\(\{[\s\S]{0,180}?sources:\s*completePlaybackSourcePool/
  );
  assert.doesNotMatch(
    providerSource,
    /cacheAuthoritativePlaybackSources/
  );
  assert.match(
    providerSource,
    /orderedSources\s*=\s*canonicalCompletePlaybackSources\.length > 0[\s\S]{0,100}?\? canonicalCompletePlaybackSources/
  );
  assert.match(
    providerSource,
    /cachedSourceCount\s*=\s*confirmedCachedPlaybackSources\.length/
  );
  assert.match(providerSource, /publishedCachedSourceCount/);
});

test("fast addon discovery never limits the configured addon list to six", () => {
  const addonSource = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(addonSource, /const selectedAddons\s*=\s*activeAddons/);
  assert.doesNotMatch(addonSource, /activeAddons\.slice\(0,\s*6\)/);
});

test("source selector stays visible with a single ready source and expands as more arrive", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const controlsSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerControls.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /selectableSourceCount > 0[\s\S]{0,220}?Source \/ quality/);
  assert.match(playerSource, /visibleSourceSelectorEntries\.map/);
  assert.match(controlsSource, /selectableSourceEntries\.length > 0/);
  assert.match(controlsSource, /visibleSourceChoices\.map/);

  // Continue Watching first publishes one fast-start source. That temporary
  // list must remain live so later cached results populate both selectors.
  assert.match(
    playerSource,
    /if \(selectableSourceEntries\.length <= 1\)[\s\S]{0,260}?sourceSelectorPinnedRef\.current = false/
  );
  assert.match(
    controlsSource,
    /if \(selectableSourceEntries\.length <= 1\)[\s\S]{0,180}?releaseSourceChoices\(\)/
  );
  assert.doesNotMatch(playerSource, /sourceSelectorReleaseTimerRef/);
  assert.doesNotMatch(controlsSource, /sourceChoiceReleaseTimerRef/);
});

test("stable source publishing keeps all 117 cached rows after a six-row fast start", () => {
  const fastStart = Array.from({ length: 6 }, (_, index) => ({
    id: `fast-${index}`,
    sourceKey: `torrent-${index}`,
    debridCached: true,
  }));
  const fullCachedPool = Array.from({ length: 117 }, (_, index) => ({
    id: `cached-${index}`,
    sourceKey: `torrent-${index % 6}`,
    debridCached: true,
  }));

  const merged = preservePublishedSourceOrder(
    fastStart,
    fullCachedPool,
    (item) => item.sourceKey
  );

  assert.equal(merged.length, 117);
  assert.deepEqual(
    merged.map((item) => item.id),
    fullCachedPool.map((item) => item.id)
  );
  assert.equal(new Set(merged.map((item) => item.id)).size, 117);

  const lateFastStart = preservePublishedSourceOrder(
    fullCachedPool,
    fastStart,
    (item) => item.sourceKey,
    {
      retainSurplusPublished: true,
    }
  );

  assert.equal(lateFastStart.length, 117);
  assert.equal(
    lateFastStart.filter((item) => item.debridCached === true).length,
    117
  );

  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    providerSource,
    /preservePublishedSourceOrder\([\s\S]{0,180}?stableDiscoveredSourceKey/
  );
  assert.match(
    providerSource,
    /preservePublishedSourceOrder\([\s\S]{0,260}?retainSurplusPublished:\s*true/
  );
});

test("the player stage pins one active video surface to the full frame", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const liveVideoSource = readFileSync(
    new URL("../src/components/mg/LiveVideo.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /data-mg-player-stage="true"/);
  assert.match(
    playerSource,
    /absolute inset-0 h-full w-full flex-none object-contain bg-black/
  );
  assert.match(liveVideoSource, /data-mg-playback-surface="true"/);
  assert.match(
    liveVideoSource,
    /claimExclusivePlayback\([\s\S]{0,180}?element:\s*video,[\s\S]{0,80}?poster/
  );
});

test("autoplay puts the three most compatible ready sources first", () => {
  const ordered = prioritiseCompatibleAutoplayEntries([
    { id: "ready-low", index: 0, autoplayReady: true, compatibility: 100 },
    { id: "not-ready", index: 1, autoplayReady: false, compatibility: 1000 },
    { id: "ready-best", index: 2, autoplayReady: true, compatibility: 400 },
    { id: "ready-third", index: 3, autoplayReady: true, compatibility: 200 },
    { id: "ready-second", index: 4, autoplayReady: true, compatibility: 300 },
  ]);

  assert.equal(COMPATIBLE_AUTOPLAY_LIMIT, 3);
  assert.deepEqual(
    ordered.slice(0, COMPATIBLE_AUTOPLAY_LIMIT).map((entry) => entry.id),
    ["ready-best", "ready-second", "ready-third"]
  );
  assert.equal(
    ordered.slice(0, COMPATIBLE_AUTOPLAY_LIMIT).some((entry) => entry.id === "not-ready"),
    false
  );
});

test("English audio rank stays ahead of compatibility in the autoplay top three", () => {
  const ordered = prioritiseCompatibleAutoplayEntries([
    {
      id: "foreign-most-compatible",
      index: 0,
      autoplayReady: true,
      languageRank: 3,
      compatibility: 1000,
    },
    {
      id: "unknown",
      index: 1,
      autoplayReady: true,
      languageRank: 2,
      compatibility: 900,
    },
    {
      id: "english",
      index: 2,
      autoplayReady: true,
      languageRank: 0,
      compatibility: 200,
    },
    {
      id: "multi-audio",
      index: 3,
      autoplayReady: true,
      languageRank: 1,
      compatibility: 500,
    },
  ]);

  assert.deepEqual(
    ordered.slice(0, COMPATIBLE_AUTOPLAY_LIMIT).map((entry) => entry.id),
    ["english", "multi-audio", "unknown"]
  );
});

test("audio tracks prefer English main audio while preserving explicit language memory", () => {
  const englishMain = {
    language: "eng",
    label: "English Main DTS-HD 5.1",
  };
  const englishCommentary = {
    label: "English Commentary AAC 2.0",
  };
  const frenchDefault = {
    language: "fr",
    label: "French Main AAC 5.1",
    default: true,
  };

  assert.equal(trackLanguage({ label: "English AAC 5.1" }), "en");
  assert.ok(
    preferredAudioTrackScore(englishMain, "en") >
      preferredAudioTrackScore(frenchDefault, "en")
  );
  assert.ok(
    preferredAudioTrackScore(englishMain, "en") >
      preferredAudioTrackScore(englishCommentary, "en")
  );

  const rememberedEnglish = {
    language: "en",
    codec: "aac",
    channels: "5.1",
    commentary: false,
    descriptive: false,
  };
  assert.ok(rememberedAudioTrackScore(frenchDefault, rememberedEnglish) < 0);
  assert.ok(
    rememberedAudioTrackScore(
      { language: "en", label: "English AAC 5.1" },
      rememberedEnglish
    ) > 0
  );
});
