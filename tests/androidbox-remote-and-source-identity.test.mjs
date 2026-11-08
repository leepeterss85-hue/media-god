import test from "node:test";
import assert from "node:assert/strict";
import {
  createAndroidTvDpadDetector,
  isKnownTvUserAgent,
} from "../src/components/mg/runtimePlatform.js";
import { createRollingSourceChecks } from "../src/components/mg/rollingSourceChecks.js";

const flush = () => new Promise(resolve => setImmediate(resolve));

test("more generic Android TV boxes boot straight into remote mode", () => {
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 12; HOMATICS Box R 4K Plus) AppleWebKit/537.36",
    "Mozilla/5.0 (Linux; Android 11; Dune HD Homatics Box R) AppleWebKit/537.36",
    "Mozilla/5.0 (Linux; Android 10; ZIDOO Z9X) AppleWebKit/537.36",
    "Mozilla/5.0 (Linux; Android 9; TANIX TX6) AppleWebKit/537.36",
    "Mozilla/5.0 (Linux; Android 11; VONTAR X4) AppleWebKit/537.36",
    "Mozilla/5.0 (Linux; Android 12; STRONG LEAP-S3) AppleWebKit/537.36",
  ]) {
    assert.equal(isKnownTvUserAgent(ua), true, ua);
  }
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/156",
  ]) {
    assert.equal(isKnownTvUserAgent(ua), false, ua);
  }
});

test("unidentified Android TV box still confirms two consecutive DPAD arrows", () => {
  let at = 1000;
  const check = createAndroidTvDpadDetector({now: () => at});
  const context = {userAgent:"Mozilla/5.0 (Linux; Android 11; AOSP) Chrome/112"};
  assert.equal(check({key:"ArrowUp",keyCode:38},context),false);
  at += 200;
  assert.equal(check({key:"ArrowDown",keyCode:40},context),true);
});

test("Enter, typing or media actions between arrows never fake an Android TV remote", () => {
  let at = 1000;
  const check = createAndroidTvDpadDetector({now: () => at});
  const context = {userAgent:"Mozilla/5.0 (Linux; Android 14; generic) Chrome/112"};
  assert.equal(check({key:"ArrowUp",keyCode:38},context),false);
  at += 50;
  assert.equal(check({key:"Enter",keyCode:13},context),false);
  at += 50;
  assert.equal(check({key:"ArrowDown",keyCode:40},context),false);
  at += 50;
  assert.equal(check({key:"MediaPlayPause",keyCode:179},context),false);
  at += 50;
  assert.equal(check({key:"ArrowLeft",keyCode:37},context),false);
  at += 50;
  assert.equal(check({key:"ArrowRight",keyCode:39},context),true);
});

test("phone APK and editable fields still cannot activate generic TV mode", () => {
  let at = 100;
  const check = createAndroidTvDpadDetector({now: () => at});
  const context = {userAgent:"Mozilla/5.0 (Linux; Android 15; Pixel) MediaGodMobile/1.0",mobileApp:true};
  assert.equal(check({key:"ArrowRight",keyCode:39},context),false);
  at += 20;
  assert.equal(check({key:"ArrowLeft",keyCode:37},context),false);
  const generic = {userAgent:"Mozilla/5.0 (Linux; Android 14; AOSP)"};
  assert.equal(check({key:"ArrowRight",keyCode:39},{...generic,editable:true}),false);
  at += 20;
  assert.equal(check({key:"ArrowDown",keyCode:40},generic),false);
});

class FakeEvents extends EventTarget {
  constructor() { super(); this.visibilityState="visible"; this.timers=new Map(); this.nextId=0; }
  setInterval(callback, ms) { const id=++this.nextId; this.timers.set(id,{callback,ms}); return id; }
  clearInterval(id) { this.timers.delete(id); }
}

test("Android-box rolling checks do not conflate a movie and series with the same TMDB ID", async () => {
  const win = new FakeEvents(), doc = new FakeEvents();
  const seen = [], waiting = [];
  const stop = createRollingSourceChecks(
    () => [
      {tmdb_id:100,media_type:"movie",year:2026},
      {tmdbId:100,mediaType:"tv",year:2026},
      {id:100,type:"series",year:2026},
      {id:100,mediaType:"movie",year:2026},
    ],
    item => {seen.push(item.media_type || item.mediaType || item.type); return new Promise(resolve=>waiting.push(resolve));},
    {windowObject:win,documentObject:doc,batchSize:4}
  );
  await flush();
  assert.deepEqual(seen, ["movie","tv"], "Only one pending lookup per distinct media identity");
  stop();
  waiting.forEach(resolve=>resolve()); await flush();
  assert.equal(win.timers.size,0);
});
