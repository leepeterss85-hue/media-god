const SMART_SOURCE_HISTORY_KEY = "mg:smart-source-history-v1";
const SMART_SOURCE_HISTORY_LIMIT = 250;
const SMART_SOURCE_HISTORY_TTL_MS = 120 * 24 * 60 * 60 * 1000;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const sourceText = (item) =>
  [
    item?.label,
    item?.name,
    item?.title,
    item?.description,
    item?.filename,
    item?.path,
    item?.behaviorHints?.filename,
    item?.behavior_hints?.filename,
    item?.quality,
    item?.release,
    item?.videoCodec,
    item?.video_codec,
    item?.audioCodec,
    item?.audio_codec,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

const normaliseLanguageToken = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/_/g, "-");

const englishToken = (value) => {
  const token = normaliseLanguageToken(value);
  return (
    /^(?:en|eng|english)(?:-|$)/i.test(token) ||
    /\b(?:english|eng)\b/i.test(token)
  );
};

const knownLanguageToken = (value) =>
  /^(?:[a-z]{2,3})(?:-|$)/i.test(normaliseLanguageToken(value)) ||
  /\b(?:english|french|spanish|german|italian|russian|ukrainian|hindi|tamil|telugu|polish|turkish|arabic|japanese|korean|chinese|mandarin|cantonese|portuguese|dutch|swedish|norwegian|danish|finnish|czech|slovak|hungarian|romanian|bulgarian|greek|hebrew|indonesian|thai|vietnamese)\b/i.test(
    normaliseLanguageToken(value)
  );

const mediaInfoFor = (item) => {
  const candidates = [
    item?.mediaInfo,
    item?.media_info,
    item?.probe,
    item?.mediaProbe,
    item?.media_probe,
  ];

  return candidates.find(
    (value) => value && typeof value === "object" && !Array.isArray(value)
  ) || null;
};

const trackLanguageText = (track) =>
  clean(
    track?.language_iso ||
      track?.lang_iso ||
      track?.language ||
      track?.lang ||
      track?.languageCode ||
      track?.language_code ||
      track?.tags?.language ||
      track?.tags?.LANGUAGE ||
      track?.title ||
      track?.name ||
      ""
  );

const audioTracksFor = (item) => {
  const mediaInfo = mediaInfoFor(item);
  if (!mediaInfo) return [];

  const direct = [
    mediaInfo?.audioTracks,
    mediaInfo?.audio_tracks,
    mediaInfo?.audios,
    mediaInfo?.audio,
  ].find(Array.isArray);

  if (Array.isArray(direct)) {
    return direct.filter(Boolean);
  }

  const streams = Array.isArray(mediaInfo?.streams)
    ? mediaInfo.streams
    : Array.isArray(mediaInfo?.tracks)
      ? mediaInfo.tracks
      : [];

  return streams.filter((track) =>
    /^(?:audio|a)$/i.test(
      clean(
        track?.codec_type ||
          track?.type ||
          track?.kind ||
          track?.stream_type ||
          ""
      )
    )
  );
};

const ENGLISH_MARKER_RE =
  /(?:^|[\s._\-\[\](){}|+,])(?:eng|en|english)(?=$|[\s._\-\[\](){}|+,])|(?:⛿\s*)?(?:ᴇɴ|ᴇɴɢ|ᴇɴɢʟɪꜱʜ)(?=$|[\s._\-\[\](){}|+,])/i;

const MULTI_MARKER_RE =
  /\b(?:multi(?:[ ._-]?audio)?|dual(?:[ ._-]?audio)?|multi(?:[ ._-]?lang(?:uage)?)?)\b|(?:⛿\s*)?ᴍᴜʟᴛɪ/i;

const FOREIGN_MARKER_RE =
  /(?:^|[\s._\-\[\](){}|+,])(?:rus|russian|ukr|ukrainian|hin|hindi|tam|tamil|tel|telugu|spa|spanish|es|fre|fra|french|fr|ger|deu|german|de|ita|italian|it|por|portuguese|pt|pol|polish|pl|tur|turkish|tr|ara|arabic|ar|jpn|japanese|ja|kor|korean|ko|chi|zho|chinese|mandarin|cantonese|zh|dut|nld|dutch|nl|swe|swedish|sv|nor|norwegian|no|dan|danish|da|fin|finnish|fi|cze|ces|czech|cs|slo|slk|slovak|sk|hun|hungarian|hu|rum|ron|romanian|ro|bul|bulgarian|bg|gre|ell|greek|el|heb|hebrew|he|ind|indonesian|id|tha|thai|th|vie|vietnamese|vi)(?=$|[\s._\-\[\](){}|+,])/i;

