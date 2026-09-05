const VIDEO_PROBE =
  typeof document !== "undefined"
    ? document.createElement("video")
    : null;

const AUDIO_PROBE =
  typeof document !== "undefined"
    ? document.createElement("audio")
    : null;

const canPlay = (probe, mime) => {
  if (!probe?.canPlayType) return false;

  try {
    return Boolean(probe.canPlayType(mime));
  } catch {
    return false;
  }
};

export const browserCodecSupport = {
  h264Aac:
    canPlay(
      VIDEO_PROBE,
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
    ) ||
    canPlay(
      VIDEO_PROBE,
      'video/mp4; codecs="avc1.4D401F, mp4a.40.2"'
    ),

  hevcAac:
    canPlay(
      VIDEO_PROBE,
      'video/mp4; codecs="hvc1.1.6.L93.B0, mp4a.40.2"'
    ) ||
    canPlay(
      VIDEO_PROBE,
      'video/mp4; codecs="hev1.1.6.L93.B0, mp4a.40.2"'
    ),

  av1Aac: canPlay(
    VIDEO_PROBE,
    'video/mp4; codecs="av01.0.05M.08, mp4a.40.2"'
  ),

  vp9Opus:
    canPlay(
      VIDEO_PROBE,
      'video/webm; codecs="vp9, opus"'
    ) ||
    canPlay(
      VIDEO_PROBE,
      'video/webm; codecs="vp09.00.10.08, opus"'
    ),

  aac:
    canPlay(AUDIO_PROBE, 'audio/mp4; codecs="mp4a.40.2"') ||
    canPlay(AUDIO_PROBE, "audio/aac"),

  mp3: canPlay(AUDIO_PROBE, "audio/mpeg"),

  opus:
    canPlay(AUDIO_PROBE, 'audio/webm; codecs="opus"') ||
    canPlay(AUDIO_PROBE, 'audio/ogg; codecs="opus"'),

  flac:
    canPlay(AUDIO_PROBE, "audio/flac") ||
    canPlay(AUDIO_PROBE, 'audio/mp4; codecs="fLaC"'),

  ac3:
    canPlay(AUDIO_PROBE, 'audio/mp4; codecs="ac-3"') ||
    canPlay(VIDEO_PROBE, 'video/mp4; codecs="avc1.4D401F, ac-3"'),

  eac3:
    canPlay(AUDIO_PROBE, 'audio/mp4; codecs="ec-3"') ||
    canPlay(VIDEO_PROBE, 'video/mp4; codecs="avc1.4D401F, ec-3"'),
};

export const getSourceUrl = (item) =>
  item?.src ||
  item?.url ||
  item?.magnet ||
  item?.magnetLink ||
  "";

