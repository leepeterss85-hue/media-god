import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createTvRemoteFocusTiming } from "../src/components/mg/tvRemoteFocusTiming.js";
import { getAndroidBoxSupportLines } from "../src/components/mg/androidBoxDiagnostics.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("working Live TV and channel playback return to the exact protected source baseline", () => {
  const bytes = readFileSync(new URL("../src/components/mg/LiveTVView.jsx", import.meta.url));
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const baseline = JSON.parse(read("scripts/protected-media-baseline.json"));
  assert.equal(checksum, baseline.files["src/components/mg/LiveTVView.jsx"]);
  const text = bytes.toString("utf8");
  assert.match(text, /data-mg-live-tv-search="true"/);
  assert.match(text, /onChange=\{\(event\) =>\s*setQuery\(/);
  assert.doesNotMatch(text, /LiveTvSearchField/);
});

test("Live TV microphone stays available through the existing search request prop, not via player edits", () => {
  const home = read("src/pages/Home.jsx");
  const voice = read("src/components/mg/LiveTvVoiceSearchAccessory.jsx");
  assert.match(home, /import LiveTvVoiceSearchAccessory/);
  assert.match(home, /<LiveTVView/);
  assert.match(home, /<LiveTvVoiceSearchAccessory onResult=\{onLiveTvVoiceResult\} \/>/);
  assert.match(home, /setLiveSearchRequest\(\(current\) => \(\{/);
  assert.match(home, /searchRequestKey=\{/);
  assert.match(voice, /createPortal\(/);
  assert.match(voice, /\[data-mg-live-tv-controls="true"\]/);
  assert.match(voice, /input\[aria-label="Search Live TV channels"\]/);
  assert.match(voice, /VoiceSearchButton/);
  assert.match(voice, /onResult=\{onResult\}/);
  assert.match(voice, /previousPadding/);
  assert.match(voice, /cancelAnimationFrame/);
});

test("remote measurements report actual WebView focus latency, not text or keys", () => {
  let at = 1000;
  const monitor = createTvRemoteFocusTiming({ now: () => at });
  monitor.onKeyDown({key:"ArrowDown"});
  at += 90;
  monitor.onFocusIn();
  monitor.onKeyDown({key:"x",keyCode:88});
  at += 1000;
  monitor.onFocusIn();
  monitor.onKeyDown({key:"ArrowRight"});
  at += 375;
  monitor.onFocusIn();
  monitor.onKeyDown({key:"ArrowDown",repeat:true});
  at += 900;
  monitor.onFocusIn();
  assert.deepEqual(monitor.snapshot(), {
    arrowKeys:2,focusMoves:2,slowFocusMoves:1,averageFocusMs:233,longestFocusMs:375,
  });
  const serialized=JSON.stringify(monitor.snapshot());
  assert.doesNotMatch(serialized,/ArrowDown|ArrowRight|example|title|url|password/i);
});

test("lost focus, hidden window and impossible timestamps cannot fake remote latency", () => {
  let at = 0;
  const monitor = createTvRemoteFocusTiming({now:()=>at});
  monitor.onKeyDown({keyCode:37});
  monitor.clearPending();
  at += 200;
  monitor.onFocusIn();
  monitor.onKeyDown({keyCode:38});
  at += 15000;
  monitor.onFocusIn();
  assert.equal(monitor.snapshot().focusMoves,0);
  assert.equal(monitor.snapshot().arrowKeys,2);
});

test("support report includes anonymised remote delay but not device or playback secrets", () => {
  const report = getAndroidBoxSupportLines({
    nav:{userAgent:"Mozilla/5.0 (Linux; Android 12; TV Box) Chrome/123 token=PRIVATE"},
    win:{},doc:{visibilityState:"visible"},
    counters:{tvRemoteFocus:{
      arrowKeys:12,focusMoves:10,slowFocusMoves:2,averageFocusMs:140,longestFocusMs:880,
    },recentErrors:[]},
  }).join("\n");
  assert.match(report,/Remote arrow presses received: 12/);
  assert.match(report,/Slow focus changes \(250ms\+\): 2/);
  assert.match(report,/WebView focus delay: 140ms average; 880ms longest/);
  assert.match(report,/wireless\/CEC delay is not measured/);
  assert.doesNotMatch(report,/PRIVATE|token=|https?:\/\//);
});
