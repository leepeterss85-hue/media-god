import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
for (const [platform, pkg] of [["android-mobile","mobile"],["firetv-android","firetv"]]) {
  const code = read(`${platform}/app/src/main/java/com/mediagod/${pkg}/CompatibilityPlayerActivity.kt`);
  test(`${platform}: VLC player keeps actionable Sources and Back destinations`, () => {
    assert.match(code, /controlButton\(if \(isTvEpisode\(\)\) "‹ Episodes" else "‹ Home"\) \{ finishWithResult\("back"\) \}/);
    assert.match(code, /controlButton\("☷ Sources"\) \{ showSourceMenu\(\) \}/);
    assert.match(code, /private fun showSourceMenu\(\)/);
    assert.match(code, /finishWithResult\("source"/);
    assert.match(code, /KeyEvent\.KEYCODE_BACK -> \{ finishWithResult\("back"\)/);
    assert.match(code, /progressTintList = android\.content\.res\.ColorStateList\.valueOf\(Color\.rgb\(36, 244, 95\)\)/);
    assert.match(code, /addView\(playPauseButton, LinearLayout\.LayoutParams/);
    assert.match(code, /showAudioTrackMenu/);
    assert.match(code, /showSubtitleTrackMenu/);
    assert.match(code, /showAdvancedControlsMenu/);
    assert.match(code, /CONTROLS_HIDE_DELAY_MS/);
  });
}
test("phone Cast button uses the native Cast SDK only for compatible direct video", () => {
  const vlc = read("android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt");
  const mobile = read("android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt");
  const cast = read("android-mobile/app/src/main/java/com/mediagod/mobile/MediaGodCastManager.kt");
  assert.match(vlc, /controlButton\("◉ Cast"\) \{ requestCastFromVlc\(\) \}/);
  assert.match(vlc, /private fun requestCastFromVlc\(\)/);
  assert.match(vlc, /castContentType\(\)\.isBlank\(\)/);
  assert.match(vlc, /finishWithResult\("cast"\)/);
  assert.match(vlc, /putExtra\("mg_cast_url", streamUrl\)/);
  assert.match(mobile, /result\.optString\("reason"\) == "cast"/);
  assert.match(mobile, /MediaGodCastManager\(this@MainActivity\)/);
  assert.match(mobile, /castManager\?\.start\(request\.toString\(\)\)/);
  assert.match(cast, /MediaRouteChooserDialogFragment/);
  assert.match(cast, /contentType !in setOf\("video\/mp4"/);
});
test("back in native VLC or web returns movie Home and TV to episodes", () => {
  const player=read("src/components/mg/VideoPlayer.jsx");
  const home=read("src/pages/Home.jsx");
  const portal=read("src/components/mg/PlayerPortalRenderer.jsx");
  assert.match(player, /reason === "back" && !isLive[\s\S]*?returnFromPlayback\(\);/);
  assert.match(player, /reason === "cast" && !isLive[\s\S]*?returnFromPlayback\(\);/);
  assert.match(player, /window\.dispatchEvent\(new CustomEvent\("mg:return-to-home"\)\)/);
  assert.match(player, /new CustomEvent\("mg:return-to-episode-selector"/);
  assert.match(home, /addEventListener\("mg:return-to-home", onReturnHome\)/);
  assert.match(home, /setView\("home"\)/);
  assert.match(portal, /const exitToDestination = \(\) =>/);
  assert.match(portal, /onBack=\{exitToDestination\}/);
  assert.match(portal, /onClose=\{exitToDestination\}/);
});
