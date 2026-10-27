import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("Fire Stick Menu reaches the full film/episode provider strip without hijacking Play", () => {
  const embedded = read("firetv-android/app/src/main/java/com/mediagod/firetv/EmbeddedPlayerRemote.kt");
  const remote = read("src/components/mg/FireTvRemote.jsx");
  const providers = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  assert.match(embedded, /KeyEvent\.KEYCODE_MENU -> "ContextMenu"/);
  assert.match(remote, /keyName\(event\) === "ContextMenu"/);
  assert.match(remote, /data-mg-movie-player-backups/);
  assert.match(remote, /data-mg-episode-player-backups/);
  assert.match(remote, /providerButtons\.find\(button => button\.getAttribute\("aria-pressed"\) === "true"\)/);
  assert.match(remote, /direction === "left" \|\| direction === "right"/);
  assert.match(remote, /direction === "down"/);
  assert.match(remote, /pointerRect\.top <= frameRect\.top/);
  assert.match(remote, /focusElement\(providerButtons\.find/);
  assert.match(remote, /currentFocus\.click\(\)/);
  assert.ok(remote.indexOf("providerButtons.length && providerBar.contains(currentFocus)") <
    remote.indexOf("tapOnlyFlixForRemote("),
    "Focused provider tabs must receive D-pad input before the iframe pointer consumes it");
  assert.match(providers, /activeBackups\.map\(\(option\) =>/);
  assert.match(providers, /data-mg-movie-provider/);
  assert.match(providers, /data-mg-episode-provider/);
  assert.match(providers, /<SafeEmbedStage>/);
});

test("Fire Stick sidebar moves highlight with D-pad and Right opens focused view", () => {
  const remote = read("src/components/mg/FireTvRemote.jsx");
  const styles = read("src/fire-tv-stable.css");
  const navbar = read("src/components/mg/Navbar.jsx");
  assert.match(remote, /current\?\.closest\("\.mg-fire-tv-nav"\)/);
  assert.match(remote, /direction === "up" \|\| direction === "down"/);
  assert.match(remote, /index \+ step/);
  assert.match(remote, /direction === "right"/);
  assert.match(remote, /if \(!event\.repeat\) current\.click\(\)/);
  assert.match(styles, /mg-fire-tv-nav button:focus/);
  assert.match(styles, /--mg-green/);
  assert.match(navbar, /data-mg-focus-key=\{\x60nav:\$\{item\.id\}\x60\}/);
});

test("Fire Stick update prompt focuses Update now and does not auto-start installation", () => {
  const notice = read("src/components/mg/FireTvAppUpdateNotice.jsx");
  const remote = read("src/components/mg/FireTvRemote.jsx");
  assert.match(notice, /data-mg-update-primary="true"/);
  assert.match(notice, /if \(!visible \|\| !canSelfUpdate \|\| signatureMigration\)/);
  assert.match(notice, /primary\.focus\(\{ preventScroll: true \}\)/);
  assert.match(remote, /\[data-mg-update-primary="true"\]:not\(\[disabled\]\)/);
  assert.match(notice, /onClick=\{startUpdate\}/);
  assert.doesNotMatch(notice, /useEffect\(\(\) => \{\s*startUpdate\(/);
  // Deliberately do not modify phone update/popup behavior.
  assert.match(read("public/android-mobile-update.json"), /"versionName": "1\.0\.94"/);
});
