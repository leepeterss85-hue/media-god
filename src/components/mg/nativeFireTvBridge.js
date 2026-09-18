import { readPlaybackPreferences } from "@/components/mg/playbackPreferences";

let nativeCodecInfoCache = null;

const bridge = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = window.MediaGodNative;

  if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) {
    return null;
  }

  return candidate;
};

export const isNativeFireTvPlayerAvailable = () => {
  const native = bridge();
  return Boolean(native && typeof native.play === "function");
};

/*
 * Cancel a native handoff that is still in its network/preflight phase.
 * Current APKs reject cancellation after PlayerActivity owns the screen, so
 * this cannot tear down playback behind the user's back. Older APKs simply do
 * not expose the method and safely fall back to the normal component cleanup.
 */
export const cancelNativeFireTvPlayback = (requestId = "") => {
  const native = bridge();

  if (!native || typeof native.cancelPlayback !== "function") {
    return false;
  }

  try {
    return native.cancelPlayback(String(requestId || "")) === true;
  } catch {
    return false;
  }
};

export const nativeFireTvDisplayInfo = () => {
  const native = bridge();

  if (!native || typeof native.getDisplayInfo !== "function") {
    return null;
  }

  try {
    const value = native.getDisplayInfo();
    return typeof value === "string" ? JSON.parse(value) : value || null;
  } catch {
    return null;
  }
};

export const nativeFireTvAppInfo = () => {
  const native = bridge();

  if (!native || typeof native.getAppInfo !== "function") {
    return null;
  }

  try {
    const value = native.getAppInfo();
    return typeof value === "string" ? JSON.parse(value) : value || null;
  } catch {
    return null;
  }
};

export const nativeFireTvCodecInfo = () => {
  if (nativeCodecInfoCache) {
    return nativeCodecInfoCache;
  }

  const native = bridge();

  if (!native || typeof native.getCodecInfo !== "function") {
    return null;
  }

  try {
    const value = native.getCodecInfo();
    const parsed = typeof value === "string" ? JSON.parse(value) : value || null;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    nativeCodecInfoCache = {
      video: Array.isArray(parsed.video) ? parsed.video.map(String) : [],
      audio: Array.isArray(parsed.audio) ? parsed.audio.map(String) : [],
    };

    return nativeCodecInfoCache;
  } catch {
    return null;
  }
};

export const nativeFireTvSelfUpdateAvailable = () => {
  const native = bridge();
  return Boolean(native && typeof native.startUpdate === "function");
};

export const nativeFireTvExitAvailable = () => {
  const native = bridge();
  return Boolean(native && typeof native.exitApp === "function");
};

export const exitNativeFireTvApp = () => {
  const native = bridge();

  if (!native || typeof native.exitApp !== "function") {
    return false;
  }

  try {
    const result = native.exitApp();
    return result !== false && result !== "false" && result !== "error";
  } catch {
    return false;
  }
};

export const startNativeFireTvUpdate = ({ url, versionName = "" }) => {
  const native = bridge();
  const target = String(url || "").trim();

  if (
    !native ||
    typeof native.startUpdate !== "function" ||
    !/^https?:\/\//i.test(target)
  ) {
    return "error";
  }

  try {
    const result = native.startUpdate(target, String(versionName || ""));
    return String(result || "error").trim().toLowerCase();
  } catch {
    return "error";
  }
};

export const openNativeFireTvExternalUrl = (url) => {
  const native = bridge();
  const target = String(url || "").trim();

  if (!native || typeof native.openExternalUrl !== "function" || !/^https?:\/\//i.test(target)) {
    return false;
  }

  try {
    const result = native.openExternalUrl(target);
    return result !== false && result !== "false" && result !== "error";
  } catch {
    return false;
  }
};

const NATIVE_DIAGNOSTICS_KEY = "mg:native-playback-diagnostics:v1";

