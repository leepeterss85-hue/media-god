import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOnlyFlixEmbedUrl } from "../src/components/mg/onlyFlixEmbed.js";
import {
  buildVidRiftEpisodeEmbedUrl,
  buildStellarEpisodeEmbedUrl,
} from "../src/components/mg/extraEmbedProviders.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sources = read("src/components/mg/MediaStreamSourcesBox.jsx");
const onlyFlix = read("src/components/mg/onlyFlixEmbed.js");
const provider = read("src/components/mg/MediaPlayerProvider.jsx");
const bridge = read("src/components/mg/nativeFireTvBridge.js");
const launcher = read("src/components/mg/reeznTvLauncher.js");
const main = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");
const manifest = read("firetv-android/app/src/main/AndroidManifest.xml");

test("ReeznTV appears as a clearly labelled external app handoff", () => {
  assert.match(sources, /id: "reezntv-external-app"/);
  assert.match(sources, /label: "ReeznTV app"/);
  assert.match(launcher, /launchNativeFireTvReeznTV\(\)/);
  assert.match(launcher, /https:\/\/reezntvapp\.com\/download/);
  assert.match(sources, /onClick: \(\) => launchReeznTv\(\)/);
  assert.match(sources, /External app • open ReeznTV and choose the live channel/);
  assert.match(sources, /mediaType === "live"/);
  assert.doesNotMatch(sources, /mediaType !== "live" \? \[\{\s*id: "reezntv-external-app"/);
});

test("Fire TV launches the installed ReeznTV app by its launcher label or package name", () => {
  assert.match(bridge, /native\.launchReeznTvApp/);
  assert.match(main, /fun launchReeznTvApp\(\): Boolean/);
  assert.match(main, /label\.contains\("reezn", ignoreCase = true\)/);
  assert.match(main, /packageId\.contains\("reezn", ignoreCase = true\)/);
  assert.match(manifest, /<category android:name="android\.intent\.category\.LAUNCHER" \/>/);
});

test("OnlyFlix multi-server webpage is offered for films and TV episodes", () => {
  assert.match(sources, /label: "OnlyFlix • Multiple Servers"/);
  assert.match(sources, /choose an available server for this film or episode/);
  assert.match(sources, /onClick: \(\) => onlyFlixTitlePageUrl && window\.open\(onlyFlixTitlePageUrl/);
  assert.match(sources, /buildOnlyFlixTitlePageUrl/);
  assert.match(onlyFlix, /https:\/\/onlyflix\.to\//);
  assert.match(onlyFlix, /media\?\.title/);
  assert.match(provider, /const playOnlyFlix = useCallback/);
  assert.match(provider, /buildOnlyFlixEmbedUrl\(media\)/);
});

test("TV Play uses the movie OnlyFlix player with two optional episode backups", () => {
  const episode = { tmdbId: 1399, mediaType: "tv", season: 1, episode: 3 };
  assert.equal(buildOnlyFlixEmbedUrl(episode),
    "https://share.cdnm.ink/embed/tmdb/1399?season=1&episode=3");
  assert.equal(buildVidRiftEpisodeEmbedUrl(episode),
    "https://embed.vidrift.net/embed/tv/1399/1/3?exit=1");
  assert.equal(buildStellarEpisodeEmbedUrl(episode),
    "https://stellar.rip/en/watch/embed/tv/1399-1-3?autoPlay=true&nextButton=true&autoNext=true");
  for (const build of [buildVidRiftEpisodeEmbedUrl, buildStellarEpisodeEmbedUrl]) {
    assert.equal(build({ ...episode, mediaType: "movie" }), "");
    assert.equal(build({ ...episode, episode: 0 }), "");
    assert.equal(build({ ...episode, tmdbId: "nonsense" }), "");
  }
  const episodeSelector = read("src/components/mg/EpisodeSelector.jsx");
  const newEpisodes = read("src/components/mg/NewEpisodesRow.jsx");
  const embeddedPlayer = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  assert.match(episodeSelector, /!startTime && player\.playOnlyFlix\?\.\(baseRequest\)/);
  assert.match(episodeSelector, /player\.play\(\{/);
  assert.match(newEpisodes, /player\.playOnlyFlix\?\.\(\{/);
  assert.match(newEpisodes, /if \(player\.play\)/);
  assert.match(embeddedPlayer, /data-mg-episode-player-backups/);
  assert.match(embeddedPlayer, /aria-pressed=\{activeEpisodePlayer === option\.id\}/);
  assert.match(embeddedPlayer, /src=\{selectedUrl\}/);
  assert.match(embeddedPlayer, /data-mg-embedded-open-sources="true"/);
  assert.match(embeddedPlayer, /media\?\.mediaType === "tv"/);
});

test("ReeznTV app handoff remains limited to Live TV", () => {
  assert.match(sources, /mediaType === "live" \? \[\{\s*id: "reezntv-external-app"/);
  assert.doesNotMatch(sources, /External app • choose this title inside ReeznTV/);
});
