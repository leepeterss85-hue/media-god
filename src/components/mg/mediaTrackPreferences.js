export const MEDIA_TRACK_PREFERENCES_KEY = "mg:media-track-preferences-v1";
export const MEDIA_TITLE_AUDIO_PREFERENCES_KEY = "mg:title-audio-preferences-v1";

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

const audioCodecKey = (track) => {
  const text = [
    track?.audioCodec,
    track?.codec,
    track?.label,
    track?.name,
    track?.attrs?.CODECS,
    track?.attrs?.NAME,
  ]
    .filter(Boolean)
    .join(" ");

  if (/\b(?:truehd|mlp)\b/i.test(text)) return "truehd";
  if (/\b(?:dts(?:-?hd)?|dts:x|dca)\b/i.test(text)) return "dts";
  if (/\b(?:e-?ac-?3|eac3|ec-?3|ddp|dd\+)\b/i.test(text)) return "eac3";
  if (/\b(?:ac-?3|ac3|dolby digital)\b/i.test(text)) return "ac3";
  if (/\b(?:aac|he-?aac|mp4a)\b/i.test(text)) return "aac";
  if (/\bopus\b/i.test(text)) return "opus";
  if (/\bflac\b/i.test(text)) return "flac";
  if (/\b(?:mp3|mpeg audio)\b/i.test(text)) return "mp3";
  return "";
};

const audioChannelKey = (track) => {
  const direct =
    track?.channels ||
    track?.channelCount ||
    track?.attrs?.CHANNELS ||
    track?.attrs?.CHANNEL_COUNT ||
    "";
  const text = `${direct} ${track?.label || ""} ${track?.name || ""}`;
  const match = text.match(/(?:^|[^0-9])(7\.1|5\.1|2\.1|2\.0|1\.0|8|6|2)(?:[^0-9]|$)/i);
  if (!match) return "";
  const value = String(match[1]);
  if (value === "8") return "7.1";
  if (value === "6") return "5.1";
  if (value === "2") return "2.0";
  return value;
};

const audioPreferenceContextKey = (context = {}) => {
  const mediaType = String(context?.mediaType || context?.type || "").toLowerCase();
  const tmdbId = String(context?.tmdbId || context?.tmdb_id || "").trim();
  const title = String(context?.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 140);

  if (mediaType === "tv" || context?.season != null || context?.episode != null) {
    return tmdbId ? `tv:${tmdbId}` : title ? `tv-title:${title}` : "";
  }

  return tmdbId ? `movie:${tmdbId}` : title ? `movie-title:${title}` : "";
};

