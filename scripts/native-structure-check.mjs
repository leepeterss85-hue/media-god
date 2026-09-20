import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const apps = [
  {
    name: "Fire TV",
    dir: "firetv-android",
    packagePath: "com/mediagod/firetv",
    namespace: "com.mediagod.firetv",
    expectedVersion: "1.4.46",
    expectedMedia3: "1.8.0",
    expectedOrientation: "landscape",
  },
  {
    name: "Android mobile",
    dir: "android-mobile",
    packagePath: "com/mediagod/mobile",
    namespace: "com.mediagod.mobile",
    expectedVersion: "1.0.32",
    expectedMedia3: "1.11.0",
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
const nativeBridge = requireFile(
  "src/components/mg/nativeFireTvBridge.js",
  "web/native codec metadata bridge"
);
const playbackReliability = requireFile(
  "src/components/mg/playbackReliability.js",
  "permanent Real-Debrid rejection failover"
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
  [
    nativeBridge.includes("videoCodec") &&
      nativeBridge.includes("audioCodec") &&
      nativeBridge.includes("container") &&
      nativeBridge.includes("hintText"),
    "native codec/container hint payload",
  ],
  [
    nativeBridge.includes("mediaInfo") &&
      nativeBridge.includes("findNestedHint"),
    "nested media metadata extraction",
  ],
  [
    nativeBridge.includes("videoProfile") &&
      nativeBridge.includes("bitDepth") &&
      nativeBridge.includes("hdrFormat") &&
      nativeBridge.includes("width") &&
      nativeBridge.includes("height") &&
      nativeBridge.includes("fps") &&
      nativeBridge.includes("bitrate"),
    "4K/HDR metadata payload",
  ],
  [
    playbackReliability.includes("installPermanentRdRejectionFailover") &&
      playbackReliability.includes("rejected by Real-Debrid") &&
      playbackReliability.includes('dispatchEvent(new Event("change", { bubbles: true }))'),
    "permanent Real-Debrid rejection source advance",
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
  const compatibilityActivity = requireFile(
    `${javaRoot}/CompatibilityPlayerActivity.kt`,
    `${app.name} compatibility player`
  );
  const compatibilityRouter = requireFile(
    `${javaRoot}/PlaybackCompatibilityRouter.kt`,
    `${app.name} codec preflight router`
  );
  const devicePerformanceGuard = requireFile(
    `${javaRoot}/DevicePerformanceGuard.kt`,
    `${app.name} thermal and memory guard`
  );
  const streamPreflight = requireFile(
    `${javaRoot}/NativeStreamPreflight.kt`,
    `${app.name} stream preflight`
  );
  const playbackDiagnostics = requireFile(
    `${javaRoot}/NativePlaybackDiagnostics.kt`,
    `${app.name} playback diagnostics`
  );
  const displayRateMatcher = requireFile(
    `${javaRoot}/DisplayRateMatcher.kt`,
    `${app.name} display rate matcher`
  );
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
    [gradle.includes(`val media3Version = "${app.expectedMedia3}"`), "Media3 version"],
    [gradle.includes("media3-exoplayer-hls"), "Media3 HLS dependency"],
    [gradle.includes("media3-exoplayer-dash"), "Media3 DASH dependency"],
    [gradle.includes("media3-exoplayer-smoothstreaming"), "Media3 SmoothStreaming dependency"],
    [gradle.includes("media3-exoplayer-rtsp"), "Media3 RTSP dependency"],
    [gradle.includes("org.videolan.android:libvlc-all:3.6.5"), "LibVLC compatibility dependency"],
    [manifest.includes("android.permission.INTERNET"), "INTERNET permission"],
    [manifest.includes('android:usesCleartextTraffic="true"'), "cleartext media support"],
    [manifest.includes('android:name=".MainActivity"'), "MainActivity declaration"],
    [manifest.includes('android:name=".PlayerActivity"'), "PlayerActivity declaration"],
    [manifest.includes('android:name=".CompatibilityPlayerActivity"'), "compatibility player declaration"],
    [manifest.includes(`android:screenOrientation="${app.expectedOrientation}"`), "player orientation"],
    [mainActivity.includes("addJavascriptInterface"), "JavaScript bridge"],
    [mainActivity.includes("mg:native-player-result"), "native result event"],
    [mainActivity.includes("PlaybackCompatibilityRouter.decide(payload)"), "preflight routing decision"],
    [mainActivity.includes("CompatibilityPlayerActivity::class.java"), "direct compatibility player routing"],
    [mainActivity.includes("NativeStreamPreflight.checkPayload(payload)"), "pre-play stream validation"],
    [mainActivity.includes("EXTRA_DIAGNOSTICS"), "native diagnostics result forwarding"],
    [
      mainActivity.includes("__MG_SINGLE_VIDEO_SURFACE_GUARD__") &&
        mainActivity.includes("data-mg-playback-retired"),
      "APK-side single video surface guard",
    ],
    [playerActivity.includes("DefaultHttpDataSource.Factory"), "Media3 HTTP data source"],
    [playerActivity.includes("setEnableDecoderFallback(true)"), "device decoder fallback"],
    [playerActivity.includes("setVideoChangeFrameRateStrategy"), "Media3 frame-rate strategy"],
    [playerActivity.includes("DisplayRateMatcher.apply"), "native display frame-rate matching"],
    [playerActivity.includes("NativePlaybackDiagnostics.snapshot"), "Media3 diagnostics snapshot"],
    [
      playerActivity.includes("buildAssistControls") &&
        playerActivity.includes("updateAssistControls") &&
        playerActivity.includes('finishWithResult("next")'),
      "native episode skip/next controls",
    ],
    [
      playerActivity.includes("isHostedProviderErrorClip") &&
        playerActivity.includes("115_000L..125_000L") &&
        playerActivity.includes("AIOStreams / ElfHosted returned a short error clip"),
      "AIOStreams/ElfHosted short error-clip failover",
    ],
    [playerActivity.includes("CompatibilityPlayerActivity::class.java"), "runtime compatibility decoder fallback"],
    [playerActivity.includes("MimeTypes.APPLICATION_M3U8"), "HLS MIME fallback"],
    [playerActivity.includes("MimeTypes.APPLICATION_MPD"), "DASH MIME fallback"],
    [playerActivity.includes("video/x-matroska"), "Matroska MIME recognition"],
    [playerActivity.includes("video/x-msvideo"), "AVI MIME recognition"],
    [compatibilityActivity.includes("LibVLC("), "LibVLC engine"],
    [compatibilityActivity.includes("setHWDecoderEnabled(true, false)"), "hardware-first VLC fallback"],
    [compatibilityActivity.includes('setAudioOutput("android_audiotrack")'), "compatibility Android AudioTrack output"],
    [compatibilityActivity.includes("setAudioDigitalOutputEnabled(false)"), "compatibility digital passthrough disabled"],
    [compatibilityActivity.includes('setAudioOutputDevice("stereo")'), "compatibility stereo PCM downmix"],
    [compatibilityActivity.includes("cycleAudioTrack"), "compatibility audio track selector"],
    [compatibilityActivity.includes("audioTracks"), "compatibility audio track discovery"],
    [compatibilityActivity.includes("DisplayRateMatcher.apply"), "compatibility refresh-rate matching"],
    [compatibilityActivity.includes("NativePlaybackDiagnostics.snapshot"), "compatibility diagnostics snapshot"],
    [compatibilityActivity.includes("IMedia.Slave.Type.Subtitle"), "compatibility subtitle support"],
    [compatibilityRouter.includes("MediaCodecList(MediaCodecList.ALL_CODECS)"), "device codec registry preflight"],
    [compatibilityRouter.includes("areSizeAndRateSupported"), "4K size/rate capability check"],
    [compatibilityRouter.includes("HEVCProfileMain10"), "HEVC Main10 capability check"],
    [compatibilityRouter.includes("bitrateRange"), "UHD bitrate capability check"],
    [compatibilityRouter.includes("dolby-vision"), "Dolby Vision profile routing"],
    [compatibilityRouter.includes('CodecSpec("hevc", listOf("video/hevc"))'), "Dolby Vision HEVC base-layer rescue"],
    [compatibilityRouter.includes("provider:torrentio"), "Torrentio compatibility-player preflight"],
    [compatibilityRouter.includes("video:") && compatibilityRouter.includes("audio:"), "codec-class routing"],
    [compatibilityRouter.includes("prores") && compatibilityRouter.includes("vc1"), "extended video codec detection"],
    [compatibilityRouter.includes("dts-hd") && compatibilityRouter.includes("truehd"), "extended audio codec detection"],
    [compatibilityRouter.includes("container:legacy"), "legacy container preflight"],
    [compatibilityRouter.includes('payload.optJSONObject("drm")'), "DRM Media3 guard"],
    [compatibilityRouter.includes('payload.optBoolean("forceCompatibility"'), "learned/advanced compatibility routing"],
    [playerActivity.includes("setShowSubtitleButton(true)"), "Media3 subtitle-track selector"],
    [compatibilityActivity.includes("spuTracks") && compatibilityActivity.includes("setSpuTrack"), "LibVLC subtitle-track selector"],
    [compatibilityActivity.includes("setAudioDelay"), "lip-sync adjustment"],
    [compatibilityActivity.includes("audioOutputMode") && compatibilityActivity.includes("setAudioDigitalOutputEnabled"), "selectable audio output modes"],
    [compatibilityActivity.includes("automaticNoSoundRecovery") && compatibilityActivity.includes("recoverAudioTrack"), "automatic no-sound recovery"],
    [
      compatibilityActivity.includes("preferredAliases") &&
        compatibilityActivity.includes("value += 1000"),
      "preferred/English audio track priority",
    ],
    [compatibilityActivity.includes("equalizer-bands") && compatibilityActivity.includes("dialogueBoost"), "dialogue boost"],
    [compatibilityActivity.includes("audio-replay-gain-mode") && compatibilityActivity.includes("volumeNormalization"), "volume normalization"],
    [compatibilityActivity.includes("showPlaybackInfo"), "native playback info screen"],
    [devicePerformanceGuard.includes("currentThermalStatus") && devicePerformanceGuard.includes("lowMemory"), "thermal/memory 4K protection"],
    [
      streamPreflight.includes('setRequestProperty("Range", "bytes=0-${wanted - 1}")') &&
        streamPreflight.includes("networkRisk") &&
        streamPreflight.includes("estimatedMbps") &&
        streamPreflight.includes("451"),
      "resolved stream HTTP/network preflight",
    ],
    [playbackDiagnostics.includes("videoCodec") && playbackDiagnostics.includes("audioCodec") && playbackDiagnostics.includes("hdrFormat") && playbackDiagnostics.includes("bitDepth"), "native codec/HDR diagnostics"],
    [displayRateMatcher.includes("preferredRefreshRate"), "display refresh-rate hint"],
  ];

  if (app.name === "Fire TV") {
    checks.push([
      compatibilityRouter.includes("firetv-dv-hdr10plus-mkv"),
      "Fire TV Dolby Vision + HDR10+ MKV workaround",
    ]);
    checks.push([
      displayRateMatcher.includes("preferredDisplayModeId"),
      "Fire TV same-resolution display mode matching",
    ]);
  }

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
