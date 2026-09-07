export const PLAYBACK_PREFERENCES_KEY = "mg:playback-preferences-v1";

export const DEFAULT_PLAYBACK_PREFERENCES = {
  autoNext: true,
  quality: "Auto",
  autoRecovery: true,
};

const QUALITY_VALUES = ["Auto", "4K", "1080p", "720p", "480p"];

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
  };
};

export const readPlaybackPreferences = () => {
  if (typeof window === "undefined") {
    return DEFAULT_PLAYBACK_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(PLAYBACK_PREFERENCES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
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
  const next = normalisePlaybackPreferences(value);

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
