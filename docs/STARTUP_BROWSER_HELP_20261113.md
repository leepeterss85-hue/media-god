# Faster initial loading and browser-entry help

Home now loads on demand inside the existing player-provider boundary. Signed-out visitors no longer download Home, catalogue screens and their Home-only dependencies to display sign-in. A failed Home chunk shows a manual reload action and help link; there is no automatic reload loop. Existing player files, source selection and Live TV files are unchanged.

A dismissible hint appears for recognised social/in-app browser user agents. The native Media God bridge and phone/TV user-agent markers suppress the hint. Detection cannot identify every in-app browser.

`/open.html` is a small, standalone page with no app bundle, external scripts, fonts, or API dependency. It offers a normal HTTPS link, a user-initiated Android Chrome intent with a help-page fallback, and a copyable public address. It never forwards the incoming query/hash or account tokens. iOS and unavailable/blocked clipboard paths retain manual instructions. The page remains usable without JavaScript.

This mitigates browser-entry difficulties; it cannot fix a DNS/network/host failure before HTML arrives, or guarantee that another app permits external-browser intents. The original user's direct-browser success suggests a launch-context issue, but does not establish its exact cause.

## Measurement and validation

Compared production builds at afdb5680 using identical installed dependencies and Vite manifest static-import closure:

| Initial JavaScript | Before | After |
| --- | ---: | ---: |
| Uncompressed bytes | 2,356,508 | 1,834,049 |
| Locally gzip-compressed bytes | 679,877 | 532,749 |

Approximately 22% less initial JavaScript (21.6% by local gzip estimate). Home still downloads when needed; this is not a measured FPS or network timing improvement. Actual hosting compression can differ.

Full regression suite passed, including build, lint, protected playback checks and native structural checks. Added tests cover browser detection, native exclusions, token-free copying, and clipboard failure. A local Chromium smoke run could not start because the runtime prohibits its process-singleton socket; visual and real-device browser-launch behaviour are not claimed as tested.

Physical checks: open from WhatsApp/Facebook on Android and iOS; use help, copy link, dismiss, sign in, and enter Home. Confirm the phone APK and Fire TV show no browser prompt. Test a slow connection and an interrupted Home chunk download.
