import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseVylaSseFrame, normaliseVylaEpisodeCandidate, validVylaPilotBase,
} from "../base44/functions/_shared/vylaSseProtocol.js";
import { flixQuestFirstEpisodeSources } from "../src/components/mg/episodeSourcePolicy.js";

const context = { season: 1, episode: 1 };
const event = url => ({ type: "source", source: {
  url, label: "1080p English", provider: "licensed-test-provider",
  season: 1, episode: 1, audioLanguage: "en",
}});

test("SSE parser accepts data frames with an event name and ignores malformed input", () => {
  const frame = 'event: source\r\ndata: {"source":{"url":"https://media.example.test/a.m3u8"}}\r\n';
  assert.equal(parseVylaSseFrame(frame).type, "source");
  assert.equal(parseVylaSseFrame("data: {invalid"), null);
  assert.equal(parseVylaSseFrame("event: meta"), null);
  assert.equal(parseVylaSseFrame("data: " + "X".repeat(50000)), null);
});

test("direct candidate accepts correct HTTPS episode but remains unverified by decoder", () => {
  const candidate = normaliseVylaEpisodeCandidate(event("https://media.example.test/episode.m3u8"), context);
  assert.equal(candidate.episodeResolver, "vyla");
  assert.equal(candidate.runtimeQualificationFallback, true);
  assert.equal(candidate.launchQualified, false);
  assert.equal(candidate.season, 1);
  assert.equal(candidate.episode, 1);
});

test("unsafe, wrong-episode, foreign-audio, or ad/placeholder results are rejected", () => {
  for (const url of ["http://example.test/video.mp4", "https://127.0.0.1/x",
    "https://localhost/x", "https://192.168.1.10/x", "https://user:pass@media.example.test/x"]) {
    assert.equal(normaliseVylaEpisodeCandidate(event(url), context), null, url);
  }
  assert.equal(normaliseVylaEpisodeCandidate({ ...event("https://media.example.test/x"), source: {
    ...event("https://media.example.test/x").source, episode: 2,
  }}, context), null);
  assert.equal(normaliseVylaEpisodeCandidate({ ...event("https://media.example.test/x"), source: {
    ...event("https://media.example.test/x").source, audioLanguage: "fr",
  }}, context), null);
  assert.equal(normaliseVylaEpisodeCandidate({ ...event("https://media.example.test/x"), source: {
    ...event("https://media.example.test/x").source, label: "Stream not found",
  }}, context), null);
});

test("only a configured HTTPS service URL is accepted, never app-supplied URLs", () => {
  assert.equal(validVylaPilotBase("https://vyla.example.test/api"), "https://vyla.example.test/api/");
  assert.equal(validVylaPilotBase("http://vyla.example.test"), "");
  assert.equal(validVylaPilotBase("https://localhost:7860"), "");
  assert.equal(validVylaPilotBase("https://vyla.example.test/api?token=secret"), "");
});

test("Vyla direct pilot ranks ahead of torrent and FlixQuest while preserving manual choices", () => {
  const vyla = normaliseVylaEpisodeCandidate(event("https://media.example.test/episode.m3u8"), context);
  const torrent = { addon: "Torrentio", type: "torrent", infoHash: "a".repeat(40) };
  const flix = { episodeResolver: "flixquest", src: "https://media.example.test/backup.mp4" };
  assert.deepEqual(flixQuestFirstEpisodeSources([torrent, flix, vyla]), [vyla, torrent, flix]);
  const provider = readFileSync(new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8");
  assert.match(provider, /vylaTvPilotEnabled\(\)/);
  assert.match(provider, /publishEarlySources\(result.streams/);
  assert.match(provider, /!isLive && mediaType === "tv"/);
  const endpoint = readFileSync(new URL("../base44/functions/vylaEpisodePilot/entry.ts", import.meta.url), "utf8");
  assert.match(endpoint, /VYLA_TV_PILOT_ENABLED/);
  assert.match(endpoint, /VYLA_STREAM_API_URL/);
  assert.match(endpoint, /VYLA_STREAM_API_TOKEN/);
  assert.match(endpoint, /7500/);
});
