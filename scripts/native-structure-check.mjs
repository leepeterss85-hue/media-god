import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const apps = [
  {
    name: "Fire TV",
    dir: "firetv-android",
    packagePath: "com/mediagod/firetv",
    namespace: "com.mediagod.firetv",
    expectedVersion: null,
    expectedOrientation: "landscape",
  },
  {
    name: "Android mobile",
    dir: "android-mobile",
    packagePath: "com/mediagod/mobile",
    namespace: "com.mediagod.mobile",
    expectedVersion: "1.0.5",
    expectedOrientation: "sensor",
  },
];

let failures = 0;

const requireFile = (filePath, label) => {
  const absolute = path.join(root, filePath);
  if (!fs.existsSync(absolute)) {
    console.error(`FAIL ${label}: missing ${filePath}`);
    failures += 1;
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const videoPlayer = requireFile(
  "src/components/mg/VideoPlayer.jsx",
  "web/native player coordination"
);

const nativeCoordinationChecks = [
  [
    /if\s*\(\s*!isLive\s*\|\|\s*isNativeFireTvPlayerAvailable\(\)\s*\)/m.test(
      videoPlayer
    ),
    "native Live TV browser-listener guard",
  ],
  [
    /!isLive\s*\|\|\s*sources\.length\s*<=\s*1\s*\|\|\s*isNativeFireTvPlayerAvailable\(\)/m.test(
      videoPlayer
    ),
    "native Live TV watchdog guard",
  ],
  [
    /if\s*\(\s*!isLive\s*\)\s*\{\s*nativeLaunchTimerRef\.current\s*=\s*window\.setTimeout/m.test(
      videoPlayer
    ),
    "native Live TV duplicate fallback-timer guard",
  ],
];

for (const [ok, label] of nativeCoordinationChecks) {
  if (!ok) {
    console.error(`FAIL player coordination: ${label}`);
    failures += 1;
  }
}

for (const app of apps) {
  const gradlePath = `${app.dir}/app/build.gradle.kts`;
  const manifestPath = `${app.dir}/app/src/main/AndroidManifest.xml`;
  const javaRoot = `${app.dir}/app/src/main/java/${app.packagePath}`;
  const gradle = requireFile(gradlePath, `${app.name} Gradle`);
  const manifest = requireFile(manifestPath, `${app.name} manifest`);
  const mainActivity = requireFile(`${javaRoot}/MainActivity.kt`, `${app.name} MainActivity`);
  const playerActivity = requireFile(`${javaRoot}/PlayerActivity.kt`, `${app.name} PlayerActivity`);
  requireFile(`${javaRoot}/AppUpdater.kt`, `${app.name} updater`);
  requireFile(`${app.dir}/app/src/main/res/xml/network_security_config.xml`, `${app.name} network security`);
  requireFile(`${app.dir}/app/src/main/res/xml/file_paths.xml`, `${app.name} file provider paths`);
  requireFile(`${app.dir}/app/src/main/res/values/strings.xml`, `${app.name} strings`);
  requireFile(`${app.dir}/app/src/main/res/values/styles.xml`, `${app.name} styles`);

  const versionNameOk = app.expectedVersion
    ? gradle.includes(`versionName = "${app.expectedVersion}"`)
    : /versionName\s*=\s*"\d+\.\d+\.\d+"/.test(gradle);

  const checks = [
    [gradle.includes(`namespace = "${app.namespace}"`), "namespace"],
    [versionNameOk, "versionName"],
    [gradle.includes("media3-exoplayer-hls"), "Media3 HLS dependency"],
    [gradle.includes("media3-exoplayer-dash"), "Media3 DASH dependency"],
    [manifest.includes('android.permission.INTERNET'), "INTERNET permission"],
    [manifest.includes('android:usesCleartextTraffic="true"'), "cleartext media support"],
    [manifest.includes('android:name=".MainActivity"'), "MainActivity declaration"],
    [manifest.includes('android:name=".PlayerActivity"'), "PlayerActivity declaration"],
    [manifest.includes(`android:screenOrientation="${app.expectedOrientation}"`), "player orientation"],
    [mainActivity.includes('addJavascriptInterface'), "JavaScript bridge"],
    [mainActivity.includes('mg:native-player-result'), "native result event"],
    [playerActivity.includes('DefaultHttpDataSource.Factory'), "Media3 HTTP data source"],
    [playerActivity.includes('setEnableDecoderFallback(true)'), "decoder fallback"],
    [playerActivity.includes('MimeTypes.APPLICATION_M3U8'), "HLS MIME fallback"],
    [playerActivity.includes('MimeTypes.APPLICATION_MPD'), "DASH MIME fallback"],
  ];

  for (const [ok, label] of checks) {
    if (!ok) {
      console.error(`FAIL ${app.name}: ${label}`);
      failures += 1;
    }
  }

  console.log(`ok ${app.name}: structural checks complete`);
}

if (failures > 0) {
  console.error(`native structure failures: ${failures}`);
  process.exit(1);
}

console.log("native structure check passed");
