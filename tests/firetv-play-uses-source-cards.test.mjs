import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Fire Stick main Play reuses native source-card playback rather than an iframe", () => {
  const provider = read("src/components/mg/MediaPlayerProvider.jsx");
  const cards = read("src/components/mg/MediaStreamSourcesBox.jsx");
  const player = read("src/components/mg/VideoPlayer.jsx");
  const bridge = read("src/components/mg/nativeFireTvBridge.js");
  assert.match(provider, /import \{ isNativeFireTvEmbedRemoteAvailable \} from/);
  assert.match(provider, /const playOnlyFlix = useCallback\(\(media\) => \{\s*\/\/ Fire Stick:/);
  assert.match(provider, /if \(isNativeFireTvEmbedRemoteAvailable\(\)\) \{\s*void play\(media\);\s*return true;/);
  assert.match(cards, /const playAddonStream =/);
  assert.match(cards, /await player\.play\(\{[\s\S]*?manualSourceSelection: !nonMediaSource/);
  assert.match(player, /playNativeFireTv/);
  assert.match(bridge, /export const isNativeFireTvEmbedRemoteAvailable = \(\) =>/);
});

test("Phone, tablet, and Base44 still use the original OnlyFlix iframe route", () => {
  const provider = read("src/components/mg/MediaPlayerProvider.jsx");
  const mobile = read("android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt");
  const fireTv = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");
  assert.match(provider, /const url = buildOnlyFlixEmbedUrl\(media\);\s*return url \? startEmbed\(url, media, "onlyflix"\) : false;/);
  assert.doesNotMatch(mobile, /fun setEmbeddedPlayerRemoteActive\(/);
  assert.match(fireTv, /fun setEmbeddedPlayerRemoteActive\(active: Boolean\)/);
});

test("Fire TV manual scraper options stay intact and Live TV remains unchanged", () => {
  const sources = read("src/components/mg/MediaStreamSourcesBox.jsx");
  const embedded = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  const portal = read("src/components/mg/PlayerPortalRenderer.jsx");
  for (const provider of ["onlyflix", "vidcore", "vidrift", "stellar", "vidsrc", "twoembed", "cinesrc", "multiembed"]) {
    assert.match(embedded, new RegExp(`id: "${provider}"`));
  }
  assert.match(sources, /label: "OnlyFlix • Multiple Servers"/);
  assert.match(sources, /player\.playVidCore\(/);
  assert.match(sources, /player\.playVidSrc\(/);
  assert.match(embedded, /data-mg-embedded-top-fullscreen="true"/);
  assert.match(embedded, /data-mg-embedded-top-sources="true"/);
  assert.match(portal, /<VidSrcEmbedPlayer/);
  assert.match(portal, /<VideoPlayer/);
});
