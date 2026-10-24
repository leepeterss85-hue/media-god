import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/*
 * User-confirmed, known-good playback on 2026-10-24.
 * Fire TV 1.4.116, released from commit 1942a7b382c1c4a19d5514f74d89a2bca3740229.
 * The recovery branch stable/playback-known-good-20261024-firetv-1.4.116
 * contains the actual untouched player files.
 *
 * Do not automatically regenerate these checksums as part of a build.
 * If a functional playback edit is explicitly approved, first back up the
 * baseline, run all regression gates, then verify picture, sound, sources,
 * fullscreen and remote navigation on the relevant physical devices.
 * Only then manually update the relevant hash with an explanation.
 *
 * npm run test:regression is required for GitHub APK publishing.
 * Tests cannot prove future network availability or every media title.
 */

const verifiedPlaybackCommit = "1942a7b382c1c4a19d5514f74d89a2bca3740229";
const protectedFiles = {
  "src/components/mg/fireTvCardPlay.js": "374a6d057944e6540a58ed8a41bbadcd4dbd3fd67e8504c606454287ca5dbdf5",
  "src/components/mg/fireTvScraperRecovery.js": "cb4d7c77fb6a9c59938592679b2c2688d4bda08bb85b3bfa1ed3251645ba6866",
  "src/components/mg/OnlyFlixEmbedPlayer.jsx": "4ebfdc633d0638445ec25dd07c3d1f535552af413c2bab5344dd99d8df14377b",
  "src/components/mg/SafeEmbedStage.jsx": "e55d5a2ce91d00b52a090d5b6ea3b5a749f28fae39b3db1bb7e9afd3f8b488d3",
  "src/components/mg/onlyFlixEmbed.js": "bf36e826f331506d22bb4e5d359f35aebfc9efe56aa336a86b8874710fef4e33",
  "src/components/mg/OnlyFlixRemotePointer.jsx": "681c9bbefc2410f034b395e81d39eb974424b44908f594a1f3a58c9851d023bf",
  "src/components/mg/onlyFlixRemoteActions.js": "1ebed047636acb033cc1bbdc6dbedc2ce88031a368afda83205989b0c853d589",
  "src/components/mg/automaticWebFallback.js": "e0ab6eb5edbcdf82378750f3a5edb3dbf45e1d89b9b0134a0fb6d5a9ecbf29ed",
  "src/components/mg/embeddedFramePixels.js": "1259f9ab1045c2b973d396994dd0d4d1ccd7c4930bef10e67d4b2fae9a686938",
  "src/components/mg/nativeFireTvBridge.js": "7935a279f2d5ff39f18126d1dbda93e651121d1bc03006a51c628e5c78ef19d6",
  "src/components/mg/MediaStreamSourcesBox.jsx": "5b017ab58dbe430e65cdfc4ecf06344e1f7f2fdb4d7b4347fd67c56b1b9843d4",
  "src/components/mg/FireTvRemote.jsx": "c0b1178932cda48f7a1dcf350d7f23bdef3978879fea731262e48d331d5edec8",
  "src/fire-tv-player-failsafe.css": "4bed7bf1ab29a72d336fb255830ac1f92c951fe6d47eba8a9366824a36199216",
  "firetv-android/app/src/main/java/com/mediagod/firetv/EmbeddedPlayerRemote.kt": "d1cbf95fab45063357c7576d4abad2266f24efd029a31461db72269f5804801e",
  "firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt": "77b296f5271cebecb8381e1ad506b5b13dbcbffe1387fb912973663084641451",
  "firetv-android/app/src/main/java/com/mediagod/firetv/PlaybackCompatibilityRouter.kt": "29d777e60136211a053f3bf50ce0c1c40060964b63045aecc7e928912ee390a7",
  "src/components/mg/audioDiagnostics.js": "a1e465b860d8d05df1d7abb52e1430db7f0613f61654e750e2786e10e31aa8e9",
  "android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt": "91c6bd430febb68b7631370aa5b34b28fd5613e4e16edb1305a9e72fa40f3f3d"
};

test("the approved playback baseline is identifiable and recoverable", () => {
  assert.equal(verifiedPlaybackCommit.length, 40);
  assert.ok(Object.keys(protectedFiles).length >= 18);
  const documented = readFileSync(
    new URL("../docs/PLAYBACK_KNOWN_GOOD.md", import.meta.url), "utf8"
  );
  assert.ok(documented.includes(verifiedPlaybackCommit));
  assert.ok(documented.includes("stable/playback-known-good-20261024-firetv-1.4.116"));
});

for (const [file, expected] of Object.entries(protectedFiles)) {
  test("locked working playback: " + file, () => {
    const actual = createHash("sha256")
      .update(readFileSync(new URL("../" + file, import.meta.url)))
      .digest("hex");
    assert.equal(
      actual, expected,
      "Playback-protected file was changed: " + file +
      ". Restore the known-good version or obtain explicit approval and " +
      "physical-device playback verification before accepting a new baseline."
    );
  });
}
