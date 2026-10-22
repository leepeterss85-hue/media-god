import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/components/mg/ContinueWatchingRow.jsx");
const player = read("src/components/mg/VideoPlayer.jsx");
const drawer = read("src/components/mg/InPlayerSourceDrawer.jsx");
const onlyflix = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
const portal = read("src/components/mg/PlayerPortalRenderer.jsx");
const provider = read("src/components/mg/MediaPlayerProvider.jsx");

test("Continue Watching uses a single card without outside Other sources button", () => {
  assert.doesNotMatch(home, /chooseAnotherSource|Other sources/);
  assert.match(home, /onClick=\{\(\) => openDetail\(item\)\}/);
  assert.match(home, /resumeFromHistory:\s*true/);
  // Don't relock a saved HTTP address to an expired link.
  assert.doesNotMatch(home, /skipAddonLookup:\s*true|skipRdLookup:\s*true|noRd:\s*true/);
});

test("Continue Watching offers movie and exact-episode player tabs without changing resume", () => {
  // Resume still restores the saved file and seek position. Players is
  // a separate explicit action, not an alternate primary-card click.
  assert.match(home, /data-mg-continue-player-options="true"/);
  assert.match(home, /onClick=\{\(event\) => openPlayerOptions\(item, event\)\}/);
  assert.match(home, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(home, /event\?\.stopPropagation\(\)/);
  assert.match(home, /player\.playOnlyFlix\?\.\(\{/);
  assert.match(home, /mediaType: meta\.mediaType/);
  assert.match(home, /type: isTv \? "series" : "movie"/);
  assert.match(home, /season: isTv \? meta\.season : undefined/);
  assert.match(home, /episode: isTv \? meta\.episode : undefined/);
  assert.match(home, /if \(!launched\)\s*\{[\s\S]*?await openDetail\(item\)/);
  assert.match(home, /if \(hasSavedSource\) \{/);
  assert.match(home, /startTime: Number\(item\.progress \|\| 0\)/);
  // Same top-of-player options that normal Play exposes.
  assert.match(onlyflix, /data-mg-movie-player-backups=/);
  assert.match(onlyflix, /data-mg-episode-player-backups=/);
  assert.match(onlyflix, /buildTwoEmbedEmbedUrl\(media\)/);
  assert.match(onlyflix, /buildCineSrcEmbedUrl\(media\)/);
  assert.match(onlyflix, /buildMultiEmbedEmbedUrl\(media\)/);
  assert.match(onlyflix, /buildVidRiftEpisodeEmbedUrl\(media\)/);
  assert.match(onlyflix, /buildStellarEpisodeEmbedUrl\(media\)/);
});

test("the VideoPlayer always has its own usable Sources button for VOD", () => {
  assert.match(player, /data-mg-open-in-player-sources="true"/);
  assert.match(player, /!isLive\s*&&\s*\(\s*<button/);
  assert.match(player, /onClick=\{\(\) => setInPlayerSourcesOpen\(true\)\}/);
  assert.match(player, /<InPlayerSourceDrawer/);
  assert.match(player, /entries=\{selectableSourceEntries\}/);
  assert.match(player, /selectSource\(index, item\)/);
  assert.match(player, /sourceLabel=\{sourceCacheStateLabel\}/);
});

test("the source drawer stays in the player and uses stable buttons even while discovery is changing", () => {
  assert.match(drawer, /data-mg-in-player-source-drawer="true"/);
  assert.match(drawer, /data-mg-source-drawer-list="true"/);
  assert.match(drawer, /data-mg-source-choice=\{index\}/);
  assert.match(drawer, /onSelect\?\.\(index, item\)/);
  assert.match(drawer, /Looking for alternative sources/);
  assert.match(drawer, /No alternative sources found/);
  assert.doesNotMatch(drawer, /window\.location|location\.href|history\.push/);
});

test("embedded OnlyFlix player exposes Media God source discovery inside the player, not on Home", () => {
  assert.match(onlyflix, /data-mg-embedded-open-sources="true"/);
  assert.match(onlyflix, /onClick=\{onOpenSources\}/);
  assert.match(portal, /onOpenSources=\{onOpenSources\}/);
  assert.match(provider, /onOpenSources=\{\(\) => \{/);
  assert.match(provider, /verifiedPlaybackPolicy: "strict"/);
  assert.match(provider, /skipAddonLookup: false/);
  assert.match(provider, /skipRdLookup: false/);
  assert.match(provider, /sources: \[\],\s*completeSources: \[\],\s*discoveredSources: \[\]/);
});
