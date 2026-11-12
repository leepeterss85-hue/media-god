# Media God reliability polish — 12 November 2026

The last main build (ecb66dd7) passed regression, both native builds and emulator tests, then failed in archive-stable-apks.sh with a GitHub HTTP 404. Both latest releases remain publicly readable. GitHub documents that creating a release against a historical commit with different workflow files can return 404 with GITHUB_TOKEN. Archive releases now use the current hosting commit and record the original APK source explicitly in Original-APK-Commit and SHA256SUMS; original binaries are unchanged. See https://docs.github.com/en/rest/releases/releases#create-a-release.

Release changes: recover exact-tag lookups through paginated release listings; download inspected asset IDs with byte-count/checksum checks; read back archives before publication; stage a permanent signed pair; verify both candidate uploads before swapping asset names on existing releases. Previous assets remain available. Partial swap failures attempt to restore both original assets and suppress update prompts. They do not attempt permission-restricted backwards tag/metadata updates; the original source SHA remains recorded. Publication is no longer cancelled midway by a new push. Update readiness markers remain withheld until both public downloads match the signed builds.

Source loading: successful public IMDb identities use a separate seven-day cache, capped at 128 small entries with oldest-first eviction. Catalogue browsing no longer evicts these matches. No source ranking, resolved stream URLs or user credentials are cached by this change.

Downloads: the existing DownloadManager enqueue call remains unchanged in behaviour. Only its returned ID is retained (100 IDs maximum) and an origin-guarded read-only status bridge is added. Progress, transfer rate, estimated time, available destination storage and history appear on Downloads. Older APKs and browsers direct users to their system download manager. Unknown sizes/speeds remain unknown rather than showing invented completion estimates. History records start with the updated APK.

Diagnostics: existing optional, local-only capture also records slow/failed public lookups using fixed categories and duration. No URLs, titles, request payloads or account credentials are recorded by the new instrumentation. No automatic upload or central monitoring is enabled.

Playback protection: the protected-media baseline is untouched. Both MainActivity additions are solely download-status code. The known-good lock removes only the two exact additive blocks in memory, then verifies all original bytes against the original hashes; no playback hash is refreshed. This protects the original enqueue operation and every player, remote, fullscreen and source-handoff byte. This is source verification, not a claim of testing on physical devices.

Versions: Android phone/tablet 1.0.96 (97), Fire TV 1.4.121 (126). Both manifests match their native packages. GitHub must still compile and run native emulator regression before publication.


## Follow-up: unblocking draft rollback and older TV-box polish

The next main workflow (7a41de9) compiled and signed both APKs, passed
Android/Fire TV emulator checks, and failed at the rollback-archive step
because stable-b31952157b56 already existed as a **draft**. It had both
assets and correct provenance, so the archive script returned early, while
verify-apk-archive.sh correctly rejected the unpublished draft.

If an archive is already a draft, the release job now compares the archived
binary against the currently published, signed device binary before using
GitHub's release API to publish the existing draft. The second device's bytes
are independently compared, and publication requires a publicly readable,
non-draft archive. A mismatch or a release API error stops the workflow
without changing either latest release or enabling update prompts. Both
matching and mismatched draft cases have simulated regression tests.

On older, low-capacity Android TV boxes only, opportunistic background
catalogue hint checks now wait for a two-second quiet period after D-pad
keyboard or scroll activity. This does not hold, modify or delay key events,
current video playback, user-requested search, addon selection or the real
stream source list. Normal-capacity device behaviour remains unchanged.

Download history now remembers whether the user manually opened or closed
its section while progress refreshes. A temporary native bridge read error
retains the last visible history with an unavailable notice, rather than
showing an empty list. The native download engine is untouched.

### Release and real-device acceptance checklist

1. GitHub PR CI: web regression, device emulator lifecycle, debug compilation,
   signed-release signature verification and backup archive tests must pass.
2. Production release job: archive published, new paired APKs staged and
   hash-verified, both public latest URLs verified, then enable update prompts.
   If any step fails, leave old latest APKs and prompts intact.
3. Real phone and Fire Stick: update installs over existing version (no
   reinstall), existing Continue Watching resumes from the same position and
   source, scrapers/source list and downloads remain unchanged.
4. Generic older Android box: remote remains responsive, scrolling and poster
   loading remain stable, passive catalogue checks do not compete while
   navigating, and copies of private support reports contain no source URLs,
   tokens or account secrets.
5. Broad rollout only after the real-device checks. CI does not replace testing
   on an actual older Android box.
