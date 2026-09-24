import { sanitizeDiagnosticText } from "./diagnostics.js";

const STORAGE_KEY = "mg:playback-audio-diagnostic:v1";
const safe = (value) => sanitizeDiagnosticText(value).slice(0, 120);
const role = (track) => {
  const label = `${track?.name || ""} ${track?.title || ""} ${track?.label || ""}`;
  if (track?.descriptive || /audio[ ._-]*description|descriptive|visually[ ._-]*impaired/i.test(label)) return "descriptive";
  if (track?.commentary || /commentary/i.test(label)) return "commentary";
  return "main or unlabelled";
};

/** @returns {Record<string, any>} */
export const sanitizeNativePlaybackDiagnostic = (raw = {}) => {
  const strings = ["engine", "event", "message", "sourceName", "label", "container",
    "mimeType", "videoCodec", "audioCodec", "selectedAudioCodec", "selectedAudioLanguage",
    "selectedAudioName", "compatibilityReason", "compatibilityError", "forceCompatibilityReason"];
  /** @type {Record<string, any>} */
  const result = Object.fromEntries(strings.map((key) => [key, safe(raw?.[key])]));
  for (const key of ["selectedAudioTrack", "compatibilityErrorCode", "height", "width", "positionMs"]) {
    const number = Number(raw?.[key]);
    if (Number.isFinite(number)) result[key] = number;
  }
  result.audioOutputConfirmed = raw?.audioOutputConfirmed === true;
  result.audioFailureEvidence = raw?.audioFailureEvidence === "decoder-error" ? "decoder-error" : "unknown";
  result.audioTracks = Array.isArray(raw?.audioTracks)
    ? raw.audioTracks.slice(0, 16).map((track, index) => ({
        index: Number.isInteger(Number(track?.index)) ? Number(track.index) : index,
        language: safe(track?.language), codec: safe(track?.codec),
        name: safe(track?.name), selected: track?.selected === true,
        commentary: track?.commentary === true,
        descriptive: track?.descriptive === true,
      }))
    : [];
  return result;
};

export const buildPlaybackAudioDiagnostic = ({ source, resolved, native = null, player = "browser" }) => {
  const info = resolved?.mediaInfo || resolved?.media_info || source?.mediaInfo || source?.media_info || {};
  const tracks = Array.isArray(native?.audioTracks) ? native.audioTracks :
    Array.isArray(info?.audio_tracks) ? info.audio_tracks : [];
  const selected = tracks.find((track) => track?.selected === true ||
    Number(track?.index) === Number(native?.selectedAudioTrack) &&
    native?.selectedAudioTrack != null);
  const fallbackReason = native?.compatibilityReason || native?.forceCompatibilityReason ||
    resolved?.audioRescue?.reason || resolved?.audio_rescue?.reason || "";

  return {
    provider: safe(source?.addon || source?.debridProvider || source?.sourceName || native?.sourceName || "unknown"),
    source: safe(source?.label || source?.name || native?.label || "unknown"),
    container: safe(native?.container || source?.container || info?.type || "unknown"),
    videoCodec: safe(selected?.videoCodec || native?.videoCodec || info?.video_tracks?.[0]?.codec || source?.videoCodec || "unknown"),
    audioCodec: safe(selected?.codec || native?.selectedAudioCodec || native?.audioCodec || info?.audio_tracks?.[0]?.codec || source?.audioCodec || "unknown"),
    tracks: tracks.slice(0, 16).map((track, index) => ({
      index: Number.isInteger(Number(track?.index)) ? Number(track.index) : index,
      language: safe(track?.language_iso || track?.language || track?.lang || "unknown"),
      codec: safe(track?.codec || track?.audioCodec || "unknown"),
      name: safe(track?.name || track?.title || track?.label || ""),
      role: role(track),
      selected: track === selected,
    })),
    selectedAudioTrack: selected ? safe(selected?.name || selected?.title || selected?.label || `Track ${selected?.index ?? 0}`) :
      safe(native?.selectedAudioName || "unknown"),
    audioLanguage: safe(selected?.language_iso || selected?.language || selected?.lang || native?.selectedAudioLanguage || "unknown"),
    audioRole: selected ? role(selected) : "unknown",
    player: safe(native?.engine || player || "browser"),
    playbackPath: native?.engine === "libvlc" ? "compatibility" : native?.engine === "media3" ? "native" : "browser",
    audioFallbackReason: safe(fallbackReason || "none"),
    audioFailureEvidence: native?.audioFailureEvidence === "decoder-error" ? "confirmed decoder error" : "unknown",
    audioOutput: native?.audioOutputConfirmed === true ? "decoded output advanced" : "unknown",
  };
};

export const writePlaybackAudioDiagnostic = (value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Playback diagnostics never interrupt playback.
  }
};

export const readPlaybackAudioDiagnostic = () => {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
};
