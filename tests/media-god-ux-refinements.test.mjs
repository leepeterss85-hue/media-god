import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
for (const [platform, pkg] of [["android-mobile","mobile"],["firetv-android","firetv"]]) {
  const native = read(`${platform}/app/src/main/java/com/mediagod/${pkg}/CompatibilityPlayerActivity.kt`);
  test(`${platform} remembers English and subtitle choices per title without changing the source`, () => {
    assert.match(native,/private fun trackPreferenceKey\(\): String/);
    assert.match(native,/if \(isTvEpisode\(\)\) "tv" else "movie"/);
    assert.match(native,/getSharedPreferences\("mg_vlc_track_choices", MODE_PRIVATE\)/);
    assert.match(native,/private fun rememberedEnglishTrack\(\): String/);
    assert.match(native,/private fun saveEnglishTrackChoice\(name: String\)/);
    assert.match(native,/!audioTrackNameLooksEnglish\(name\)/);
    assert.match(native,/val rememberedMatchingEnglish = english\.firstOrNull/);
    assert.match(native,/saveEnglishTrackChoice\(selected\.name\.orEmpty\(\)\)/);
    assert.match(native,/private fun saveSubtitleChoice\(name: String\?\)/);
    assert.match(native,/saveSubtitleChoice\(null\)/);
    assert.match(native,/saveSubtitleChoice\(selected\.name\.orEmpty\(\)\)/);
    assert.match(native,/saved\.contains\("\$\{key\}:subtitlesEnabled"\)/);
    assert.match(native,/val savedName = if \(payload\.optBoolean\("live", false\)\)/);
    assert.match(native,/root\.postDelayed\(\{[\s\S]{0,110}?applyPreferredSubtitle\(\)/);
    assert.match(native,/private fun showSourceMenu\(\)/);
    assert.match(native,/nextEpisodeButton\.text = buildNextEpisodeLabel\(\)/);
    assert.doesNotMatch(native,/putString\("[^"]*streamUrl/);
  });
}
test("Continue Watching clearly displays the saved position and remote-focus progress", () => {
  const row = read("src/components/mg/ContinueWatchingRow.jsx");
  assert.match(row,/const formatWatched = \(item\) =>/);
  assert.match(row,/Math\.floor\(seconds\)/);
  assert.match(row,/\{watched \? `Resume · \$\{watched\}` : "Resume"\}/);
  assert.match(row,/role="progressbar"/);
  assert.match(row,/aria-valuenow=\{Math\.round\(progress\)\}/);
  assert.match(row,/group-focus-within:opacity-100/);
  assert.match(row,/focus-within:ring-2/);
  assert.match(row,/resumeFromHistory: true/);
  assert.match(row,/startTime: Number\(item\.progress \|\| 0\)/);
  assert.match(row,/restoreResumeSource\(/);
  assert.match(row,/hasSavedSource/);
});
test("Existing Continue Watching storage and easy Update workflow are untouched",()=>{
  const assist=read("src/components/mg/ContinueWatchingAssist.jsx");
  assert.match(assist,/const WATCHED_THRESHOLD = 0\.92/);
  assert.match(assist,/manualSelectionKey/);
  assert.match(assist,/mg:continue-watching-progress/);
  assert.match(assist,/mg:continue-watching-source/);
  const provider=read("src/components/mg/PlayerProvider.jsx");
  assert.match(provider,/void preloadNextEpisode\(reliableRequest\)/);
  assert.match(provider,/const prepared = freshEpisodePreparation\(cachedPreload\?\.prepared\)/);
  assert.match(provider,/window\.setTimeout\(resolve, 1400\)/);
});
