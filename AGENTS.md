# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Prefer the existing Base44 CLI workflow over adding new npm scripts for Base44-specific tasks.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

## Playback / Live TV protection

Playback, source resolution and Live TV are intentionally protected from unrelated work. Unless the user's request explicitly asks to change one of those areas, do **not** edit the protected media core files tracked by:

- `scripts/protected-media-baseline.json`
- `scripts/protected-media-guard.mjs`

This includes the browser player/provider core, Real-Debrid/addon stream resolution, Live TV catalogue/backend files, and the Android/Fire TV native player activities.

For ordinary catalogue, settings, navigation, accessibility, backup, diagnostics, account or visual work:

1. keep all protected media-core hashes unchanged;
2. run `npm run test:regression`;
3. treat a `test:protected` failure as a stop condition, not something to bypass.

If a playback or Live TV change is explicitly requested, make that change separately, review it as media-core work, and only then update the protected baseline to the newly reviewed hashes. Never refresh the baseline merely to make an unrelated build pass.
