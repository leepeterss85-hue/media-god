import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  dedupeMergedChannels,
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
  editionPresentationState,
  sourceEntriesForPresentation,
  sourceSortOptionsForEntries,
} from "../src/components/mg/editionCachePresentation.js";

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
  assert.match(playerSource, /const activeNeedsCaching = sourceNeedsCachingForSession\(active\)/);
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
    /if \(sourceNeedsCachingForSession\(active\)\) \{[\s\S]{0,700}?same cached source has been kept selected/
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

test("edition preference prioritises the requested cut and keeps standard/theatrical boxes exact", () => {
  const directors = { name: "Movie.Directors.Cut.1080p.mkv" };
  const extended = { name: "Movie.Extended.Edition.2160p.mkv" };
  const standard = { name: "Movie.1080p.mkv" };

  assert.ok(
    mediaEditionSortScore(directors, "directors_cut") >
      mediaEditionSortScore(extended, "directors_cut")
  );
  assert.equal(sourceHasEdition(directors, "directors_cut"), true);
  assert.equal(sourceHasEdition(extended, "directors_cut"), false);
  assert.equal(sourceHasEdition(standard, "standard"), true);
  assert.equal(sourceHasEdition(standard, "theatrical"), false);
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
  const editionPresentation = readFileSync(
    new URL("../src/components/mg/editionCachePresentation.js", import.meta.url),
    "utf8"
  );
  const player = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(labels, /detectMediaEdition/);
  assert.match(sourcePreferences, /edition:\$\{option\.value\}/);
  assert.match(sourcePreferences, /sourceEntriesForPresentation/);
  assert.match(editionPresentation, /Preparing/);
  assert.match(player, /Sort \/ edition/);
  assert.match(player, /Preparing \{selectedEditionState\.label\}/);
});

test("cached edition presentation hides uncached rows, keeps the edition visible, then exposes it after cache completion", () => {
  const toPresentationEntries = (items) =>
    items.map((item, index) => {
      const edition = detectMediaEdition(item);
      const cached =
        item?.debridCached === true ||
        item?.viaRealDebrid === true ||
        item?.runtimeReadyCached === true;
      const pendingCache =
        cached !== true &&
        (item?.cacheRequired === true ||
          item?.cometUncached === true ||
          item?.debridCacheChecked === true);

      return {
        item,
        index,
        cached,
        pendingCache,
        readyForUser: !pendingCache,
        editionValue: edition.value,
        editionLabel: edition.label,
      };
    });

  const initialSources = [
    {
      label: "Movie Standard 1080p Cached",
      debridCached: true,
      infoHash: "1111111111111111111111111111111111111111",
    },
    {
      label: "Movie Directors Cut 2160p",
      description: "Director's Cut",
      infoHash: "2222222222222222222222222222222222222222",
      magnet: "magnet:?xt=urn:btih:2222222222222222222222222222222222222222",
      cacheRequired: true,
      debridCacheChecked: true,
      debridCached: false,
      reportedSeeders: 42,
    },
    {
      label: "Movie Directors Cut 1080p",
      description: "Director's Cut",
      infoHash: "3333333333333333333333333333333333333333",
      magnet: "magnet:?xt=urn:btih:3333333333333333333333333333333333333333",
      cacheRequired: true,
      debridCacheChecked: true,
      debridCached: false,
      reportedSeeders: 20,
    },
  ];

  const initialEntries = toPresentationEntries(initialSources);
  const initialPresented = sourceEntriesForPresentation(
    initialEntries,
    "edition:directors_cut"
  );
  const initialState = editionPresentationState(
    initialEntries,
    "edition:directors_cut"
  );
  const options = sourceSortOptionsForEntries(
    initialEntries,
    "edition:directors_cut"
  );

  assert.equal(initialPresented.length, 0);
  assert.equal(initialState.preparing, true);
  assert.equal(initialState.pendingCount, 2);
  assert.match(
    options.find((option) => option.value === "edition:directors_cut")?.label || "",
    /Preparing/
  );

  const afterCacheSources = initialSources.map((item, index) =>
    index === 1
      ? {
          ...item,
          cacheRequired: false,
          debridCached: true,
          runtimeReadyCached: true,
        }
      : item
  );
  const afterEntries = toPresentationEntries(afterCacheSources);
  const afterPresented = sourceEntriesForPresentation(
    afterEntries,
    "edition:directors_cut"
  );
  const afterState = editionPresentationState(
    afterEntries,
    "edition:directors_cut"
  );

  assert.equal(afterPresented.length, 1);
  assert.equal(afterPresented[0].index, 1);
  assert.equal(afterState.preparing, false);
  assert.equal(afterState.readyCount, 1);

  const bestEntries = sourceEntriesForPresentation(
    afterEntries,
    "best"
  );
  assert.equal(bestEntries.length, 2);
  assert.deepEqual(
    bestEntries.map((entry) => entry.index).sort((a, b) => a - b),
    [0, 1]
  );
});

test("country normalisation keeps UK/GB and USA/US consistent", () => {
  assert.equal(normaliseCountryCode("UK"), "GB");
  assert.equal(normaliseCountryCode("GBR"), "GB");
  assert.equal(normaliseCountryCode("USA"), "US");
  assert.equal(normaliseCountryCode("United States"), "US");
  assert.equal(normaliseCountryCode("United Kingdom"), "GB");
  assert.equal(normaliseCountryCode("GB;IE"), "GB");
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
