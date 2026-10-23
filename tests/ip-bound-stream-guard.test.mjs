import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isElfHostedUrl,
  isServerIssuedIpBoundVod,
  excludeServerIssuedIpBoundVod,
} from "../src/components/mg/ipBoundVodSafety.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("only server-issued IP-locked direct VOD links are rejected", () => {
  assert.equal(isElfHostedUrl("https://aiostreams.elfhosted.com/stream/file"),true);
  assert.equal(isElfHostedUrl("https://mediafusion.elfhosted.com/x"),true);
  assert.equal(isElfHostedUrl("https://example.com/elfhosted.com/x"),false);
  const serverItems = [
    {type:"url",addon:"AIOStreams",url:"https://cdn.example/video1"},
    {type:"url",addon:"MediaFusion",url:"https://cdn.example/video2"},
    {type:"url",addon:"Misc",url:"https://comet.elfhosted.com/stream/1"},
    {type:"url",addon:"Torrentio",url:"https://cdn.example/working.mp4"},
    {type:"rd",addon:"AIOStreams",url:"https://cdn.example/debrid"},
    {type:"magnet",addon:"MediaFusion",url:"magnet:?xt=urn:btih:abc"},
    {type:"url",addon:"AIOStreams",url:"https://cdn.example/device",browserFallback:true},
    {type:"url",addon:"Comet",url:"https://cdn.example/workingComet"},
  ];
  assert.equal(isServerIssuedIpBoundVod(serverItems[0]),true);
  const filtered=excludeServerIssuedIpBoundVod(serverItems);
  assert.equal(filtered.length,5);
  assert.deepEqual(filtered,serverItems.slice(3));
});

test("both autoplay discovery and manual Sources guard server results before merging browser sources",()=>{
  for (const filename of ["MediaPlayerProvider.jsx","MediaStreamSourcesBox.jsx"]) {
    const source=read("src/components/mg/"+filename);
    assert.match(source,/excludeServerIssuedIpBoundVod\(data\?\.streams\)/);
    assert.match(source,/fetchBrowserAddonStreams/);
  }
  const backend=read("base44/functions/fetchAddonStreams/entry.ts");
  assert.match(backend,/ipBoundElfHostedOrigin/);
  assert.match(backend,/\(\^\|\\\.\)elfhosted/);
  assert.doesNotMatch(backend,/addonUrlParts\?\.basePath && addonUrlParts\.basePath !== "\/"/);
  assert.match(backend,/deferIpBoundDirectToBrowser/);
  assert.match(backend,/item\?\.type === "url"/);
  assert.match(backend,/ipBoundDirectStreams \+= 1/);
});

test("Vyla removes server-minted ElfHosted addresses before candidates reach Media God", () => {
  const vyla=read("base44/functions/vylaStreamPilot/entry.ts");
  assert.match(vyla,/const urlHost =/);
  assert.match(vyla,/const sourceProvider =/);
  assert.match(vyla,/elfhosted/);
  assert.match(vyla,/mediafusion/);
  assert.match(vyla,/return null/);
  const player=read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  assert.match(player,/data-mg-try-next-web-source="true"/);
  assert.match(player,/beginTorrentFallback/);
});

test("Continue Watching cannot reopen known IP-bound saved direct links",()=>{
  const row=read("src/components/mg/ContinueWatchingRow.jsx");
  assert.match(row,/savedDirectIsIpBound/);
  assert.match(row,/isIpBoundHostedProvider\(savedSource\)/);
  assert.match(row,/!isElfHostedUrl\(savedUrl\)/);
  assert.match(row,/startTime: Number\(item\.progress \|\| 0\)/);
  assert.match(row,/resumeFromHistory: true/);
});

test("live TV and the established default movie and episode players are untouched",()=>{
  const player=read("src/components/mg/MediaPlayerProvider.jsx");
  assert.match(player,/const playOnlyFlix = useCallback/);
  assert.match(player,/const playVidCore = useCallback/);
  const other=read("src/components/mg/PlayerPortalRenderer.jsx");
  assert.match(other,/<VidCoreEmbedPlayer/);
});
