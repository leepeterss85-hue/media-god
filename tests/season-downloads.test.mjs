import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fileMatchesSeasonEpisode,
  readySeasonTorrentCandidates,
  candidatesForSeasonEpisode,
  seasonEpisodeNumbers,
} from "../src/components/mg/seasonMediaDownloads.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const entries = [
  { id: "e1", filename: "The.Expanse.S02E01.1080p.mkv", status: "downloaded" },
  { id: "e2", filename: "The.Expanse.2x02.mkv", status: "downloaded" },
  { id: "pack", filename: "The.Expanse.Season.2.Complete", status: "downloaded" },
  { id: "season1", filename: "The.Expanse.Season.1.Complete", status: "downloaded" },
  { id: "other", filename: "The.Exorcist.S02E02.mkv", status: "downloaded" },
  { id: "pending", filename: "The.Expanse.S02E03.mkv", status: "downloading" },
  { id: "wrongEp", filename: "The.Expanse.S02E12.mkv", status: "downloaded" },
];

test("download season candidates are title, status and season exact", () => {
  assert.deepEqual(readySeasonTorrentCandidates(entries, {
    title: "The Expanse", season: 2
  }).map(x => x.id), ["e1", "e2", "pack", "wrongEp"]);
  assert.deepEqual(readySeasonTorrentCandidates(entries, {
    title: "The Expanse", season: 1
  }).map(x => x.id), ["season1"]);
  assert.deepEqual(readySeasonTorrentCandidates(entries, {
    title: "Completely different", season: 2
  }), []);
  assert.deepEqual(readySeasonTorrentCandidates(entries, {
    title: "The Expanse", season: null
  }), []);
});

test("exact file check blocks the wrong episode and wrong season, even from a pack", () => {
  assert.equal(fileMatchesSeasonEpisode("The Expanse S02E02.mp4", 2, 2), true);
  assert.equal(fileMatchesSeasonEpisode("/Pack/Season 2/Show.2x02.mkv", 2, 2), true);
  assert.equal(fileMatchesSeasonEpisode("The.Expanse.S02E01.mkv", 2, 2), false);
  assert.equal(fileMatchesSeasonEpisode("Show.S03E02.mkv", 2, 2), false);
  assert.equal(fileMatchesSeasonEpisode("The.Expanse.S02.pack.mkv", 2, 2), false);
  assert.equal(fileMatchesSeasonEpisode("The.Expanse.S02E02.S02E03.mkv", 2, 2), false);
  assert.equal(fileMatchesSeasonEpisode("", 2, 2), false);
});

test("episode candidate choice prefers exact ready files over packs", () => {
  const choices = candidatesForSeasonEpisode(
    readySeasonTorrentCandidates(entries, { title: "The Expanse", season: 2 }), 2, 2
  );
  assert.deepEqual(choices.map(x => x.id), ["e2", "pack"]);
  assert.deepEqual(candidatesForSeasonEpisode([], 2, 2), []);
  assert.deepEqual(seasonEpisodeNumbers([
    { episode_number: 3 }, { episode_number: 2 }, { episode_number: 2 },
    { episode_number: 0 }, { episode_number: "wrong" }, { episode_number: 1 },
  ]), [1, 2, 3]);
});

test("season download UI is beside season selector and retains individual episode downloads", () => {
  const selector = read("src/components/mg/EpisodeSelector.jsx");
  const bulk = read("src/components/mg/SeasonDownloadPicker.jsx");
  const legacy = read("src/components/mg/MediaDownloadPicker.jsx");
  assert.match(selector, /data-mg-download-season="true"/);
  assert.match(selector, /<SeasonDownloadPicker/);
  assert.match(selector, /episodes=\{airedEpisodes\}/);
  assert.match(selector, /data-mg-episode-download="true"/);
  assert.match(selector, /<MediaDownloadPicker/);
  assert.match(bulk, /action: "torrents_list"/);
  assert.match(bulk, /action: "torrent_info"/);
  assert.match(bulk, /fileMatchesSeasonEpisode\(result\.filename, season, episode\)/);
  assert.match(bulk, /downloadableMedia\(result, result\.filename\)/);
  assert.match(bulk, /startDeviceDownload\(file\)/);
  assert.match(bulk, /queuedEpisodesRef\.current\.has\(episode\)/);
  assert.match(bulk, /data-mg-season-download-start="true"/);
  assert.match(bulk, /!hasNativeDownload/);
  assert.match(bulk, /cancelRef\.current/);
  assert.match(legacy, /data-mg-main-page-save="true"/);
});
