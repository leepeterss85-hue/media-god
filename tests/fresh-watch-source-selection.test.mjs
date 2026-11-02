import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("hotfix: Continue Watching remains mounted inside the verified player provider", () => {
  const provider = read("src/components/mg/PlayerProvider.jsx");
  const row = read("src/components/mg/ContinueWatchingRow.jsx");
  const home = read("src/components/mg/HomeDashboard.jsx");
  assert.match(provider, /<PlayerAutomationBridge>[\s\S]*?\{children\}[\s\S]*?<\/PlayerAutomationBridge>/);
  assert.doesNotMatch(provider, /FreshWatchSourcesOverlay/);
  assert.match(home, /<ContinueWatchingRow/);
  assert.match(row, /profiledLibrary\.ContinueWatching/);
  assert.match(row, /data-mg-continue-resume="true"/);
  assert.match(row, /data-mg-continue-sources="true"/);
  assert.match(row, /data-mg-continue-reviews="true"/);
  assert.match(row, /data-mg-continue-player-options="true"/);
  assert.match(row, /data-mg-continue-download="true"/);
  assert.match(row, /<StreamSourcesBox/);
});

test("hotfix: restore original embedded-player routing without a new Sources overlay", () => {
  const portal = read("src/components/mg/PlayerPortalRenderer.jsx");
  assert.doesNotMatch(portal, /fresh-watch-sources-open|manualSourcesOpen|FreshWatchSourcesOverlay/);
  assert.match(portal, /onOpenSources=\{onOpenSources\}/);
  assert.match(portal, /<OnlyFlixEmbedPlayer/);
  assert.match(portal, /<VideoPlayer/);
});
