export const MEDIA_TRACK_PREFERENCES_KEY = "mg:media-track-preferences-v1";

export const DEFAULT_MEDIA_TRACK_PREFERENCES = {
  audioLanguage: "en",
  subtitlesEnabled: true,
  subtitleLanguage: "en",
  preferForcedSubtitles: true,
  subtitleSize: "medium",
  subtitleBackground: "medium",
};

const normaliseLanguage = (value, fallback = "en") => {
  const text = String(value || "").trim().toLowerCase();

  if (!text) return fallback;

  const aliases = {
    english: "en",
    eng: "en",
    en: "en",
    french: "fr",
    fra: "fr",
    fre: "fr",
    fr: "fr",
    spanish: "es",
    spa: "es",
    es: "es",
    german: "de",
    ger: "de",
    deu: "de",
    de: "de",
    italian: "it",
    ita: "it",
    it: "it",
  };

  return aliases[text] || text.split(/[-_]/)[0] || fallback;
};

export const normaliseTrackPreferences = (value) => {
  const raw = value && typeof value === "object" ? value : {};

  return {
    audioLanguage: normaliseLanguage(
      raw.audioLanguage,
      DEFAULT_MEDIA_TRACK_PREFERENCES.audioLanguage
    ),
    subtitlesEnabled:
      typeof raw.subtitlesEnabled === "boolean"
        ? raw.subtitlesEnabled
        : DEFAULT_MEDIA_TRACK_PREFERENCES.subtitlesEnabled,
    subtitleLanguage: normaliseLanguage(
      raw.subtitleLanguage,
      DEFAULT_MEDIA_TRACK_PREFERENCES.subtitleLanguage
    ),
    preferForcedSubtitles:
      typeof raw.preferForcedSubtitles === "boolean"
        ? raw.preferForcedSubtitles
        : DEFAULT_MEDIA_TRACK_PREFERENCES.preferForcedSubtitles,
    subtitleSize: ["small", "medium", "large", "extra-large"].includes(
      raw.subtitleSize
    )
      ? raw.subtitleSize
      : DEFAULT_MEDIA_TRACK_PREFERENCES.subtitleSize,
    subtitleBackground: ["none", "light", "medium", "dark"].includes(
      raw.subtitleBackground
    )
      ? raw.subtitleBackground
      : DEFAULT_MEDIA_TRACK_PREFERENCES.subtitleBackground,
  };
};

export const readTrackPreferences = () => {
  if (typeof window === "undefined") {
    return DEFAULT_MEDIA_TRACK_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(MEDIA_TRACK_PREFERENCES_KEY);
    return normaliseTrackPreferences(raw ? JSON.parse(raw) : {});
  } catch {
    return DEFAULT_MEDIA_TRACK_PREFERENCES;
  }
};

export const writeTrackPreferences = (value) => {
  const next = normaliseTrackPreferences(value);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        MEDIA_TRACK_PREFERENCES_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Device-local preference storage is optional.
    }

    window.dispatchEvent(
      new CustomEvent("mg:media-track-preferences-changed", {
        detail: next,
      })
    );
  }

  return next;
};

export const trackLanguage = (track) =>
  normaliseLanguage(
    track?.language ||
      track?.lang ||
      track?.srclang ||
      track?.label ||
      "",
    ""
  );

export const trackLooksForced = (track) =>
  /\bforced\b|\bforeign parts?\b/i.test(
    String(track?.label || track?.name || "")
  );

export const friendlyTrackLabel = (track, kind, index) => {
  const label = String(track?.label || track?.name || "").trim();
  const language = String(track?.language || track?.lang || "").trim();
  const base = label || language || `${kind} ${index + 1}`;
  const languageSuffix =
    language && !base.toLowerCase().includes(language.toLowerCase())
      ? ` · ${language}`
      : "";
  const forcedSuffix = trackLooksForced(track) && !/forced/i.test(base)
    ? " · Forced"
    : "";

  return `${base}${languageSuffix}${forcedSuffix}`;
};

export const subtitleCueStyle = (preferences = readTrackPreferences()) => {
  const prefs = normaliseTrackPreferences(preferences);

  const fontSize = {
    small: "0.85em",
    medium: "1em",
    large: "1.2em",
    "extra-large": "1.4em",
  }[prefs.subtitleSize];

  const background = {
    none: "transparent",
    light: "rgba(0,0,0,0.3)",
    medium: "rgba(0,0,0,0.58)",
    dark: "rgba(0,0,0,0.82)",
  }[prefs.subtitleBackground];

  return { fontSize, background };
};
