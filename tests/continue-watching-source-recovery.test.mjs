import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const row = readFileSync(
  new URL("../src/components/mg/ContinueWatchingRow.jsx", import.meta.url),
  "utf8"
);

test("Continue Watching never freezes an old direct link as its entire source catalogue", () => {
  assert.doesNotMatch(row, /skipRdLookup:\s*true/);
  assert.doesNotMatch(row, /skipAddonLookup:\s*true/);
  assert.doesNotMatch(row, /noRd:\s*true/);
  // The old link is optional first candidate while fresh discovery continues.
  assert.match(row, /sources:\s*\[\{[\s\S]*?Resume last source/);
  assert.match(row, /resumeFromHistory:\s*true/);
});

test("saved torrent is respected but alternative sources are still discovered", () => {
  assert.match(row, /verifiedPlaybackPolicy:\s*"manual",\s*sources:\s*\[savedSource\]/);
  assert.match(row, /const hasSavedSource/);
  assert.match(row, /startTime:\s*Number\(item\.progress\s*\|\|\s*0\)/);
});

test("every history card has a distinct keyboard-accessible manual source escape route", () => {
  assert.match(row, /const chooseAnotherSource = async/);
  assert.match(row, /onClick=\{\(event\) => chooseAnotherSource\(item, event\)\}/);
  assert.match(row, /Find another source for/);
  assert.match(row, /Other sources/);
  // Fire TV CSS hides .mg-fire-tv-secondary-action, which is appropriate for
  // Remove but must never conceal the recovery button.
  const otherSourcesControl = row.slice(row.indexOf("chooseAnotherSource(item, event)"));
  assert.doesNotMatch(otherSourcesControl.slice(0, 500), /className="mg-fire-tv-secondary-action/);
  assert.match(row, /event\?\.stopPropagation\?\.\(\)/);
  const start = row.indexOf("const chooseAnotherSource = async");
  const end = row.indexOf("const displayItems = useMemo", start);
  const other = row.slice(start, end);
  assert.match(other, /verifiedPlaybackPolicy:\s*"manual"/);
  assert.match(other, /sources:\s*\[\]/);
  assert.doesNotMatch(other, /playOnlyFlix/);
  assert.doesNotMatch(other, /skipRdLookup:\s*true|skipAddonLookup:\s*true/);
});

test("normal Play keeps its existing OnlyFlix semantics distinct from Continue Watching", () => {
  assert.match(row, /savedSourceType === "onlyflix"/);
  assert.match(row, /explicitOnlyFlixResume/);
  assert.match(row, /player\.playOnlyFlix\(/);
});
