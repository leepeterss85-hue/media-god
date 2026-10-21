import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sender = read("src/components/mg/CastButton.jsx");
const app = read("android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt");
const casting = read("android-mobile/app/src/main/java/com/mediagod/mobile/MediaGodCastManager.kt");
const provider = read("android-mobile/app/src/main/java/com/mediagod/mobile/MediaGodCastOptionsProvider.kt");
const manifest = read("android-mobile/app/src/main/AndroidManifest.xml");
const gradle = read("android-mobile/app/build.gradle.kts");

test("Android APK uses native Cast instead of WebView remote audio-only mode", () => {
  assert.match(sender, /MediaGodNative\.castVideo\(JSON\.stringify/);
  assert.doesNotMatch(sender, /\.remote\.prompt\s*\(/);
  assert.match(sender, /mg:native-cast-status/);
  assert.match(app, /fun castVideo\(payloadJson: String\)/);
  assert.match(app, /MediaGodCastManager\(this@MainActivity\)/);
  assert.match(app, /nativeBridgeAllowed\(\)/);
});

test("native sender is configured with Google's default media receiver and checks playback status", () => {
  assert.match(provider, /DEFAULT_MEDIA_RECEIVER_APPLICATION_ID/);
  assert.match(manifest, /OPTIONS_PROVIDER_CLASS_NAME/);
  assert.match(gradle, /play-services-cast-framework/);
  assert.match(casting, /MediaRouteChooserDialogFragment/);
  assert.match(casting, /setMediaInfo\(mediaInfo\)/);
  assert.match(casting, /PLAYER_STATE_PLAYING/);
  assert.match(casting, /IDLE_REASON_ERROR/);
});

test("native casting does not mutate Live TV or standard Play behaviour", () => {
  assert.doesNotMatch(casting, /ContinueWatching|OnlyFlix|LiveTVView/);
  assert.match(casting, /setStreamType\(/);
});