const connectionDownlinkMbps = () => {
  if (typeof navigator === "undefined") return 0;
  const value = Number(navigator.connection?.downlink || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const diagnosticFingerprint = (value = {}) => {
  const height = Number(value?.height || 0);
  const resolution = height >= 1700 ? "4k" : height >= 900 ? "1080p" : height > 0 ? "sd" : "unknown";
  return [
    String(value?.videoCodec || "").toLowerCase(),
    String(value?.audioCodec || "").toLowerCase(),
    String(value?.container || value?.mimeType || "").toLowerCase(),
    String(value?.hdrFormat || "").toLowerCase(),
    Number(value?.bitDepth || 0) >= 10 ? "10bit" : "normalbit",
    resolution,
  ].join("|");
};

const learnedCompatibilityReason = (hints = {}) => {
  if (typeof window === "undefined") return "";
  let history = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NATIVE_DIAGNOSTICS_KEY) || "[]");
    history = Array.isArray(parsed) ? parsed : [];
  } catch {
    return "";
  }

  const wanted = diagnosticFingerprint(hints);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const failures = history.filter((entry) => {
    if (Number(entry?.at || 0) < cutoff || diagnosticFingerprint(entry) !== wanted) return false;
    const code = Number(entry?.compatibilityErrorCode || 0);
    const text = [
      entry?.compatibilityError,
      entry?.compatibilityReason,
      entry?.message,
    ].filter(Boolean).join(" ");
    return code === 3003 || (code >= 4001 && code <= 5004) ||
      /decoder|codec|format|profile|unsupported|initialization/i.test(text);
  });

  return failures.length >= 2 ? "learned-device-decoder-failure" : "";
};

const positiveWholeNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
};

const episodeNumbersFromTitle = (title) => {
  const text = String(title || "");
  const match = text.match(/(?:^|\b)S(\d{1,3})E(\d{1,4})(?:\b|$)/i);

  return {
    season: positiveWholeNumber(match?.[1]),
    episode: positiveWholeNumber(match?.[2]),
  };
};

const normaliseHintKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const hintString = (value) => {
  if (value == null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) {
    return String(value).replace(/\s+/g, " ").trim();
  }
  return "";
};

