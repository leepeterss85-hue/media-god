# Railway: experimental Vyla TV pilot

This is a **separate service**, not the Media God frontend. Do not deploy the repository root as Vyla.

- Source: GitHub `leepeterss85-hue/media-god` branch `feature/vyla-tv-pilot-20261022`
- Root Directory: `/deploy/vyla`
- Builder: Dockerfile (found at that root)
- Healthcheck: `/health`
- Service variables (private, Railway): `TMDB_API_KEY`, `ENABLE_DEBUG_ROUTE=false`, `WORKER_COUNT=1`
- The runtime listens on Railway's provided `PORT` (fallback 7860).
- No secrets or source-provider credentials are committed to GitHub or baked into the image.
- Vyla upstream commit is pinned in the Dockerfile; verify updated upstream before changing it.

**Licence:** Upstream Vyla Stream API says Attribution–NonCommercial 4.0 International, so commercial deployments require explicit permission or another appropriate licence. Its providers also have their own terms and content-rights restrictions. This pilot should remain private and disabled in Media God until those questions are settled and genuine playback tests pass.

The host only reports discovery candidates, not English-audio guarantees. Also configure the separate Media God backend `VYLA_STREAM_API_URL` and flags as described in `docs/vyla-tv-pilot.md` only after this service is deployed and tested.
