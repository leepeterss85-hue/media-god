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
  torrentFileIdentityMismatchReason,
  torrentFileMatchesRequestedIdentity,
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
import {
  filterSourcesForRequestedIdentity,
  sourceIdentityMismatchReason,
  sourceMatchesRequestedIdentity,
} from "../src/components/mg/sourceIdentity.js";
import {
  sourceIsAioStreamsCandidate,
  sourceLooksTorrentLike,
} from "../src/components/mg/sourceProviderIdentity.js";
import {
  bestSmartUpgradeEntry,
  clearSmartSourceHistoryForTests,
  detectSmartSourceUpgrade,
  recordSmartSourceBaseline,
  smartSourceEvidence,
  sourceAudioTier,
  sourceReleaseTier,
} from "../src/components/mg/smartSourceSelection.js";

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

test("smart VOD language evidence trusts real audio metadata before release tags", () => {
  const verifiedEnglish = smartSourceEvidence(
    {
      label: "Movie.2026.FRENCH.1080p.WEB-DL",
      mediaInfo: {
        streams: [
          { codec_type: "audio", language: "eng", codec_name: "eac3" },
          { codec_type: "video", codec_name: "h264" },
        ],
      },
    },
    "foreign"
  );

  const taggedEnglish = smartSourceEvidence(
    { label: "Movie.2026.ENG.1080p.WEB-DL" },
    "english"
  );
  const multilingual = smartSourceEvidence(
    { label: "Movie.2026.MULTI.1080p.WEB-DL" },
    "multi"
  );
  const foreignOnly = smartSourceEvidence(
    { label: "Movie.2026.FRENCH.1080p.WEB-DL" },
    "foreign"
  );
  const misleadingEnglishFilename = smartSourceEvidence(
    {
      label: "Movie.2026.ENG.MULTI.1080p.WEB-DL",
      mediaInfo: {
        streams: [
          { codec_type: "audio", language: "fra", codec_name: "eac3" },
        ],
      },
    },
    "english"
  );

  assert.equal(verifiedEnglish.languageRank, 0);
  assert.equal(verifiedEnglish.languageVerified, true);
  assert.equal(taggedEnglish.languageRank, 1);
  assert.equal(multilingual.languageRank, 2);
  assert.equal(foreignOnly.languageRank, 4);
  assert.equal(misleadingEnglishFilename.languageRank, 4);
  assert.equal(misleadingEnglishFilename.languageVerified, true);
});

test("smart VOD quality tiers prefer remux and modern audio without hiding alternatives", () => {
  assert.equal(
    sourceReleaseTier({ label: "Movie.2026.2160p.BluRay.REMUX" }).rank,
    0
  );
  assert.ok(
    sourceReleaseTier({ label: "Movie.2026.1080p.WEB-DL" }).rank <
      sourceReleaseTier({ label: "Movie.2026.1080p.WEBRip" }).rank
  );
  assert.ok(
    sourceAudioTier({ audioCodec: "TrueHD Atmos" }).rank <
      sourceAudioTier({ audioCodec: "AAC 2.0" }).rank
  );

  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /All sources \/ quality/);
  assert.match(playerSource, /manualSourceLockActive\(\)/);
  assert.match(selectorSource, /Source visibility is intentionally independent of cache\/readiness state/);
});

test("smart VOD history flags a materially better version on a later visit", () => {
  clearSmartSourceHistoryForTests();

  const context = {
    mediaType: "movie",
    imdbId: "tt-smart-upgrade-test",
    title: "Upgrade Test",
    year: 2026,
  };

  const oldEntry = {
    index: 0,
    languageRank: 1,
    releaseTierRank: 3,
    releaseTierLabel: "WEB-DL",
    audioTierRank: 3,
    audioTierLabel: "Modern compressed",
    resolution: 1080,
    compatibilityTier: 1,
    cached: true,
    item: {
      infoHash: "a".repeat(40),
      label: "Upgrade.Test.2026.1080p.WEB-DL.ENG.AAC",
    },
  };

  const newEntry = {
    index: 1,
    languageRank: 0,
    releaseTierRank: 0,
    releaseTierLabel: "Remux",
    audioTierRank: 0,
    audioTierLabel: "Lossless",
    resolution: 2160,
    compatibilityTier: 1,
    cached: true,
    item: {
      infoHash: "b".repeat(40),
      label: "Upgrade.Test.2026.2160p.BluRay.REMUX.ENG.TrueHD",
      mediaInfo: {
        streams: [
          { codec_type: "audio", language: "eng", codec_name: "truehd" },
        ],
      },
    },
  };

  recordSmartSourceBaseline(context, oldEntry);
  const upgrade = detectSmartSourceUpgrade(context, newEntry);

  assert.equal(upgrade.available, true);
  assert.equal(bestSmartUpgradeEntry([oldEntry, newEntry]), newEntry);
});

