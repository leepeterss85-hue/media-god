# Fire TV 1.4.122 (code 127): fullscreen wake recovery

The owner explicitly instructed release of all outstanding work on 14 November. This release combines the previously tested performance/browser-entry update with the outstanding native screensaver fix.

Review: MainActivity and ExternalWebActivity delegate lifecycle/focus interruptions to a helper. On return, only when resumed and focused, it reattaches the same fullscreen custom view. No page reload, source change, seek or Play command is issued. Back/exit clears pending recovery. Posted work checks view identity, parent and lifecycle before acting. The existing Chromium exit callback remains owned by the original fullscreen session.

The observed 24 October baseline and recovery branch remain intact in the playback lock. The separate source-reviewed map pins the exact recovery implementation and affected host files. This source acceptance follows the owner's explicit release instruction; it does not claim physical Fire Stick validation. CI must still compile the APKs, run the emulator lifecycle tests, verify signatures, preserve old APKs and verify public downloads before enabling update prompts.

Version code 127 exceeds both the published 125 and the previously prepared 126. Phone version is unchanged. Removed the obsolete parallel firetv-resume-release workflow: it still hard-coded 1.4.119/code 124 and used a separate release replacement path. android-apks.yml is now the sole APK publisher with coordinated backup and verification.

Device acceptance still to verify: pause an OnlyFlix film in native fullscreen, let the Fire OS screensaver start, wake with the remote, confirm the video frame returns at the same position and remains paused, then resume. Repeat with an episode, repeated wake cycles and Back. No physical-device result is asserted here.
