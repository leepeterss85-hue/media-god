import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

for (const [platform, pkg] of [
  ["android-mobile", "mobile"],
  ["firetv-android", "firetv"],
]) {
  const base = `${platform}/app/src/main/java/com/mediagod/${pkg}/`;
  const router = read(base + "PlaybackCompatibilityRouter.kt");
  const main = read(base + "MainActivity.kt");
  const vlc = read(base + "CompatibilityPlayerActivity.kt");
  const media3 = read(base + "PlayerActivity.kt");

  test(`${platform}: VLC is the VOD default but DRM and Live TV retain their native paths`, () => {
    const entry = router.slice(router.indexOf("fun decide(payload: JSONObject)"));
    const drmAt = entry.indexOf('if (payload.optJSONObject("drm") != null)');
    const liveAt = entry.indexOf('if (!payload.optBoolean("live", false))');
    const defaultAt = entry.indexOf('return Decision(true, "default-libvlc-vod")');
    const forcedAt = entry.indexOf('if (payload.optBoolean("forceCompatibility", false))');
    assert.ok(drmAt >= 0 && drmAt < liveAt && liveAt < defaultAt && defaultAt < forcedAt);
    assert.match(entry.slice(drmAt, liveAt), /return Decision\(false\)/);
    assert.match(entry.slice(liveAt,forcedAt), /return Decision\(true, "default-libvlc-vod"\)/);
    assert.match(router, /val selected = selectedSource\(payload\)/); // Live TV's original router still available
    assert.match(main, /val initialPlaybackDecision =\s*PlaybackCompatibilityRouter.decide\(payload\)/);
    assert.match(main, /val finalPlaybackDecision =\s*PlaybackCompatibilityRouter.decide\(payload\)/);
    assert.match(main, /if \(finalPlaybackDecision.useCompatibility\) \{\s*CompatibilityPlayerActivity::class.java\s*\} else \{\s*PlayerActivity::class.java/);
  });

  test(`${platform}: existing VLC player preserves seek, English audio and source selection`, () => {
    assert.match(vlc, /Media\(engine, Uri.parse\(streamUrl\)\)/);
    if (platform === "android-mobile") {
      assert.match(vlc, /:start-time=\$\{pendingStartPositionMs \/ 1000\.0\}/);
    } else {
      // Existing Fire TV VLC seeks after the first native Playing callback.
      assert.match(vlc, /player\.time = target/);
      assert.match(vlc, /pendingStartPositionMs > 0L/);
    }
    assert.match(vlc, /wantsPreferredEnglishAudio/);
    assert.match(vlc, /requiresStrictEnglishAudio/);
    assert.match(vlc, /payload.optJSONArray\("sourceChoices"\)/);
    assert.match(vlc, /nextEpisode/);
    assert.match(vlc, /compatibilityRetryPass/);
    assert.match(media3, /ExoPlayer\.Builder/);
  });
}

test("all resolved native VOD streams use the Android bridge even without runtime UA markers", () => {
  const player = read("src/components/mg/VideoPlayer.jsx");
  assert.match(player, /const nativePlaybackAvailable =[\s\S]*?nativeFireTvPlayer &&[\s\S]*?\^https\?:/);
  assert.match(player, /const useNativePlayback =\s*nativePlaybackAvailable;/);
  assert.match(player, /const nativePlaybackUrl =[\s\S]*?rdOverride\?\.src[\s\S]*?isDirectFile \? activeUrl/);
  assert.match(player, /const started = playNativeFireTv\(\{/);
  assert.match(player, /nativeFallbackUrl !== nativePlaybackUrl/);
  assert.match(player, /const fireTvNativeSelectorMode =/);
  // The Chrome/Base44 page does not expose MediaGodNative. Only the
  // installed native wrapper can hand the resolved file to LibVLC.
  const bridge = read("src/components/mg/nativeFireTvBridge.js");
  assert.match(bridge, /window\.MediaGodNative/);
  assert.match(bridge, /typeof native\.play === "function"/);
});

test("VLC default retains phone version while shipping the Fire TV-only fix", () => {
  assert.match(read("android-mobile/app/build.gradle.kts"),/versionCode = 95/);
  assert.match(read("android-mobile/app/build.gradle.kts"),/versionName = "1\.0\.94"/);
  assert.match(read("firetv-android/app/build.gradle.kts"),/versionCode = 123/);
  assert.match(read("firetv-android/app/build.gradle.kts"),/versionName = "1\.4\.117"/);
  const mobile = JSON.parse(read("public/android-mobile-update.json"));
  const fire = JSON.parse(read("public/firetv-update.json"));
  assert.equal(mobile.versionCode,95);
  assert.equal(fire.versionCode,122);
  assert.equal(mobile.versionName,"1.0.94");
  assert.equal(fire.versionName,"1.4.118");
});
