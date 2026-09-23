export const PLAYBACK_PREFERENCES_KEY = "mg:playback-preferences-v1";

export const DEFAULT_PLAYBACK_PREFERENCES = {
  autoNext: true,
  quality: "Auto",
  autoRecovery: true,
  audioOutputMode: "auto",
  lipSyncMs: 0,
  dialogueBoost: "off",
  volumeNormalization: false,
  automaticNoSoundRecovery: false,
  networkAware4K: true,
  thermalProtection: true,
};

const QUALITY_VALUES = ["Auto", "4K", "1080p", "720p", "480p"];
const AUDIO_OUTPUT_VALUES = ["auto", "stereo", "surround", "passthrough"];
const DIALOGUE_BOOST_VALUES = ["off", "low", "medium", "high"];

const clampLipSync = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-500, Math.min(500, Math.round(number / 10) * 10));
};

export const normalisePlaybackPreferences = (value) => {
  const raw = value && typeof value === "object" ? value : {};

  return {
    autoNext:
      typeof raw.autoNext === "boolean"
        ? raw.autoNext
        : DEFAULT_PLAYBACK_PREFERENCES.autoNext,
    quality: QUALITY_VALUES.includes(raw.quality)
      ? raw.quality
      : DEFAULT_PLAYBACK_PREFERENCES.quality,
    autoRecovery:
      typeof raw.autoRecovery === "boolean"
        ? raw.autoRecovery
        : DEFAULT_PLAYBACK_PREFERENCES.autoRecovery,
    audioOutputMode: AUDIO_OUTPUT_VALUES.includes(raw.audioOutputMode)
      ? raw.audioOutputMode
      : DEFAULT_PLAYBACK_PREFERENCES.audioOutputMode,
    lipSyncMs: clampLipSync(raw.lipSyncMs),
    dialogueBoost: DIALOGUE_BOOST_VALUES.includes(raw.dialogueBoost)
      ? raw.dialogueBoost
      : DEFAULT_PLAYBACK_PREFERENCES.dialogueBoost,
    volumeNormalization:
      typeof raw.volumeNormalization === "boolean"
        ? raw.volumeNormalization
        : DEFAULT_PLAYBACK_PREFERENCES.volumeNormalization,
    automaticNoSoundRecovery:
      typeof raw.automaticNoSoundRecovery === "boolean"
        ? raw.automaticNoSoundRecovery
        : DEFAULT_PLAYBACK_PREFERENCES.automaticNoSoundRecovery,
    networkAware4K:
      typeof raw.networkAware4K === "boolean"
        ? raw.networkAware4K
        : DEFAULT_PLAYBACK_PREFERENCES.networkAware4K,
    thermalProtection:
      typeof raw.thermalProtection === "boolean"
        ? raw.thermalProtection
        : DEFAULT_PLAYBACK_PREFERENCES.thermalProtection,
  };
};

const storedPreferences = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLAYBACK_PREFERENCES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const readPlaybackPreferences = () => {
  if (typeof window === "undefined") {
    return DEFAULT_PLAYBACK_PREFERENCES;
  }

  try {
    const parsed = storedPreferences();
    const legacyAutoNext = window.localStorage.getItem("mg_auto_next");

    return normalisePlaybackPreferences({
      ...parsed,
      ...(legacyAutoNext === "0"
        ? { autoNext: false }
        : legacyAutoNext === "1"
          ? { autoNext: true }
          : {}),
    });
  } catch {
    return DEFAULT_PLAYBACK_PREFERENCES;
  }
};

export const writePlaybackPreferences = (value) => {
  const next = normalisePlaybackPreferences({
    ...storedPreferences(),
    ...(value && typeof value === "object" ? value : {}),
  });

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        PLAYBACK_PREFERENCES_KEY,
        JSON.stringify(next)
      );
      window.localStorage.setItem("mg_auto_next", next.autoNext ? "1" : "0");
    } catch {
      // Device-local playback preferences are best effort.
    }

    window.dispatchEvent(
      new CustomEvent("mg:playback-preferences-changed", {
        detail: next,
      })
    );
  }

  return next;
};
