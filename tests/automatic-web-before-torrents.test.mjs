import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  nextWebFallback,
  mediaForTorrentFallback,
  WEB_FALLBACK_LOAD_TIMEOUT_MS,
} from "../src/components/mg/automaticWebFallback.js";
import { buildOnlyFlixEmbedUrl } from "../src/components/mg/onlyFlixEmbed.js";
import { buildVidCoreEmbedUrl } from "../src/components/mg/vidCoreEmbed.js";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const web = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
const coreVidCore = read("src/components/mg/VidCoreEmbedPlayer.jsx");
const portal = read("src/components/mg/PlayerPortalRenderer.jsx");
const core = read("src/components/mg/MediaPlayerProvider.jsx");

test("Web fallback keeps original first choice and exhausts other web players before Vyla and torrents", () => {
  const options = ["onlyflix", "vidcore", "vidsrc", "vidrift", "stellar",
    "vidlink", "twoembed", "cinesrc", "multiembed"].map((id) => ({id,url:"https://example.com/"+id}));
  let active = options[0].id;
  const seen = [active];
  for (let i=0;i<11;i++) {
    active = nextWebFallback(options, active, true, seen);
    seen.push(active);
    if (active === "torrents") break;
  }
  assert.deepEqual(seen, [
    "onlyflix","vidcore","vidsrc","vidrift","stellar","vidlink",
    "twoembed","cinesrc","multiembed","vyla","torrents",
  ]);
  assert.equal(nextWebFallback(options,"multiembed",false),"torrents");
  assert.equal(nextWebFallback(options,"vyla",true),"torrents");
  assert.equal(nextWebFallback(options,"onlyflix",true,["vidcore","vidsrc"]),"vidrift");
});

test("Exact TV episode fallback never changes season/episode or becomes a generic show", () => {
  const media={mediaType:"tv",tmdbId:1399,season:2,episode:3,title:"Series"};
  assert.match(buildOnlyFlixEmbedUrl(media), /season=2&episode=3/);
  assert.match(buildVidCoreEmbedUrl(media), /\/tv\/1399\/2\/3$/);
  const fallback=mediaForTorrentFallback(media);
  assert.equal(fallback.mediaType,"tv");
  assert.equal(fallback.season,2);
  assert.equal(fallback.episode,3);
  assert.equal(fallback.rdSeason,2);
  assert.equal(fallback.rdEpisode,3);
  assert.equal(fallback.skipRdLookup,false);
  assert.equal(fallback.skipAddonLookup,false);
  assert.deepEqual(fallback.sources,[]);
});

test("Sources, native player and Live TV protected core are not rewritten", () => {
  assert.match(portal,/onOpenSources=\{onOpenSources\}/);
  assert.match(core,/const playOnlyFlix = useCallback/);
  assert.match(core,/const playVidCore = useCallback/);
  assert.match(web,/initialEpisodeProvider = "onlyflix"/);
  assert.match(web,/const tvBackups = useMemo/);
  assert.match(web,/const movieBackups = useMemo/);
  assert.match(web,/id: "twoembed"/);
  assert.match(web,/id: "cinesrc"/);
  assert.match(web,/id: "multiembed"/);
  assert.match(web,/id: "vidrift"/);
  assert.match(web,/id: "stellar"/);
  assert.match(web,/id: "vidsrc"/);
  assert.match(web,/id: "vidcore"/);
  assert.match(web,/data-mg-vyla-test-player="true"/);
  assert.match(web,/data-mg-embedded-open-sources="true"/);
});

test("Automatic escalation only follows iframe load failure; a loaded iframe is never timed out", () => {
  assert.equal(WEB_FALLBACK_LOAD_TIMEOUT_MS,30000);
  assert.match(web,/if \(!iframeLoadedRef\.current\) advanceAfterFailure\(\)/);
  assert.match(web,/onLoad=\{\(\) => \{ iframeLoadedRef\.current = true; \}\}/);
  assert.match(web,/onError=\{advanceAfterFailure\}/);
  assert.match(web,/return \(\) => window\.clearTimeout\(timeout\)/);
  assert.match(web,/setAutoRecovery\(false\)/);
  assert.match(web,/data-mg-try-next-web-source="true"/);
  assert.doesNotMatch(web,/setInterval\(/);
});

test("Last web candidate automatically queries Vyla before torrents, never starts both at once", () => {
  assert.match(web,/const next = nextWebFallback\(/);
  assert.match(web,/if \(next === "torrents"\) \{\s*beginTorrentFallback\(\)/);
  assert.match(web,/if \(next === "vyla"\)/);
  assert.match(web,/if \(activeEpisodePlayer !== "vyla" \|\| !autoRecovery/);
  assert.match(web,/vylaResult\.streams\.filter/);
  assert.match(web,/skipAddonLookup: true/);
  assert.match(web,/skipRdLookup: true/);
  assert.match(web,/sources: candidates/);
  assert.match(web,/completeSources: candidates/);
  assert.match(web,/else \{\s*beginTorrentFallback\(\)/);
  assert.match(web,/if \(torrentStartedRef\.current\) return/);
});

test("Working VidCore movie default is preserved and only failures enter the other scrapers", () => {
  assert.match(coreVidCore,/data-mg-vidcore-player="true"/);
  assert.match(coreVidCore,/url=\{url\}/);
  assert.match(coreVidCore,/onLoad=\{\(\) => \{ loadedRef\.current = true; \}\}/);
  assert.match(coreVidCore,/if \(!loadedRef\.current\) setNeedsRecovery\(true\)/);
  assert.match(coreVidCore,/initialFailedProvider="vidcore"/);
  assert.match(coreVidCore,/data-mg-vidcore-try-next="true"/);
  assert.match(coreVidCore,/mediaForTorrentFallback\(fallbackMedia\)/);
});
