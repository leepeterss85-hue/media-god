import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { episodeAutoprepareCandidates } from "../src/components/mg/episodeAutoprepare.js";

const hash = "a".repeat(40);
const caseEpisode = { season: 1, episode: 1 };
const stream = (overrides = {}) => ({
  id: "test-episode",
  type: "torrent",
  infoHash: hash,
  title: "Breaking.Bad.S01E01.1080p.WEB-DL.mkv",
  ...overrides,
});

test("one-click fallback prepares an exact episode RD magnet when zero sources are verified cached", () => {
  const [prepared] = episodeAutoprepareCandidates([
    stream({ src: "https://hosted.example.invalid/error.mp4", addon: "Torrentio" }),
  ], caseEpisode);
  assert.equal(prepared.episodeAutoPrepare, true);
  assert.equal(prepared.type, "torrent");
  assert.equal(prepared.src, `magnet:?xt=urn:btih:${hash}`);
  assert.equal(prepared.url, prepared.src);
  assert.equal(prepared.infoHash, hash);
});

test("missing torrent identity or explicitly wrong episode cannot be guessed into autoplay", () => {
  assert.deepEqual(episodeAutoprepareCandidates([
    { title: "Breaking Bad S01E01", type: "url", src: "https://stream.example.invalid/video.mp4" },
    stream({ infoHash: "", src: "", url: "", magnet: "" }),
    stream({ title: "Breaking.Bad.S01E02.720p.mkv" }),
    stream({ title: "Breaking.Bad.S02E01.720p.mkv" }),
    stream({ type: "status" }),
  ], caseEpisode), []);
});

test("only non-foreign non-commentary proper torrent sources can be prepared automatically", () => {
  const result = episodeAutoprepareCandidates([
    stream({ audioLanguage: "fr", id: "foreign" }),
    stream({ audioLanguage: "en", id: "english" }),
    stream({ audioLanguage: "unknown", id: "unknown", infoHash: "b".repeat(40) }),
    stream({ name: "Commentary only", id: "commentary", filename: "Audio commentary" }),
  ], caseEpisode);
  assert.deepEqual(result.map(item => item.id), ["english", "unknown"]);
});

test("prefer actually cached and trusted torrent releases over unknown uncached guesses", () => {
  const result = episodeAutoprepareCandidates([
    stream({ id: "uncached", infoHash: "a".repeat(40), cacheRequired: true }),
    stream({ id: "cached", infoHash: "b".repeat(40), debridCached: true }),
    stream({ id: "aio", infoHash: "c".repeat(40), addon: "AIOStreams" }),
  ], caseEpisode);
  assert.deepEqual(result.map(item => item.id), ["cached", "uncached", "aio"]);
});

test("reuse the full rich magnet and retain all manually selectable torrent rows", () => {
  const rich = `magnet:?xt=urn:btih:${hash}&tr=https%3A%2F%2Ftracker.example.invalid`;
  const original = [
    stream({ richMagnet: rich, src: "https://hosted.example.invalid/placeholder.mp4" }),
    stream({ id: "other", infoHash: "b".repeat(40) }),
  ];
  const prepared = episodeAutoprepareCandidates(original, caseEpisode);
  assert.equal(prepared[0].src, rich);
  assert.equal(original[0].src, "https://hosted.example.invalid/placeholder.mp4");
  assert.equal(original.length, 2);
  assert.equal(prepared.length, 2);
});

test("provider starts fallback early and final publication preserves autoplay preparation", () => {
  const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  const video = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
  assert.match(provider, /if \(mediaType === "tv" && hasRd && !request\?\.skipEpisodeAutoPrepare\)/);
  assert.match(provider, /publishEarlySources\(fallback\.slice\(0, 1\)/);
  assert.match(provider, /const episodePreparationLeads = qualificationMode &&/);
  assert.match(provider, /episodeAutoprepareCandidates\(orderedSources, \{ season, episode \}\)/);
  assert.match(provider, /runtimeFallbackSources\.length > 0\s*\? runtimeFallbackSources\s*: episodePreparationLeads/);
  assert.match(provider, /stableDiscoveredSourceKey\(episodePreparationLeads\[0\]\)/);
  assert.match(video, /item\?\.episodeAutoPrepare === true && Boolean\(sourceTorrentHash\(item\)\)/);
  assert.match(video, /const activeNeedsCaching =/);
  assert.match(video, /const switchToSource =/);
  assert.match(video, /manualSourceLockActive\(\)/);
  assert.match(video, /const nextSource = findNextPlayableSource\(activeIdx\)/);
});

test("FlixQuest remains the preferred direct lead and no-sound error videos are excluded", () => {
  const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  assert.match(provider, /runtimeEpisodeSources\.length > 0\s*\? runtimeEpisodeSources/);
  assert.match(provider, /flixQuestFirstEpisodeSources\(episodeAutoplayCandidates/);
  assert.match(provider, /\.filter\(episodeAutoplayCanTrustSource\)/);
  assert.deepEqual(episodeAutoprepareCandidates([], caseEpisode), []);
});
