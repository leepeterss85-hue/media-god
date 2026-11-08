import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redactSupportErrorMessage, MAX_SUPPORT_ERROR_LENGTH } from "../src/components/mg/supportErrorRedaction.js";
import {
  MAX_RECENT_SUPPORT_ERRORS,
  getAndroidBoxSupportLines,
  installAndroidBoxDiagnostics,
  snapshotAndroidBoxDiagnostics,
} from "../src/components/mg/androidBoxDiagnostics.js";

const status = message => {
  const e = new Event("mg:player-status");
  e.detail = { message };
  return e;
};

test("support report retains actionable playback errors, HTTP statuses and decoder failures", () => {
  const useful = [
    "HTTP 429: Real-Debrid rate limited",
    "Media3 DecoderInitializationException: unsupported HEVC hardware decoder",
    "Playback failed: source timed out after 15 seconds",
    "Failed to play video: no supported codec",
    "Video removed by provider for copyright reasons",
  ];
  for (const message of useful) {
    assert.equal(redactSupportErrorMessage(message), message);
  }
});

test("redact URLs, authorization headers, credentials, magnet IDs and private file paths", () => {
  const unsafe = [
    "Playback failed: https://cdn.example.test/video.mp4?token=abc-secret&rd_token=xQw",
    "HTTP 403 Authorization: Bearer this-is-a-private-token",
    "OAuth failed: access_token=red-abc-987 refresh_token:abc-special",
    "Request denied: api_key=1234apikey password=awfulPassword secret=secretValue",
    "Torrent error magnet:?xt=urn:btih:0123456789012345678901234567890123456789",
    "File missing /storage/emulated/0/Download/user/secret.mov",
    "Error file:///data/user/0/my.app/cache/privatefile",
    "Failed sending to example.person@example.org on 192.168.1.33:9090",
    "Process failed for session_id=private-session",
  ].join("\n");
  const safe = redactSupportErrorMessage(unsafe);
  assert.match(safe, /Playback failed/);
  for (const secret of [
    "cdn.example.test", "abc-secret", "private-token", "red-abc-987",
    "1234apikey", "awfulPassword", "secretValue", "btih", "secret.mov",
    "my.app/cache", "example.person", "192.168.1.33", "private-session",
  ]) assert.ok(!safe.includes(secret), secret);
  assert.ok(safe.length <= MAX_SUPPORT_ERROR_LENGTH);
});

test("script and promise errors retain redacted messages without saving a stack trace", () => {
  const win = new EventTarget();
  const stop = installAndroidBoxDiagnostics(win);
  const baseline = snapshotAndroidBoxDiagnostics().recentErrors.length;

  win.dispatchEvent(status("Unable to play HTTP 429: https://media.example.test/stream?token=SECRET123"));
  const crash = new Event("error");
  crash.message = "TypeError: codec worker failed at /storage/emulated/0/private.js";
  crash.error = {stack:"Bearer never-save-this-stack", message:"Unsafe"};
  win.dispatchEvent(crash);
  const rejection = new Event("unhandledrejection");
  rejection.reason = {message:"Request timed out: Bearer private-credential", stack:"super secret stack"};
  win.dispatchEvent(rejection);

  const report = getAndroidBoxSupportLines().join("\n");
  assert.match(report, /Recent errors \(redacted; newest last\):/);
  assert.match(report, /\[playback\] Unable to play HTTP 429:/);
  assert.match(report, /\[script\] TypeError: codec worker failed at \[path redacted\]/);
  assert.match(report, /\[promise\] Request timed out: \[credential redacted\]/);
  assert.doesNotMatch(report, /SECRET123|media\.example|never-save-this-stack|private-credential|super secret stack|private\.js/);
  assert.ok(snapshotAndroidBoxDiagnostics().recentErrors.length >= baseline);
  stop();
});

test("diagnostics keep only the last few errors, copying does not require account credentials", () => {
  const win = new EventTarget();
  const stop = installAndroidBoxDiagnostics(win);
  for (let i=0; i<MAX_RECENT_SUPPORT_ERRORS+9; i++) {
    win.dispatchEvent(status("Playback failed: HTTP " + (500+i)));
  }
  const snap = snapshotAndroidBoxDiagnostics();
  assert.equal(snap.recentErrors.length, MAX_RECENT_SUPPORT_ERRORS);
  assert.equal(snap.recentErrors.at(-1).message, "Playback failed: HTTP " + (509+MAX_RECENT_SUPPORT_ERRORS-6));
  assert.equal(snap.recentErrors[0].category, "playback");
  stop();

  const src = readFileSync(new URL("../src/components/mg/androidBoxDiagnostics.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /(?:localStorage|sessionStorage)\.setItem/);
  assert.doesNotMatch(src, /(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/);
  const settings = readFileSync(new URL("../src/components/mg/SettingsView.jsx", import.meta.url), "utf8");
  assert.match(settings, /\.\.\.getAndroidBoxSupportLines\(\)/);
});

test("short structured incident details do not become private URL exports", () => {
  const inputs = [
    "Media3 decoder failed: https://stream.example/large.mp4?expires=123&signature=ab",
    '401 Unauthorized {"rd_token":"private"}',
    "Out of memory: https://bad.example.test/very-long-file?key=private",
  ];
  for (const value of inputs) {
    const message = redactSupportErrorMessage(value);
    assert.match(message, /(?:decoder failed|401 Unauthorized|Out of memory)/);
    assert.doesNotMatch(message, /stream\.example|bad\.example|rd_token|private/);
  }
});
