import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sources = [
  ["Android", "android-mobile", "mobile"],
  ["Fire TV", "firetv-android", "firetv"],
].flatMap(([platform, directory, packageName]) =>
  ["PlayerActivity", "CompatibilityPlayerActivity"].map(activity => ({
    label: `${platform} ${activity}`,
    source: readFileSync(new URL(`../${directory}/app/src/main/java/com/mediagod/${packageName}/${activity}.kt`, import.meta.url), "utf8"),
  }))
);

for (const { label, source } of sources) {
  test(`${label} scopes late episode metadata to its active request and episode`, () => {
    const start = source.indexOf("private val playbackContextReceiver =");
    const end = source.indexOf("private fun registerPlaybackContextReceiver", start);
    const receiver = source.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(receiver, /getStringExtra\("requestId"\) != requestId/);
    assert.match(receiver, /NativeEpisodePolicy\.sameEpisode\(/);
    for (const key of ["tmdbId", "season", "episode"]) {
      assert.match(receiver, new RegExp(`opt(?:Long|Int)\\("${key}"`, "g"));
    }
    assert.match(source, /ContextCompat\.RECEIVER_NOT_EXPORTED/);
    assert.match(source, /unregisterReceiver\(playbackContextReceiver\)/);
    // Metadata updates must never restart a source, seek, or erase an Audio /
    // Stay here choice made while the metadata request was in flight.
    assert.doesNotMatch(receiver, /(?:\.seekTo\(|\.time\s*=|streamUrl\s*=|manualAudioTrackLocked\s*=|nextEpisodeCountdownCancelled\s*=)/);
    assert.doesNotMatch(receiver, /"(?:url|sources|startPositionMs|strictEnglishPlayback|audioLanguage)"/);
  });

  test(`${label} preserves English startup and cancellation as explicit viewer choices`, () => {
    assert.match(source, /NativeEpisodePolicy\.requiresEnglish\(\s*isTvEpisode\(\), payload\.optBoolean\("strictEnglishPlayback", false\), manualAudioTrackLocked/);
    assert.match(source, /NativeEpisodePolicy\.segmentWindow\(/);
    assert.match(source, /NativeEpisodePolicy\.countdownEligible\(/);
    assert.match(source, /nextEpisodeCountdownCancelled = true/);
    assert.match(source, /putExtra\((?:PlayerActivity\.)?(?:EXTRA_AUTO_NEXT_CANCELLED|"mg_auto_next_cancelled"), nextEpisodeCountdownCancelled\)/);
    assert.doesNotMatch(source, /remaining <= 45_000L/);
  });
}

for (const { label, source } of sources.filter(item => item.source.includes("resumeStrictEnglishPlaybackIfReady"))) {
  test(`${label} releases the English gate once and cannot re-arm it after synchronous preparation`, () => {
    const armStart = source.indexOf("private fun armStrictEnglishStartupWatchdog()");
    const armEnd = source.indexOf("private fun clearStrictEnglishStartupWatchdog", armStart);
    assert.match(source.slice(armStart, armEnd), /!strictEnglishStartupPending/);
    const releaseStart = source.indexOf("private fun resumeStrictEnglishPlaybackIfReady(");
    const releaseEnd = source.indexOf("private val strictEnglishStartupWatchdogRunnable", releaseStart);
    const release = source.slice(releaseStart, releaseEnd);
    assert.match(release, /!strictEnglishStartupPending/);
    assert.ok(release.indexOf("strictEnglishStartupPending = false") < release.indexOf("activePlayer.play()"));
  });
}


for (const { label, source } of sources.filter(item => item.label.endsWith(" PlayerActivity"))) {
  test(`${label} preserves Play intent when backgrounded during English startup`, () => {
    const pause = source.slice(source.indexOf("override fun onPause()"), source.indexOf("override fun onStop()"));
    assert.match(pause, /if \(!strictEnglishStartupPending\) shouldPlayWhenReady = it.playWhenReady/);
  });
}
