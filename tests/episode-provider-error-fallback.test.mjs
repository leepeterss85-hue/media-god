import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isUnverifiedHostedEpisodeStream,
  episodeAutoplayCanTrustSource,
  rankEpisodeSourceChoices,
} from "../src/components/mg/episodeLaunchTrust.js";

const flixQuest = {
  provider: "flixquest-showbox",
  episodeResolver: "flixquest",
  src: "https://example.test/breaking-bad-s01e01.m3u8",
  type: "url",
};
const mediaFusionErrorClip = {
  addon: "MediaFusion",
  label: "720p · MediaFusion",
  url: "https://mediafusion.elfhosted.com/stream/1396/1/1",
  type: "url",
};
const torrentio = {
  addon: "Torrentio",
  name: "Breaking.Bad.S01E01.1080p.WEB-DL.mkv",
  infoHash: "a".repeat(40),
  type: "torrent",
};
const reliableRd = {
  addon: "MediaFusion",
  url: "https://real-debrid.example.test/stream.mp4",
  viaRealDebrid: true,
  debridCached: true,
  launchQualified: true,
  type: "url",
};

test("Breaking Bad S01E01: unverified MediaFusion error-video URL is not autoplay-approved", () => {
  assert.equal(isUnverifiedHostedEpisodeStream(mediaFusionErrorClip), true);
  assert.equal(episodeAutoplayCanTrustSource(mediaFusionErrorClip), false);
  assert.equal(episodeAutoplayCanTrustSource(torrentio), true);
  assert.equal(episodeAutoplayCanTrustSource(flixQuest), true);
});

test("confirmed cached/qualified MediaFusion stays available for automatic episode playback", () => {
  assert.equal(isUnverifiedHostedEpisodeStream(reliableRd), false);
  assert.equal(episodeAutoplayCanTrustSource(reliableRd), true);
  assert.equal(isUnverifiedHostedEpisodeStream({
    ...mediaFusionErrorClip, runtimePlaybackVerified: true,
  }), false);
});

test("episode chooser prioritises alternatives and retains FlixQuest as backup", () => {
  const entries = [mediaFusionErrorClip, torrentio, reliableRd, flixQuest]
    .map((item, index) => ({ item, index }));
  const ranked = rankEpisodeSourceChoices(entries);
  assert.deepEqual(ranked.map(({ index }) => index), [1, 2, 3, 0]);
  assert.deepEqual(new Set(ranked.map(({ index }) => index)), new Set([0, 1, 2, 3]));
  assert.equal(rankEpisodeSourceChoices([entries[0]])[0], entries[0]);
});

test("other providers, movies and Live TV are outside the new MediaFusion-only gate", () => {
  const other = { ...mediaFusionErrorClip, addon: "Comet", label: "Comet", url: "https://other.example.test/media.mp4" };
  assert.equal(isUnverifiedHostedEpisodeStream(other), false);
  assert.equal(isUnverifiedHostedEpisodeStream({ addon: "MediaFusion", type: "torrent", infoHash: "b".repeat(40) }), false);
  const player = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  const selector = readFileSync(new URL("../src/components/mg/sourceSelectorPreferences.js", import.meta.url), "utf8");
  assert.match(provider, /initialAudioCandidates = !isLive && mediaType === "tv"/);
  assert.match(provider, /\.filter\(episodeAutoplayCanTrustSource\)/);
  assert.match(provider, /No verified episode stream is ready yet/);
  assert.match(player, /playbackMediaType !== "tv" \|\| episodeAutoplayCanTrustSource\(item\)/);
  assert.match(player, /Unverified •/);
  assert.match(selector, /rankEpisodeSourceChoices\(ranked\)/);
});

test("FlixQuest backup remains ahead of unverified error clips when no trusted addon is available", () => {
  const ranked = rankEpisodeSourceChoices([
    { item: mediaFusionErrorClip, index: 0 },
    { item: flixQuest, index: 1 },
  ]);
  assert.equal(ranked[0].index, 1);
  assert.equal(ranked[1].index, 0);
});