const readTitleAudioStore = () => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(MEDIA_TITLE_AUDIO_PREFERENCES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeTitleAudioStore = (store) => {
  if (typeof window === "undefined") return;

  try {
    const entries = Object.entries(store || {})
      .sort((a, b) => Number(b?.[1]?.updatedAt || 0) - Number(a?.[1]?.updatedAt || 0))
      .slice(0, 250);
    window.localStorage.setItem(
      MEDIA_TITLE_AUDIO_PREFERENCES_KEY,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch {
    // Per-title audio memory is best effort only.
  }
};

export const audioProfileFromTrack = (track) => ({
  language: trackLanguage(track),
  codec: audioCodecKey(track),
  channels: audioChannelKey(track),
  commentary: /\bcommentary\b/i.test(String(track?.label || track?.name || "")),
  descriptive: /\b(?:audio description|descriptive|visually impaired)\b/i.test(
    String(track?.label || track?.name || "")
  ),
});

export const rememberAudioPreference = (context, track) => {
  const key = audioPreferenceContextKey(context);
  if (!key || !track) return null;

  const profile = {
    ...audioProfileFromTrack(track),
    updatedAt: Date.now(),
  };
  const store = readTitleAudioStore();
  store[key] = profile;
  writeTitleAudioStore(store);
  return profile;
};

export const readRememberedAudioPreference = (context) => {
  const key = audioPreferenceContextKey(context);
  if (!key) return null;
  const profile = readTitleAudioStore()?.[key];
  return profile && typeof profile === "object" ? profile : null;
};

export const rememberedAudioTrackScore = (track, profile) => {
  if (!track || !profile) return 0;

  const candidate = audioProfileFromTrack(track);
  let score = 0;

  if (profile.language && candidate.language === profile.language) score += 12000;
  if (profile.codec && candidate.codec === profile.codec) score += 6500;
  if (profile.channels && candidate.channels === profile.channels) score += 1800;
  if (profile.commentary === false && candidate.commentary) score -= 7000;
  if (profile.descriptive === false && candidate.descriptive) score -= 7000;

  return score;
};

const languageDisplayName = (value) => {
  const language = normaliseLanguage(value, "");
  if (!language) return "";

  const names = {
    en: "English",
    fr: "French",
    es: "Spanish",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
    pl: "Polish",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    hi: "Hindi",
  };

  return names[language] || String(value || language).trim();
};

const audioCodecLabel = (track) => {
  const text = [
    track?.audioCodec,
    track?.codec,
    track?.label,
    track?.name,
    track?.attrs?.CODECS,
    track?.attrs?.NAME,
  ]
    .filter(Boolean)
    .join(" ");

  if (/\b(?:truehd|mlp)\b/i.test(text)) return "TrueHD";
  if (/\b(?:dts(?:-?hd)?|dts:x|dca)\b/i.test(text)) return "DTS";
  if (/\b(?:e-?ac-?3|eac3|ec-?3|ddp|dd\+)\b/i.test(text)) return "EAC3";
  if (/\b(?:ac-?3|ac3|dolby digital)\b/i.test(text)) return "AC3";
  if (/\b(?:aac|he-?aac|mp4a)\b/i.test(text)) return "AAC";
  if (/\bopus\b/i.test(text)) return "Opus";
  if (/\bflac\b/i.test(text)) return "FLAC";
  if (/\b(?:mp3|mpeg audio)\b/i.test(text)) return "MP3";
  return "";
};

const audioChannelLabel = (track) => {
  const direct =
    track?.channels ||
    track?.channelCount ||
    track?.attrs?.CHANNELS ||
    track?.attrs?.CHANNEL_COUNT ||
    "";

  const text = `${direct} ${track?.label || ""} ${track?.name || ""}`;
  const match = text.match(/(?:^|[^0-9])(7\.1|5\.1|2\.1|2\.0|1\.0|8|6|2)(?:[^0-9]|$)/i);
  if (!match) return "";

  const value = String(match[1]);
  if (value === "8") return "7.1";
  if (value === "6") return "5.1";
  if (value === "2") return "2.0";
  return value;
};

export const friendlyTrackLabel = (track, kind, index) => {
  const rawLabel = String(track?.label || track?.name || "").trim();
  const language = String(track?.language || track?.lang || track?.attrs?.LANGUAGE || "").trim();

  if (kind !== "Audio") {
    const base = rawLabel || languageDisplayName(language) || `${kind} ${index + 1}`;
    const languageName = languageDisplayName(language);
    const languageSuffix =
      languageName && !base.toLowerCase().includes(languageName.toLowerCase())
        ? ` · ${languageName}`
        : "";
    const forcedSuffix = trackLooksForced(track) && !/forced/i.test(base)
      ? " · Forced"
      : "";

    return `${base}${languageSuffix}${forcedSuffix}`;
  }

  const languageName = languageDisplayName(language);
  const codec = audioCodecLabel(track);
  const channels = audioChannelLabel(track);
  const commentary = /\bcommentary\b/i.test(rawLabel) ? "Commentary" : "";
  const descriptive = /\b(?:audio description|descriptive|visually impaired)\b/i.test(rawLabel)
    ? "Audio description"
    : "";

  const parts = [
    languageName,
    codec,
    channels,
    commentary,
    descriptive,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.filter((part, partIndex, list) => list.indexOf(part) === partIndex).join(" · ");
  }

  return rawLabel || language || `${kind} ${index + 1}`;
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
