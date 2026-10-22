# Vyla Stream API — TV-only pilot for Media God

Status: **staging / disabled by default**. No movie, Live TV, native player or existing addon changes are required.

## Purpose

Connect a self-hosted Vyla Stream API to Media God for **direct TV episode candidates** without making torrent results the only automatic path. This is a pilot, not a guarantee of legal rights, English audio or successful playback. Use **only providers and streams you are authorised to access**.

## Host an instance independently

Vyla is self-hosted, not a public hosted API; Media God cannot make it appear by supplying a URL for Vyla's marketing website.

```bash
git clone https://gitlab.com/vyla-entertainment/stream-api
cd stream-api
npm install
# Put TMDB_API_KEY in the server's environment securely.
PORT=7860 node server.js
```

The instance must run on a persistent machine, behind your own HTTPS reverse proxy and access control. Base44's temporary app sandbox is NOT a permanent Vyla host. Vyla documentation notes some upstream providers block datacenter IP addresses. Check permission and upstream service policies.

Test on the host using `curl http://localhost:7860/health`, then verify authorised providers with `/test/:id?season=1&episode=1&source=provider-key`. **Never** make `/debug` public; Vyla says it may expose headers/source URLs.

## Configure Media God (after the server is running)

Base44 **server secrets**:

- `VYLA_STREAM_API_URL=https://your-vyla-host.example/` (or `.../api/`, matching the reverse proxy)
- `VYLA_STREAM_API_TOKEN=<server-auth-token>` optional bearer token, depending on your proxy configuration
- `VYLA_TV_PILOT_ENABLED=true`

Front-end *public non-secret build variable*:

- `VITE_MG_VYLA_TV_PILOT_ENABLED=true`

**Never put a credential in VITE_ variables**; they are embedded in the browser bundle. Both switches must be on to make live calls. Without them the pilot has no effect; the current Media God pipeline remains untouched.

The Base44 backend calls `/tv?id=:tmdbId&season=:season&episode=:episode`. It consumes SSE in a bounded window (7.5 seconds, 256 KiB, at most five candidates) and returns a compact JSON batch. This is **not client-side progressive streaming yet**; the production player can stay operational while pilot results arrive.

It rejects non-HTTPS, private-network and credential-bearing URLs, invalid episodes, explicitly foreign audio, placeholder labels and rows needing unsupported proxy headers. An upstream “verified” candidate is **not** a decoder-verified stream or a guaranteed English soundtrack; Media God must validate playback and audio at runtime.

## Pilot success criteria before enabling by default

Use available authorised episodes with known IDs. Suggested checks: exact S/E, first-frame start delay, 30-second uninterrupted video, decoded English dialogue, late-fallback behaviour, Android and Fire TV. Test empty responses, HTTP 403/429, invalid/expired MP4/HLS and upstream aborts. Record failures by **source** without persisting signed URLs, credentials or full user history.

Only promote Vyla from pilot after real-device tests show it improves success rates. Keep FlixQuest unconfigured backup and manual source selection untouched. Roll back by setting either flag to false.
