# Playback source review — 8 November 2026

The owner explicitly requested fixing the release blockers and merging catch-up PR #96. This review accepts the following existing changes on main for source integration. It does not claim new physical-device acceptance or certify a new APK. The observed 24 October recovery snapshot and original 18 hashes remain preserved in `tests/known-good-playback-lock.test.mjs`.

## Reviewed diffs

- `MediaStreamSourcesBox.jsx`: compared `1942a7b382c1c4a19d5514f74d89a2bca3740229` to `eebaf799481dca87999cbfdff65553a064fce976`. The only functional addition imports TV runtime/source classification and guards HTML webpages before the direct-video handoff. It applies to TV runtimes and excludes Live TV. Recognised OnlyFlix/VidCore URLs use existing embed entrypoints; other webpages show a provider-choice message instead of reaching VLC. Direct media retains the existing manual source/episode identity path. Tests execute those handlers with both TV and non-TV contexts and cover the source classifier.
- `FireTvRemote.jsx`: the same comparison shows only import of `fireTvFocusWork`, scheduling of passive MutationObserver scans, and cancellation during cleanup (commit `ffe90a350eeb9ce2340e0b2caf0ed2ec3b5b3198`). Key handling remains synchronous. Existing scheduler tests check coalescing and cancellation.
- Native `firetv-android/.../PlayerActivity.kt`: `3ced8e0b98dcb37970b31915a25ef8f5ca336c3d` is the complete delta from the recorded protected hash. Its parent hashes to `6f0bf56e97efce0613dbc015408babc43ad7d7d3db17c31bd312611fd42396f4`. The first-frame watchdog additionally allows non-Amazon READY/BUFFERING startup to try the same URL in LibVLC. Existing guards exclude Live TV, an already-rendered frame, paused playback, DRM, duplicate handoff and completed playback. The handoff carries the current position and headers, releases ExoPlayer first and records compatibility ownership. Amazon's original audio-only condition remains unchanged. New source hash: `d118db73344d014c6cf3fb784401a64fa8e874ac8c2d2c0941b756b050fe1397`.

## Release-check repairs

The old tests expected direct public fallback calls even after deadlines were introduced, Fire TV 1.4.118 after 1.4.119 was committed, and overlapping timer batches after concurrency was deliberately bounded. The source-handler VM also omitted its new runtime/classifier imports. Repair the fixtures and retain privacy assertions, exact source hashes, overlap checks and platform isolation assertions. No production playback implementation is altered by these repairs.

## Acceptance boundary

The two reviewed web files have explicit current-source hashes separate from the original observed hashes. The native guard records its narrowly reviewed current hash. These are source review locks, not evidence that a device has played a programme successfully. Before a new native playback release, perform the physical picture/audio, remote, resume, source-selection and Live TV checks in `PLAYBACK_KNOWN_GOOD.md`. Keep the original recovery reference. Catch-up itself only opens official service websites. Existing GitHub native build/release workflows may run on merge; their device, signature and download-verification gates still apply.
