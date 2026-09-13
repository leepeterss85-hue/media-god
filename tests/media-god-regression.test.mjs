import test from "node:test";
import assert from "node:assert/strict";

import {
  dedupeMergedChannels,
  normaliseCountryCode,
  parseFreeTvPlaylist,
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
  chooseRequestedTorrentFileForPlayback,
  chooseVideoFileForPlayback,
  normaliseRequestedFileIndex,
} from "../base44/functions/realDebrid/regressionHelpers.js";
import {
  guideNameAliases,
  normaliseGuideName,
} from "../base44/functions/getLiveEpg/nameMatching.js";

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

test("opaque Comet uncached rows remain comet_uncached", () => {
  assert.equal(
    chooseDebridResolutionStrategy({ cometUncached: true }),
    "comet_uncached"
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
});
