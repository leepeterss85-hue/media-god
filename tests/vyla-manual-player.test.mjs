import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const embed = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
const backend = read("base44/functions/vylaStreamPilot/entry.ts");
const player = read("src/components/mg/MediaPlayerProvider.jsx");

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
