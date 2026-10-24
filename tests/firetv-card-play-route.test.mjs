import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Fire Stick main Play uses the native direct-source-card route, never the automatic iframe", () => {
  const route = read("src/components/mg/fireTvCardPlay.js");
  assert.match(route, /getPlaybackDeviceProfile\(\)\.nativeFireTv/);
  assert.match(route, /player\.play\(\{/);
  assert.match(route, /verifiedPlaybackPolicy: "strict"/);
  assert.match(route, /skipRdLookup: false/);
  assert.match(route, /skipAddonLookup: false/);
  assert.match(route, /type === "movie" \|\| type === "tv" \|\| type === "series"/);
  for (const file of ["MediaCard","HomeDashboard","DetailModal","EpisodeSelector","NewEpisodesRow","RecentlyWatchedRow"]) {
    assert.match(read("src/components/mg/" + file + ".jsx"), /launchFireTvCardPlay\(player,/);
  }
});
test("Protected core, existing manual scrapers and phone-only routing remain unchanged", () => {
  const core = read("src/components/mg/MediaPlayerProvider.jsx");
  assert.match(core, /return url \? startEmbed\(url, media, "onlyflix"\) : false;/);
  const embedded = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  assert.match(embedded, /data-mg-embedded-top-sources="true"/);
});
