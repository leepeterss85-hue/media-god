import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const embed = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
const backend = read("base44/functions/vylaStreamPilot/entry.ts");
const player = read("src/components/mg/MediaPlayerProvider.jsx");
const portal = read("src/components/mg/PlayerPortalRenderer.jsx");
const enhanced = read("src/components/mg/PlayerProvider.jsx");

test("Vyla stays an explicit test choice for BOTH TV episodes and films", () => {
  assert.match(embed, /data-mg-vyla-test-player="true"/);
  assert.match(embed, /onClick=\{\(\) => setActiveEpisodePlayer\("vyla"\)\}/);
  assert.match(embed, /const \[activeEpisodePlayer, setActiveEpisodePlayer\] = useState\("onlyflix"\)/);
  assert.match(embed, /media\?\.mediaType === "tv"/);
  assert.match(embed, /media\?\.mediaType === "movie"/);
  assert.match(embed, /media_type: vylaType/);
  assert.match(embed, /season: vylaSeason, episode: vylaEpisode/);
  assert.match(embed, /data-mg-vyla-source-panel="true"/);
  assert.match(embed, /verifiedPlaybackPolicy: "strict"/);
  assert.match(embed, /skipAddonLookup: true/);
  assert.match(embed, /skipRdLookup: true/);
  assert.match(embed, /onClick=\{\(\) => launchVylaCandidate\(candidate\)\}/);
  assert.match(player, /const playOnlyFlix = useCallback/);
});

test("embedded-player Vyla cannot read the enhanced context outside its provider", () => {
  // The portal is rendered inside CorePlayerProvider, beside (not inside)
  // PlayerAutomationBridge, so the enhanced usePlayer hook throws immediately.
  assert.match(player, /<PlayerContext\.Provider value=\{value\}>[\s\S]*<PlayerPortalRenderer/);
  assert.match(enhanced, /<CorePlayerProvider>[\s\S]*<PlayerAutomationBridge>/);
  assert.match(portal, /<OnlyFlixEmbedPlayer/);
  assert.match(embed, /import \{ usePlayer \} from "@\/components\/mg\/MediaPlayerProvider"/);
  assert.doesNotMatch(embed, /import \{ usePlayer \} from "@\/components\/mg\/PlayerProvider"/);
  assert.match(embed, /const player = usePlayer\(\)/);
});

test("Vyla lookup is server-side, bounded and rejects unqualified links", () => {
  assert.match(backend, /import \{ secrets \} from "base44:runtime"/);
  assert.match(backend, /VYLA_STREAM_API_TOKEN/);
  assert.match(backend, /VYLA_MANUAL_TEST_ENABLED/);
  assert.match(backend, /trailer\|teaser\|commentary\|preview/);
  assert.match(backend, /requiresHeaders/);
  assert.match(backend, /proxyHeaders/);
  assert.match(backend, /"https:"/);
  assert.match(backend, /streams\.length < 6/);
  assert.match(backend, /bytes < 262144/);
  assert.match(backend, /new URL\(type, base\.endsWith/);
  assert.match(backend, /redirect: "error"/);
  assert.doesNotMatch(embed, /VYLA_STREAM_API_TOKEN/);
});
