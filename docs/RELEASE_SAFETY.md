# Media God stable release, diagnostics and rollback

## Known-good baseline
The last device-confirmed stable reference before this safeguard package is
`afa4757cbeec789ddd5b1f80515f321fa313241e` (23 October 2026).
Keep VLC playback, source selection, casting, Live TV, navigation, the existing
theme and colours untouched unless an isolated fix is explicitly requested.
The protected-media hash guard must pass unchanged.

## Releasing safely
1. Open a feature branch, run `npm run test:regression`, and use a PR.
2. The release workflow requires regression, Android and Fire TV emulator tests,
   signed APK builds, signature verification, and matching update manifests.
3. Before changing either stable `*-latest` release pointer, the workflow
   archives the previous **pair** of published signed APKs (only if both point
   to the same immutable 40-character commit SHA) under `stable-<sha-prefix>`.
   It saves both signed APK files and SHA256SUMS.txt.
4. The new public APK assets are downloaded again and compared byte-for-byte
   with the tested build. Only then does the workflow write
   `Verified-APK-Commit: <sha>` to the release notes for both platforms.
   The in-app update prompt checks that marker against the published tag's
   exact commit-specific manifest; incomplete builds are not offered.
5. App versions/versionCodes are deliberately **not bumped** by this safety
   package. Ordinary UI-only changes should not force extra APK reinstalls.

## Recovering from a bad update
* Find the most recent `stable-<sha-prefix>` GitHub Release and verify its
  checksums. It contains the older signed phone and Fire TV APK files.
* Restore the known-good code on a **new recovery branch**, run tests and
  review the diff; do not reset or force-push main over concurrent changes.
* For already-installed Android/Fire TV apps, **do not simply try installing
  an older APK over a newer one**. Android normally rejects versionCode
  downgrades. Instead create a recovery build from the known-good source with
  **higher** versionCodes on both devices, update matching JSON manifests,
  and run the complete signed release pipeline.
* The in-app updater will then offer the signed recovery build normally.
  A manual older-APK install may require uninstalling and losing app data;
  never recommend that as the normal rollback route.
* GitHub's `*-latest` release tags are mutable pointers. The named stable
  archives are immutable by convention and should never be overwritten.

## Optional diagnostics
Open **Settings → Diagnostics** and enable **Record app crashes on this device**
only when troubleshooting. It is off by default. It records a small bounded
list of sanitised JavaScript errors locally, not an external telemetry upload.
You can view, copy or clear these messages; sharing is always your choice.
Native crashes that happen before the WebView starts require separate
device logs and are not automatically collected by this feature.

## Routine smoke test before promoting a playback change
* On a phone and Fire Stick, play a movie with English audio and subtitles off.
* Start an episode, seek and rewind, use Next Episode, then reopen via Continue
  Watching and verify the saved source and position.
* Check casting produces both audio and picture, and manually switch source.
* Confirm Live TV still works using the existing catalogue.
* Verify the Fire Stick Back button, focus and full-screen controls.
* Verify the standard one-tap update pop-up appears only for a verified newer
  signed version, and that Settings still displays the installed version.

Automated checks protect common regressions but cannot prove every provider
or device will work: record real-device test outcomes before public rollout.
