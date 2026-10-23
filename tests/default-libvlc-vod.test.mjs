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
    assert.match(vlc, /:start-time=\$\{pendingStartPositionMs \/ 1000\.0\}/);
    assert.match(vlc, /wantsPreferredEnglishAudio/);
    assert.match(vlc, /requiresStrictEnglishAudio/);
    assert.match(vlc, /payload.optJSONArray\("sourceChoices"\)/);
    assert.match(vlc, /nextEpisode/);
    assert.match(vlc, /compatibilityRetryPass/);
    assert.match(media3, /ExoPlayer\.Builder/);
  });
}

test("VLC default requires updated signed APK versions on both platforms", () => {
  assert.match(read("android-mobile/app/build.gradle.kts"),/versionCode = 91/);
  assert.match(read("android-mobile/app/build.gradle.kts"),/versionName = "1\.0\.90"/);
  assert.match(read("firetv-android/app/build.gradle.kts"),/versionCode = 105/);
  assert.match(read("firetv-android/app/build.gradle.kts"),/versionName = "1\.4\.100"/);
  const mobile = JSON.parse(read("public/android-mobile-update.json"));
  const fire = JSON.parse(read("public/firetv-update.json"));
  assert.equal(mobile.versionCode,91);
  assert.equal(fire.versionCode,105);
  assert.equal(mobile.versionName,"1.0.90");
  assert.equal(fire.versionName,"1.4.100");
});