const audioCodecText = (item) => {
  const mediaInfo = mediaInfoFor(item);
  const tracks = audioTracksFor(item);

  return [
    item?.audioCodec,
    item?.audio_codec,
    item?.codec,
    ...tracks.flatMap((track) => [
      track?.codec,
      track?.codecName,
      track?.codec_name,
      track?.format,
      track?.profile,
      track?.title,
      track?.name,
    ]),
    mediaInfo?.audioCodec,
    mediaInfo?.audio_codec,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");
};

export const smartSourceEvidence = (item, languageHint = "unknown") => {
  const text = sourceText(item);
  const tracks = audioTracksFor(item);
  // An English commentary or descriptive track is not an English main track.
  const mainTracks = tracks.filter((track) =>
    !/commentary|audio[ ._-]*description|descriptive|visually[ ._-]*impaired/i.test(
      [track?.title, track?.name, track?.label, track?.description]
        .filter(Boolean).join(" ")
    ) && track?.commentary !== true && track?.descriptive !== true
  );
  const trackLanguages = mainTracks.map(trackLanguageText).filter(Boolean);
  const hasVerifiedEnglishTrack = trackLanguages.some(englishToken);
  const knownTrackLanguages = trackLanguages.filter(knownLanguageToken);
  const hasKnownAudioLanguages = knownTrackLanguages.length > 0;
  const allKnownTracksForeign =
    hasKnownAudioLanguages &&
    knownTrackLanguages.every((value) => !englishToken(value));

  let languageRank = 3;
  let languageLabel = "Unknown";
  let languageVerified = false;

  if (
    item?.englishMainAudio === true ||
    item?.english_audio === true ||
    item?.englishAudio === true ||
    item?.runtimeEnglishAudioVerified === true ||
    hasVerifiedEnglishTrack
  ) {
    languageRank = 0;
    languageLabel = "English verified";
    languageVerified = true;
  } else if (allKnownTracksForeign) {
    /*
     * Real audio-track metadata outranks release-name guesses. A filename that
     * says ENG/MULTI must never stay eligible for automatic playback after the
     * inspected file proves that every known audio track is non-English.
     */
    languageRank = 4;
    languageLabel = "Foreign";
    languageVerified = true;
  } else if (ENGLISH_MARKER_RE.test(text) || languageHint === "english") {
    languageRank = 1;
    languageLabel = "English tagged";
  } else if (MULTI_MARKER_RE.test(text) || languageHint === "multi") {
    languageRank = 2;
    languageLabel = "Multi";
  } else if (
    (
      FOREIGN_MARKER_RE.test(text) &&
      !ENGLISH_MARKER_RE.test(text) &&
      !MULTI_MARKER_RE.test(text)
    ) ||
    languageHint === "foreign"
  ) {
    languageRank = 4;
    languageLabel = "Foreign";
  }

  const release = sourceReleaseTier(item);
  const audio = sourceAudioTier(item);

  return {
    languageRank,
    languageLabel,
    languageVerified,
    releaseTierRank: release.rank,
    releaseTierLabel: release.label,
    audioTierRank: audio.rank,
    audioTierLabel: audio.label,
  };
};

export const sourceReleaseTier = (item) => {
  const text = sourceText(item);

  if (/\b(?:camrip|cam|hdcam|telesync|telecine|hdts)\b/i.test(text)) {
    return { rank: 9, label: "CAM/TS" };
  }
  if (/\b(?:remux)\b/i.test(text)) {
    return { rank: 0, label: "Remux" };
  }
  if (/\b(?:blu[ ._-]?ray|bluray|uhd[ ._-]?blu[ ._-]?ray)\b/i.test(text)) {
    return { rank: 1, label: "Blu-ray" };
  }
  if (/\b(?:bd(?:rip)?|bdrip|brrip)\b/i.test(text)) {
    return { rank: 2, label: "Blu-ray rip" };
  }
  if (/\b(?:web[ ._-]?dl|webdl)\b/i.test(text)) {
    return { rank: 3, label: "WEB-DL" };
  }
  if (/\b(?:web[ ._-]?rip|webrip)\b/i.test(text)) {
    return { rank: 4, label: "WEBRip" };
  }
  if (/\b(?:hdtv|pdtv|dsr)\b/i.test(text)) {
    return { rank: 5, label: "HDTV" };
  }
  if (/\b(?:dvd(?:rip)?|dvdrip|dvd5|dvd9)\b/i.test(text)) {
    return { rank: 7, label: "DVD" };
  }
  if (/\b(?:vhs|sdtv)\b/i.test(text)) {
    return { rank: 8, label: "Legacy" };
  }

  return { rank: 6, label: "Unknown" };
};

export const sourceAudioTier = (item) => {
  const text = audioCodecText(item);

  if (/\b(?:truehd|mlp|dts[ ._-]?hd[ ._-]?ma|dts[ ._-]?ma|flac|pcm|lpcm)\b/i.test(text)) {
    return { rank: 0, label: "Lossless" };
  }
  if (/\b(?:atmos|eac3|e-ac-3|ddp|dd\+|dolby[ ._-]?digital[ ._-]?plus)\b/i.test(text)) {
    return { rank: 1, label: "Modern multichannel" };
  }
  if (/\b(?:dts|ac3|dd5[ ._-]?1|dolby[ ._-]?digital)\b/i.test(text)) {
    return { rank: 2, label: "Multichannel" };
  }
  if (/\b(?:aac|opus|vorbis)\b/i.test(text)) {
    return { rank: 3, label: "Modern compressed" };
  }
  if (/\b(?:mp3|mp2|wma)\b/i.test(text)) {
    return { rank: 5, label: "Legacy compressed" };
  }

  return { rank: 4, label: "Unknown" };
};

export const smartSourceFingerprint = (item, fallbackIndex = -1) => {
  if (!item) return "";

  const hash = clean(
    item?.infoHash ||
      item?.info_hash ||
      item?.torrentHash ||
      item?.torrent_hash ||
      ""
  )
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");

  if (/^[a-f0-9]{40,64}$/i.test(hash)) {
    return [
      "torrent",
      hash,
      clean(item?.fileIdx ?? item?.file_idx ?? ""),
      clean(item?.debridProvider || item?.sourceName || item?.addon || ""),
    ].join(":");
  }

  const magnet = clean(item?.richMagnet || item?.magnet || item?.magnetLink || "");
  const magnetHash = clean(
    magnet.match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i)?.[1] || ""
  ).toLowerCase();

  if (magnetHash) {
    return ["torrent", magnetHash, clean(item?.fileIdx ?? item?.file_idx ?? "")].join(":");
  }

  const filename = clean(
    item?.behaviorHints?.filename ||
      item?.behavior_hints?.filename ||
      item?.filename ||
      item?.path ||
      ""
  );

  if (filename) {
    return `file:${filename.toLowerCase()}`;
  }

  const url = clean(item?.src || item?.url || "");
  if (url) {
    try {
      const parsed = new URL(url);
      return `url:${parsed.origin}${parsed.pathname}`;
    } catch {
      return `url:${url.split("?")[0].toLowerCase()}`;
    }
  }

  return [
    "label",
    clean(item?.type || ""),
    clean(item?.label || item?.name || item?.title || ""),
    String(fallbackIndex),
  ].join(":");
};

