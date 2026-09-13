# Media God testing

## Main regression gate

Run:

```bash
npm run test:regression
```

This is the normal pre-publish gate. It runs:

- Node regression tests for Live TV playlist parsing and duplicate merging
- Live TV playback-learning/quarantine behaviour
- UK-first Live TV ranking priority
- Real-Debrid resolution-strategy rules
- Real-Debrid file-index validation
- EPG alias/name normalisation
- ESLint
- Vite production build
- Base44 backend bundle checks for Real-Debrid, Live EPG and addon stream discovery

## Public network smoke test

Run:

```bash
npm run test:network
```

This checks a small representative set of public Live TV repositories, direct HLS feeds and the UK XMLTV EPG endpoint. Because these are third-party services, a failure can mean an upstream outage rather than an application regression.

## Full type check

Run:

```bash
npm run test:full
```

This runs the regression gate and then the project-wide TypeScript/JS type check. The repository currently has pre-existing UI typing errors outside the Media God playback changes, so `test:full` may remain red until that older typing debt is cleaned up. `test:regression` is the reliable release gate in the meantime.

## GitHub Actions

`.github/workflows/media-god-regression.yml` runs the regression gate automatically on pushes to `main`, pull requests and manual workflow runs. The public network smoke test also runs there as a non-blocking diagnostic so a temporary third-party outage does not prevent a valid code change from being merged.