const hintNumber = (value) => {
  if (value == null || value === "") return 0;

  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  const match = String(value).match(/\d+(?:\.\d+)?/);
  const number = Number(match?.[0] || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const hintBitrate = (value) => {
  if (value == null || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  const text = String(value).trim().toLowerCase();
  const amount = hintNumber(text);
  if (!amount) return 0;

  if (/g(?:b|bit)ps|gb\/s/.test(text)) return amount * 1_000_000_000;
  if (/m(?:b|bit)ps|mb\/s/.test(text)) return amount * 1_000_000;
  if (/k(?:b|bit)ps|kb\/s/.test(text)) return amount * 1_000;

  return amount;
};

const findNestedHint = (value, wantedKeys, depth = 0) => {
  if (!value || typeof value !== "object" || depth > 3) {
    return "";
  }

  const wanted = new Set(wantedKeys.map(normaliseHintKey));
  const entries = Array.isArray(value)
    ? value.slice(0, 16).map((item, index) => [String(index), item])
    : Object.entries(value).slice(0, 64);

  for (const [key, item] of entries) {
    if (wanted.has(normaliseHintKey(key))) {
      const direct = hintString(item);
      if (direct) return direct;
    }
  }

  for (const [, item] of entries) {
    const nested = findNestedHint(item, wantedKeys, depth + 1);
    if (nested) return nested;
  }

  return "";
};

const safeObjectHint = (value) => {
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value).replace(/\s+/g, " ").slice(0, 5000);
  } catch {
    return "";
  }
};

const nativeSourceHints = (item = {}) => {
  const mediaInfo =
    item?.mediaInfo && typeof item.mediaInfo === "object"
      ? item.mediaInfo
      : item?.media_info && typeof item.media_info === "object"
        ? item.media_info
        : null;

  const videoCodec =
    hintString(item?.videoCodec || item?.video_codec || item?.vcodec) ||
    findNestedHint(mediaInfo, [
      "videoCodec",
      "video_codec",
      "vcodec",
      "videoCodecName",
      "video_codec_name",
      "codec",
    ]);

  const audioCodec =
    hintString(item?.audioCodec || item?.audio_codec || item?.acodec) ||
    findNestedHint(mediaInfo, [
      "audioCodec",
      "audio_codec",
      "acodec",
      "audioCodecName",
      "audio_codec_name",
    ]);

  const container =
    hintString(
      item?.container ||
        item?.containerName ||
        item?.container_name ||
        item?.formatName ||
        item?.format_name
    ) ||
    findNestedHint(mediaInfo, [
      "container",
      "containerName",
      "container_name",
      "formatName",
      "format_name",
      "format",
    ]);

  const videoProfile =
    hintString(item?.videoProfile || item?.video_profile || item?.profile) ||
    findNestedHint(mediaInfo, [
      "videoProfile",
      "video_profile",
      "profile",
      "codecProfile",
      "codec_profile",
    ]);

  const width = hintNumber(
    item?.width ||
      item?.videoWidth ||
      item?.video_width ||
      findNestedHint(mediaInfo, ["width", "videoWidth", "video_width", "codedWidth"])
  );

  const height = hintNumber(
    item?.height ||
      item?.videoHeight ||
      item?.video_height ||
      findNestedHint(mediaInfo, ["height", "videoHeight", "video_height", "codedHeight"])
  );

  const fps = hintNumber(
    item?.fps ||
      item?.frameRate ||
      item?.frame_rate ||
      findNestedHint(mediaInfo, ["fps", "frameRate", "frame_rate", "framerate"])
  );

  const bitDepth = hintNumber(
    item?.bitDepth ||
      item?.bit_depth ||
      findNestedHint(mediaInfo, ["bitDepth", "bit_depth", "bitsPerPixel", "bits_per_pixel"])
  );

  const bitrate = hintBitrate(
    item?.bitrate ||
      item?.bit_rate ||
      item?.videoBitrate ||
      item?.video_bitrate ||
      findNestedHint(mediaInfo, [
        "bitrate",
        "bit_rate",
        "videoBitrate",
        "video_bitrate",
      ])
  );

  const hdrFormat =
    hintString(
      item?.hdrFormat ||
        item?.hdr_format ||
        item?.dynamicRange ||
        item?.dynamic_range
    ) ||
    findNestedHint(mediaInfo, [
      "hdr",
      "hdrFormat",
      "hdr_format",
      "dynamicRange",
      "dynamic_range",
      "colorTransfer",
      "color_transfer",
    ]);

  const hintText = [
    item?.label,
    item?.name,
    item?.title,
    item?.filename,
    item?.file,
    item?.path,
    item?.quality,
    item?.format,
    item?.codec,
    item?.codecs,
    videoCodec,
    audioCodec,
    container,
    videoProfile,
    width ? `${Math.round(width)}x${Math.round(height || 0)}` : "",
    fps ? `${fps}fps` : "",
    bitDepth ? `${bitDepth}bit` : "",
    bitrate ? `${Math.round(bitrate)}bps` : "",
    hdrFormat,
    safeObjectHint(mediaInfo),
  ]
    .map(hintString)
    .filter(Boolean)
    .join(" • ")
    .slice(0, 8000);

  return {
    videoCodec,
    audioCodec,
    container,
    videoProfile,
    width,
    height,
    fps,
    bitDepth,
    bitrate,
    hdrFormat,
    hintText,
  };
};

const playerMarkerSeconds = (context, key) => {
  const value = Number(context?.[key]);
  return Number.isFinite(value) && value >= 0 ? value : -1;
};

export const playNativeFireTv = ({
  requestId,
  url,
  title = "",
  poster = "",
  startPositionMs = 0,
  live = false,
  headers = {},
  mimeType = "",
  drm = null,
  audioLanguage = "en",
  subtitleLanguage = "en",
  subtitlesEnabled = false,
  subtitles = [],
  sources = [],
  activeSourceIndex = 0,
  preferForcedSubtitles = false,
}) => {
  const native = bridge();
  const streamUrl = String(url || "").trim();

  if (!native || !/^https?:\/\//i.test(streamUrl)) {
    return false;
  }

  const playerContext =
    typeof window !== "undefined" &&
    window.__MG_PLAYER_CONTEXT__ &&
    typeof window.__MG_PLAYER_CONTEXT__ === "object"
      ? window.__MG_PLAYER_CONTEXT__
      : {};

  const titleEpisode = episodeNumbersFromTitle(title);
  const contextSeason = positiveWholeNumber(
    playerContext?.season ?? playerContext?.rdSeason
  );
  const contextEpisode = positiveWholeNumber(
    playerContext?.episode ?? playerContext?.rdEpisode
  );
  const season = contextSeason || titleEpisode.season;
  const episode = contextEpisode || titleEpisode.episode;

  const rawMediaType = String(
    playerContext?.mediaType || playerContext?.type || ""
  )
    .trim()
    .toLowerCase();

  const looksLikeTvEpisode =
    rawMediaType === "tv" ||
    rawMediaType === "series" ||
    season > 0 ||
    episode > 0 ||
    (titleEpisode.season > 0 && titleEpisode.episode > 0);

  const mediaType = looksLikeTvEpisode ? "tv" : rawMediaType;
  const tmdbId = positiveWholeNumber(
    playerContext?.tmdbId ??
      playerContext?.tmdb_id ??
      playerContext?.id
  );

  /*
   * Do not hide Season / Episode just because one browser-context field is
   * missing. Fire TV already knows how to return to Media God's existing
   * season/episode picker. A clearly identified TV episode is enough to show
   * those two native menu entries; TMDB id is useful metadata, not a gate.
   */
  const canChooseEpisode =
    !live &&
    looksLikeTvEpisode &&
    season > 0 &&
    episode > 0;

  if (typeof window !== "undefined" && canChooseEpisode) {
    window.__MG_PLAYER_CONTEXT__ = {
      ...playerContext,
      mediaType: "tv",
      season,
      episode,
      ...(tmdbId > 0 ? { tmdbId } : {}),
    };
  }

  const contextHints = nativeSourceHints(playerContext);

  const nativeSources = Array.isArray(sources)
    ? sources.map((item, index) => {
        const hints = nativeSourceHints(item);

        return {
          label: String(
            item?.label || item?.name || item?.sourceName || `Source ${index + 1}`
          )
            .replace(/\s+/g, " ")
            .trim(),
          sourceName: String(item?.sourceName || "").replace(/\s+/g, " ").trim(),
          url: String(item?.url || item?.src || item?.magnet || item?.magnetLink || "").trim(),
          mimeType: String(item?.mimeType || item?.mime_type || "").trim(),
          videoCodec: hints.videoCodec,
          audioCodec: hints.audioCodec,
          container: hints.container,
          videoProfile: hints.videoProfile,
          width: hints.width,
          height: hints.height,
          fps: hints.fps,
          bitDepth: hints.bitDepth,
          bitrate: hints.bitrate,
          hdrFormat: hints.hdrFormat,
          hintText: hints.hintText,
          drm:
            item?.drm && typeof item.drm === "object" && !Array.isArray(item.drm)
              ? {
                  scheme: String(item.drm?.scheme || "widevine").trim(),
                  licenseUrl: String(item.drm?.licenseUrl || item.drm?.license_url || "").trim(),
                  headers:
                    item.drm?.headers &&
                    typeof item.drm.headers === "object" &&
                    !Array.isArray(item.drm.headers)
                      ? item.drm.headers
                      : {},
                }
              : null,
          webIndex: Number.isFinite(Number(item?.webIndex))
            ? Number(item.webIndex)
            : index,
          headers:
            item?.headers &&
            typeof item.headers === "object" &&
            !Array.isArray(item.headers)
              ? item.headers
              : item?.requestHeaders &&
                  typeof item.requestHeaders === "object" &&
                  !Array.isArray(item.requestHeaders)
                ? item.requestHeaders
                : {},
        };
      })
    : [];

  const selectedHints =
    nativeSources.find(
      (item) => Number(item.webIndex) === Number(activeSourceIndex)
    ) ||
    nativeSources.find((item) => item.url === streamUrl) ||
    null;

  const resolvedHints = {
    videoCodec: selectedHints?.videoCodec || contextHints.videoCodec || "",
    audioCodec: selectedHints?.audioCodec || contextHints.audioCodec || "",
    container: selectedHints?.container || contextHints.container || "",
    videoProfile: selectedHints?.videoProfile || contextHints.videoProfile || "",
    width: selectedHints?.width || contextHints.width || 0,
    height: selectedHints?.height || contextHints.height || 0,
    fps: selectedHints?.fps || contextHints.fps || 0,
    bitDepth: selectedHints?.bitDepth || contextHints.bitDepth || 0,
    bitrate: selectedHints?.bitrate || contextHints.bitrate || 0,
    hdrFormat: selectedHints?.hdrFormat || contextHints.hdrFormat || "",
  };

  const advancedPlayback = readPlaybackPreferences();
  const learnedReason = learnedCompatibilityReason(resolvedHints);
  const userForcesCompatibility =
    advancedPlayback.audioOutputMode !== "auto" ||
    Number(advancedPlayback.lipSyncMs || 0) !== 0 ||
    advancedPlayback.dialogueBoost !== "off" ||
    advancedPlayback.volumeNormalization === true;
  const forceCompatibilityReason = learnedReason ||
    (userForcesCompatibility ? "advanced-audio-processing" : "");

  const payload = {
    requestId: String(requestId || `${Date.now()}`),
    url: streamUrl,
    title: String(title || ""),
    poster: String(poster || ""),
    sourceLabel: String(selectedHints?.label || ""),
    sourceName: String(selectedHints?.sourceName || ""),
    startPositionMs: Math.max(0, Number(startPositionMs || 0)),
    live: Boolean(live),
    mediaType,
    tmdbId,
    season,
    episode,
    canChooseEpisode,
    autoNext: playerContext?.autoNext !== false,
    recapStart: playerMarkerSeconds(playerContext, "recapStart"),
    recapEnd: playerMarkerSeconds(playerContext, "recapEnd"),
    introStart: playerMarkerSeconds(playerContext, "introStart"),
    introEnd: playerMarkerSeconds(playerContext, "introEnd"),
    creditsStart: playerMarkerSeconds(playerContext, "creditsStart"),
    audioOutputMode: advancedPlayback.audioOutputMode,
    lipSyncMs: advancedPlayback.lipSyncMs,
    dialogueBoost: advancedPlayback.dialogueBoost,
    volumeNormalization: advancedPlayback.volumeNormalization,
    automaticNoSoundRecovery: advancedPlayback.automaticNoSoundRecovery,
    networkAware4K: advancedPlayback.networkAware4K,
    thermalProtection: advancedPlayback.thermalProtection,
    networkDownlinkMbps: connectionDownlinkMbps(),
    connectionEffectiveType: String(navigator?.connection?.effectiveType || ""),
    forceCompatibility: Boolean(forceCompatibilityReason),
    forceCompatibilityReason,
    preferForcedSubtitles: Boolean(preferForcedSubtitles),
    headers:
      headers && typeof headers === "object" && !Array.isArray(headers)
        ? headers
        : {},
    mimeType: String(mimeType || "").trim(),
    videoCodec: resolvedHints.videoCodec,
    audioCodec: resolvedHints.audioCodec,
    container: resolvedHints.container,
    videoProfile: resolvedHints.videoProfile,
    width: resolvedHints.width,
    height: resolvedHints.height,
    fps: resolvedHints.fps,
    bitDepth: resolvedHints.bitDepth,
    bitrate: resolvedHints.bitrate,
    hdrFormat: resolvedHints.hdrFormat,
    hintText: [
      selectedHints?.hintText,
      contextHints.hintText,
      title,
      mimeType,
      streamUrl,
    ]
      .map(hintString)
      .filter(Boolean)
      .join(" • ")
      .slice(0, 10000),
    drm:
      drm && typeof drm === "object" && !Array.isArray(drm)
        ? {
            scheme: String(drm?.scheme || "widevine").trim(),
            licenseUrl: String(drm?.licenseUrl || drm?.license_url || "").trim(),
            headers:
              drm?.headers && typeof drm.headers === "object" && !Array.isArray(drm.headers)
                ? drm.headers
                : {},
          }
        : null,
    audioLanguage: String(audioLanguage || "en"),
    subtitleLanguage: String(subtitleLanguage || "en"),
    subtitlesEnabled: Boolean(subtitlesEnabled),
    subtitles: Array.isArray(subtitles)
      ? subtitles
          .map((track) => ({
            url: String(track?.url || track?.src || "").trim(),
            language: String(track?.language || track?.lang || "").trim(),
            label: String(track?.label || track?.name || "").trim(),
            mimeType: String(track?.mimeType || track?.mime_type || "").trim(),
          }))
          .filter((track) => /^https?:\/\//i.test(track.url))
          .slice(0, 20)
      : [],
    sources: nativeSources,
    activeSourceIndex: Math.max(0, Number(activeSourceIndex || 0)),
  };

  try {
    const result = native.play(JSON.stringify(payload));
    const status = String(result ?? "").trim().toLowerCase();

    return (
      result !== false &&
      status !== "" &&
      status !== "false" &&
      status !== "error" &&
      status !== "busy"
    );
  } catch {
    return false;
  }
};
