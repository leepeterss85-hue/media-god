import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("provider remains mounted above auth-dependent routes, not inside their conditional render", () => {
  const app = read("src/App.jsx");
  const top = app.slice(app.indexOf("function App()"));
  const authTree = app.slice(app.indexOf("const AuthenticatedApp"), app.indexOf("function App()"));
  assert.match(top, /<Router>[\s\S]*?<PlayerProvider>[\s\S]*?<AuthenticatedApp\s*\/>[\s\S]*?<\/PlayerProvider>/);
  assert.doesNotMatch(authTree, /<PlayerProvider>/);
  assert.match(read("src/components/mg/PlayerProvider.jsx"), /<CorePlayerProvider>[\s\S]*?<PlayerAutomationBridge>[\s\S]*?\{children\}/);
});

test("Continue Watching cannot be hidden by saved recommendation preferences", () => {
  const home = read("src/components/mg/HomeDashboard.jsx");
  assert.match(home, /data-mg-home-second="continue-watching"[\s\S]*?<ContinueWatchingRow/);
  assert.doesNotMatch(home, /!hiddenHomeSections\.has\("continue-watching"\)/);
});

test("initial account-history fetch must run even in a hidden WebView", () => {
  const code = read("src/components/mg/continueWatchingSync.js");
  assert.match(code, /windowObject\.setInterval\(refreshIfVisible, intervalMs\)/);
  assert.match(code, /const timer = windowObject\.setInterval\(refreshIfVisible, intervalMs\);[\s\S]*?refresh\(\);/);
});

test("Continue Watching remains visible and offers retry when history is loading, empty, or unavailable", () => {
  const code = read("src/components/mg/ContinueWatchingRow.jsx");
  assert.doesNotMatch(code, /if \(loading \|\| \(displayItems\.length === 0 && !syncError\)\) \{\s*return null;/);
  assert.match(code, /<section aria-busy=\{loading\}/);
  assert.match(code, /Loading your saved Continue Watching titles/);
  assert.match(code, /displayItems\.length === 0 && !syncError/);
  assert.match(code, /Refresh history/);
  assert.match(code, /role="status"/);
  for (const key of ["resume", "sources", "reviews", "player-options", "download"]) {
    assert.match(code, new RegExp('data-mg-continue-' + key + '="true"'));
  }
  assert.match(code, /profiledLibrary\.ContinueWatching/);
  assert.match(code, /watchContinueWatchingChanges/);
});