export const sourceText = (item, extraText = "") =>
  [
    item?.label,
    item?.name,
    item?.title,
    item?.filename,
    item?.file,
    item?.path,
    item?.description,
    item?.behaviorHints?.filename,
    item?.behaviorHints?.videoHash,
    extraText,
    getSourceUrl(item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const has = (text, regex) => regex.test(text);

const ENGLISH_LANGUAGE_RE =
  /(?:^|[\s._\-\[\](){}|+,])(?:eng|en|english)(?=$|[\s._\-\[\](){}|+,])/i;

const MULTI_LANGUAGE_RE =
  /\b(?:multi(?:[ ._-]?audio)?|dual(?:[ ._-]?audio)?|multi(?:[ ._-]?lang(?:uage)?)?)\b/i;

const FOREIGN_LANGUAGE_RE =
  /(?:^|[\s._\-\[\](){}|+,])(?:rus|russian|ukr|ukrainian|hin|hindi|tam|tamil|tel|telugu|spa|spanish|es|fre|fra|french|fr|ger|deu|german|de|ita|italian|it|por|portuguese|pt|pol|polish|pl|tur|turkish|tr|ara|arabic|ar|jpn|japanese|ja|kor|korean|ko|chi|zho|chinese|mandarin|cantonese|zh|dut|nld|dutch|nl|swe|swedish|sv|nor|norwegian|no|dan|danish|da|fin|finnish|fi|cze|ces|czech|cs|slo|slk|slovak|sk|hun|hungarian|hu|rum|ron|romanian|ro|bul|bulgarian|bg|gre|ell|greek|el|heb|hebrew|he|ind|indonesian|id|tha|thai|th|vie|vietnamese|vi)(?=$|[\s._\-\[\](){}|+,])/i;

export const detectLanguagePreference = (item, extraText = "") => {
  const text = sourceText(item, extraText);
  const english = ENGLISH_LANGUAGE_RE.test(text);
  const multi = MULTI_LANGUAGE_RE.test(text);
  const foreign = FOREIGN_LANGUAGE_RE.test(text);

  if (english) return "english";
  if (multi) return "multi";
  if (foreign) return "foreign";
  return "unknown";
};

export const detectStreamTraits = (item, extraText = "") => {
  const text = sourceText(item, extraText);
  const url = String(getSourceUrl(item) || "").toLowerCase();

  const traits = {
    text,
    container: "",
    video: "",
    audio: "",
    resolution: 0,
    hdr: false,
    dolbyVision: false,
    atmos: false,
    audioRisk: false,
    language: "unknown",
  };

  traits.language = detectLanguagePreference(item, extraText);

  if (has(url + " " + text, /\.m3u8(?:[?#\s]|$)|\bhls\b/i)) {
    traits.container = "hls";
  } else if (has(url + " " + text, /\.m2ts(?:[?#\s]|$)|\bm2ts\b/i)) {
    traits.container = "m2ts";
  } else if (has(url + " " + text, /\.mts(?:[?#\s]|$)|\bmts\b/i)) {
    traits.container = "mts";
  } else if (
    has(
      url + " " + text,
      /\.ts(?:[?#\s]|$)|\bmpeg[ -]?ts\b|\btransport stream\b/i
    )
  ) {
    traits.container = "ts";
  } else if (has(url + " " + text, /\.flv(?:[?#\s]|$)|\bflv\b/i)) {
    traits.container = "flv";
  } else if (has(url + " " + text, /\.mp4(?:[?#\s]|$)|\bmp4\b/i)) {
    traits.container = "mp4";
  } else if (has(url + " " + text, /\.m4v(?:[?#\s]|$)|\bm4v\b/i)) {
    traits.container = "m4v";
  } else if (has(url + " " + text, /\.webm(?:[?#\s]|$)|\bwebm\b/i)) {
    traits.container = "webm";
  } else if (
    has(
      url + " " + text,
      /\.mkv(?:[?#\s]|$)|\bmkv\b|\bmatroska\b/i
    )
  ) {
    traits.container = "mkv";
  } else if (has(url + " " + text, /\.avi(?:[?#\s]|$)|\bavi\b/i)) {
    traits.container = "avi";
  } else if (has(url + " " + text, /\.mov(?:[?#\s]|$)|\bmov\b/i)) {
    traits.container = "mov";
  }

  if (has(text, /\b(?:h\.?264|avc1?|x264)\b/i)) {
    traits.video = "h264";
  } else if (has(text, /\b(?:h\.?265|hevc|hev1|hvc1|x265)\b/i)) {
    traits.video = "hevc";
  } else if (has(text, /\b(?:av1|av01)\b/i)) {
    traits.video = "av1";
  } else if (has(text, /\b(?:vp9|vp09)\b/i)) {
    traits.video = "vp9";
  } else if (has(text, /\bmpeg[ -]?2\b/i)) {
    traits.video = "mpeg2";
  }

  if (has(text, /\b(?:truehd|true-hd|mlp)\b/i)) {
    traits.audio = "truehd";
    traits.audioRisk = true;
  } else if (
    has(
      text,
      /\b(?:dts[ -]?hd|dts[- .]?ma|dts[- .]?x|dts)\b/i
    )
  ) {
    traits.audio = "dts";
    traits.audioRisk = true;
  } else if (
    has(
      text,
      /\b(?:e-?ac-?3(?:[ .-]?\d(?:\.\d)?)?|eac3(?:[ .-]?\d(?:\.\d)?)?|ddp(?:[ .-]?\d(?:\.\d)?)?|dd\+|dolby digital plus)\b/i
    )
  ) {
    traits.audio = "eac3";
  } else if (
    has(
      text,
      /\b(?:ac-?3(?:[ .-]?\d(?:\.\d)?)?|ac3(?:[ .-]?\d(?:\.\d)?)?|dolby digital|dd(?:[ .-]?\d(?:\.\d)?)?)\b/i
    )
  ) {
    traits.audio = "ac3";
  } else if (has(text, /\b(?:aac|mp4a)\b/i)) {
    traits.audio = "aac";
  } else if (has(text, /\bopus\b/i)) {
    traits.audio = "opus";
  } else if (has(text, /\bflac\b/i)) {
    traits.audio = "flac";
  } else if (has(text, /\bmp3\b|\bmpeg audio\b/i)) {
    traits.audio = "mp3";
  }

  traits.atmos = has(text, /\batmos\b/i);
  traits.dolbyVision = has(text, /\b(?:dolby vision|dovi|dv)\b/i);
  traits.hdr = traits.dolbyVision || has(text, /\b(?:hdr10\+?|hdr)\b/i);

  const resolutionMatch = text.match(/\b(2160|1440|1080|720|576|480)p\b/i);

  if (resolutionMatch) {
    traits.resolution = Number(resolutionMatch[1]);
  } else if (has(text, /\b4k\b/i)) {
    traits.resolution = 2160;
  }

  return traits;
};

const audioSupport = (audio) => {
  if (!audio) return null;
  if (audio === "aac") return browserCodecSupport.aac;
  if (audio === "mp3") return browserCodecSupport.mp3;
  if (audio === "opus") return browserCodecSupport.opus;
  if (audio === "flac") return browserCodecSupport.flac;
  if (audio === "ac3") return browserCodecSupport.ac3;
  if (audio === "eac3") return browserCodecSupport.eac3;
  if (audio === "dts" || audio === "truehd") return false;

  return null;
};

export const scoreSourceCompatibility = (item, extraText = "") => {
  const traits = detectStreamTraits(item, extraText);
  const type = String(item?.type || "").toLowerCase();

  let score = 0;

  if (item?.viaRealDebrid) {
    score += 1600;
  }

  if (type === "provider" || type === "youtube") {
    score -= 30000;
  }

  /*
   * English is the default Media God audio language.
   *
   * Prefer sources explicitly marked:
   * ENG
   * EN
   * English
   *
   * Multi/dual-audio sources come next because they commonly include
   * an English audio track.
   *
   * Explicit foreign-only sources are pushed down but are not removed.
   */
  if (traits.language === "english") {
    score += 12000;
  } else if (traits.language === "multi") {
    score += 5500;
  } else if (traits.language === "foreign") {
    score -= 10000;
  }

  if (
    traits.container === "mp4" ||
    traits.container === "m4v"
  ) {
    score += 4500;
  }

  if (traits.container === "hls") {
    score += 4200;
  }

  if (traits.container === "webm") {
    score += 1800;
  }

  if (
    ["ts", "m2ts", "mts", "flv"].includes(
      traits.container
    )
  ) {
    score += 1200;
  }

  if (traits.container === "mkv") {
    score -= 900;
  }

  if (traits.container === "avi") {
    score -= 4000;
  }

  if (traits.video === "h264") {
    score += 6000;
  }

  if (traits.video === "hevc") {
    score += browserCodecSupport.hevcAac
      ? 3000
      : -1200;
  }

  if (traits.video === "av1") {
    score += browserCodecSupport.av1Aac
      ? 2200
      : -1500;
  }

  if (traits.video === "vp9") {
    score += browserCodecSupport.vp9Opus
      ? 2200
      : -700;
  }

  if (traits.audio === "aac") {
    score += 7000;
  }

  if (traits.audio === "mp3") {
    score += 5000;
  }

  if (traits.audio === "opus") {
    score += browserCodecSupport.opus
      ? 4200
      : -900;
  }

  if (traits.audio === "flac") {
    score += browserCodecSupport.flac
      ? 1400
      : -1000;
  }

  if (traits.audio === "ac3") {
    score += browserCodecSupport.ac3
      ? 2600
      : -700;
  }

  if (traits.audio === "eac3") {
    score += browserCodecSupport.eac3
      ? 2200
      : -900;
  }

  if (traits.audio === "dts") {
    score -= 11000;
  }

  if (traits.audio === "truehd") {
    score -= 13000;
  }

  if (
    traits.video === "h264" &&
    traits.audio === "aac"
  ) {
    score += 7000;
  }

  if (
    (
      traits.container === "mp4" ||
      traits.container === "hls"
    ) &&
    traits.audio === "aac"
  ) {
    score += 3000;
  }

  if (traits.resolution === 1080) {
    score += 1500;
  } else if (traits.resolution === 720) {
    score += 900;
  } else if (traits.resolution === 2160) {
    score += 500;
  } else if (traits.resolution > 0) {
    score += Math.min(
      600,
      traits.resolution / 2
    );
  }

  return score;
};

export const orderSourcesForPlayback = (items) =>
  (items || [])
    .map((item, index) => ({
      item,
      index,
      score: scoreSourceCompatibility(item),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.index - b.index
    )
    .map(({ item }) => item);

const prettyContainer = {
  hls: "HLS",
  mp4: "MP4",
  m4v: "M4V",
  webm: "WebM",
  ts: "MPEG-TS",
  m2ts: "M2TS",
  mts: "MTS",
  flv: "FLV",
  mkv: "MKV",
  avi: "AVI",
  mov: "MOV",
};

const prettyVideo = {
  h264: "H.264",
  hevc: "HEVC/H.265",
  av1: "AV1",
  vp9: "VP9",
  mpeg2: "MPEG-2",
};

const prettyAudio = {
  aac: "AAC",
  mp3: "MP3",
  opus: "Opus",
  flac: "FLAC",
  ac3: "AC-3",
  eac3: "E-AC-3",
  dts: "DTS",
  truehd: "TrueHD",
};

export const hasSevereAudioRisk = (item, extraText = "") => {
  const traits = detectStreamTraits(item, extraText);

  return (
    traits.audio === "dts" ||
    traits.audio === "truehd"
  );
};

export const describeSourceCompatibility = (item, extraText = "") => {
  const traits = detectStreamTraits(item, extraText);
  const parts = [];

  if (traits.resolution) {
    parts.push(
      `${traits.resolution}p`
    );
  }

  if (traits.video) {
    parts.push(
      prettyVideo[
        traits.video
      ] ||
        traits.video
    );
  }

  if (traits.audio) {
    parts.push(
      prettyAudio[
        traits.audio
      ] ||
        traits.audio
    );
  }

  if (traits.container) {
    parts.push(
      prettyContainer[
        traits.container
      ] ||
        traits.container
    );
  }

  if (traits.language === "english") {
    parts.push(
      "English preferred"
    );
  } else if (traits.language === "multi") {
    parts.push(
      "multi-audio"
    );
  } else if (traits.language === "foreign") {
    parts.push(
      "non-English source"
    );
  }

  if (
    traits.audio === "dts" ||
    traits.audio === "truehd"
  ) {
    parts.push(
      "audio may be silent in browser"
    );
  } else {
    const supported =
      audioSupport(
        traits.audio
      );

    if (supported === false) {
      parts.push(
        "audio support uncertain"
      );
    } else if (
      traits.video === "h264" &&
      traits.audio === "aac"
    ) {
      parts.push(
        "best compatibility"
      );
    }
  }

  return (
    parts.join(" · ") ||
    "Codec details not supplied by source"
  );
};

export const isMpegTsLike = (src, label = "") => {
  const text =
    `${String(src || "")} ${String(label || "")}`.toLowerCase();

  return /\.m2ts(?:[?#\s]|$)|\.mts(?:[?#\s]|$)|\.ts(?:[?#\s]|$)|\bm2ts\b|\bmpeg[ -]?ts\b|\btransport stream\b/i.test(
    text
  );
};

export const isFlvLike = (src, label = "") => {
  const text =
    `${String(src || "")} ${String(label || "")}`.toLowerCase();

  return /\.flv(?:[?#\s]|$)|\bflv\b/i.test(
    text
  );
};
