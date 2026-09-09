export const LIVE_TV_SETTINGS_KEY = "mg:live-tv-settings-v1";

export const DEFAULT_LIVE_TV_SETTINGS = {
  regionalLock: false,
};

export const normaliseLiveTvSettings = (value) => {
  const raw = value && typeof value === "object" ? value : {};

  return {
    regionalLock:
      typeof raw.regionalLock === "boolean"
        ? raw.regionalLock
        : DEFAULT_LIVE_TV_SETTINGS.regionalLock,
  };
};

export const readLiveTvSettings = () => {
  if (typeof window === "undefined") {
    return DEFAULT_LIVE_TV_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(LIVE_TV_SETTINGS_KEY);

    if (!raw) {
      return DEFAULT_LIVE_TV_SETTINGS;
    }

    return normaliseLiveTvSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_LIVE_TV_SETTINGS;
  }
};

export const writeLiveTvSettings = (settings) => {
  const next = normaliseLiveTvSettings(settings);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        LIVE_TV_SETTINGS_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Device-local Live TV preferences are best effort.
    }

    window.dispatchEvent(
      new CustomEvent("mg:live-tv-settings-changed", {
        detail: next,
      })
    );
  }

  return next;
};
