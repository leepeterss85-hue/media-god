import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../scripts/archive-stable-apks.sh", import.meta.url));
const code = readFileSync(path, "utf8");

test("APK archive script has valid shell syntax", () => {
  const result = spawnSync("bash", ["-n", path], {encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr);
});

test("mismatched previous APK SHAs are preserved separately without altering latest pointers", () => {
  assert.match(code, /old_mobile_sha.*!=.*old_firetv_sha/);
  assert.match(code, /archive_independent_previous mobile/);
  assert.match(code, /archive_independent_previous firetv/);
  assert.match(code, /recovery-/);
  assert.match(code, /gh release download/);
  assert.match(code, /gh release create/);
  assert.doesNotMatch(code, /gh release delete|--clobber/);
  assert.match(code, /Both independently published previous APKs are safely archived/);
});

test("old mobile and TV archives reject incomplete and misattributed downloads", () => {
  assert.match(code, /\.draft == false and .published_at != null/);
  assert.match(code, /\.state == "uploaded" and .size > 1000000/);
  assert.match(code, /expected_bytes/);
  assert.match(code, /actual_bytes/);
  assert.match(code, /incomplete; refusing replacement/);
  assert.match(code, /Existing .* incomplete or has a different commit/);
  assert.match(code, /SHA256SUMS\.txt/);
});

test("matching prior APK SHAs still use paired immutable rollback archive", () => {
  assert.match(code, /archive_tag="stable-/);
  assert.match(code, /Known-good rollback archive already exists/);
  assert.match(code, /Media-God-Android-Mobile\.apk/);
  assert.match(code, /Media-God-Fire-TV\.apk/);
});

test("Android and Fire TV APK versions increased and remain in sync with manifests", () => {
  for (const [folder, manifestFile, versionCode, versionName] of [
    ["android-mobile", "android-mobile-update.json", 97, "1.0.96"],
    ["firetv-android", "firetv-update.json", 126, "1.4.121"],
  ]) {
    const gradle = readFileSync(new URL("../" + folder + "/app/build.gradle.kts", import.meta.url), "utf8");
    const manifest = JSON.parse(readFileSync(new URL("../public/" + manifestFile, import.meta.url), "utf8"));
    assert.match(gradle, new RegExp("versionCode\\s*=\\s*" + versionCode + "\\b"));
    assert.ok(gradle.includes('versionName = "' + versionName + '"'));
    assert.equal(manifest.versionCode, versionCode);
    assert.equal(manifest.versionName, versionName);
  }
});