const sourceResolution = (entry) => {
  const explicit = Number(
    entry?.resolution ||
      entry?.item?.resolution ||
      entry?.item?.height ||
      0
  );

  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const match = sourceText(entry?.item).match(/\b(4320|2160|1440|1080|720|576|480|360)p\b/i);
  if (match) return Number(match[1]);
  if (/\b(?:8k)\b/i.test(sourceText(entry?.item))) return 4320;
  if (/\b(?:4k|uhd)\b/i.test(sourceText(entry?.item))) return 2160;
  return 0;
};

export const smartEntryUpgradeScore = (entry) => {
  if (!entry?.item) return Number.NEGATIVE_INFINITY;

  const languageRank = Number(entry?.languageRank ?? entry?.englishEvidenceRank ?? 3);
  if (languageRank >= 4) return Number.NEGATIVE_INFINITY;

  const releaseTierRank = Number(entry?.releaseTierRank ?? 6);
  const audioTierRank = Number(entry?.audioTierRank ?? 4);
  const resolution = sourceResolution(entry);
  const compatibilityTier = Number(entry?.compatibilityTier ?? 3);

  return (
    Math.max(0, 4 - languageRank) * 1_000_000 +
    Math.max(0, 10 - releaseTierRank) * 60_000 +
    Math.max(0, 7 - audioTierRank) * 18_000 +
    Math.min(4320, Math.max(0, resolution)) * 25 +
    Math.max(0, 4 - compatibilityTier) * 250_000 +
    Number(Boolean(entry?.provenWorking)) * 30_000 +
    Number(Boolean(entry?.cached)) * 12_000
  );
};

export const bestSmartUpgradeEntry = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .filter(
      (entry) =>
        entry?.item &&
        Number(entry?.languageRank ?? entry?.englishEvidenceRank ?? 3) <= 2
    )
    .slice()
    .sort(
      (left, right) =>
        smartEntryUpgradeScore(right) - smartEntryUpgradeScore(left) ||
        Number(left?.index || 0) - Number(right?.index || 0)
    )[0] || null;