test("smart ranking is explicitly bypassed for Live TV", () => {
  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );
  const orderSource = readFileSync(
    new URL("../src/components/mg/automaticSourceOrder.js", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    selectorSource,
    /String\(options\?\.mediaType \|\| ""\)\.toLowerCase\(\) !== "live"/
  );
  assert.match(orderSource, /compareLegacyEntries/);
  assert.match(playerSource, /\{ mediaType: playbackMediaType \}/);

  const legacyLiveOrder = prioritiseCompatibleAutoplayEntries([
    {
      id: "english-but-incompatible-live",
      index: 0,
      smartRankingEnabled: false,
      autoplayReady: true,
      compatibilityTier: 3,
      languageRank: 0,
      compatibility: 5000,
    },
    {
      id: "foreign-but-compatible-live",
      index: 1,
      smartRankingEnabled: false,
      autoplayReady: true,
      compatibilityTier: 0,
      languageRank: 3,
      compatibility: 1000,
    },
  ]);

  assert.deepEqual(
    legacyLiveOrder.map((entry) => entry.id),
    ["foreign-but-compatible-live", "english-but-incompatible-live"]
  );
});

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
  assert.match(playerSource, /Pending\/uncached \{Number\(source\?\.sourceDiagnostics\?\.pendingSourceCount/);
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

test("missing successful-provider cache entries stay unknown for retry", () => {
  const hash = "f".repeat(40);
  const result = classifyDebridCacheCheck(
    {
      providersChecked: ["realdebrid"],
      cached: {
        realdebrid: {},
      },
      providerStats: {
        realdebrid: {
          latencyMs: 70,
          error: "",
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

test("retired Real-Debrid availability endpoint is not used for cache truth", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const backendSource = readFileSync(
    new URL("../base44/functions/multiDebrid/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(providerSource, /DEBRID_CACHE_BATCH_SIZE\s*=\s*100/);
  assert.match(providerSource, /debridCacheChecked:\s*false/);
  assert.match(providerSource, /debridCacheCheckState:\s*"unknown"/);
  assert.doesNotMatch(
    backendSource,
    /requestJson\([\s\S]{0,180}?torrents\/instantAvailability/
  );
  assert.match(
    backendSource,
    /Real-Debrid removed \/torrents\/instantAvailability/
  );
});

test("VOD discovery keeps a credential-free fallback when user addon rows are unavailable", () => {
  const serverSource = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );
  const browserSource = readFileSync(
    new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url),
    "utf8"
  );

  for (const source of [serverSource, browserSource]) {
    assert.match(source, /BUILTIN_PUBLIC_PLAYBACK_ADDONS/);
    assert.match(source, /https:\/\/torrentio\.strem\.fun\/manifest\.json/);
    assert.match(source, /withBuiltinPlaybackAddons\(addons\)/);
  }

  assert.match(serverSource, /let\s+user\s*=\s*null/);
  assert.match(serverSource, /user\s*=\s*await base44\.auth\.me\(\)/);
  assert.doesNotMatch(
    serverSource,
    /if\s*\(\s*!user\s*\)[\s\S]{0,260}?Unauthorized/
  );
  assert.match(
    serverSource,
    /if\s*\(\s*user\s*\)[\s\S]{0,320}?base44\.entities\.Addon\.list/
  );

  assert.match(
    browserSource,
    /catch \{[\s\S]{0,420}?addons\s*=\s*\[\];/
  );
});

test("empty VOD discovery never fabricates a selectable generic Stream row", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /const fallbackSourceUrl\s*=\s*getSourceUrl\(source\)/);
  assert.match(playerSource, /"Finding playback sources…"/);
  assert.match(playerSource, /type:\s*"status"/);
  assert.match(playerSource, /diagnostic:\s*true/);
  assert.doesNotMatch(
    playerSource,
    /:\s*\[\s*\{[\s\S]{0,220}?type:\s*source\?\.type\s*\|\|\s*"rd"/
  );
});

test("addon-confirmed cached RD sources keep every ready URL without a five-source ceiling", () => {
  const serverSource = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );
  const browserSource = readFileSync(
    new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url),
    "utf8"
  );
  const trustedSource = readFileSync(
    new URL("../src/components/mg/trustedCachedSources.js", import.meta.url),
    "utf8"
  );

  for (const source of [serverSource, browserSource]) {
    assert.match(source, /addonDebridCacheSignal/);
    assert.match(source, /cacheSignal\.resolvedUrl/);
    assert.match(source, /runtimeReadyCached:\s*true/);
    assert.match(source, /resolutionStrategy:\s*"cached_debrid"/);
    assert.match(source, /cachedResolvedUrl/);
  }

  assert.doesNotMatch(trustedSource, /TRUSTED_CACHED_PER_EDITION/);
  assert.doesNotMatch(trustedSource, /slice\(0,[^\n]*perEdition/);
});

test("modern RD cache markers are authoritative cached signals", () => {
  assert.equal(
    sourceHasAuthoritativeCachedSignal({ label: "[RD+] Torrentio 1080p" }),
    true
  );
  assert.equal(
    sourceHasAuthoritativeCachedSignal({ label: "[RD⚡] Comet 2160p" }),
    true
  );
  assert.equal(
    sourceHasAuthoritativeCachedSignal({
      cacheStatus: "ready",
      label: "Resolved Real-Debrid source",
    }),
    true
  );
  assert.equal(
    sourceHasAuthoritativeCachedSignal({ label: "[RD⬇] Comet" }),
    false
  );
  assert.equal(
    sourceHasPendingCacheSignal({
      label: "[RD⬇] Comet",
      cacheRequired: true,
    }),
    true
  );
});
test("year-specific franchise lookups never fall back to a bare title", () => {
  const serverSource = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );
  const browserSource = readFileSync(
    new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url),
    "utf8"
  );

  assert.match(serverSource, /: year\s*\?\s*`search:\$\{title\}:\$\{year\}/);
  assert.match(
    browserSource,
    /: clean\(year\)\s*\?\s*`search:\$\{suppliedTitle\}:\$\{clean\(year\)\}/
  );
  assert.match(serverSource, /title &&\s*!year &&/);
  assert.match(browserSource, /suppliedTitle &&\s*!clean\(year\) &&/);
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

test("movie source identity rejects wrong franchise years, sequel numbers and audio-only files", () => {
  const request = {
    title: "Resident Evil",
    year: "2026",
    mediaType: "movie",
  };

  assert.equal(
    sourceIdentityMismatchReason(
      { label: "Torrentio: Resident.Evil.2.2004.1080p.BluRay.x265.mkv" },
      request
    ),
    "conflicting_release_year"
  );

  assert.equal(
    sourceIdentityMismatchReason(
      { label: "Comet: Resident Evil 2 Audio" },
      request
    ),
    "audio_only_release"
  );

  assert.equal(
    sourceIdentityMismatchReason(
      { label: "Comet: Resident Evil 2 1080p WEB-DL" },
      { title: "Resident Evil", mediaType: "movie" }
    ),
    "conflicting_sequel_number"
  );

  assert.equal(
    sourceMatchesRequestedIdentity(
      { label: "Torrentio: Resident.Evil.2026.2160p.WEB-DL.DDP5.1.H.265" },
      request
    ),
    true
  );

  assert.equal(
    sourceMatchesRequestedIdentity(
      { label: "Torrentio: Resident Evil 2160p WEB-DL DDP5.1" },
      request
    ),
    true
  );

  assert.deepEqual(
    filterSourcesForRequestedIdentity(
      [
        { label: "Resident Evil 2026 1080p WEB-DL" },
        { label: "Resident Evil 2 2004 1080p BluRay" },
        { label: "Resident Evil OST FLAC" },
      ],
      request
    ).map((item) => item.label),
    ["Resident Evil 2026 1080p WEB-DL"]
  );
});

test("long-running TV episode releases are not rejected by the series premiere year", () => {
  const request = {
    title: "The Simpsons",
    year: "1989",
    mediaType: "tv",
  };

  assert.equal(
    sourceIdentityMismatchReason(
      {
        label:
          "The.Simpsons.S36E01.2025.1080p.WEB-DL.DDP5.1.H.264",
      },
      request
    ),
    ""
  );

  assert.equal(
    sourceMatchesRequestedIdentity(
      {
        filename:
          "The.Simpsons.S37E03.2026.1080p.WEB-DL.mkv",
      },
      request
    ),
    true
  );

  assert.equal(
    sourceIdentityMismatchReason(
      {
        label:
          "The Simpsons S36E01 soundtrack FLAC",
      },
      request
    ),
    "audio_only_release"
  );
});

test("official alternate movie titles can satisfy strict source identity without weakening year checks", () => {
  const request = {
    title: "Hardcore Henry",
    year: "2015",
    mediaType: "movie",
    alternateTitles: ["Hardcore"],
  };

  assert.equal(
    sourceIdentityMismatchReason(
      { filename: "Hardcore.2015.1080p.BluRay.x264.mkv" },
      request
    ),
    ""
  );

  assert.equal(
    sourceIdentityMismatchReason(
      { filename: "Hardcore.2016.1080p.BluRay.x264.mkv" },
      request
    ),
    "conflicting_release_year"
  );

  assert.equal(
    sourceIdentityMismatchReason(
      { filename: "Hardcore.2016.1080p.BluRay.x264.mkv" },
      {
        ...request,
        alternateYears: ["2016"],
      }
    ),
    ""
  );

  assert.equal(
    sourceIdentityMismatchReason(
      { filename: "Hardcore.2017.1080p.BluRay.x264.mkv" },
      {
        ...request,
        alternateYears: ["2016"],
      }
    ),
    "conflicting_release_year"
  );

  assert.equal(
    sourceIdentityMismatchReason(
      { filename: "Hardcore.2015.1080p.BluRay.x264.mkv" },
      {
        title: "Hardcore Henry",
        year: "2015",
        mediaType: "movie",
      }
    ),
    "conflicting_release_title"
  );

  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const resolverSource = readFileSync(
    new URL("../base44/functions/resolveImdb/entry.ts", import.meta.url),
    "utf8"
  );
  const rdSource = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(resolverSource, /alternative_titles/);
  assert.match(resolverSource, /alternate_titles:\s*alternateTitles/);
  assert.match(resolverSource, /release_dates/);
  assert.match(resolverSource, /alternate_years:\s*alternateYears/);
  assert.match(providerSource, /identityAlternateTitles/);
  assert.match(providerSource, /identityAlternateYears/);
  assert.match(providerSource, /alternateTitles:\s*addonArgs\.alternateTitles/);
  assert.match(providerSource, /alternate_titles:[\s\S]{0,100}?alternateTitles/);
  assert.match(rdSource, /body\.alternate_titles/);
  assert.match(rdSource, /titleProfiles/);
});

test("Real-Debrid file selection accepts verified adjacent release years for renamed films", () => {
  const files = [
    {
      id: 1,
      path: "Hardcore.2015.1080p.BluRay.x264.mkv",
      bytes: 5_000_000_000,
    },
  ];

  assert.equal(
    chooseRequestedTorrentFileForPlayback(files, {
      title: "Hardcore Henry",
      year: "2016",
      alternateYears: ["2015"],
    })?.id,
    1
  );

  assert.equal(
    chooseRequestedTorrentFileForPlayback(files, {
      title: "Hardcore Henry",
      year: "2016",
    }),
    null
  );

  const backend = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );
  const cacheEngine = readFileSync(
    new URL("../src/components/mg/realDebridCacheEngine.js", import.meta.url),
    "utf8"
  );
  const player = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const resolver = readFileSync(
    new URL("../base44/functions/resolveImdb/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    resolver,
    /adjacentMovieReleaseYear[\s\S]{0,180}?Math\.abs\(Number\(recordYear\) - Number\(requestedYear\)\) === 1/
  );
  assert.match(
    backend,
    /alternateYears:\s*alternateYearsFromBody\(body\)/
  );
  assert.match(
    backend,
    /alternateTitles:\s*alternateTitlesFromBody\(body\)/
  );
  assert.match(cacheEngine, /const identityFields =/);
  assert.match(cacheEngine, /alternate_years:/);
  assert.match(cacheEngine, /alternate_titles:/);
  assert.match(player, /alternateYears:/);
  assert.match(player, /alternateTitles:/);

  const resolveBestStart = player.indexOf(
    'action:\n                    "resolve_best"'
  );
  const resolveBestEnd = player.indexOf(
    "if (\n              cancelled",
    resolveBestStart
  );
  assert.ok(resolveBestStart >= 0 && resolveBestEnd > resolveBestStart);
  const resolveBestBlock = player.slice(resolveBestStart, resolveBestEnd);
  assert.match(resolveBestBlock, /alternate_years:/);
  assert.match(resolveBestBlock, /alternate_titles:/);
});

test("addon and RD fast-start paths both enforce requested source identity", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(providerSource, /filterSourcesForRequestedIdentity/);
  assert.match(providerSource, /sourceMatchesRequestedIdentity/);
  assert.match(
    providerSource,
    /Real-Debrid library match rejected because it belongs to a different release/
  );
});

test("verified movie/TV title conflicts keep the canonical media identity", () => {
  const catalogSource = readFileSync(
    new URL("../base44/functions/getTmdbMovies/entry.ts", import.meta.url),
    "utf8"
  );
  const searchSource = readFileSync(
    new URL("../src/components/mg/SearchDialog.jsx", import.meta.url),
    "utf8"
  );
  const homeSource = readFileSync(
    new URL("../src/pages/Home.jsx", import.meta.url),
    "utf8"
  );

  assert.match(catalogSource, /SEARCH_IDENTITY_CORRECTIONS/);
  assert.match(catalogSource, /tmdb_id:\s*1198654/);
  assert.match(catalogSource, /imdb_id:\s*'tt29714073'/);
  assert.match(catalogSource, /'bad apple'/);
  assert.match(catalogSource, /'bad apples'/);
  assert.match(catalogSource, /fetchSearchIdentityCorrections/);
  assert.match(catalogSource, /identity_corrected:\s*true/);

  const mapItemStart = catalogSource.indexOf("const mapItem =");
  const mapItemEnd = catalogSource.indexOf("const fetchSearchIdentityCorrections", mapItemStart);
  assert.ok(mapItemStart >= 0);
  assert.ok(mapItemEnd > mapItemStart);

  const mapItemSource = catalogSource.slice(mapItemStart, mapItemEnd);
  const forcedMovieIndex = mapItemSource.indexOf("forcedType === 'movie'");
  const staleTmdbTypeIndex = mapItemSource.indexOf("m?.media_type === 'tv'");
  assert.ok(forcedMovieIndex >= 0);
  assert.ok(staleTmdbTypeIndex > forcedMovieIndex);

  assert.match(searchSource, /identity_corrected === true/);
  assert.match(searchSource, /aliases\.includes\(wanted\)/);
  assert.match(searchSource, /return 1200/);

  const explicitMovieIndex = homeSource.indexOf('type === "movie"');
  const firstAirIndex = homeSource.indexOf("item?.first_air_date");
  assert.ok(explicitMovieIndex >= 0);
  assert.ok(firstAirIndex > explicitMovieIndex);
});

test("player context is owned above the authenticated routes tree", () => {
  const appSource = readFileSync(
    new URL("../src/App.jsx", import.meta.url),
    "utf8"
  );
  const homeSource = readFileSync(
    new URL("../src/pages/Home.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    appSource,
    /import \{ PlayerProvider \} from '@\/components\/mg\/PlayerProvider\.jsx';/
  );
  assert.match(
    appSource,
    /const appRoutes = \([\s\S]{0,120}<Routes>/
  );
  assert.match(
    appSource,
    /return isAuthenticated \|\| isGuest[\s\S]{0,120}<PlayerProvider>\{appRoutes\}<\/PlayerProvider>/
  );
  assert.doesNotMatch(
    appSource,
    /<PlayerProvider>[\s\S]{0,240}<ProtectedRoute/
  );
  assert.doesNotMatch(homeSource, /<PlayerProvider>/);
  assert.match(
    homeSource,
    /from "@\/components\/mg\/PlayerProvider\.jsx";/
  );
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

test("Real-Debrid movie file selection rejects wrong franchise films before playback", () => {
  const request = {
    title: "Resident Evil",
    year: "2026",
  };

  assert.equal(
    torrentFileIdentityMismatchReason(
      { path: "Resident.Evil.Apocalypse.2004.2160p.UHD.BluRay.mkv" },
      request
    ),
    "conflicting_release_year"
  );
  assert.equal(
    torrentFileIdentityMismatchReason(
      { path: "Resident Evil 2 1080p WEB-DL.mkv" },
      { title: "Resident Evil" }
    ),
    "conflicting_sequel_number"
  );
  assert.equal(
    torrentFileIdentityMismatchReason(
      { path: "Resident Evil Original Soundtrack OST.mkv" },
      request
    ),
    "audio_only_file"
  );

  const files = [
    {
      id: 1,
      path: "Resident.Evil.Apocalypse.2004.2160p.UHD.BluRay.mkv",
      bytes: 35_000_000_000,
    },
    {
      id: 2,
      path: "Resident.Evil.2026.1080p.WEB-DL.mkv",
      bytes: 8_000_000_000,
    },
    {
      id: 3,
      path: "Resident.Evil.2.Audio.2004.mkv",
      bytes: 40_000_000_000,
    },
  ];

  assert.equal(
    chooseVideoFileForPlayback(files, request)?.id,
    2
  );

  assert.equal(
    chooseRequestedTorrentFileForPlayback(
      files,
      { ...request, file_idx: 0 }
    )?.id,
    2
  );

  assert.equal(
    chooseVideoFileForPlayback(
      [files[0], files[2]],
      request
    ),
    null
  );

  assert.equal(
    torrentFileMatchesRequestedIdentity(files[1], request),
    true
  );
});

test("player torrent-file selector hides mismatched franchise files", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /identitySafeRdFiles/);
  assert.match(playerSource, /sourceMatchesRequestedIdentity/);
  assert.match(
    playerSource,
    /visibleRdFileSelectorFiles[\s\S]{0,220}identitySafeRdFiles/
  );
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

test("background caching continues after foreground reaches ready", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /const backgroundForegroundStatus/);
  assert.match(playerSource, /"ready",[\s\S]{0,220}?"cached"/);
  assert.match(playerSource, /backgroundForegroundBusy/);
  assert.doesNotMatch(
    playerSource,
    /rdPreparation\s*&&\s*!\["stalled", "failed", "error"\]/
  );
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

  assert.match(playerSource, /selectableSourceCount > 0[\s\S]{0,220}?All sources \/ quality/);
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

test("all catalogue VOD entry points inherit the central strict playback policy", () => {
  const wrapperSource = readFileSync(
    new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(wrapperSource, /applyReliableVodPolicy/);
  assert.match(
    wrapperSource,
    /verifiedPlaybackPolicy:\s*"strict"/
  );
  assert.match(
    wrapperSource,
    /allowNonPlaybackFallback:\s*false/
  );
  assert.match(
    wrapperSource,
    /core\.play\(reliableRequest\)/
  );
  assert.match(
    wrapperSource,
    /core\.prepare\([\s\S]{0,120}applyReliableVodPolicy/
  );

  const catalogueLaunchers = [
    "../src/components/mg/MediaCard.jsx",
    "../src/components/mg/DetailModal.jsx",
    "../src/components/mg/EpisodeSelector.jsx",
    "../src/components/mg/NewEpisodesRow.jsx",
    "../src/components/mg/ContinueWatchingRow.jsx",
    "../src/components/mg/RecentlyWatchedRow.jsx",
    "../src/components/mg/WatchlistView.jsx",
    "../src/components/mg/FavoritesView.jsx",
    "../src/components/mg/RoadmapView.jsx",
  ];

  catalogueLaunchers.forEach((relativePath) => {
    const launcherSource = readFileSync(
      new URL(relativePath, import.meta.url),
      "utf8"
    );

    assert.match(
      launcherSource,
      /@\/components\/mg\/PlayerProvider/
    );
    assert.doesNotMatch(
      launcherSource,
      /@\/components\/mg\/MediaPlayerProvider|\.\/MediaPlayerProvider\.jsx/
    );
  });
});

test("Best available globally wires the AIOStreams fallback rank into central VOD ordering", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );

  assert.match(
    providerSource,
    /return sortSourceEntries\([\s\S]{0,180}?languageOrdered,[\s\S]{0,120}?sortMode,[\s\S]{0,180}?mediaType: onlyLiveSources \? "live" : "vod"[\s\S]{0,120}?\)\.map\(\(entry\) => entry\.item\)/
  );
  assert.match(
    selectorSource,
    /aioStreamsFallback:\s*sourceIsAioStreamsCandidate\(item\)/
  );
  assert.match(
    selectorSource,
    /hasNonAioTorrentCandidate[\s\S]{0,420}?left\.aioStreamsFallback[\s\S]{0,220}?right\.aioStreamsFallback/
  );
  assert.match(
    selectorSource,
    /return prioritiseCompatibleAutoplayEntries\(fallbackRanked\)/
  );
});

test("central provider keeps AIOStreams as an automatic last-resort instead of removing it", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(providerSource, /const automaticVodCandidatePool =/);
  assert.match(
    providerSource,
    /const nonAio = list\.filter[\s\S]{0,180}?sourceIsAioStreamsCandidate/
  );
  assert.match(
    providerSource,
    /const aio = list\.filter[\s\S]{0,180}?sourceIsAioStreamsCandidate/
  );
  assert.match(
    providerSource,
    /return \[[\s\S]{0,80}?\.\.\.nonAio,[\s\S]{0,80}?\.\.\.aio/
  );
  assert.match(
    providerSource,
    /items:\s*automaticCandidates/
  );
  assert.match(
    providerSource,
    /items:\s*automaticFastCandidates/
  );
  assert.match(
    providerSource,
    /items:\s*automaticQualificationCandidates/
  );
  assert.match(
    providerSource,
    /automaticVodCandidatePool\([\s\S]{0,140}?confirmedCachedPlaybackSources/
  );

  const completePoolStart = providerSource.indexOf(
    "const completePlaybackSourcePool"
  );
  const canonicalPoolStart = providerSource.indexOf(
    "const canonicalCompletePlaybackSources",
    completePoolStart
  );
  assert.ok(completePoolStart >= 0 && canonicalPoolStart > completePoolStart);

  const chooserPoolBlock = providerSource.slice(
    completePoolStart,
    canonicalPoolStart + 500
  );

  assert.doesNotMatch(
    chooserPoolBlock,
    /sourceIsAioStreamsCandidate/
  );
});

test("next episode preload only hands off verified prepared sources", () => {
  const wrapperSource = readFileSync(
    new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    wrapperSource,
    /prepared\?\.verifiedPlaybackPolicy !== "strict"[\s\S]{0,100}prepared\?\.verifiedPrepared === true/
  );
  assert.match(
    providerSource,
    /verifiedPrepared:[\s\S]{0,100}verifiedSources\.length > 0/
  );
  assert.match(
    providerSource,
    /discoveredSources:\s*ordered/
  );
});

test("automatic English playback requires a proven non-commentary English main track", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(providerSource, /launchTrackIsEnglishMain/);
  assert.match(
    providerSource,
    /english_main_audio_not_proven/
  );
  assert.match(
    providerSource,
    /english_audio_not_proven/
  );
  assert.match(
    providerSource,
    /commentary\|audio\[ \._-\]\*description/
  );
  assert.match(providerSource, /const labelText = \[/);
  assert.match(
    providerSource,
    /\(\?:eng\|en\|english\)/
  );
});

test("explicit Real-Debrid library playback remains a deliberate manual exception", () => {
  const librarySource = readFileSync(
    new URL("../src/components/mg/RdLibraryView.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    librarySource,
    /verifiedPlaybackPolicy:\s*"manual"/
  );
});

test("strict startup never autoplays request sources before qualification", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  const qualificationIndex = providerSource.indexOf(
    "const qualificationMode ="
  );
  const initialPlayableIndex = providerSource.indexOf(
    "const initialPlayableSources ="
  );

  assert.ok(qualificationIndex >= 0);
  assert.ok(initialPlayableIndex > qualificationIndex);

  const initialBlock = providerSource.slice(
    initialPlayableIndex,
    providerSource.indexOf(
      "const initialPrimary",
      initialPlayableIndex
    )
  );

  assert.match(
    initialBlock,
    /!qualificationMode[\s\S]{0,120}launchQualified === true/
  );
  assert.match(
    initialBlock,
    /Finding a verified compatible source/
  );
});

test("full addon discovery supplements a non-empty server result with browser addon sources", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  const fetchStart = providerSource.indexOf("const fetchAddonSources = async");
  const fetchEnd = providerSource.indexOf("const SAFE_RD_LAUNCH_AUDIO_STATES", fetchStart);
  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart);

  const block = providerSource.slice(fetchStart, fetchEnd);

  assert.match(block, /if \(args\?\.fastMode\)/);
  assert.doesNotMatch(block, /!shouldUseBrowserAddonFallback/);
  assert.match(
    block,
    /await fetchBrowserAddonStreams\([\s\S]{0,700}?mergeAddonStreams\([\s\S]{0,220}?safeServer\.streams[\s\S]{0,220}?safeBrowserStreams/
  );
  assert.match(
    block,
    /Browser fallback recovered/
  );
});

test("strict VOD autoplay keeps the full chooser and falls back to cached runtime rescue", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    providerSource,
    /completeSources:\s*canonicalCompletePlaybackSources/
  );
  assert.match(
    providerSource,
    /discoveredSources:[\s\S]{0,100}canonicalCompletePlaybackSources/
  );
  assert.match(providerSource, /const runtimeFallbackSources/);
  assert.match(providerSource, /runtimeQualificationFallback:\s*true/);
  assert.match(providerSource, /native-runtime-audio-rescue/);
  assert.match(
    providerSource,
    /targetCount:\s*5[\s\S]{0,80}scanLimit:\s*20[\s\S]{0,80}timeBudgetMs:\s*6500/
  );
});

test("cached Comet RD playback URLs become native English-validation fallbacks instead of a waiting spinner", () => {
  const serverSource = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );
  const browserSource = readFileSync(
    new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url),
    "utf8"
  );
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  for (const source of [serverSource, browserSource]) {
    assert.match(source, /providerPlaybackUrl:/);
    assert.match(
      source,
      /cacheSignal\.cached[\s\S]{0,140}?isHttp\(rawUrl\)/
    );
  }

  assert.match(
    providerSource,
    /nativeRuntimeAudioValidationAvailable[\s\S]{0,1800}?runtimeQualificationFallback: true[\s\S]{0,220}?runtimeNativeEnglishValidation: true/
  );
  assert.match(providerSource, /runtimeNativeDirect: true/);
  assert.match(
    providerSource,
    /native-runtime-english-track-validation/
  );
  assert.match(
    providerSource,
    /qualifiedLaunchSources\.length > 0[\s\S]{0,260}?nativeRuntimeAudioValidationAvailable[\s\S]{0,120}?runtimeFallbackSources/
  );

  assert.match(playerSource, /nativeRuntimeEnglishFallback/);
  assert.match(playerSource, /runtimeNativeDirect/);
  const resolvedAudioGuard = playerSource.slice(
    playerSource.indexOf("const rejectResolvedForeignAutoplay ="),
    playerSource.indexOf("const tryNextSource =")
  );
  assert.match(resolvedAudioGuard, /RD mediaInfos may omit or mislabel tracks/);
  assert.doesNotMatch(resolvedAudioGuard, /switchToSource\(|markSourceFailed\(/);
});

test("LibVLC compatibility playback cannot spin forever during opening or buffering", () => {
  for (const relativePath of [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt",
  ]) {
    const source = readFileSync(
      new URL(relativePath, import.meta.url),
      "utf8"
    );

    assert.match(source, /STARTUP_TIMEOUT_MS = 10000L/);
    assert.match(source, /private val startupTimeoutRunnable = Runnable/);
    assert.match(
      source,
      /compatibilityRetryPass < 1[\s\S]{0,220}?forceSoftwareVideoDecode = true/
    );
    assert.match(
      source,
      /Strict English playback could not start this source in the compatibility decoder/
    );
    assert.match(
      source,
      /armStartupTimeout\(\)[\s\S]{0,100}?player\.play\(\)/
    );
    assert.match(
      source,
      /MediaPlayer\.Event\.Playing[\s\S]{0,220}?compatibilityPlaybackStarted = true[\s\S]{0,420}?clearStartupTimeout\(\)/
    );
    assert.match(
      source,
      /private fun releaseCompatibilityPlayer\(\)[\s\S]{0,140}?clearStartupTimeout\(\)/
    );
  }
});

test("TMDB and IMDb ids are validated against requested title and year", () => {
  const resolverSource = readFileSync(
    new URL("../base44/functions/resolveImdb/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(resolverSource, /tmdbRecordMatchesRequest/);
  assert.match(resolverSource, /recordYear !== requestedYear/);
  assert.match(resolverSource, /tmdb_id_corrected_supplied_imdb/);
  assert.match(resolverSource, /title_search_corrected_supplied_imdb/);
});

test("strict launch barrier preserves verified playback and blocks unverified autoplay", () => {
  const hash = "a".repeat(40);
  const qualified = {
    infoHash: hash,
    fileIdx: 0,
    type: "url",
    src: "https://verified.example/resident-evil-2026.m3u8",
    url: "https://verified.example/resident-evil-2026.m3u8",
    label: "Resident Evil 2026",
    launchQualified: true,
    launchQualification: "rd-strict-media-inspected",
    mediaInfo: {
      audio_tracks: [{ language: "eng", codec: "aac" }],
      video_tracks: [{ codec: "h264", height: 1080 }],
    },
  };
  const unverified = {
    infoHash: hash,
    fileIdx: 0,
    type: "rd",
    src: `magnet:?xt=urn:btih:${hash}`,
    label: "Cached addon row",
    debridCached: true,
  };

  const mergedQualified = mergeCompleteSourcePool(
    [qualified],
    [unverified],
    { preservePublishedStatus: true }
  );

  assert.equal(mergedQualified[0].launchQualified, true);
  assert.equal(
    mergedQualified[0].src,
    "https://verified.example/resident-evil-2026.m3u8"
  );
  assert.equal(
    mergedQualified[0].mediaInfo.audio_tracks.length,
    1
  );

  const waiting = {
    label: "Finding a verified compatible source…",
    type: "status",
    src: "",
    url: "",
    diagnostic: true,
  };
  const mergedWaiting = mergeCompleteSourcePool(
    [waiting],
    [unverified],
    { preservePublishedStatus: true }
  );

  assert.equal(mergedWaiting[0].type, "status");
  assert.equal(mergedWaiting[0].diagnostic, true);
  assert.equal(mergedWaiting[1].infoHash, hash);
});

test("film and episode playback source pools never include trailers or watch-provider pages", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const episodeSource = readFileSync(
    new URL("../src/components/mg/EpisodeSelector.jsx", import.meta.url),
    "utf8"
  );

  const builderStart = providerSource.indexOf(
    "export function buildMediaSources"
  );
  const builderBlock = providerSource.slice(builderStart);

  assert.ok(builderStart >= 0);
  assert.doesNotMatch(builderBlock, /type:\s*"youtube"/);
  assert.doesNotMatch(builderBlock, /label:\s*"Trailer"/);
  assert.doesNotMatch(builderBlock, /type:\s*"provider"/);
  assert.match(providerSource, /Watch-provider links/);
  assert.match(builderBlock, /return \[\];/);
  assert.match(
    providerSource,
    /const stripVodTrailerSources =[\s\S]{0,700}?!\["youtube", "provider", "external"\]\.includes\(type\)/
  );
  assert.match(
    providerSource,
    /const suppliedCompleteSources =[\s\S]{0,320}?stripVodTrailerSources/
  );

  const fastAddonStart = providerSource.indexOf("fastAddonPromise.then");
  const fastAddonEnd = providerSource.indexOf(
    "const addonPromise",
    fastAddonStart
  );
  const fastAddonBlock = providerSource.slice(fastAddonStart, fastAddonEnd);

  assert.ok(fastAddonStart >= 0);
  assert.ok(fastAddonEnd > fastAddonStart);
  assert.match(
    fastAddonBlock,
    /if\s*\(\s*!qualificationMode\s*\)[\s\S]{0,900}?publishEarlySources\(automaticFastCandidates/
  );
  assert.ok(
    fastAddonBlock.indexOf("publishEarlySources(automaticFastCandidates") <
      fastAddonBlock.indexOf("qualifyCachedRealDebridLaunchPool")
  );
  assert.doesNotMatch(
    episodeSource.slice(
      episodeSource.indexOf("buildMediaSources({"),
      episodeSource.indexOf("}).map(", episodeSource.indexOf("buildMediaSources({"))
    ),
    /trailerUrl/
  );
});

test("finished episode discovery cannot promote show-level fallback links to autoplay", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  const fallbackGuardIndex = providerSource.indexOf(
    "const onlyEpisodeFallbacksRemain ="
  );
  const fallbackFlagIndex = providerSource.indexOf(
    "episodeFallbackOnly === true",
    fallbackGuardIndex
  );
  const statusIndex = providerSource.indexOf(
    "No playable episode stream found yet.",
    fallbackGuardIndex
  );
  const playerSourceIndex = providerSource.indexOf(
    "const playerSources =",
    fallbackGuardIndex
  );
  const guardedStatusIndex = providerSource.indexOf(
    "episodeSourceMissingStatus",
    playerSourceIndex
  );

  assert.ok(fallbackGuardIndex >= 0);
  assert.ok(fallbackFlagIndex > fallbackGuardIndex);
  assert.ok(statusIndex > fallbackGuardIndex);
  assert.ok(playerSourceIndex > statusIndex);
  assert.ok(guardedStatusIndex > playerSourceIndex);
});

test("full discovery requires identity and English-track qualification without requiring an RD transcode state", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(providerSource, /SAFE_RD_LAUNCH_AUDIO_STATES/);
  assert.match(providerSource, /strictRdLaunchQualification/);
  assert.doesNotMatch(providerSource, /unverified_audio_state/);
  assert.match(providerSource, /sourceMatchesRequestedIdentity/);
  assert.doesNotMatch(providerSource, /requested_year_not_proven/);
  assert.match(providerSource, /audioTracks\.length < 1/);
  assert.match(providerSource, /videoTracks\.length < 1/);
  assert.match(providerSource, /qualifyCachedRealDebridLaunchPool/);
  assert.match(providerSource, /qualifiedLaunchOnly:\s*qualificationMode/);
  assert.match(providerSource, /sources:\s*playerSources/);
  assert.match(
    providerSource,
    /Finding a verified compatible source…/
  );

  const fullBegin = providerSource.indexOf(
    "addonPromise.then((addonLookup) =>"
  );
  const fullEnd = providerSource.indexOf(
    "const [",
    fullBegin
  );
  assert.ok(fullBegin >= 0);
  assert.ok(fullEnd > fullBegin);
  const fullBlock = providerSource.slice(fullBegin, fullEnd);
  assert.doesNotMatch(
    fullBlock,
    /publishEarlySources\(addonLookup\.streams/
  );

  assert.match(
    playerSource,
    /preservePublishedStatus:[\s\S]{0,100}qualifiedLaunchOnly/
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

test("smart VOD ordering keeps English ahead of foreign sources, then uses compatibility", () => {
  const ordered = prioritiseCompatibleAutoplayEntries([
    {
      id: "english-incompatible",
      index: 0,
      autoplayReady: false,
      compatibilityTier: 3,
      languageRank: 0,
      compatibility: 5000,
    },
    {
      id: "foreign-compatible",
      index: 1,
      autoplayReady: true,
      compatibilityTier: 0,
      languageRank: 3,
      compatibility: 1000,
    },
    {
      id: "english-compatible",
      index: 2,
      autoplayReady: true,
      compatibilityTier: 0,
      languageRank: 0,
      compatibility: 200,
    },
    {
      id: "multi-likely",
      index: 3,
      autoplayReady: true,
      compatibilityTier: 1,
      languageRank: 1,
      compatibility: 900,
    },
  ]);

  assert.deepEqual(
    ordered.slice(0, COMPATIBLE_AUTOPLAY_LIMIT).map((entry) => entry.id),
    ["english-compatible", "multi-likely", "foreign-compatible"]
  );
  assert.equal(ordered.at(-1).id, "english-incompatible");
});

test("qualification picks the lead source without truncating the full chooser to five", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  const runtimeStart = providerSource.indexOf("const runtimeFallbackSources");
  const runtimeEnd = providerSource.indexOf("const diagnosticLabel", runtimeStart);
  assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart);
  assert.doesNotMatch(
    providerSource.slice(runtimeStart, runtimeEnd),
    /\.slice\(0,\s*5\)/
  );

  const playerStart = providerSource.indexOf("const playbackLeadSources");
  const playerEnd = providerSource.indexOf("const primary", playerStart);
  assert.ok(playerStart >= 0 && playerEnd > playerStart);
  const playerBlock = providerSource.slice(playerStart, playerEnd);
  assert.match(playerBlock, /preservePublishedSourceOrder\([\s\S]*playbackLeadSources[\s\S]*orderedSources/);
  assert.match(playerBlock, /waitingForVerifiedSource[\s\S]*\.\.\.orderedSources/);

  assert.match(
    playerSource,
    /sources:\s*selectableSourceEntries[\s\S]{0,2200}?webIndex:\s*index/
  );
});

test("compatibility tier explicitly puts proven audio+video before known incompatibility", () => {
  const compatibilitySource = readFileSync(
    new URL("../src/components/mg/mediaCompatibility.js", import.meta.url),
    "utf8"
  );

  const start = compatibilitySource.indexOf(
    "export const sourcePlaybackCompatibilityTier"
  );
  const end = compatibilitySource.indexOf(
    "export const scoreSourceCompatibility",
    start
  );
  assert.ok(start >= 0 && end > start);

  const tierBlock = compatibilitySource.slice(start, end);
  assert.doesNotMatch(tierBlock, /launchQualified === true\) return 0/);
  assert.match(tierBlock, /sourceAudioSupport\(traits, deviceProfile\)/);
  assert.match(tierBlock, /video === true && audio === true\) return 0/);
  assert.match(tierBlock, /video === false \|\| audio === false\) return 3/);
  assert.match(tierBlock, /video === true \|\| audio === true\) return 1/);
  assert.match(tierBlock, /return 2/);
});

test("safe English audio beats a qualified lossless remux for automatic playback", () => {
  const ordered = prioritiseCompatibleAutoplayEntries([
    {
      id: "lossless-remux", index: 0, smartRankingEnabled: true,
      autoplayReady: true, languageRank: 0, compatibilityTier: 3,
      provenWorking: true, successfulPlayback: true,
      releaseTierRank: 0, audioTierRank: 0, cached: true,
    },
    {
      id: "aac-web", index: 1, smartRankingEnabled: true,
      autoplayReady: true, languageRank: 0, compatibilityTier: 0,
      releaseTierRank: 3, audioTierRank: 3, cached: true,
    },
  ]);
  assert.deepEqual(ordered.map((row) => row.id), ["aac-web", "lossless-remux"]);

  const compatibility = readFileSync(
    new URL("../src/components/mg/mediaCompatibility.js", import.meta.url), "utf8"
  );
  const audioCheck = compatibility.slice(
    compatibility.indexOf("const audioSupport ="),
    compatibility.indexOf("const sourceAudioSupport =")
  );
  assert.match(audioCheck, /nativeSupport === true \|\| nativeSupport === false/);
  assert.match(compatibility, /audioCapabilities/);
  assert.match(compatibility, /audioChannels/);
  const selector = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url), "utf8"
  );
  assert.match(selector, /entry\.item\?\.launchQualified === true &&\s*entry\.compatibilityTier < 3/);
});

test("phone and Fire TV package matching FFmpeg audio extensions and prefer them for VOD only", () => {
  const workflow = readFileSync(new URL("../.github/workflows/android-apks.yml", import.meta.url), "utf8");
  const script = readFileSync(new URL("../scripts/build-media3-ffmpeg.sh", import.meta.url), "utf8");
  assert.match(workflow, /ffmpeg-extension:/);
  assert.match(workflow, /name: ffmpeg-android-mobile/);
  assert.match(workflow, /name: ffmpeg-firetv-android/);
  assert.match(script, /aac ac3 eac3 truehd dca vorbis opus flac alac mp3/);
  for (const app of ["android-mobile", "firetv-android"]) {
    const gradle = readFileSync(new URL(`../${app}/app/build.gradle.kts`, import.meta.url), "utf8");
    const player = readFileSync(new URL(
      `../${app}/app/src/main/java/com/mediagod/${app === "android-mobile" ? "mobile" : "firetv"}/PlayerActivity.kt`,
      import.meta.url
    ), "utf8");
    assert.match(gradle, /implementation\(files\("libs\/decoder-ffmpeg\.aar"\)\)/);
    assert.match(player, /EXTENSION_RENDERER_MODE_ON/);
    assert.match(player, /EXTENSION_RENDERER_MODE_PREFER/);
    assert.match(player, /if \(live\)[\s\S]{0,180}?EXTENSION_RENDERER_MODE_ON[\s\S]{0,180}?EXTENSION_RENDERER_MODE_PREFER/);
    assert.match(player, /scheduleMissingAudioCheck/);
  }
});

test("Real-Debrid zero-audio metadata tries transcode then preserves the original source for runtime verification", () => {
  const rdSource = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  const transcodeCall = rdSource.indexOf(
    "await getBestRdTranscode("
  );
  const zeroAudioProbe = rdSource.indexOf(
    "if (audioTracks.length === 0)"
  );
  assert.ok(transcodeCall >= 0);
  assert.ok(zeroAudioProbe > transcodeCall);

  const zeroAudioBlock = rdSource.slice(
    zeroAudioProbe,
    rdSource.indexOf("const hardRisk =", zeroAudioProbe)
  );
  assert.match(zeroAudioBlock, /stream_url:\s*\n\s*originalUrl/);
  assert.match(zeroAudioBlock, /rd_metadata_zero_audio_original_probe/);
  assert.doesNotMatch(zeroAudioBlock, /RD_NO_AUDIO_TRACKS/);
  assert.doesNotMatch(zeroAudioBlock, /error_code/);

  const audioErrorStart = playerSource.indexOf(
    'rdErrorCode === "RD_NO_AUDIO_TRACKS"'
  );
  const audioErrorEnd = playerSource.indexOf(
    'rdErrorCode === "RD_TORRENT_INFO_FAILED"',
    audioErrorStart
  );
  assert.ok(audioErrorStart >= 0 && audioErrorEnd > audioErrorStart);
  const audioErrorBlock = playerSource.slice(audioErrorStart, audioErrorEnd);
  assert.doesNotMatch(audioErrorBlock, /tryNextSource\(/);
  assert.doesNotMatch(audioErrorBlock, /blacklistTorrentHash/);
  assert.match(audioErrorBlock, /kept available instead of being marked bad/);
});

test("fast discovery cannot launch an unqualified torrent", () => {
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
    /qualifyCachedRealDebridLaunchSource/
  );
  assert.match(
    providerSource,
    /QUALIFIED FAST READY/
  );
  const fastStartBegin = providerSource.indexOf(
    "fastAddonPromise.then(async"
  );
  const fastStartEnd = providerSource.indexOf(
    "const addonPromise",
    fastStartBegin
  );
  assert.ok(fastStartBegin >= 0);
  assert.ok(fastStartEnd > fastStartBegin);
  const fastStartBlock = providerSource.slice(
    fastStartBegin,
    fastStartEnd
  );
  assert.doesNotMatch(
    fastStartBlock,
    /publishEarlySources\(addonLookup\.streams/
  );
  assert.match(
    providerSource,
    /FAST DISCOVERED · QUALIFYING/
  );
  assert.match(
    providerSource,
    /restoreQualifiedLaunchRows/
  );
  assert.match(
    playerSource,
    /launchQualifiedDirect/
  );
  assert.match(
    playerSource,
    /!launchQualifiedDirect[\s\S]{0,120}active\?\.type === "rd"/
  );
});

test("Real-Debrid library fast start is already media inspected", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    providerSource,
    /launchQualification:\s*"rd-library-strict-media-inspected"/
  );
});

test("Real-Debrid library lookup prefers the exact owned RdLink episode association", () => {
  const rdSource = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );

  const findCachedStart = rdSource.indexOf('if (action === "find_cached")');
  const findCachedEnd = rdSource.indexOf('return Response.json(\n      {\n        error:\n          "Unknown action"', findCachedStart);
  assert.ok(findCachedStart >= 0 && findCachedEnd > findCachedStart);

  const block = rdSource.slice(findCachedStart, findCachedEnd);

  assert.match(block, /rdLinks\.filter/);
  assert.match(
    rdSource,
    /user[\s\S]{0,120}?base44\.entities\.RdLink[\s\S]{0,220}?GuestRdLink/
  );
  assert.match(
    block,
    /title,[\s\S]{0,180}?year[\s\S]{0,180}?season[\s\S]{0,180}?episode/
  );
  assert.match(block, /String\(link\?\.torrent_id \|\| ""\)\.trim\(\)/);
  assert.match(
    block,
    /resolveStreamable\([\s\S]{0,220}?linkedTorrentId[\s\S]{0,360}?season,[\s\S]{0,100}?episode/
  );
  assert.match(block, /association:[\s\S]{0,80}?"exact_rdlink"/);
});

test("browser audio track choice stays manual while native decoders may repair missing audio", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const compatibilityFiles = [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt",
  ];

  assert.match(playerSource, /Audio recovery is deliberately MANUAL ONLY/);
  assert.match(playerSource, /const handleNoSound =\s*\n\s*async \(\) =>/);
  assert.match(playerSource, /mg:audio-rescue-request/);
  assert.match(playerSource, /force_audio_rescue: true/);
  assert.match(playerSource, /handleNoSound\(\);/);
  assert.doesNotMatch(playerSource, /handleNoSoundRef/);
  assert.doesNotMatch(playerSource, /browserConfirmedNoAudio/);
  assert.doesNotMatch(playerSource, /rejectAutomaticAioAudioFailure/);
  assert.doesNotMatch(playerSource, /automatic:\s*true/);

  for (const file of compatibilityFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /automaticNoSoundRecovery = false/);
    assert.match(source, /recoverAudioTrack\(\) = Unit/);
    assert.match(
      source,
      /audioButton = controlButton\("Audio"\) \{ cycleAudioTrack\(\) \}/
    );
    assert.doesNotMatch(source, /postDelayed\(audioRecoveryRunnable, 1000L\)/);
    assert.match(source, /private fun preferEnglishMainAudio\(player: MediaPlayer\)/);
    assert.match(source, /if \(manualAudioTrackLocked \|\| payload\.optBoolean\("live", false\)\) return/);
    assert.match(source, /player\.audioTrack < 0 && !manualAudioTrackLocked/);
    assert.match(source, /player\.time < 5000L/);
  }
});

test("audio menu ranks tracks but changes them only after a user choice", () => {
  const controlsSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerControls.jsx", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const rdSource = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(controlsSource, /Manual-only audio policy/);
  assert.match(controlsSource, /manualAudioChoiceRef/);
  assert.doesNotMatch(controlsSource, /rememberedPreferred/);

  const chooseStart = controlsSource.indexOf("const chooseAudio =");
  const chooseEnd = controlsSource.indexOf("const toggleMenu =", chooseStart);
  assert.ok(chooseStart >= 0 && chooseEnd > chooseStart);
  const chooseAudioSource = controlsSource.slice(chooseStart, chooseEnd);
  assert.match(chooseAudioSource, /mg:hls-audio-track-selected/);
  assert.match(chooseAudioSource, /tracks\[trackIndex\]\.enabled = trackIndex === choice\.index/);
  assert.match(chooseAudioSource, /manualAudioChoiceRef\.current =/);
  assert.match(chooseAudioSource, /rememberAudioPreference/);

  const noSoundStart = playerSource.indexOf("const handleNoSound =");
  const noSoundEnd = playerSource.indexOf(
    "Audio recovery is deliberately MANUAL ONLY",
    noSoundStart
  );
  assert.ok(noSoundStart >= 0 && noSoundEnd > noSoundStart);
  const noSoundSource = playerSource.slice(noSoundStart, noSoundEnd);
  assert.match(noSoundSource, /force_audio_rescue: true/);
  assert.match(noSoundSource, /userReportedNoSound: true/);
  assert.doesNotMatch(noSoundSource, /findNextPlayableSource\(/);
  assert.doesNotMatch(noSoundSource, /markSourceFailed\(/);
  assert.doesNotMatch(noSoundSource, /switchToSource\(/);

  assert.match(rdSource, /forced_audio_rescue_original_probe/);
  assert.doesNotMatch(
    rdSource,
    /forced_audio_rescue_unavailable_try_next_source/
  );
});

test("native players prefer English main audio without replacing a manual audio override", () => {
  const nativeFiles = [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt",
  ];

  for (const file of nativeFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /strictEnglishStartupRequired\(\): Boolean = false/);
    assert.match(source, /group\.isTrackSelected\(index\) && group\.isTrackSupported\(index\)/);
    assert.match(source, /trackSelectionParameters\.overrides\.values\.any/);
    assert.match(source, /enforcePreferredEnglishAudio\(exoPlayer, tracks\)/);
    assert.match(source, /if \(audioOutputConfirmed\) return/);
    assert.match(source, /if \(audioOutputConfirmed\) return@postDelayed/);
    assert.match(source, /native audio output never started/);
    assert.doesNotMatch(source, /val englishOverrideApplied =/);
    assert.match(source, /onAudioPositionAdvancing\(/);
  }
});

test("VOD keeps manual audio choice but repairs verified missing native audio", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const controlsSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerControls.jsx", import.meta.url),
    "utf8"
  );
  const nativeFiles = [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt",
  ];
  const compatibilityFiles = [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt",
  ];

  assert.match(playerSource, /Audio recovery is deliberately MANUAL ONLY/);
  assert.doesNotMatch(playerSource, /browserConfirmedNoAudio/);
  assert.doesNotMatch(playerSource, /handleNoSoundRef/);
  assert.match(controlsSource, /Manual-only audio policy/);

  for (const file of nativeFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /strictEnglishStartupRequired\(\): Boolean = false/);
    assert.match(source, /activePlayer\.currentPosition < 5000L/);
    assert.match(source, /launchCompatibilityPlayer\(activePlayer, null, reason\)/);
    assert.match(source, /error\.errorCode in 5001\.\.5004/);
    assert.match(source, /onAudioPositionAdvancing\(/);
    assert.match(source, /audioOutputConfirmed/);
  }

  for (const file of compatibilityFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /requiresStrictEnglishAudio\(\): Boolean = false/);
    assert.match(source, /recoverAudioTrack\(\) = Unit/);
    assert.match(source, /later choices belong to Audio/);
    assert.doesNotMatch(source, /postDelayed\(audioRecoveryRunnable, 1000L\)/);
    assert.match(source, /noAudioCheckGeneration/);
    assert.match(
      source,
      /MediaPlayer\.Event\.EncounteredError -> \{[\s\S]{0,120}?confirmCompatibilityError\(player\)/
    );
  }
});

test("strict native English audio gates stay disabled under manual-only audio policy", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const bridgeSource = readFileSync(
    new URL("../src/components/mg/nativeFireTvBridge.js", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /strictEnglishPlayback:\s*false/);
  assert.doesNotMatch(playerSource, /strictEnglishNativeFailure/);
  assert.match(bridgeSource, /strictEnglishPlayback = false/);

  for (const relativePath of [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /strictEnglishStartupRequired\(\): Boolean = false/);
    assert.match(source, /holdForEnglishStartup/);
    assert.match(source, /shouldPlayWhenReady && !holdForEnglishStartup/);
    assert.match(source, /scheduleMissingAudioCheck/);
  }

  for (const relativePath of [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /requiresStrictEnglishAudio\(\): Boolean = false/);
    assert.doesNotMatch(source, /player\.setVolume\(0\)/);
    assert.doesNotMatch(source, /postDelayed\(audioRecoveryRunnable, 1000L\)/);
  }
});

test("No sound button stays available as an explicit user report and manual recovery action", () => {
  const controlsSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerControls.jsx", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const reliabilitySource = readFileSync(
    new URL("../src/components/mg/PlaybackReliabilityAssist.jsx", import.meta.url),
    "utf8"
  );

  assert.match(controlsSource, /aria-label="No sound"/);
  assert.match(controlsSource, /title="No sound"/);
  assert.match(controlsSource, /No sound\?/);
  assert.match(controlsSource, /onClick=\{[\s\S]{0,80}?onNoSound/);
  assert.match(playerSource, /new CustomEvent\("mg:playback-no-sound"/);
  assert.match(playerSource, /handleNoSound\(\);/);
  assert.match(reliabilitySource, /saveReliability\([\s\S]{0,80}?"no-sound"/);
  assert.match(
    reliabilitySource,
    /No-sound report saved for this exact source · manual audio recovery started\./
  );
  assert.doesNotMatch(playerSource, /handleNoSoundRef/);
  assert.doesNotMatch(playerSource, /automatic:\s*true/);
});

test("a no-sound report tries another English track before a ready backup", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /trackLanguage\(track\)/);
  assert.match(playerSource, /englishMain\.find\(\(item\) => !triedTracks\.has\(item\.index\)\)/);
  assert.match(playerSource, /Audio track changed within this file/);
  assert.match(playerSource, /No usable audio could be recovered from this source/);

  const manualStart = playerSource.indexOf("const handleNoSound =");
  const manualEnd = playerSource.indexOf(
    "Audio recovery is deliberately MANUAL ONLY",
    manualStart
  );
  assert.ok(manualStart >= 0 && manualEnd > manualStart);
  const manualBlock = playerSource.slice(manualStart, manualEnd);
  assert.match(manualBlock, /force_audio_rescue: true/);
  assert.match(manualBlock, /userReportedNoSound: true/);
  assert.match(manualBlock, /allowCaching: false/);
  assert.doesNotMatch(manualBlock, /findNextPlayableSource\(/);
  assert.doesNotMatch(manualBlock, /markSourceFailed\(/);
  assert.doesNotMatch(manualBlock, /switchToSource\(/);
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


test("movie identity rejects same-year franchise siblings and wrong resolved filenames", () => {
  const request = {
    title: "Resident Evil",
    year: "2026",
    mediaType: "movie",
  };

  assert.equal(
    sourceIdentityMismatchReason(
      {
        filename:
          "Resident.Evil.Apocalypse.2026.1080p.WEB-DL.DDP5.1.H264.mkv",
      },
      request
    ),
    "conflicting_title_suffix"
  );

  assert.equal(
    sourceIdentityMismatchReason(
      {
        filename:
          "Completely.Different.Movie.2026.1080p.WEB-DL.DDP5.1.H264.mkv",
      },
      request
    ),
    "conflicting_release_title"
  );

  assert.equal(
    sourceIdentityMismatchReason(
      {
        filename:
          "Resident.Evil.2026.1080p.WEB-DL.English.DDP5.1.H264.mkv",
      },
      request
    ),
    ""
  );
});

test("authoritative IDs stay isolated and English autoplay never falls back blindly", () => {
  const serverSource = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );
  const browserSource = readFileSync(
    new URL("../src/components/mg/addonBrowserFallback.js", import.meta.url),
    "utf8"
  );
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  for (const source of [serverSource, browserSource]) {
    assert.match(source, /const isAuthoritativeStreamId/);
    assert.match(
      source,
      /rawStreams\.length > 0 &&\s*!isAuthoritativeStreamId\(alternateIdUsed \|\| streamId\)/
    );
  }

  assert.match(providerSource, /requireExplicitEnglishRuntimeFallback/);
  assert.match(
    providerSource,
    /\["english", "multi"\]\.includes\([\s\S]{0,120}?detectLanguagePreference\(item\)/
  );
  assert.match(
    providerSource,
    /native-runtime-english-track-validation/
  );
  assert.match(providerSource, /prioritiseEnglishAutoplayCandidates/);
  assert.match(
    providerSource,
    /targetCount:\s*1,[\s\S]{0,120}?scanLimit:\s*40,[\s\S]{0,120}?timeBudgetMs:\s*10000/
  );
});


test("native VOD proves audio output after playback advances and rescues silent video", () => {
  const nativeFiles = [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt",
  ];

  for (const file of nativeFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const start = source.indexOf("private fun scheduleMissingAudioCheck(");
    const end = source.indexOf("private fun buildMediaItem", start);
    assert.ok(start >= 0 && end > start);
    const block = source.slice(start, end);

    assert.doesNotMatch(block, /!initial\.present \|\| \(initial\.supported && initial\.selected\)/);
    assert.match(block, /if \(audioOutputConfirmed\) return/);
    assert.match(block, /activePlayer\.currentPosition < 5000L/);
    assert.match(block, /native audio output never started/);
    assert.match(block, /launchCompatibilityPlayer\(activePlayer, null, reason\)/);
    assert.match(block, /10000L/);
    assert.match(source, /error\.errorCode in 5001\.\.5004/);
    assert.match(source, /return code == 3003 \|\|\s*\n\s*code in 4001\.\.4005/);
  }

  const mobile = readFileSync(
    new URL("../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt", import.meta.url),
    "utf8"
  );
  assert.match(mobile, /put\("verifiedEnglishMain", currentVerifiedEnglishMain\(\)\)/);
  assert.match(mobile, /put\("preferredAudioTrackName", currentPreferredEnglishTrackName\(\)\)/);
  assert.match(mobile, /put\("preferredAudioTrackLanguage", currentPreferredEnglishTrackLanguage\(\)\)/);
  assert.match(mobile, /put\("preferredAudioTrackCodec", currentPreferredEnglishTrackCodec\(\)\)/);
  assert.match(mobile, /put\("preferredAudioTrackStream", currentPreferredEnglishTrackStream\(\)\)/);

  for (const file of [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /matchingHint\.singleOrNull\(\) \?: english\.firstOrNull\(\)/);
    assert.match(source, /900L/);
  }
});

test("manual VOD source choices remain locked across native playback recovery", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /manualSourceLockRef/);
  assert.match(playerSource, /const manualSourceLockActive =/);
  assert.match(
    playerSource,
    /if \(!activeIsLive && manualSourceLockActive\(\) && !userReportedNoSound\)/
  );
  assert.match(
    playerSource,
    /This source was selected manually, so Media God kept it selected/
  );

  const nativeResultStart = playerSource.indexOf('reason === "source"');
  const nativeResultEnd = playerSource.indexOf('reason === "error"', nativeResultStart);
  assert.ok(nativeResultStart >= 0 && nativeResultEnd > nativeResultStart);
  assert.match(
    playerSource.slice(nativeResultStart, nativeResultEnd),
    /manualSelection:\s*true/
  );
});


test("AIOStreams audio failures are never auto-skipped and short playback is not remembered as proven", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const trustedSource = readFileSync(
    new URL("../src/components/mg/trustedCachedSources.js", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /SUCCESSFUL_VOD_PLAYBACK_SECONDS = 20/);
  assert.match(playerSource, /currentTime >= SUCCESSFUL_VOD_PLAYBACK_SECONDS/);
  assert.match(playerSource, /positionSeconds >= SUCCESSFUL_VOD_PLAYBACK_SECONDS/);
  assert.doesNotMatch(playerSource, /rejectAutomaticAioAudioFailure/);
  assert.doesNotMatch(
    playerSource,
    /AIOStreams audio failed — skipping that source/
  );
  assert.match(playerSource, /forgetSuccessfulPlaybackSource\(failedItem\)/);
  assert.match(trustedSource, /export const forgetSuccessfulPlaybackSource/);
});

test("only a confirmed no-sound report can advance after same-file recovery fails", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  const audioBlockStart = playerSource.indexOf("const handleNoSound =");
  const audioBlockEnd = playerSource.indexOf(
    "Audio recovery is deliberately MANUAL ONLY",
    audioBlockStart
  );
  assert.ok(audioBlockStart >= 0 && audioBlockEnd > audioBlockStart);
  const audioBlock = playerSource.slice(audioBlockStart, audioBlockEnd);

  assert.match(audioBlock, /force_audio_rescue: true/);
  assert.match(audioBlock, /video\?\.pause\?\.\(\)/);
  assert.match(audioBlock, /tryNextSource\("No usable audio could be recovered from this source\."/);
  assert.match(audioBlock, /userReportedNoSound: true/);
  assert.match(audioBlock, /allowCaching: false/);
  assert.match(audioBlock, /triedTracks\.add\(currentAudio\)/);
  assert.match(audioBlock, /skipIndices: \[\.\.\.reportedNoSoundTracksRef\.current\.hlsTried\]/);
  assert.match(audioBlock, /reportedNoSoundTracksRef\.current\.hlsTried\.add\(index\)/);
  assert.doesNotMatch(audioBlock, /switchToSource\(/);
  assert.doesNotMatch(audioBlock, /markSourceFailed\(/);
  assert.doesNotMatch(audioBlock, /rejectAutomaticAioAudioFailure/);
  assert.match(playerSource, /manualSourceLockActive\(\) && !userReportedNoSound/);
  assert.match(playerSource, /currentVideoHealthy &&[\s\S]{0,100}!userReportedNoSound/);
});

test("LibVLC PCM modes never route to a fabricated stereo output device", () => {
  const nativeFiles = [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt",
  ];

  for (const file of nativeFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const start = source.indexOf("private fun configureAudioOutput");
    const end = source.indexOf("private fun recoverAudioTrack", start);
    assert.ok(start >= 0 && end > start);
    const block = source.slice(start, end);

    assert.match(block, /player\.setAudioDigitalOutputEnabled\(false\)/);
    assert.match(block, /"stereo" -> player\.setAudioDigitalOutputEnabled\(false\)/);
    assert.doesNotMatch(block, /setAudioOutputDevice\("stereo"\)/);
  }
});


test("Real-Debrid no-English or no-audio metadata never blacklists or races through VOD sources", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    playerSource,
    /mg:failed-uncached-torrent-hashes:v7/
  );

  const pollStart = playerSource.indexOf('rdErrorCode === "RD_NO_AUDIO_TRACKS"');
  const pollEnd = playerSource.indexOf('rdErrorCode === "RD_TORRENT_INFO_FAILED"', pollStart);
  assert.ok(pollStart >= 0 && pollEnd > pollStart);
  const pollBlock = playerSource.slice(pollStart, pollEnd);
  assert.doesNotMatch(pollBlock, /tryNextSource\(/);
  assert.doesNotMatch(pollBlock, /blacklistTorrentHash/);
  assert.doesNotMatch(pollBlock, /markSourceFailed\(/);
  assert.match(pollBlock, /kept available instead of being marked bad/);

  const resolveStart = playerSource.indexOf('error?.code === "RD_NO_AUDIO_TRACKS"');
  const resolveEnd = playerSource.indexOf('error?.code === "RD_ACTIVE_SLOTS_FULL"', resolveStart);
  assert.ok(resolveStart >= 0 && resolveEnd > resolveStart);
  const resolveBlock = playerSource.slice(resolveStart, resolveEnd);
  assert.match(resolveBlock, /RD_NO_ENGLISH_AUDIO/);
  assert.doesNotMatch(resolveBlock, /tryNextSource\(/);
  assert.doesNotMatch(resolveBlock, /blacklistTorrentHash/);
  assert.doesNotMatch(resolveBlock, /markSourceFailed\(/);
  assert.match(resolveBlock, /kept the source available instead of marking it bad/);
});


test("one-second native decoder failures never become a torrent carousel", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /const lockedVodNativeFailure =\s*!isLive && manualSourceLockActive\(\)/);
  assert.match(playerSource, /if \(lockedVodNativeFailure\)/);
  assert.match(
    playerSource,
    /if \(nativeAudioFailure\) \{[\s\S]{0,450}?authoritativeSourceRejection: true, immediate: true/
  );
  assert.match(playerSource, /no usable audio track\|audio decoder could not recover/);

  const nativeApps = [
    {
      router: "../android-mobile/app/src/main/java/com/mediagod/mobile/PlaybackCompatibilityRouter.kt",
      compatibility: "../android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt",
      player: "../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt",
      main: "../android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt",
      diagnostics: "../android-mobile/app/src/main/java/com/mediagod/mobile/NativePlaybackDiagnostics.kt",
    },
    {
      router: "../firetv-android/app/src/main/java/com/mediagod/firetv/PlaybackCompatibilityRouter.kt",
      compatibility: "../firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt",
      player: "../firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt",
      main: "../firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt",
      diagnostics: "../firetv-android/app/src/main/java/com/mediagod/firetv/NativePlaybackDiagnostics.kt",
    },
  ];

  for (const app of nativeApps) {
    const router = readFileSync(new URL(app.router, import.meta.url), "utf8");
    const compatibility = readFileSync(new URL(app.compatibility, import.meta.url), "utf8");
    const player = readFileSync(new URL(app.player, import.meta.url), "utf8");
    const main = readFileSync(new URL(app.main, import.meta.url), "utf8");
    const diagnostics = readFileSync(new URL(app.diagnostics, import.meta.url), "utf8");

    assert.doesNotMatch(router, /return Decision\(true, "provider:torrentio"\)/);
    assert.match(compatibility, /private var compatibilityRetryPass = 0/);
    assert.match(compatibility, /private var forceSoftwareVideoDecode = false/);
    assert.match(
      compatibility,
      /setHWDecoderEnabled\(!forceSoftwareVideoDecode, false\)/
    );
    assert.match(
      compatibility,
      /retrying this same source in software mode/
    );
    assert.match(player, /"compatibilityAudioRecovery"/);
    assert.match(main, /playbackDecision\.reason\.startsWith\("audio"/);
    assert.match(diagnostics, /"compatibilityAudioRecovery"/);
  }
});

test("native results only update the matching source and silent video is not learned as a success", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const reliabilitySource = readFileSync(
    new URL("../src/components/mg/playbackReliability.js", import.meta.url),
    "utf8"
  );
  const assistSource = readFileSync(
    new URL("../src/components/mg/PlaybackReliabilityAssist.jsx", import.meta.url),
    "utf8"
  );
  const nativeApps = ["android-mobile", "firetv-android"];
  const nativePackages = ["mobile", "firetv"];
  const nativeHandler = playerSource.slice(
    playerSource.indexOf("const onNativeResult ="),
    playerSource.indexOf("const selectedSourceIndex", playerSource.indexOf("const onNativeResult ="))
  );
  assert.ok(nativeHandler.indexOf('String(detail.requestId || "") !== activeRequest.requestId') <
    nativeHandler.indexOf("if (detail?.diagnostics)"));
  assert.match(nativeHandler, /diagnosticFailure && String\(detail.reason \|\| ""\).toLowerCase\(\) === "error"/);
  assert.match(playerSource, /!hasRecentNoSoundHistory\(activeExactReliabilityLabel\(\)\)/);
  assert.match(playerSource, /forgetSuccessfulPlaybackSource\(active\);/);

  const good = reliabilitySource.slice(
    reliabilitySource.indexOf('kind === "good"'),
    reliabilitySource.indexOf("return current;", reliabilitySource.indexOf('kind === "good"'))
  );
  assert.match(good, /value\?\.audioConfirmed === true[\s\S]{0,95}?current\.lastNoSound = 0/);
  assert.match(assistSource, /!fresh\(readStore\(\)\[sourceKey\(label\)\]\?\.lastNoSound, NO_SOUND_TTL\)/);

  nativeApps.forEach((app, index) => {
    const base = `../${app}/app/src/main/java/com/mediagod/${nativePackages[index]}`;
    const native = readFileSync(new URL(`${base}/PlayerActivity.kt`, import.meta.url), "utf8");
    const compatibility = readFileSync(new URL(`${base}/CompatibilityPlayerActivity.kt`, import.meta.url), "utf8");
    const launch = native.slice(
      native.indexOf("val compatibilityText ="),
      native.indexOf("compatibilityPlayerOpen = true", native.indexOf("val compatibilityText ="))
    );
    const retry = compatibility.slice(
      compatibility.indexOf("val recoveryText ="),
      compatibility.indexOf("finishWithResult(", compatibility.indexOf("val recoveryText ="))
    );
    assert.doesNotMatch(launch, /payload\.optString\("(?:audioCodec|hintText)"\)/);
    assert.doesNotMatch(retry, /payload\.optString\("(?:audioCodec|hintText)"\)/);
    assert.match(launch, /error\?\.errorCode\?\.let \{ it in 5001\.\.5004 \}/);
  });
});


test("qualification can choose the lead source but can never truncate the chooser to five", () => {
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    providerSource,
    /runtimeFallbackSources[\s\S]{0,1400}?\.slice\(0,\s*5\)/
  );
  assert.match(providerSource, /const playbackLeadSources/);
  assert.match(
    providerSource,
    /preservePublishedSourceOrder\([\s\S]{0,160}?playbackLeadSources,[\s\S]{0,160}?orderedSources/
  );
  assert.match(providerSource, /sources:\s*playerSources/);
  assert.match(providerSource, /completeSources:\s*canonicalCompletePlaybackSources/);
});

test("native playback receives the full compatibility-sorted source list", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    playerSource,
    /sources:\s*selectableSourceEntries[\s\S]{0,2200}?webIndex:\s*index/
  );
  assert.doesNotMatch(
    playerSource,
    /sources:\s*sourcesForSelector[\s\S]{0,120}?sourceIsUserSelectable/
  );
});

test("resolved Real-Debrid audio inspection follows the active URL into native playback", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const bridgeSource = readFileSync(
    new URL("../src/components/mg/nativeFireTvBridge.js", import.meta.url),
    "utf8"
  );

  const nativeLaunchStart = playerSource.indexOf("const started = playNativeFireTv({");
  const nativeLaunchEnd = playerSource.indexOf("if (!started)", nativeLaunchStart);
  assert.ok(nativeLaunchStart >= 0 && nativeLaunchEnd > nativeLaunchStart);

  const nativeLaunchBlock = playerSource.slice(nativeLaunchStart, nativeLaunchEnd);

  assert.match(
    nativeLaunchBlock,
    /const effectiveCandidate =[\s\S]{0,260}?index === activeIdx && rdOverride/
  );
  assert.match(
    nativeLaunchBlock,
    /\.\.\.candidate,[\s\S]{0,100}?\.\.\.rdOverride,[\s\S]{0,100}?src: nativePlaybackUrl,[\s\S]{0,80}?url: nativePlaybackUrl/
  );
  assert.match(
    nativeLaunchBlock,
    /\.\.\.effectiveCandidate/
  );

  assert.match(bridgeSource, /const nativePreferredEnglishAudio =/);
  assert.match(
    bridgeSource,
    /mediaInfo =\s*item\?\.mediaInfo/
  );
  assert.match(bridgeSource, /verifiedEnglishMain: Boolean\(preferred\)/);
});

test("audio and video compatibility tier drives source ordering without hiding rows", () => {
  const compatibilitySource = readFileSync(
    new URL("../src/components/mg/mediaCompatibility.js", import.meta.url),
    "utf8"
  );
  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );
  const automaticOrderSource = readFileSync(
    new URL("../src/components/mg/automaticSourceOrder.js", import.meta.url),
    "utf8"
  );
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    compatibilitySource,
    /export const sourcePlaybackCompatibilityTier/
  );
  assert.match(
    compatibilitySource,
    /if \(video === true && audio === true\) return 0/
  );
  assert.match(
    compatibilitySource,
    /if \(video === false \|\| audio === false\) return 3/
  );
  assert.match(
    selectorSource,
    /compatibilityTier:\s*sourcePlaybackCompatibilityTier/
  );
  assert.match(
    automaticOrderSource,
    /effectiveCompatibilityTier\(left\)[\s\S]{0,160}?effectiveCompatibilityTier\(right\)/
  );
  assert.match(
    selectorSource,
    /sourceIsUserSelectable\(entry\.item\)[\s\S]{0,240}?entry\.cached === true/
  );
  assert.match(
    selectorSource,
    /entry\.successfulPlayback === true[\s\S]{0,120}?successfulPlaybackLanguageRank/
  );
  assert.match(selectorSource, /entry\.languageRank <= 3/);
  assert.match(selectorSource, /entry\.compatibilityTier <= 1/);
  assert.match(
    selectorSource,
    /mode === "compatible"[\s\S]{0,220}?a\.compatibilityTier - b\.compatibilityTier/
  );
  assert.match(
    providerSource,
    /sourcePlaybackCompatibilityTier\(a[\s\S]{0,160}?sourcePlaybackCompatibilityTier\(b/
  );
  assert.match(
    playerSource,
    /compatibilityTierPriority[\s\S]{0,120}?250000/
  );
});


test("Best source order never puts uncached guesses above a cached qualified source", () => {
  const ordered = prioritiseCompatibleAutoplayEntries([
    {
      id: "uncached-comet",
      index: 0,
      autoplayReady: false,
      compatibilityTier: 0,
      languageRank: 0,
      compatibility: 50000,
      cached: false,
      trustedCached: false,
    },
    {
      id: "cached-qualified-torrentio",
      index: 1,
      autoplayReady: true,
      compatibilityTier: 1,
      provenWorking: true,
      languageRank: 0,
      hardSubtitleRank: 0,
      compatibility: 1000,
      cached: true,
      trustedCached: true,
    },
  ]);

  assert.equal(ordered[0].id, "cached-qualified-torrentio");
  assert.equal(ordered[1].id, "uncached-comet");
});

test("Best chooser pins the playing VOD first and native playback receives that same list", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );
  const automaticSource = readFileSync(
    new URL("../src/components/mg/automaticSourceOrder.js", import.meta.url),
    "utf8"
  );

  assert.match(
    playerSource,
    /sourceSortMode === "best"[\s\S]{0,700}?entry\.index === activeIdx/
  );
  assert.match(
    playerSource,
    /activeEntry\?\.provenWorking === true[\s\S]{0,260}?selectableSourceEntries = \[/
  );
  assert.match(
    playerSource,
    /sources:\s*selectableSourceEntries[\s\S]{0,2200}?webIndex:\s*index/
  );
  assert.match(selectorSource, /entry\.cached === true/);
  assert.match(
    selectorSource,
    /entry\.successfulPlayback === true[\s\S]{0,120}?successfulPlaybackLanguageRank/
  );
  assert.match(selectorSource, /entry\.languageRank <= 3/);
  assert.match(selectorSource, /entry\.provenWorking === true/);
  assert.match(selectorSource, /entry\.compatibilityTier <= 1/);
  assert.match(selectorSource, /hardSubtitleRank/);
  assert.match(automaticSource, /effectiveCompatibilityTier/);
  assert.match(automaticSource, /hardSubtitleRank/);
});


test("best approved cached English row owns startup and strict waiting can still hand off", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const poolSource = readFileSync(
    new URL("../src/components/mg/sourcePoolCompleteness.js", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /bestApprovedAutoplaySourceIndex/);
  assert.match(playerSource, /automaticApprovedAutoplaySourceIndex/);
  assert.match(playerSource, /activeIsWaitingForVerifiedSource/);
  assert.match(
    playerSource,
    /sortedSourceEntries\.find\([\s\S]{0,420}?autoplayEntryApproved\(entry\)/
  );
  assert.match(
    playerSource,
    /bestSourceShouldOwnStartup[\s\S]{0,520}?bestApprovedAutoplaySourceIndex[\s\S]{0,260}?activeIsWaitingForVerifiedSource[\s\S]{0,160}?automaticApprovedAutoplaySourceIndex/
  );
  assert.match(
    playerSource,
    /!bestSourceShouldOwnStartup[\s\S]{0,260}?!activeNeedsCaching && !activeIsWaitingForVerifiedSource/
  );
  assert.match(
    playerSource,
    /Best cached English source ready — starting automatically/
  );
  assert.match(
    playerSource,
    /Verified cached source ready — starting automatically/
  );
  assert.match(
    poolSource,
    /runtimeQualificationFallback:\s*runtimeFallbackApproved/
  );
});

test("a genuinely successful cached source outranks an equally compatible cached guess", () => {
  const ordered = prioritiseCompatibleAutoplayEntries([
    {
      index: 0,
      autoplayReady: true,
      compatibilityTier: 0,
      languageRank: 0,
      hardSubtitleRank: 0,
      provenWorking: false,
      successfulPlayback: false,
      trustedCached: true,
      cached: true,
      compatibility: 100,
      resolution: 1080,
    },
    {
      index: 1,
      autoplayReady: true,
      compatibilityTier: 0,
      languageRank: 0,
      hardSubtitleRank: 0,
      provenWorking: false,
      successfulPlayback: true,
      trustedCached: true,
      cached: true,
      compatibility: 100,
      resolution: 1080,
    },
  ]);

  assert.equal(ordered[0]?.index, 1);

  const trustedSource = readFileSync(
    new URL("../src/components/mg/trustedCachedSources.js", import.meta.url),
    "utf8"
  );
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );

  assert.match(
    trustedSource,
    /mg:successful-playback-sources:v1/
  );
  assert.match(
    trustedSource,
    /recordSuccessfulPlaybackSource/
  );
  assert.match(
    selectorSource,
    /entry\.successfulPlayback === true[\s\S]{0,120}?successfulPlaybackLanguageRank/
  );
  assert.match(
    playerSource,
    /currentTime >= SUCCESSFUL_VOD_PLAYBACK_SECONDS[\s\S]{0,260}?recordSuccessfulPlaybackSource\(active/
  );
  assert.match(
    playerSource,
    /reason !== "error"[\s\S]{0,160}?positionSeconds >= SUCCESSFUL_VOD_PLAYBACK_SECONDS[\s\S]{0,420}?recordSuccessfulPlaybackSource\(active/
  );
});

test("AIOStreams stays fallback-only even when the addon row is typed as a torrent", () => {
  const hash = "a".repeat(40);
  const aioTorrent = {
    type: "torrent",
    addon: "AIOStreams",
    infoHash: hash,
    src: `magnet:?xt=urn:btih:${hash}`,
  };
  const torrentioTorrent = {
    type: "torrent",
    addon: "Torrentio",
    infoHash: "b".repeat(40),
    src: `magnet:?xt=urn:btih:${"b".repeat(40)}`,
  };

  assert.equal(sourceIsAioStreamsCandidate(aioTorrent), true);
  assert.equal(sourceLooksTorrentLike(aioTorrent), true);
  assert.equal(sourceIsAioStreamsCandidate(torrentioTorrent), false);
  assert.equal(sourceLooksTorrentLike(torrentioTorrent), true);

  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const selectorSource = readFileSync(
    new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /const sourceIsTorrentPlaybackCandidate =/);
  assert.match(playerSource, /const hasNonAioTorrentPlaybackCandidate =/);
  assert.match(
    playerSource,
    /hasNonAioTorrentPlaybackCandidate[\s\S]{0,220}?sourceIsAioStreamsCandidate\(item\)[\s\S]{0,120}?return false/
  );
  assert.match(playerSource, /bestNonAioTorrentAutoplayCandidateIndex/);
  assert.match(playerSource, /aioFallbackShouldYieldStartup/);
  assert.match(playerSource, /activeAioShouldYieldToAlternative/);
  assert.match(playerSource, /aioStreamsStartupTakeoverPending/);
  assert.match(
    selectorSource,
    /hasNonAioTorrentCandidate[\s\S]{0,220}?aioStreamsFallback/
  );
  assert.match(selectorSource, /AIOStreams remains a manual\/final fallback/);
  assert.match(
    selectorSource,
    /return prioritiseCompatibleAutoplayEntries\(fallbackRanked\)/
  );

  const approvalStart = playerSource.indexOf("const autoplayEntryApproved =");
  const approvalEnd = playerSource.indexOf(
    "const bestApprovedAutoplaySourceIndex",
    approvalStart
  );
  assert.ok(approvalStart >= 0 && approvalEnd > approvalStart);
  const approvalBlock = playerSource.slice(approvalStart, approvalEnd);

  assert.doesNotMatch(approvalBlock, /cachedCompatibleTorrentCandidate/);
  assert.match(
    approvalBlock,
    /item\?\.launchQualified === true[\s\S]{0,100}?englishProof === "proven"/
  );
});

test("startup discovery cannot flash through unverified English candidates", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /bestEnglishAutoplayCandidateIndex/);
  assert.match(
    playerSource,
    /Number\(entry\?\.languageRank \?\? 3\) <= 3/
  );
  assert.match(
    playerSource,
    /type !== "provider"[\s\S]{0,350}?sourceNeedsCaching\(item\)/
  );

  const startupStart = playerSource.indexOf("READY-SOURCE FIRST");
  const startupEnd = playerSource.indexOf(
    "TRUSTED CACHED BACKGROUND BUILDER",
    startupStart
  );
  assert.ok(startupStart >= 0 && startupEnd > startupStart);
  const startupBlock = playerSource.slice(startupStart, startupEnd);

  assert.match(startupBlock, /startupAutoplayClaimRef/);
  assert.match(startupBlock, /startupAlreadyClaimed/);
  assert.match(
    startupBlock,
    /bestSourceShouldOwnStartup[\s\S]{0,220}?!startupAlreadyClaimed/
  );
  assert.match(
    startupBlock,
    /const switched = switchToSource\(nextAutomaticSourceIndex/
  );
  assert.match(
    startupBlock,
    /if \(switched && sourceSortMode === "best"\)[\s\S]{0,180}?claimed: true/
  );
  assert.match(
    startupBlock,
    /bestEnglishCandidateShouldOwnStartup/
  );
  const englishClaimStart = startupBlock.indexOf(
    "const bestEnglishCandidateShouldOwnStartup"
  );
  const englishClaimEnd = startupBlock.indexOf(
    "const nextAutomaticSourceIndex",
    englishClaimStart
  );
  assert.ok(englishClaimStart >= 0 && englishClaimEnd > englishClaimStart);
  const englishClaimBlock = startupBlock.slice(
    englishClaimStart,
    englishClaimEnd
  );
  assert.match(englishClaimBlock, /!startupAlreadyClaimed/);
  assert.match(englishClaimBlock, /bestApprovedAutoplaySourceIndex < 0/);
  assert.match(englishClaimBlock, /bestEnglishAutoplayCandidateIndex >= 0/);
  assert.match(
    startupBlock,
    /Preparing the best English source automatically/
  );
  const switchStart = startupBlock.indexOf(
    "const switched = switchToSource(nextAutomaticSourceIndex"
  );
  const claimStart = startupBlock.indexOf(
    'if (switched && sourceSortMode === "best")',
    switchStart
  );
  assert.ok(switchStart >= 0 && claimStart > switchStart);
  assert.match(
    startupBlock.slice(claimStart, claimStart + 260),
    /claimed: true/
  );

  assert.match(
    playerSource,
    /MAX_RAPID_IMMEDIATE_VOD_FAILOVERS = 2/
  );
  assert.match(
    playerSource,
    /RAPID_FAILOVER_WINDOW_MS = 8000/
  );
  assert.match(
    playerSource,
    /will not flash through the whole list/
  );
  assert.match(
    playerSource,
    /rapidImmediateCount = 0/
  );

  /*
   * Native Android playback must wait for either the approved cached winner or
   * the one-shot English candidate handoff. Otherwise an old AIO/provider row
   * can seize native ownership before activeIdx changes.
   */
  assert.match(playerSource, /approvedStartupTakeoverPending/);
  assert.match(playerSource, /englishStartupTakeoverPending/);
  const approvedGuardIndex = playerSource.indexOf(
    "approvedStartupTakeoverPending ||"
  );
  const nativeLaunchIndex = playerSource.indexOf("playNativeFireTv({");
  assert.ok(approvedGuardIndex >= 0);
  assert.ok(nativeLaunchIndex > approvedGuardIndex);

  const builderStart = playerSource.indexOf("TRUSTED CACHED BACKGROUND BUILDER");
  const builderEnd = playerSource.indexOf("recoveryResumeRef.current = 0", builderStart);
  assert.ok(builderStart >= 0 && builderEnd > builderStart);

  const builderBlock = playerSource.slice(builderStart, builderEnd);
  assert.doesNotMatch(
    builderBlock,
    /!titleKey[\s\S]{0,220}?isProvider\s*\|\|/
  );
  assert.match(
    builderBlock,
    /Number\(left\.languageRank \?\? 3\) - Number\(right\.languageRank \?\? 3\)/
  );
  assert.match(
    builderBlock,
    /Number\(left\.hardSubtitleRank \?\? 0\) - Number\(right\.hardSubtitleRank \?\? 0\)/
  );
});

test("manual source selection survives label enrichment and clears stale black-screen ownership", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const controlsSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerControls.jsx", import.meta.url),
    "utf8"
  );

  const keyStart = playerSource.indexOf("const stablePlaybackSourceKey");
  const hashBranchStart = playerSource.indexOf("if (hash) {", keyStart);
  const hashBranchEnd = playerSource.indexOf("const url =", hashBranchStart);
  assert.ok(keyStart >= 0 && hashBranchStart >= keyStart && hashBranchEnd > hashBranchStart);
  const hashBranch = playerSource.slice(hashBranchStart, hashBranchEnd);
  assert.match(hashBranch, /String\(item\?\.addon \|\| item\?\.debridProvider \|\| item\?\.sourceName \|\| ""\)/);
  assert.doesNotMatch(
    hashBranch,
    /sourceDisplayLabel\(item, fallbackIndex\)/
  );

  const switchStart = playerSource.indexOf("const switchToSource =");
  const switchEnd = playerSource.indexOf("const tryNextSource =", switchStart);
  assert.ok(switchStart >= 0 && switchEnd > switchStart);
  const switchBlock = playerSource.slice(switchStart, switchEnd);
  assert.match(
    switchBlock,
    /window\.__MG_NATIVE_PLAYBACK_ACTIVE__ = false/
  );
  assert.match(
    switchBlock,
    /forgetPersistentFailedTorrentHash\(selectedHash\)/
  );
  assert.match(
    switchBlock,
    /vodStartupAttemptedRef\.current\.delete\(nextIndex\)/
  );

  assert.match(controlsSource, /sourcePlaybackConfirmed/);
  assert.match(
    controlsSource,
    /currentTime > 0\.25[\s\S]{0,180}?setSourcePlaybackConfirmed\(true\)/
  );
  assert.match(
    controlsSource,
    /index === activeIdx[\s\S]{0,120}?sourcePlaybackConfirmed[\s\S]{0,100}?"Playing • "/
  );
});

test("Android Mobile resolved VOD is owned by the native Media3 player", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const mobileMainSource = readFileSync(
    new URL(
      "../android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(playerSource, /const isAndroidMobileNativeRuntime = \(\) =>/);
  assert.match(playerSource, /MediaGodMobile\|AndroidMobile/);
  assert.match(playerSource, /mg-android-mobile/);
  assert.match(playerSource, /mg-native-android-mobile/);
  assert.match(
    playerSource,
    /const useNativePlayback =[\s\S]{0,420}?isFireTvRemoteRuntime\(\)[\s\S]{0,120}?isAndroidMobileNativeRuntime\(\)/
  );
  assert.match(
    mobileMainSource,
    /MediaGodMobile\/1\.0 AndroidMobile/
  );
  assert.match(
    mobileMainSource,
    /mg-android-mobile','mg-native-android-mobile/
  );
});

test("VOD startup keeps a slow manual source mounted and only tries ready automatic alternatives", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  const nativePlaybackDeclaration = playerSource.indexOf(
    "const useNativePlayback ="
  );
  const start = playerSource.indexOf("VOD STARTUP WATCHDOG");
  const end = playerSource.indexOf(
    "if (!nativeFireTvPlayer)",
    start
  );
  assert.ok(nativePlaybackDeclaration >= 0);
  assert.ok(start > nativePlaybackDeclaration);
  assert.ok(end > start);
  const block = playerSource.slice(start, end);

  assert.match(block, /STARTUP_GRACE_MS = 12000/);
  assert.match(block, /MAX_AUTOMATIC_STARTUP_ATTEMPTS = 3/);
  assert.match(block, /manualSourceLockActive\(\)/);
  assert.match(block, /hasBufferedData/);
  assert.match(block, /setVodStartupNotice\(/);
  assert.doesNotMatch(block, /setRdError\(/);
  assert.match(block, /Number\(entry\?\.languageRank \?\? 3\) <= 3/);
  assert.match(block, /autoplayEntryApproved\(entry\)/);
  assert.doesNotMatch(block, /markSourceFailed\(/);
  assert.doesNotMatch(block, /markTorrentHashFailed\(/);
  assert.match(
    block,
    /without blacklisting it/
  );
  assert.match(playerSource, /data-mg-vod-startup-notice="true"/);
  assert.match(playerSource, /Torrent candidates \{Number\(source\?\.sourceDiagnostics\?\.cacheCandidateCount/);
});

test("a new playback request resets the old source index and manual lock", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /lastPlayRequestIdRef/);
  assert.match(
    playerSource,
    /lastPlayRequestIdRef\.current = nextPlayRequestId[\s\S]{0,260}?manualSourceLockRef\.current = \{[\s\S]{0,220}?startupAutoplayClaimRef\.current = \{[\s\S]{0,180}?claimed: false[\s\S]{0,120}?setActiveIdx\(0\)/
  );
});

test("full source-pool merge preserves runtime autoplay approval", () => {
  const hash = "d".repeat(40);
  const published = {
    infoHash: hash,
    label: "Approved cached fallback",
    type: "rd",
    runtimeQualificationFallback: true,
    debridCached: true,
    url: "magnet:?xt=urn:btih:" + hash,
  };
  const complete = {
    infoHash: hash,
    label: "Richer discovered row",
    type: "rd",
    debridCached: true,
    url: "magnet:?xt=urn:btih:" + hash,
    reportedSeeders: 100,
  };

  const merged = mergeCompleteSourcePool([published], [complete], {
    preservePublishedStatus: true,
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].runtimeQualificationFallback, true);
  assert.equal(merged[0].reportedSeeders, 100);
});


test("smart English autoplay ranks language without rejecting a resolved playing source", () => {
  const playerSource = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url),
    "utf8"
  );
  const providerSource = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url),
    "utf8"
  );

  assert.match(playerSource, /strictEnglishAutoplayRequired/);
  assert.match(playerSource, /resolvedMediaEnglishMainState/);

  const approvalStart = playerSource.indexOf("const autoplayEntryApproved =");
  const approvalEnd = playerSource.indexOf(
    "const bestApprovedAutoplaySourceIndex",
    approvalStart
  );
  assert.ok(approvalStart >= 0 && approvalEnd > approvalStart);
  const approvalBlock = playerSource.slice(approvalStart, approvalEnd);

  assert.match(approvalBlock, /if \(strictEnglishAutoplayRequired\)/);
  assert.match(approvalBlock, /item\?\.launchQualified === true/);
  assert.match(approvalBlock, /englishProof === "proven"/);
  assert.doesNotMatch(approvalBlock, /cachedCompatibleTorrentCandidate/);
  assert.match(
    playerSource,
    /Number\(entry\?\.languageRank \?\? 3\) <= 3/
  );
  const metadataGuard = playerSource.slice(playerSource.indexOf("const rejectResolvedForeignAutoplay ="),
    playerSource.indexOf("const tryNextSource ="));
  assert.match(metadataGuard, /return false/);
  assert.doesNotMatch(metadataGuard, /switchToSource\(|markSourceFailed\(/);
  assert.match(providerSource, /PROBE_BATCH_SIZE = 6/);
  assert.match(providerSource, /PER_SOURCE_PROBE_MS = 2400/);
  assert.match(
    providerSource,
    /nativeRuntimeAudioValidationAvailable[\s\S]{0,220}?runtimeFallbackSources/
  );
});

test("native audio repair never cycles to another source on uncertain sound", () => {
  for (const relativePath of [
    "../android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt",
    "../firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");

    assert.match(source, /strictEnglishStartupRequired\(\): Boolean = false/);
    assert.match(source, /group\.isTrackSelected\(index\) && group\.isTrackSupported\(index\)/);
    assert.match(source, /player !== activePlayer/);
    assert.equal((source.match(/enforcePreferredEnglishAudio\(/g) || []).length, 2);
    assert.equal(
      (source.match(/scheduleMissingAudioCheck\(/g) || []).length,
      3
    );
    assert.match(source, /onAudioPositionAdvancing\(/);
    assert.match(source, /if \(audioOutputConfirmed\) return@postDelayed/);
    assert.match(source, /native audio output never started/);
    assert.doesNotMatch(
      source,
      /Media3 selected an audio track but no decoded audio output advanced/
    );
  }
});
