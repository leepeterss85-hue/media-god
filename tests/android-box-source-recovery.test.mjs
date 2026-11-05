import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchAddonSourcesWithPublicFallback } from "../src/api/addonSourceRecovery.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("an authenticated addon with usable streams is returned unchanged and never searches publicly", async () => {
  const personal = {data:{streams:[{name:"My private addon",infoHash:"a".repeat(40)}],diagnostics:[{name:"Personal",status:"ok"}]}};
  let publicCalls=0;
  const result=await searchAddonSourcesWithPublicFallback({title:"Film"},{
    readToken:async()=> "private-session",
    searchPersonal:async(_,opts)=>{
      assert.equal(opts.token,"private-session");
      assert.equal(opts.timeoutMs,22_000);
      return personal;
    },
    searchPublic:async()=>{publicCalls++;return {data:{streams:[]}};},
  });
  assert.equal(result,personal);
  assert.equal(publicCalls,0);
});

test("a signed-in HTTP 200 with no addon streams recovers separate public results", async () => {
  const payload={tmdb_id:"42", title:"Example", media_type:"movie"};
  const personal={data:{streams:[],reason:"Torrentio returned 429",diagnostics:[{name:"Private addon",status:"http_429"}],addons_checked:3}};
  const publicResult={data:{streams:[{infoHash:"f".repeat(40)}],diagnostics:[{name:"Public addon",status:"ok"}],addons_checked:2}};
  const result=await searchAddonSourcesWithPublicFallback(payload,{
    readToken:async()=> "session-not-for-public",
    searchPersonal:async()=>personal,
    searchPublic:async input=>{assert.equal(input,payload);assert.equal("token" in input,false);return publicResult;},
  });
  assert.equal(result.data.streams.length,1);
  assert.equal(result.data.diagnostics.length,2);
  assert.equal(result.data.addons_checked,3);
  assert.match(result.data.reason,/Recovered public sources/);
});

test("network failure or missing session uses public route; missing public results preserve personal diagnosis", async () => {
  let calls=0;
  const query={title:"Example"};
  const deps={
    readToken:async()=>{throw Error("Expired token");},
    searchPersonal:async()=>{throw Error("Should not be called");},
    searchPublic:async()=>{calls++;return {data:{streams:[{name:"Public"}]}};},
  };
  assert.equal((await searchAddonSourcesWithPublicFallback(query,deps)).data.streams.length,1);
  assert.equal(calls,1);
  const privateResult={data:{streams:[],reason:"Provider timeout",diagnostics:[{status:"unreachable"}]}};
  const none=await searchAddonSourcesWithPublicFallback(query,{
    readToken:async()=> "a",
    searchPersonal:async()=>privateResult,
    searchPublic:async()=>({data:{streams:[]}}),
  });
  assert.equal(none,privateResult);
  const failed=await searchAddonSourcesWithPublicFallback(query,{
    readToken:async()=>"a",
    searchPersonal:async()=>{throw Error("Gateway timeout");},
    searchPublic:async()=>({data:{streams:[{name:"Fallback"}]}}),
  });
  assert.equal(failed.data.streams[0].name,"Fallback");
});

test("Railway metadata reuses cache and in-flight identical work before quota, with separate route budgets", () => {
  const code=read("deploy/media-god-api/server.mjs");
  const cacheHit=code.indexOf("const cached = cache.get(key)");
  const pending=code.indexOf("const pending = inflight.get(key)");
  const rateLimit=code.indexOf("const rateKey = ");
  assert.ok(cacheHit>0 && pending>cacheHit && rateLimit>pending,
    "Cache hits and identical concurrent requests must bypass upstream work quota");
  assert.match(code,/\$\{ipFor\(req\)\}\|\$\{route\}/);
  assert.match(code,/"\/functions\/resolveImdb": 240/);
  assert.match(code,/"\/functions\/fetchAddonStreams": 100/);
  assert.match(code,/if \(inflight\.get\(key\) === task\) inflight\.delete\(key\)/);
  assert.match(code,/emptySourceLookup \? 8_000 : CACHE_MS/);
  assert.doesNotMatch(code,/const RATE_LIMIT = 150/);
});

test("Android TV Sources displays each successful discovery stage before optional browser/embed checks finish", () => {
  const code=read("src/components/mg/MediaStreamSourcesBox.jsx");
  const serverStage=code.indexOf("// A TV box must not wait");
  const browserStage=code.indexOf("shouldUseBrowserAddonFallback(",serverStage);
  const browserResult=code.indexOf("// Browser recovery can add more choices");
  const optionalEmbed=code.indexOf("const tmdbEmbed = await fetchTmdbEmbedStreams",browserResult);
  assert.ok(serverStage>0 && serverStage<browserStage);
  assert.ok(browserResult>browserStage && browserResult<optionalEmbed);
  assert.match(code.slice(serverStage,browserStage),/setAddonStreams\(streams\)/);
  assert.match(code.slice(browserResult,optionalEmbed),/setAddonStreams\(streams\)/);
  assert.match(code,/cancelled/);
});

test("scraper URLs still use an embedded web player and direct streams keep their native player", () => {
  const scraper=read("src/components/mg/fireTvCardPlay.js");
  const player=read("src/components/mg/MediaPlayerProvider.jsx");
  assert.match(scraper,/Never pass an OnlyFlix\/VidCore webpage URL to LibVLC/);
  assert.match(scraper,/player\.playOnlyFlix\(scraperMedia\)/);
  assert.match(player,/const playOnlyFlix = useCallback\(\(media\) => \{/);
  assert.match(player,/startEmbed\(url, media, "onlyflix"\)/);
});
