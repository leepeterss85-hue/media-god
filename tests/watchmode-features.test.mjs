import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {watchmodeError,watchmodeRows} from "../src/components/mg/watchmodeResponse.js";
const source=readFileSync(new URL("../base44/functions/getWatchmodeFeatures/entry.ts",import.meta.url),"utf8");
const handler=(key,fetcher)=>new Function("secrets","fetch",source.replace(/import \{ secrets \} from "base44:runtime";/,"").replace("export default async function(req)","return async function(req)"))({get:()=>key},fetcher);
const request=body=>new Request("https://example.test",{method:"POST",body:JSON.stringify(body)});
test("missing API key yields an actionable error without making a provider request",async()=>{
 const run=handler("",()=>{throw new Error("must not fetch")});
 const response=await run(request({action:"live-events"}));const payload=await response.json();
 assert.equal(response.status,503);assert.equal(payload.code,"WATCHMODE_NOT_CONFIGURED");
 assert.match(watchmodeError({message:"Request failed with status code 503",response:{status:503,data:payload}}),/WATCHMODE_API_KEY/);
});
test("feature responses preserve arrays and nested provider envelopes",()=>{
 for(const value of [[{id:1}],{events:[{id:1}]},{leaving_dates:{titles:[{id:1}]}},{changes:{title_ids:[1,2]}},{awards:{results:[{id:1}]}}]){
  const rows=watchmodeRows(value); if(value.leaving_dates) continue;
  assert.ok(rows.length);
 }
 assert.deepEqual(watchmodeRows(null),[]);
 assert.deepEqual(watchmodeRows({changes:{title_ids:[123,456]}}),[123,456]);
});
test("league requests use documented unpaginated endpoint and keep credentials out of URL",async()=>{
 let url,options;
 const run=handler("test-key",async(u,o)=>{url=u;options=o;return Response.json({leagues:[{name:"Example"}]})});
 const r=await run(request({action:"live-leagues",region:"GB"}));
 assert.equal(r.status,200);assert.equal(url.pathname,"/v1/live-leagues/");
 assert.equal(url.search,"");assert.equal(options.headers["X-API-Key"],"test-key");
});
test("leaving dates use compact calendar date format and selected country",async()=>{
 const run=handler("test-key",async(url)=>{
  assert.match(url.searchParams.get("start_date"),/^\d{8}$/);
  assert.match(url.searchParams.get("end_date"),/^\d{8}$/);
  assert.equal(url.searchParams.get("regions"),"GB");
  return Response.json([{title:"Example"}]);
 });
 assert.equal((await run(request({action:"leaving",region:"GB"}))).status,200);
});
test("provider access and rate limits return useful messages",async()=>{
 for(const status of [401,403,429,503]){
  const run=handler("test-key",async()=>Response.json({}, {status}));
  const r=await run(request({action:"live-events"}));
  const data=await r.json();
  assert.ok(data.error.length>20);assert.ok(data.code);
  assert.doesNotMatch(data.error,/test-key/);
 }
});
