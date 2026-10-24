import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Fire Stick main Play restores web scraper tabs before direct-source fallback", () => {
  const route = read("src/components/mg/fireTvCardPlay.js");
  assert.match(route, /getPlaybackDeviceProfile\(\)\.nativeFireTv/);
  assert.match(route, /player\.playOnlyFlix\(scraperMedia\)/);
  assert.match(route, /player\.playVidCore\(scraperMedia\)/);
  assert.ok(route.indexOf("player.playOnlyFlix(scraperMedia)") < route.indexOf("player.playVidCore(scraperMedia)"));
  assert.ok(route.indexOf("player.playVidCore(scraperMedia)") < route.indexOf("player.play({"));
  assert.match(route, /mediaType: type === "series" \? "tv" : type/);
  assert.match(route, /verifiedPlaybackPolicy: "strict"/);
  assert.match(route, /skipRdLookup: false/);
  assert.match(route, /skipAddonLookup: false/);
  assert.match(route, /type === "movie" \|\| type === "tv" \|\| type === "series"/);
  for (const file of ["MediaCard","HomeDashboard","DetailModal","EpisodeSelector","NewEpisodesRow","RecentlyWatchedRow"]) {
    assert.match(read("src/components/mg/" + file + ".jsx"), /launchFireTvCardPlay\(player,/);
  }
});

test("Manual source cards, Fire TV web backup tabs and LibVLC stay available", () => {
  const core = read("src/components/mg/MediaPlayerProvider.jsx");
  assert.match(core, /return url \? startEmbed\(url, media, "onlyflix"\) : false;/);
  const embedded = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  assert.match(embedded, /data-mg-embedded-top-sources="true"/);
  assert.match(embedded, /data-mg-embedded-top-fullscreen="true"/);
  assert.match(embedded, /initialFireTvScraper/);
  const cards = read("src/components/mg/MediaStreamSourcesBox.jsx");
  assert.match(cards, /label: "OnlyFlix • Multiple Servers"/);
  assert.match(cards, /player\.playVidCore\(/);
  const vlc = read("firetv-android/app/src/main/java/com/mediagod/firetv/PlaybackCompatibilityRouter.kt");
  assert.match(vlc, /default-libvlc-vod/);
});
