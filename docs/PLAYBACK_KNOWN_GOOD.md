# Media God — known-good playback lock

**User-confirmed date:** 2026-10-24  
**Baseline Git commit:** 1942a7b382c1c4a19d5514f74d89a2bca3740229  
**Fire TV/Stick:** 1.4.116 (signed GitHub release firetv-latest verified against that commit)  
**Android phone:** 1.0.93 (as tracked in the app source)  
**Snapshot/recovery branch:** stable/playback-known-good-20261024-firetv-1.4.116  
**Base44 recovery checkpoint:** 6add191bbf21b63110feae36

## User acceptance

The owner reported that Media God scrapers and audio/video are now working on their devices, without the previous missing sound and black-screen problems. Preserve this state. This is a **known-good observed baseline**, not a laboratory guarantee that every title, server or future network request will work.

## Freeze rules

- Do not casually edit the web/native player, audio-track selection, video pixel sizing, fullscreen layout, remote control handlers, scraper priority, source fallback, or Live TV playback.
- Preserve **OnlyFlix-first** for Fire Stick movie/episode Play, with VidCore and other scraper options still selectable, and VLC for direct streams.
- Preserve Fire Stick's **top-row Fullscreen** beside Sources, remote navigation, Exit fullscreen and the absence of a persistent bottom overlay.
- Preserve native audio-track compatibility, avoid switching away from healthy sound, and keep per-source failure history scoped to the device and file.
- Keep working mobile, web, and Live TV behavior isolated from Fire Stick-specific fixes.
- If a playback change becomes necessary, do it separately from catalogue or UI work. Review the precise diff and obtain approval; do not update snapshots just to make CI pass.

## Enforced regression gates

npm run test:regression runs the existing audio/source/native tests, scripts/protected-media-guard.mjs for the pre-existing protected player and Live TV core, and tests/known-good-playback-lock.test.mjs for the additional **18** verified web-scraper, Fire TV control, video-pixel, audio diagnostic and native bridge files.

The new SHA-256 checks are intentionally strict: they reject *any* byte change in those files, including harmless refactors. A failed hash is a review hold, **not proof of a playback defect**. Do not automatically rebaseline hashes. To approve a necessary change, back up this commit, inspect the diff, pass CI and manually test playback, then explicitly accept and document each updated hash.

## Physical-device acceptance before any new playback release

1. On a Fire Stick, play a movie and TV episode: confirm OnlyFlix starts first, **picture and audible sound**, and no unwanted switch to torrents.
2. On the Fire Stick, use Menu, the provider tabs, Sources, Try next, top-row Fullscreen and Back/Exit fullscreen. Confirm picture remains on-screen and bottom help box stays hidden.
3. On an Android phone and the website, test a movie and TV episode with picture, audible sound, correct track behavior and manual alternate-source access.
4. Verify direct VLC playback still has picture and audio; Live TV still plays with its existing channels/controls.
5. Complete the CI regression and signed-APK checks. Never describe automated tests as a guarantee of real-world stream availability.

## Recovery

Recovery reference: https://github.com/leepeterss85-hue/media-god/tree/stable/playback-known-good-20261024-firetv-1.4.116

Restore the specific affected player files from that snapshot or use the Base44 checkpoint after review; do not blindly roll back unrelated app work. The live firetv-latest asset is a moving release pointer and is **not** a permanent restore copy. Keep any still-installed working APK; do not trigger an APK reinstall just because these test/documentation guards were added.

**Scope of this lock:** CI detects protected code changes; it does not prevent an administrator from deliberately updating files, forcing GitHub branches or refreshing the baseline. GitHub branch-protection policy, if desired, must be separately configured by a repository administrator.
