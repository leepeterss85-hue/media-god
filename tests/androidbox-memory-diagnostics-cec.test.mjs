import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_SOURCE_STATUS_ENTRIES,
  MAX_SOURCE_WAITING_CHECKS,
  catalogueSourceKey,
  createCatalogueSourceChecker,
} from "../src/components/mg/catalogueSourceAvailability.js";
import {
  getAndroidBoxSupportLines,
  snapshotAndroidBoxDiagnostics,
  installAndroidBoxDiagnostics,
} from "../src/components/mg/androidBoxDiagnostics.js";
import {
  isAndroidCecBackKey,
  isAndroidCecConfirmKey,
  createTvBackEventDeduper,
} from "../src/components/mg/tvCecRemoteCompatibility.js";

const movie = id => ({media_type:"movie",tmdb_id:id,title:"Film " + id,year:2026});
const good = {data:{streams:[{debridCached:true,src:"https://cdn.example.test/video.mp4"}]}};
const flush = () => new Promise(resolve=>setImmediate(resolve));
const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Android-box optional catalogue checks have bounded status and waiting queues", async () => {
  assert.ok(MAX_SOURCE_STATUS_ENTRIES <= 128);
  assert.ok(MAX_SOURCE_WAITING_CHECKS <= 64);
  let inFlight=0;
  const releases=[], started=[];
  const checker=createCatalogueSourceChecker(async (_name,payload) => {
    started.push(payload.tmdb_id);
    inFlight++;
    await new Promise(resolve=>releases.push(resolve));
    inFlight--;
    return good;
  },{concurrency:1,maxStatusEntries:2,maxWaitingChecks:2});
  const p1=checker.check(movie(1));
  const p2=checker.check(movie(2));
  const p3=checker.check(movie(3));
  const p4=checker.check(movie(4));
  assert.equal(await p4,"unknown","Optional work over limit must not add memory pressure");
  await flush();
  assert.deepEqual(started,[1]);
  assert.equal(inFlight,1);
  releases.shift()();await flush();
  assert.deepEqual(started,[1,2]);
  releases.shift()();await flush();
  assert.deepEqual(started,[1,2,3]);
  releases.shift()();await flush();
  assert.deepEqual(await Promise.all([p1,p2,p3]),["found","found","found"]);
  assert.equal(checker.getStatus(movie(1)),"unknown","Old completed hint should be evicted");
  assert.equal(checker.getStatus(movie(2)),"found");
  assert.equal(checker.getStatus(movie(3)),"found");
  assert.equal(checker.getStatus(movie(4)),"unknown");
});

test("queued duplicate movies share work without bypassing memory limit", async () => {
  const releases=[], started=[];
  const checker=createCatalogueSourceChecker(async (_name,payload) => {
    started.push(payload.tmdb_id);
    await new Promise(resolve=>releases.push(resolve));
    return good;
  },{concurrency:1,maxWaitingChecks:1});
  const a=checker.check(movie(5));
  const b=checker.check(movie(6));
  const duplicate=checker.check({...movie(6),title:"Same film alias"});
  const overflow=checker.check(movie(7));
  assert.equal(await overflow,"unknown");
  await flush();
  assert.deepEqual(started,[5]);
  releases.shift()();await flush();
  assert.deepEqual(started,[5,6]);
  releases.shift()();await flush();
  assert.deepEqual(await Promise.all([a,b,duplicate]),["found","found","found"]);
  assert.equal(started.length,2);
});

test("diagnostics expose only broad Android/WebView device information and anonymous counters", () => {
  const secret="super-secret-title";
  const ua="Mozilla/5.0 (Linux; Android 12; TV Box; wv) Version/4.0 Chrome/123.0 Mobile Safari/537.36 token="+secret;
  const lines=getAndroidBoxSupportLines({
    nav:{userAgent:ua,deviceMemory:2,hardwareConcurrency:4,connection:{effectiveType:"4g"}},
    win:{matchMedia: query=>({matches:query.includes("coarse")})},
    doc:{visibilityState:"visible"},
    counters:{playerStatusEvents:3,playbackErrorNotices:2,scriptErrors:1,resourceErrors:4,unhandledRejections:0,offlineTransitions:1},
  }).join("\n");
  assert.match(lines,/Android major version: 12/);
  assert.match(lines,/Android WebView \/ Chromium 123/);
  assert.match(lines,/2 GB \(estimate\)/);
  assert.match(lines,/Playback error notices: 2/);
  assert.match(lines,/Script errors \(count only\): 1/);
  assert.match(lines,/Input pointer type: coarse/);
  assert.doesNotMatch(lines,new RegExp(secret));
  assert.doesNotMatch(lines,/https?:\/\/|Bearer |token=/);
});

