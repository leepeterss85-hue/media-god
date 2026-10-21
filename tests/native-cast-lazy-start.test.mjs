import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt",import.meta.url),"utf8");
test("phone does not start CastContext until user presses Cast",()=>{
  const onCreate=app.slice(app.indexOf("override fun onCreate("),app.indexOf("override fun onResume("));
  assert.doesNotMatch(onCreate,/castManager = runCatching/);
  const bridge=app.slice(app.indexOf("fun castVideo(payloadJson: String)"),app.indexOf("fun startVoiceSearch()"));
  assert.match(bridge,/webView\.post \{/);
  assert.match(bridge,/if \(castManager == null\)/);
  assert.match(bridge,/MediaGodCastManager\(this@MainActivity\)/);
  assert.match(bridge,/castManager\?\.start\(payloadJson\)/);
  assert.match(bridge,/mg:native-cast-status/);
  assert.match(bridge,/return true/);
});
