import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const fire = read('firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt');
const phone = read('android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt');
test('Fire TV uses the working phone hosted-player upgrade lifecycle', () => {
  const extract = source => source.slice(source.indexOf('        val webPrefs = getSharedPreferences('), source.indexOf('\n        webView.requestFocus()'));
  assert.equal(extract(fire), extract(phone).replaceAll('media_god_mobile_web', 'media_god_firetv_web').replaceAll('mg_mobile_v', 'mg_firetv_v') + '\n');
  assert.match(fire, /cacheMode = WebSettings.LOAD_NO_CACHE/);
  assert.doesNotMatch(fire, /removeAllCookies|deleteAllData/);
});
test('Fire TV retains casting black-picture ownership protection', () => {
  assert.doesNotMatch(fire, /var keep=videos\[videos.length-1\]|video.removeAttribute\('src'\)/);
  assert.match(fire, /if\(active.length!==1\)/);
  assert.match(fire, /if\(video===keep \|\| !video.paused\)/);
});