test("runtime error counter never stores player messages, source URLs or rejects", () => {
  const win=new EventTarget();
  const before=snapshotAndroidBoxDiagnostics();
  const stop=installAndroidBoxDiagnostics(win);
  assert.equal(installAndroidBoxDiagnostics(win),stop,"Duplicate mounting must not double count");
  const status=new Event("mg:player-status");
  status.detail={message:"Could not play https://private.example.test/secret.mp4?token=never-store"};
  win.dispatchEvent(status);
  const script=new Event("error");
  script.message="Bearer secret-session";
  win.dispatchEvent(script);
  win.dispatchEvent(new Event("offline"));
  const after=snapshotAndroidBoxDiagnostics();
  assert.equal(after.playbackErrorNotices,before.playbackErrorNotices+1);
  assert.equal(after.scriptErrors,before.scriptErrors+1);
  assert.equal(after.offlineTransitions,before.offlineTransitions+1);
  assert.doesNotMatch(JSON.stringify(after),/secret|private\.example|Bearer|token=/);
  stop();
  win.dispatchEvent(status);
  assert.equal(snapshotAndroidBoxDiagnostics().playbackErrorNotices,after.playbackErrorNotices);
});

test("HDMI-CEC remote Back works only in known TV mode", () => {
  assert.equal(isAndroidCecBackKey({key:"Unidentified",keyCode:111},{tvMode:true}),true);
  assert.equal(isAndroidCecBackKey({key:"Back",keyCode:0},{tvMode:true}),true);
  assert.equal(isAndroidCecBackKey({key:"TVBack",keyCode:0},{tvMode:true}),true);
  assert.equal(isAndroidCecBackKey({key:"Back",keyCode:0},{tvMode:false}),false);
  assert.equal(isAndroidCecBackKey({key:"Enter",keyCode:13},{tvMode:true}),false);
});

test("HDMI-CEC OK / numpad Enter is available on TV login, not normal phones", () => {
  assert.equal(isAndroidCecConfirmKey({key:"Unidentified",keyCode:160},{tvMode:true}),true);
  assert.equal(isAndroidCecConfirmKey({key:"OK",keyCode:0},{tvMode:true}),true);
  assert.equal(isAndroidCecConfirmKey({key:"OK",keyCode:0},{tvMode:false}),false);
  assert.equal(isAndroidCecConfirmKey({key:"Enter",keyCode:13},{tvMode:true}),false);
  const auth=read("src/components/mg/FireTvAuthNavigation.jsx");
  assert.match(auth,/isAndroidCecConfirmKey\(event, \{ tvMode: isFireTv\(\) \}\)/);
});

test("non-extensible native Back events cannot navigate twice in capture phase", () => {
  const alreadyHandled=createTvBackEventDeduper();
  const event=Object.freeze({key:"Back",keyCode:111});
  assert.equal(alreadyHandled(event),false);
  assert.equal(alreadyHandled(event),true);
  assert.equal(alreadyHandled(Object.freeze({key:"Back"})),false);
  const main=read("src/main.jsx");
  assert.match(main,/alreadyHandled\(event\)/);
  assert.match(main,/isAndroidCecBackKey\(event/);
});

test("copy support report includes device data without raw UA or URLs", () => {
  const settings=read("src/components/mg/SettingsView.jsx");
  assert.match(settings,/\.\.\.getAndroidBoxSupportLines\(\)/);
  assert.doesNotMatch(settings,/Browser:.*navigator\.userAgent/);
  const diag=read("src/components/mg/androidBoxDiagnostics.js");
  assert.doesNotMatch(diag,/(?:localStorage|sessionStorage)\.setItem/);
  const main=read("src/main.jsx");
  assert.match(main,/installAndroidBoxDiagnostics\(\)/);
  const source=read("src/components/mg/catalogueSourceCheckerClient.js");
  assert.match(source,/maxStatusEntries: 48, maxWaitingChecks: 24/);
  assert.equal(catalogueSourceKey({media_type:"tv",tmdb_id:42}),"");
});
