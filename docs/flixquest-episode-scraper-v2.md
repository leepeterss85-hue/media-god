# Media God TV episode scraper — 2026-10-22

## Why the old scraper was slow

The bundled scraper used the retired `https://flixquest-api.vercel.app/{showbox|vidsrc|vidsrcto}/watch-tv` routes. They have been observed to return HTTP 404 for Breaking Bad S01E01. Those routes are not the service used by FlixQuest's current Android app.

FlixQuest now documents a separate scraper API v2, including `GET /api/v2/providers` and `GET /api/v2/stream-tv?tmdbId=...&season=...&episode=...&provider=...`. **Its backend is closed-source; it is not a public, anonymous streaming endpoint.** To obtain a legitimate endpoint, contact the maintainer according to https://github.com/flixquest/flixquest.

## Enable a v2 API instance

In the Vite/Base44 build environment, set `VITE_FLIXQUEST_V2_API_URL=https://your-authorised-instance.example`. Deploy the built site. An instance URL ending in `/api/v2` is also accepted. The URL must be HTTPS, and local/private-host endpoints are rejected.

For environments that provision runtime configuration before the player initializes, `window.__MG_FLIXQUEST_V2_API_URL__` can provide the same URL. **Do not place API tokens or private secrets in a `VITE_` variable or window global**, since those values are visible to browser clients. If an API requires authentication, implement a separately secured backend proxy rather than embedding credentials.

The frontend loads the enabled provider list and races up to four direct episode lookups, selecting the first nonempty response. Valid links are never described as *verified English*: only the actual media decoder/audio tracks can establish that. It rejects known foreign/commentary audio and confirmed wrong-episode metadata.

If no v2 instance is configured, the app keeps the legacy scraper as a compatibility fallback, quarantines known 404 routes for five minutes and automatically searches configured Real-Debrid/addon sources. A new instance is required for scraper-first playback to work where legacy routes are unavailable.

## Latency changes

- Legacy scraper request timeout: 3.2 seconds, run in parallel, first useful result wins.
- Legacy 404 routes: no repeated requests for five minutes.
- Real-Debrid head-start wait during TV playback: 250 ms (legacy) or 850 ms (configured v2), down from 2500 ms.
- Fast TV cached-only qualification: 2.4 seconds, down from 5 seconds.
- Full source discovery, manual torrent list and Live TV are unchanged.

Nothing in this integration guarantees that a copyrighted title is available for free, that a source will remain online, or that English audio exists. Measure actual video start time and audio track selection on phone and Fire TV to confirm improvements.