const smartMediaKey = (context = {}) => {
  const mediaType =
    String(context?.mediaType || "").toLowerCase() === "tv" ||
    context?.season != null ||
    context?.episode != null
      ? "tv"
      : "movie";

  const identity = clean(
    context?.imdbId ||
      context?.imdb_id ||
      context?.tmdbId ||
      context?.tmdb_id ||
      context?.id ||
      [context?.title, context?.year].filter(Boolean).join(":")
  ).toLowerCase();

  if (!identity) return "";

  return [
    mediaType,
    identity,
    mediaType === "tv" ? `s${Number(context?.season || 0)}` : "",
    mediaType === "tv" ? `e${Number(context?.episode || 0)}` : "",
  ]
    .filter(Boolean)
    .join(":");
};

const readHistory = () => {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SMART_SOURCE_HISTORY_KEY) || "{}"
    );
    if (!parsed || typeof parsed !== "object") return {};

    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          now - Number(value?.checkedAt || 0) <= SMART_SOURCE_HISTORY_TTL_MS
      )
    );
  } catch {
    return {};
  }
};

const writeHistory = (history) => {
  if (typeof window === "undefined") return;

  try {
    const trimmed = Object.fromEntries(
      Object.entries(history || {})
        .filter(([, value]) => value && typeof value === "object")
        .sort(
          (left, right) =>
            Number(right?.[1]?.checkedAt || 0) -
            Number(left?.[1]?.checkedAt || 0)
        )
        .slice(0, SMART_SOURCE_HISTORY_LIMIT)
    );

    window.localStorage.setItem(
      SMART_SOURCE_HISTORY_KEY,
      JSON.stringify(trimmed)
    );
  } catch {
    // Device-local upgrade history is an optimisation only.
  }
};

export const buildSmartSourceSnapshot = (context, entry) => {
  if (!entry?.item) return null;

  const mediaKey = smartMediaKey(context);
  if (!mediaKey) return null;

  return {
    mediaKey,
    fingerprint: smartSourceFingerprint(entry.item, entry.index),
    checkedAt: Date.now(),
    qualityScore: smartEntryUpgradeScore(entry),
    languageRank: Number(entry?.languageRank ?? entry?.englishEvidenceRank ?? 3),
    releaseTierRank: Number(entry?.releaseTierRank ?? 6),
    releaseTierLabel: clean(entry?.releaseTierLabel || "Unknown"),
    audioTierRank: Number(entry?.audioTierRank ?? 4),
    compatibilityTier: Number(entry?.compatibilityTier ?? 2),
    audioTierLabel: clean(entry?.audioTierLabel || "Unknown"),
    resolution: sourceResolution(entry),
  };
};

export const detectSmartSourceUpgrade = (context, entry) => {
  const next = buildSmartSourceSnapshot(context, entry);
  if (!next) return { available: false };

  const previous = readHistory()[next.mediaKey];
  if (!previous || !previous.fingerprint) {
    return { available: false, previous: previous || null, next };
  }

  if (previous.fingerprint === next.fingerprint) {
    return { available: false, previous, next };
  }

  const scoreImprovement =
    Number(next.qualityScore || 0) - Number(previous.qualityScore || 0);

  const materiallyBetter =
    next.languageRank <= 2 &&
    next.compatibilityTier <= Number(previous.compatibilityTier ?? 2) &&
    (
      next.releaseTierRank < Number(previous.releaseTierRank ?? 99) ||
      next.audioTierRank < Number(previous.audioTierRank ?? 99) ||
      next.resolution > Number(previous.resolution || 0)
    ) &&
    scoreImprovement >= 12_000;

  return {
    available: materiallyBetter,
    previous,
    next,
    scoreImprovement,
  };
};

export const recordSmartSourceBaseline = (context, entry) => {
  const next = buildSmartSourceSnapshot(context, entry);
  if (!next) return null;

  const history = readHistory();
  const previous = history[next.mediaKey];

  if (
    previous &&
    Number(previous?.qualityScore || 0) > Number(next.qualityScore || 0)
  ) {
    history[next.mediaKey] = {
      ...previous,
      checkedAt: Date.now(),
    };
    writeHistory(history);
    return history[next.mediaKey];
  }

  history[next.mediaKey] = next;
  writeHistory(history);
  return next;
};

export const clearSmartSourceHistoryForTests = () => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(SMART_SOURCE_HISTORY_KEY);
  } catch {
    // Test helper only.
  }
};
