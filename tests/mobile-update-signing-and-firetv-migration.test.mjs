import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isFireTvHardware, isMobileUpdaterSignatureError } from "../src/components/mg/mobileUpdaterCompatibility.js";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("the two Android apps are independently versioned packages", () => {
  const tv = read("firetv-android/app/build.gradle.kts");
  const mobile = read("android-mobile/app/build.gradle.kts");
  assert.match(tv, /applicationId = "com\.mediagod\.firetv"/);
  assert.match(tv, /versionName = "1\.4\.122"/);
  assert.match(mobile, /applicationId = "com\.mediagod\.mobile"/);
  assert.match(mobile, /versionName = "1\.0\.96"/);
});

test("Fire TV phone-edition installations get the dedicated TV APK, not the Mobile updater", () => {
  assert.equal(isFireTvHardware({userAgent: "Mozilla/5.0 (Linux; U; Android 9; AFTMM) MediaGodMobile/1.0.93"}), true);
  assert.equal(isFireTvHardware({userAgent: "AmazonWebAppPlatform/3.4"}), true);
  assert.equal(isFireTvHardware({tvRemote: true}), true);
  assert.equal(isFireTvHardware({userAgent: "Mozilla/5.0 (Linux; Android 14) MediaGodMobile/1.0.93"}), false);
  const dialog = read("src/components/mg/AndroidMobileAppUpdateNotice.jsx");
  assert.match(dialog, /installedOnFireTv \? "Fire TV app edition"/);
  assert.match(dialog, /canSelfUpdate && !installedOnFireTv && !legacySigningError/);
  assert.match(dialog, /Open official Fire TV APK/);
  assert.match(dialog, /OFFICIAL_FIRE_TV_APK[\s\S]*?\/firetv-latest\/Media-God-Fire-TV\.apk/);
  assert.match(dialog, /Keep the old Mobile app until you have tested the TV version/);
});

test("old false signing errors explain the safe manual path without ignoring Android signature enforcement", () => {
  assert.ok(isMobileUpdaterSignatureError("Downloaded APK signing identity does not match Media God Mobile."));
  assert.equal(isMobileUpdaterSignatureError("Update download failed: HTTP 500"), false);
  const dialog = read("src/components/mg/AndroidMobileAppUpdateNotice.jsx");
  assert.match(dialog, /legacySigningError \|\| !nativeInfo\?\.selfUpdateSupported/);
  assert.match(dialog, /Android itself will verify the certificate before replacing it/);
  assert.match(dialog, /Open official Android Mobile APK/);
  const kotlin = read("android-mobile/app/src/main/java/com/mediagod/mobile/AppUpdater.kt");
  assert.match(kotlin, /currentSigners\.isNotEmpty\(\) &&\s*archiveSigners\.isNotEmpty\(\) &&\s*currentSigners\.intersect\(archiveSigners\)\.isEmpty\(\)/);
  assert.match(kotlin, /signingCertificateHistory/);
  assert.match(kotlin, /getArchivePackageInfo/);
  assert.match(kotlin, /versionCodeOf\(archiveInfo\) <= BuildConfig\.VERSION_CODE/);
  assert.match(kotlin, /archiveInfo\.packageName != BuildConfig\.APPLICATION_ID/);
});
