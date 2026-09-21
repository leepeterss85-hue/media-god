import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

const root = process.cwd();
const baseline = JSON.parse(
  await readFile(new URL("./protected-media-baseline.json", import.meta.url), "utf8")
);

const mismatches = [];

for (const [path, expected] of Object.entries(baseline.files || {})) {
  const content = await readFile(`${root}/${path}`);
  const actual = createHash("sha256").update(content).digest("hex");

  if (actual !== expected) {
    mismatches.push({ path, expected, actual });
  }
}

if (mismatches.length > 0) {
  console.error("\nProtected playback / Live TV core changed unexpectedly:\n");
  for (const item of mismatches) {
    console.error(`- ${item.path}`);
  }
  console.error(
    "\nIf these changes are intentional, review them separately and then update scripts/protected-media-baseline.json. " +
    "Do not refresh the baseline as part of unrelated UI/catalogue work.\n"
  );
  process.exit(1);
}

console.log(
  `ok protected media core unchanged (${Object.keys(baseline.files || {}).length} files)`
);
