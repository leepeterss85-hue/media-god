import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const entries = [
  "base44/functions/realDebrid/entry.ts",
  "base44/functions/realDebridAuth/entry.ts",
  "base44/functions/multiDebrid/entry.ts",
  "base44/functions/findRdLibrary/entry.ts",
  "base44/functions/configureMediaFusion/entry.ts",
  "base44/functions/fetchAddonStreams/entry.ts",
  "base44/functions/getTmdbMovies/entry.ts",
  "base44/functions/resolveImdb/entry.ts",
  "base44/functions/resolveTvImdb/entry.ts",
  "base44/functions/getLiveEpg/entry.ts",
  "base44/functions/skySportNow/entry.ts",
  "base44/functions/antSportsLive/entry.ts",
  "base44/functions/evSportsLive/entry.ts",
];

const outdir = await mkdtemp(join(tmpdir(), "media-god-backend-check-"));

try {
  for (const entry of entries) {
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "esm",
      outdir,
      external: ["npm:*", "base44:*"],
      logLevel: "silent",
    });
    console.log(`backend bundle ok: ${entry}`);
  }
} finally {
  await rm(outdir, { recursive: true, force: true });
}
