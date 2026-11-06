import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isKnownTvUserAgent } from "../src/components/mg/runtimePlatform.js";

const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("more Android TV box models are recognised without catching phones", () => {
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 10; Formuler Z11 Pro) Chrome/110",
    "Mozilla/5.0 (Linux; Android 9; T95 Max) Chrome/90",
    "Mozilla/5.0 (Linux; Android 11; X96 Mini) Chrome/98",
    "Mozilla/5.0 (Linux; Android 9; Dynalink DL-AT4K) Chrome/96",
    "Mozilla/5.0 (Linux; Android 9; BRAVIA 4K VH2) Chrome/95",
    "Mozilla/5.0 (Linux; Android 11; Amlogic) Chrome/101",
    "Mozilla/5.0 (Linux; Android 9; Leanback) AppleWebKit/537.36",
    "Mozilla/5.0 (Linux; Android 12; Mi TV Stick) Chrome/104",
  ]) {
    assert.equal(isKnownTvUserAgent(ua), true, ua);
  }

  for (const ua of [
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari",
    "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Safari",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126",
  ]) {
    assert.equal(isKnownTvUserAgent(ua), false, ua);
  }
});

test("a confirmed Android TV box remote is remembered like Fire Stick hardware", () => {
  const runtime = read("src/components/mg/runtimePlatform.js");
  const main = read("src/main.jsx");

  // Stored only after a real remote press, and never for phones, tablets,
  // touch/desktop devices or anything reporting a mouse pointer.
  assert.match(runtime, /TV_REMOTE_MEMORY_KEY/);
  assert.match(runtime, /export const rememberTvRemote/);
  assert.match(runtime, /export const hasRememberedTvRemote/);
  assert.match(runtime, /export const forgetTvRemote/);
  assert.match(runtime, /hasRememberedTvRemote\(\)\s*\)/);
  assert.match(runtime, /any-pointer: fine/);
  assert.match(runtime, /forgetTvRemote\(\)/);

  assert.match(main, /rememberTvRemote/);
  assert.match(main, /tvRemoteDetected = true[\s\S]{0,200}rememberTvRemote\(\)/);
});