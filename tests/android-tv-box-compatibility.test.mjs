import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAndroidTvDpadDetector,
  isKnownTvUserAgent,
} from "../src/components/mg/runtimePlatform.js";
import { isFireTvHardware } from "../src/components/mg/mobileUpdaterCompatibility.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("TV detection supports generic Android TV/Google TV devices as well as Fire Stick", () => {
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36",
    "Mozilla/5.0 (Linux; Android 11; Google TV) Chrome/101",
    "NVIDIA SHIELD Android TV",
    "Mi Box S Android 9",
    "MIBOX 4.0",
    "Mecool KM2",
    "Mozilla/5.0 (Linux; Android 9; AFTMM) MediaGodFireTV/1.0",
  ]) {
    assert.equal(isKnownTvUserAgent(ua), true, ua);
    assert.equal(isFireTvHardware({ userAgent: ua }), true, ua);
  }
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile",
    "Mozilla/5.0 (Linux; Android 15; Samsung Galaxy Tab) Chrome",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari",
  ]) {
    assert.equal(isKnownTvUserAgent(ua), false, ua);
    assert.equal(isFireTvHardware({ userAgent: ua }), false, ua);
  }
});

test("stock Android-box WebView can signal D-pad navigation with normal browser arrow key codes", () => {
  let ms = 1000;
  const detect = createAndroidTvDpadDetector({ now: () => ms });
  const options = { userAgent: "Mozilla/5.0 (Linux; Android 11; AOSP) Chrome/102" };
  const first = { key:"ArrowRight", keyCode:39, repeat:false };
  assert.equal(detect(first, options), false, "First ambiguous arrow is not enough");
  assert.equal(detect(first, options), false, "Window/document listeners must not count one physical press twice");
  ms += 150;
  assert.equal(detect({key:"ArrowDown",keyCode:40,repeat:false},options),true,"Second nearby arrow reveals generic TV remote");
});

test("generic Android box remote detection never forces the phone APK into TV mode", () => {
  let ms = 100;
  const detect = createAndroidTvDpadDetector({now: () => ms});
  const opts = {userAgent:"Android 14 MediaGodMobile/1.0.93", mobileApp:true};
  assert.equal(detect({key:"ArrowUp",keyCode:38},opts),false);
  ms += 100;
  assert.equal(detect({key:"ArrowDown",keyCode:40},opts),false);
  const other = {userAgent:"Mozilla/5.0 Android 14"};
  assert.equal(detect({key:"ArrowRight",keyCode:39}, {...other,editable:true}),false);
  ms += 100;
  assert.equal(detect({key:"ArrowLeft",keyCode:37}, {...other,editable:false}),false,"First arrow after typing must not switch modes");
  assert.equal(detect({key:"Enter",keyCode:13},other),false);
  assert.equal(detect({key:"ArrowUp",keyCode:38}, {...other,editable:false}),true,"A generic box can still activate after remote navigation");
});

test("TV focus-memory shares device runtime and activates after late remote detection", () => {
  const focusMemory = read("src/components/mg/FireTvFocusMemory.jsx");
  const runtime = read("src/components/mg/runtimePlatform.js");
  const main = read("src/main.jsx");
  assert.match(focusMemory,/import \{ isFireTvRuntime \} from "\.\/runtimePlatform\.js"/);
  assert.match(focusMemory,/setTvModeReady\(true\)/);
  assert.match(focusMemory,/window\.addEventListener\("mg:tv-remote-detected", onRemoteDetected\)/);
  assert.match(focusMemory,/\}, \[tvModeReady\]\)/);
  assert.match(runtime,/if \(isAndroidMobileRuntime\(\)\)\s*\{\s*return false/);
  assert.match(main,/createAndroidTvDpadDetector/);
  assert.match(main,/detectGenericAndroidTvDpad\(event/);
  assert.match(main,/mobileApp: isAndroidMobileRuntime\(\)/);
});

test("Android boxes with the Mobile edition are shown the dedicated TV APK", () => {
  const dialog = read("src/components/mg/AndroidMobileAppUpdateNotice.jsx");
  assert.match(dialog, /installedOnFireTv/);
  assert.match(dialog,/Use the dedicated Media God Fire TV app/);
  assert.match(dialog,/Open official Fire TV APK/);
  assert.match(dialog,/different Android package name/);
});

test("native television APK remains compatible with generic TV boxes", () => {
  const manifest = read("firetv-android/app/src/main/AndroidManifest.xml");
  const native = read("firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt");
  assert.match(manifest, /android:name="android.hardware.touchscreen"\s+android:required="false"/);
  assert.match(manifest, /android:name="android.software.leanback"\s+android:required="false"/);
  assert.match(manifest, /android.intent.category.LEANBACK_LAUNCHER/);
  assert.match(native, /MediaGodFireTV\/1\.0 AmazonWebAppPlatform FireTV/);
  assert.match(native, /embeddedPlayerRemote\.dispatchKeyEvent\(event\)/);
});
