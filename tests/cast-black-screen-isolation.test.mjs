import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cast = readFileSync(new URL("../src/components/mg/CastButton.jsx", import.meta.url), "utf8");
const android = readFileSync(new URL("../android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt", import.meta.url), "utf8");
const player = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
const onlyflix = readFileSync(new URL("../src/components/mg/OnlyFlixEmbedPlayer.jsx", import.meta.url), "utf8");

test("opening video or switching sources never implicitly loads Google Cast SDK", () => {
  assert.match(cast, /const prepareCastSdk = useCallback\(\(\) => \{/);
  assert.match(cast, /onClick=\{\(\) => \{\s*setShowDestinations/);
  assert.match(cast, /if \(!showDestinations\) prepareCastSdk\(\)/);
  assert.doesNotMatch(cast, /useEffect\(\(\) => \{\s*\/\/ Native Android APKs[\s\S]*?loadCastSdk\(\)/);
  assert.match(cast, /autoJoinPolicy:\s*window\.chrome\.cast\.AutoJoinPolicy\.NO_AUTO_JOIN/);
  assert.match(cast, /if \(!castInitiated\) return undefined/);
});

test("player has a single text Cast control, not repeated Cast glyph overlays", () => {
  assert.doesNotMatch(cast, /<Cast\s+className/);
  assert.match(cast, /<span>\{connecting \? "Connecting…"/);
  assert.match(player, /<CastButton/);
  assert.match(onlyflix, /<CastButton/);
  assert.match(cast, /setShowDestinations\(false\)/);
  assert.match(cast, /setShowFeedback\(false\)/);
});

test("Android WebView cannot retire playing movie video based on Cast-injected DOM order", () => {
  assert.doesNotMatch(android, /var keep=videos\[videos\.length-1\]/);
  assert.doesNotMatch(android, /video\.removeAttribute\('src'\)/);
  assert.doesNotMatch(android, /video\.load\(\)/);
  assert.match(android, /\[data-mg-player-stage="true"\]/);
  assert.match(android, /if\(active\.length!==1\)/);
  assert.match(android, /if\(video===keep \|\| !video\.paused\)/);
  assert.doesNotMatch(android, /video\.style\.setProperty\('position','absolute'/);
});

test("Cast is still explicit and usable, but media playback remains independent", () => {
  assert.match(cast, /onClick=\{\(\) => \{ setShowDestinations\(false\); void handleCast\(\); \}\}/);
  assert.match(cast, /Media God TV \/ Fire Stick/);
  assert.doesNotMatch(android, /MediaGodCastManager.*launchCompatibilityPlayer/);
});
