import {
  nativeFireTvAppInfo,
  nativeFireTvCodecInfo,
} from "@/components/mg/nativeFireTvBridge";
import {
  isAndroidMobileRuntime,
  isFireTvRuntime,
} from "@/components/mg/runtimePlatform";

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

  vp8Vorbis:
    canPlay(
      VIDEO_PROBE,
      'video/webm; codecs="vp8, vorbis"'
    ) ||
    canPlay(
      VIDEO_PROBE,
      'video/webm; codecs="vp8, opus"'
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
    canPlay(
      AUDIO_PROBE,
      'audio/mp4; codecs="mp4a.40.2"'
    ) ||
    canPlay(
      AUDIO_PROBE,
      "audio/aac"
    ),

  mp3: canPlay(
    AUDIO_PROBE,
    "audio/mpeg"
  ),

  opus:
    canPlay(
      AUDIO_PROBE,
      'audio/webm; codecs="opus"'
    ) ||
    canPlay(
      AUDIO_PROBE,
      'audio/ogg; codecs="opus"'
    ),

  flac:
    canPlay(
      AUDIO_PROBE,
      "audio/flac"
    ) ||
    canPlay(
      AUDIO_PROBE,
      'audio/mp4; codecs="fLaC"'
    ),

  vorbis:
    canPlay(
      AUDIO_PROBE,
      'audio/ogg; codecs="vorbis"'
    ) ||
    canPlay(
      AUDIO_PROBE,
      'audio/webm; codecs="vorbis"'
    ),

  alac:
    canPlay(
      AUDIO_PROBE,
      'audio/mp4; codecs="alac"'
    ),

  pcm:
    canPlay(
      AUDIO_PROBE,
      "audio/wav"
    ) ||
    canPlay(
      AUDIO_PROBE,
      'audio/wav; codecs="1"'
    ),

  ac3:
    canPlay(
      AUDIO_PROBE,
      'audio/mp4; codecs="ac-3"'
    ) ||
    canPlay(
      VIDEO_PROBE,
      'video/mp4; codecs="avc1.4D401F, ac-3"'
    ),

  eac3:
    canPlay(
      AUDIO_PROBE,
      'audio/mp4; codecs="ec-3"'
    ) ||
    canPlay(
      VIDEO_PROBE,
      'video/mp4; codecs="avc1.4D401F, ec-3"'
    ),

  ac4:
    canPlay(
      AUDIO_PROBE,
      'audio/mp4; codecs="ac-4"'
    ) ||
    canPlay(
      VIDEO_PROBE,
      'video/mp4; codecs="avc1.4D401F, ac-4"'
    ),

  xheAac:
    canPlay(
      AUDIO_PROBE,
      'audio/mp4; codecs="mp4a.40.42"'
    ),
};

const NATIVE_VIDEO_MIME = {
  h264: ["video/avc"],
  hevc: ["video/hevc"],
  av1: ["video/av01", "video/av1"],
  vp9: ["video/x-vnd.on2.vp9"],
  vp8: ["video/x-vnd.on2.vp8"],
  h263: ["video/3gpp"],
  mpeg2: ["video/mpeg2"],
  mpeg4: ["video/mp4v-es"],
  vc1: ["video/wvc1", "video/x-ms-wmv"],
};

const NATIVE_AUDIO_MIME = {
  aac: ["audio/mp4a-latm"],
  xheaac: ["audio/mp4a-latm"],
  ac3: ["audio/ac3", "audio/ac-3"],
  eac3: ["audio/eac3", "audio/e-ac-3", "audio/eac3-joc"],
  ac4: ["audio/ac4"],
  dts: ["audio/vnd.dts", "audio/vnd.dts.hd"],
  truehd: ["audio/true-hd"],
  opus: ["audio/opus"],
  flac: ["audio/flac"],
  vorbis: ["audio/vorbis"],
  mp3: ["audio/mpeg"],
  mp2: ["audio/mpeg-l2"],
  pcm: ["audio/raw"],
};

const nativeCodecSupportFor = (deviceProfile, kind, codec) => {
  if (!deviceProfile?.nativeFireTv || !codec) return null;

  const available = Array.isArray(deviceProfile?.nativeCodecSupport?.[kind])
    ? deviceProfile.nativeCodecSupport[kind].map((value) => String(value).toLowerCase())
    : [];

  if (available.length === 0) return null;

  const expected =
    kind === "video"
      ? NATIVE_VIDEO_MIME[codec] || []
      : NATIVE_AUDIO_MIME[codec] || [];

  if (expected.length === 0) return null;

  return expected.some((mime) => available.includes(mime.toLowerCase()));
};

export const getPlaybackDeviceProfile = () => {
  const userAgent =
    typeof navigator !== "undefined"
      ? String(navigator.userAgent || "")
      : "";

  const androidMobile = isAndroidMobileRuntime();
  const nativeAppInfo = nativeFireTvAppInfo();
  const nativePlatform = String(nativeAppInfo?.platform || "")
    .trim()
    .toLowerCase();

  let nativePlayerAvailable = false;

  if (typeof window !== "undefined") {
    try {
      const nativeBridge = window.MediaGodNative;
      nativePlayerAvailable = Boolean(
        nativeBridge &&
          typeof nativeBridge.play === "function" &&
          (typeof nativeBridge.isAvailable !== "function" || nativeBridge.isAvailable() !== false)
      );
    } catch {
      nativePlayerAvailable = false;
    }
  }

  const nativeAndroidMobile =
    nativePlayerAvailable &&
    (androidMobile || nativePlatform === "android-mobile");

  const nativeFireTv =
    nativePlayerAvailable &&
    !nativeAndroidMobile &&
    (nativePlatform === "fire-tv" || isFireTvRuntime());

  const fireTv =
    !androidMobile &&
    !nativeAndroidMobile &&
    (nativeFireTv || isFireTvRuntime());

  const nativeCodecSupport =
    nativeFireTv
      ? nativeFireTvCodecInfo() || { video: [], audio: [] }
      : { video: [], audio: [] };

  const width =
    typeof window !== "undefined"
      ? Math.max(
          Number(window.innerWidth || 0),
          Number(window.screen?.width || 0)
        )
      : 0;

  const height =
    typeof window !== "undefined"
      ? Math.max(
          Number(window.innerHeight || 0),
          Number(window.screen?.height || 0)
        )
      : 0;

  const pixelRatio =
    typeof window !== "undefined"
      ? Number(window.devicePixelRatio || 1)
      : 1;

  const physicalLongEdge =
    Math.max(width, height) *
    pixelRatio;

  /*
   * Do not cap Fire TV at 1080p here.
   *
   * Some 4K Fire TV WebViews report a 1920-wide CSS viewport
   * even though the device can decode/output 4K.
   *
   * LiveVideo/HLS still makes the final decoder decision.
   */
  const fourKAllowed =
    fireTv ||
    physicalLongEdge >= 3000;

  return {
    name:
      fireTv
        ? "Fire TV"
        : nativeAndroidMobile || androidMobile
          ? "Android Mobile"
          : "Browser",

    fireTv,
    isFireTv: fireTv,
    nativeFireTv,
    nativeAndroidMobile,
    nativePlayerAvailable,
    mobileApp: androidMobile || nativeAndroidMobile,
    nativePlatform,
    nativeCodecSupport,
    fourKAllowed,

    width,
    height,
    pixelRatio,

    codecSupport:
      browserCodecSupport,
  };
};

export const getSourceUrl = (item) =>
  item?.src ||
  item?.url ||
  item?.magnet ||
  item?.magnetLink ||
  "";

export const sourceText = (
  item,
  extraText = ""
) =>
  [
    item?.label,
    item?.name,
    item?.title,
    item?.filename,
    item?.file,
    item?.path,
    item?.description,
    item?.quality,
    item?.resolution,
    item?.audio,
    item?.audioCodec,
    item?.audio_codec,
    item?.codec,
    item?.videoCodec,
    item?.video_codec,
    item?.behaviorHints?.filename,
    item?.behaviorHints?.videoHash,
    extraText,
    getSourceUrl(item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const has = (
  text,
  regex
) =>
  regex.test(text);

const ENGLISH_LANGUAGE_RE =
  /(?:^|[\s._\-\[\](){}|+,])(?:eng|en|english)(?=$|[\s._\-\[\](){}|+,])/i;

// AIOStreams and a few Stremio-compatible addons use decorative small-cap
// language markers (for example "⛿  ᴇɴ" and "⛿  ᴍᴜʟᴛɪ"). Treat those as
// first-class language metadata instead of leaving them as unknown.
const DECORATIVE_ENGLISH_LANGUAGE_RE =
  /(?:⛿\s*)?(?:ᴇɴ|ᴇɴɢ|ᴇɴɢʟɪꜱʜ)(?=$|[\s._\-\[\](){}|+,])/i;

const MULTI_LANGUAGE_RE =
  /\b(?:multi(?:[ ._-]?audio)?|dual(?:[ ._-]?audio)?|multi(?:[ ._-]?lang(?:uage)?)?)\b|(?:⛿\s*)?ᴍᴜʟᴛɪ/i;

const FOREIGN_LANGUAGE_RE =
  /(?:^|[\s._\-\[\](){}|+,])(?:rus|russian|ukr|ukrainian|hin|hindi|tam|tamil|tel|telugu|spa|spanish|es|fre|fra|french|fr|ger|deu|german|de|ita|italian|it|por|portuguese|pt|pol|polish|pl|tur|turkish|tr|ara|arabic|ar|jpn|japanese|ja|kor|korean|ko|chi|zho|chinese|mandarin|cantonese|zh|dut|nld|dutch|nl|swe|swedish|sv|nor|norwegian|no|dan|danish|da|fin|finnish|fi|cze|ces|czech|cs|slo|slk|slovak|sk|hun|hungarian|hu|rum|ron|romanian|ro|bul|bulgarian|bg|gre|ell|greek|el|heb|hebrew|he|ind|indonesian|id|tha|thai|th|vie|vietnamese|vi)(?=$|[\s._\-\[\](){}|+,])/i;

export const detectLanguagePreference = (
  item,
  extraText = ""
) => {
  const text =
    sourceText(
      item,
      extraText
    );

  const english =
    ENGLISH_LANGUAGE_RE.test(
      text
    );

  const multi =
    MULTI_LANGUAGE_RE.test(
      text
    );

  const foreign =
    FOREIGN_LANGUAGE_RE.test(
      text
    );

  if (english) {
    return "english";
  }

  if (multi) {
    return "multi";
  }

  if (foreign) {
    return "foreign";
  }

  return "unknown";
};

export const detectStreamTraits = (
  item,
  extraText = ""
) => {
  const text =
    sourceText(
      item,
      extraText
    );

  const url =
    String(
      getSourceUrl(item) ||
        ""
    ).toLowerCase();

  const joined =
    `${url} ${text}`;

  const traits = {
    text,

    container:
      "",

    video:
      "",

    audio:
      "",

    resolution:
      0,

    hdr:
      false,

    dolbyVision:
      false,

    atmos:
      false,

    audioRisk:
      false,

    language:
      "unknown",
  };

  traits.language =
    detectLanguagePreference(
      item,
      extraText
    );

  if (
    has(
      joined,
      /\.m3u8(?:[?#\s]|$)|\bhls\b/i
    )
  ) {
    traits.container =
      "hls";
  } else if (
    has(
      joined,
      /\.mpd(?:[?#\s]|$)|\bmpeg[ -]?dash\b|\bdash\b/i
    )
  ) {
    traits.container =
      "dash";
  } else if (
    has(
      joined,
      /\.m2ts(?:[?#\s]|$)|\bm2ts\b/i
    )
  ) {
    traits.container =
      "m2ts";
  } else if (
    has(
      joined,
      /\.mts(?:[?#\s]|$)|\bmts\b/i
    )
  ) {
    traits.container =
      "mts";
  } else if (
    has(
      joined,
      /\.ts(?:[?#\s]|$)|\bmpeg[ -]?ts\b|\btransport stream\b/i
    )
  ) {
    traits.container =
      "ts";
  } else if (
    has(
      joined,
      /\.flv(?:[?#\s]|$)|\bflv\b/i
    )
  ) {
    traits.container =
      "flv";
  } else if (
    has(
      joined,
      /\.mp4(?:[?#\s]|$)|\bmp4\b/i
    )
  ) {
    traits.container =
      "mp4";
  } else if (
    has(
      joined,
      /\.m4v(?:[?#\s]|$)|\bm4v\b/i
    )
  ) {
    traits.container =
      "m4v";
  } else if (
    has(
      joined,
      /\.webm(?:[?#\s]|$)|\bwebm\b/i
    )
  ) {
    traits.container =
      "webm";
  } else if (
    has(
      joined,
      /\.mkv(?:[?#\s]|$)|\bmkv\b|\bmatroska\b/i
    )
  ) {
    traits.container =
      "mkv";
  } else if (
    has(
      joined,
      /\.avi(?:[?#\s]|$)|\bavi\b/i
    )
  ) {
    traits.container =
      "avi";
  } else if (
    has(
      joined,
      /\.mov(?:[?#\s]|$)|\bmov\b/i
    )
  ) {
    traits.container =
      "mov";
  } else if (
    has(
      joined,
      /\.vob(?:[?#\s]|$)|\bvob\b/i
    )
  ) {
    traits.container = "vob";
  } else if (
    has(
      joined,
      /\.ogv(?:[?#\s]|$)|\bogv\b|\bogg video\b/i
    )
  ) {
    traits.container = "ogv";
  } else if (
    has(
      joined,
      /\.(?:3gp|3g2)(?:[?#\s]|$)|\b3gp\b|\b3g2\b/i
    )
  ) {
    traits.container = "3gp";
  } else if (
    has(
      joined,
      /\.wmv(?:[?#\s]|$)|\bwmv\b/i
    )
  ) {
    traits.container = "wmv";
  } else if (
    has(
      joined,
      /\.asf(?:[?#\s]|$)|\basf\b/i
    )
  ) {
    traits.container = "asf";
  } else if (
    has(
      joined,
      /\.f4v(?:[?#\s]|$)|\bf4v\b/i
    )
  ) {
    traits.container = "f4v";
  } else if (
    has(
      joined,
      /\.mxf(?:[?#\s]|$)|\bmxf\b/i
    )
  ) {
    traits.container = "mxf";
  } else if (
    has(
      joined,
      /\.divx(?:[?#\s]|$)|\bdivx\b/i
    )
  ) {
    traits.container = "divx";
  }

  if (
    has(
      text,
      /\b(?:h\.?264|avc1?|x264)\b/i
    )
  ) {
    traits.video =
      "h264";
  } else if (
    has(
      text,
      /\b(?:h\.?265|hevc|hev1|hvc1|x265)\b/i
    )
  ) {
    traits.video =
      "hevc";
  } else if (
    has(
      text,
      /\b(?:av1|av01)\b/i
    )
  ) {
    traits.video =
      "av1";
  } else if (
    has(
      text,
      /\b(?:vp9|vp09)\b/i
    )
  ) {
    traits.video =
      "vp9";
  } else if (
    has(
      text,
      /\b(?:vp8|vp08)\b/i
    )
  ) {
    traits.video =
      "vp8";
  } else if (
    has(
      text,
      /\bh\.?263\b/i
    )
  ) {
    traits.video =
      "h263";
  } else if (
    has(
      text,
      /\bmpeg[ -]?2\b/i
    )
  ) {
    traits.video =
      "mpeg2";
  } else if (
    has(
      text,
      /\b(?:mpeg[ -]?4|mp4v|xvid|divx)\b/i
    )
  ) {
    traits.video = "mpeg4";
  } else if (
    has(
      text,
      /\b(?:vc-?1|wmv3|wvc1)\b/i
    )
  ) {
    traits.video = "vc1";
  } else if (
    has(
      text,
      /\btheora\b/i
    )
  ) {
    traits.video = "theora";
  }

  /*
   * Audio detection order matters.
   *
   * TrueHD and DTS variants are checked before generic Dolby
   * labels because release names often contain several tags.
   */
  if (
    has(
      text,
      /\b(?:ac-?4|ac4)\b/i
    )
  ) {
    traits.audio = "ac4";
  } else if (
    has(
      text,
      /\b(?:xhe-?aac|xheaac|usac|mpeg-?h[ ._-]?3d[ ._-]?audio)\b/i
    )
  ) {
    traits.audio = "xheaac";
  } else if (
    has(
      text,
      /\b(?:true[ ._-]?hd|true-hd|mlp)(?:[ ._-]?(?:atmos|7\.1|5\.1))?\b/i
    )
  ) {
    traits.audio =
      "truehd";

    traits.audioRisk =
      true;
  } else if (
    has(
      text,
      /\b(?:dts(?:[ ._-]?hd)?(?:[ ._-]?(?:ma|hra))?|dts[ ._-]?x|dca)(?:[ ._-]?(?:7\.1|5\.1))?\b/i
    )
  ) {
    traits.audio =
      "dts";

    traits.audioRisk =
      true;
  } else if (
    has(
      text,
      /\b(?:e-?ac-?3|eac3|ec-?3|ddp|dd\+|dolby[ ._-]?digital[ ._-]?plus)(?:[ ._-]?(?:atmos|7\.1|5\.1|2\.0))?\b/i
    )
  ) {
    traits.audio =
      "eac3";
  } else if (
    has(
      text,
      /\b(?:ac-?3|ac3|dolby[ ._-]?digital|dd)(?:[ ._-]?(?:7\.1|5\.1|2\.0))?\b/i
    )
  ) {
    traits.audio =
      "ac3";
  } else if (
    has(
      text,
      /\b(?:aac(?:[ ._-]?(?:lc|he|2\.0|5\.1))?|heaac|he-aac|mp4a)\b/i
    )
  ) {
    traits.audio =
      "aac";
  } else if (
    has(
      text,
      /\bopus\b/i
    )
  ) {
    traits.audio =
      "opus";
  } else if (
    has(
      text,
      /\bflac\b/i
    )
  ) {
    traits.audio =
      "flac";
  } else if (
    has(
      text,
      /\b(?:alac|apple lossless)\b/i
    )
  ) {
    traits.audio = "alac";
  } else if (
    has(
      text,
      /\bvorbis\b/i
    )
  ) {
    traits.audio = "vorbis";
  } else if (
    has(
      text,
      /\b(?:pcm|lpcm|s16le|s24le|wav)\b/i
    )
  ) {
    traits.audio = "pcm";
  } else if (
    has(
      text,
      /\b(?:mp2|mpeg[ -]?1 layer[ -]?2)\b/i
    )
  ) {
    traits.audio = "mp2";
  } else if (
    has(
      text,
      /\bmp3\b|\bmpeg audio\b/i
    )
  ) {
    traits.audio =
      "mp3";
  }

  traits.atmos =
    has(
      text,
      /\batmos\b/i
    );

  traits.dolbyVision =
    has(
      text,
      /\b(?:dolby vision|dovi|dv)\b/i
    );

  traits.hdr =
    traits.dolbyVision ||
    has(
      text,
      /\b(?:hdr10\+?|hdr)\b/i
    );

  const explicitResolution =
    Number(
      item?.resolution ||
        item?.height ||
        0
    );

  if (
    Number.isFinite(
      explicitResolution
    ) &&
    explicitResolution >=
      240
  ) {
    traits.resolution =
      explicitResolution;
  } else {
    const resolutionMatch =
      text.match(
        /\b(4320|2160|1440|1080|720|576|480|360)p\b/i
      );

    if (
      resolutionMatch
    ) {
      traits.resolution =
        Number(
          resolutionMatch[
            1
          ]
        );
    } else if (
      has(
        text,
        /\b8k\b/i
      )
    ) {
      traits.resolution =
        4320;
    } else if (
      has(
        text,
        /\b(?:4k|uhd)\b/i
      )
    ) {
      traits.resolution =
        2160;
    }
  }

  return traits;
};

const audioSupport = (
  audio,
  deviceProfile = null
) => {
  if (!audio) {
    return null;
  }

  const nativeSupport =
    nativeCodecSupportFor(
      deviceProfile,
      "audio",
      audio
    );

  if (nativeSupport === true) {
    return true;
  }

  if (
    audio ===
    "aac"
  ) {
    return browserCodecSupport.aac;
  }

  if (
    audio ===
    "mp3"
  ) {
    return browserCodecSupport.mp3;
  }

  if (
    audio ===
    "opus"
  ) {
    return browserCodecSupport.opus;
  }

  if (
    audio ===
    "flac"
  ) {
    return browserCodecSupport.flac;
  }

  if (audio === "vorbis") {
    return browserCodecSupport.vorbis;
  }

  if (audio === "alac") {
    return browserCodecSupport.alac;
  }

  if (audio === "pcm") {
    return browserCodecSupport.pcm;
  }

  if (audio === "mp2") {
    return deviceProfile?.fireTv ? null : false;
  }

  if (
    audio ===
    "ac3"
  ) {
    if (
      browserCodecSupport.ac3
    ) {
      return true;
    }

    /*
     * Fire TV WebView codec reporting is not always accurate.
     * Treat AC-3 as uncertain rather than an automatic rejection.
     */
    return deviceProfile?.fireTv
      ? null
      : false;
  }

  if (
    audio ===
    "eac3"
  ) {
    if (
      browserCodecSupport.eac3
    ) {
      return true;
    }

    return deviceProfile?.fireTv
      ? null
      : false;
  }

  if (audio === "ac4") {
    if (browserCodecSupport.ac4) {
      return true;
    }

    return deviceProfile?.nativeFireTv ? null : false;
  }

  if (audio === "xheaac") {
    if (browserCodecSupport.xheAac || browserCodecSupport.aac) {
      return true;
    }

    return deviceProfile?.nativeFireTv ? null : false;
  }

  if (
    audio ===
      "dts" ||
    audio ===
      "truehd"
  ) {
    /*
     * Current Fire TV hardware varies by model/receiver. Media3 can use the
     * device decoder or HDMI passthrough when available, so the dedicated
     * native player gets a real attempt instead of being rejected from a
     * browser codec probe. Web/mobile browsers still treat these as unsafe.
     */
    return deviceProfile?.nativeFireTv ? null : false;
  }

  return null;
};

const qualityPreferenceTarget = (
  preference
) => {
  const value =
    String(
      preference ||
        "Auto"
    ).toLowerCase();

  if (
    value ===
      "4k" ||
    value ===
      "2160p"
  ) {
    return 2160;
  }

  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
};

const qualityScore = (
  resolution,
  qualityPreference,
  deviceProfile
) => {
  const value =
    Number(
      resolution ||
        0
    );

  if (!value) {
    return 0;
  }

  const target =
    qualityPreferenceTarget(
      qualityPreference
    );

  if (target) {
    if (
      value ===
      target
    ) {
      return 9000;
    }

    if (
      value <
      target
    ) {
      return Math.max(
        500,
        6500 -
          Math.abs(
            target -
              value
          ) *
            2
      );
    }

    return 2500;
  }

  if (
    value >=
    4320
  ) {
    return deviceProfile?.fourKAllowed
      ? 3200
      : 300;
  }

  if (
    value >=
    2160
  ) {
    return deviceProfile?.fourKAllowed
      ? 4200
      : 800;
  }

  if (
    value >=
    1440
  ) {
    return 3300;
  }

  if (
    value >=
    1080
  ) {
    return 3000;
  }

  if (
    value >=
    720
  ) {
    return 1800;
  }

  return 800;
};

export const hasSevereAudioRisk = (
  item,
  extraText = ""
) => {
  const traits =
    detectStreamTraits(
      item,
      extraText
    );

  return (
    traits.audio ===
      "dts" ||
    traits.audio ===
      "truehd" ||
    traits.audioRisk
  );
};

export const hasSevereVideoRisk = (
  item,
  extraText = "",
  deviceProfile = getPlaybackDeviceProfile()
) => {
  const traits = detectStreamTraits(item, extraText);

  if (traits.resolution >= 4320) {
    return true;
  }

  if (traits.container === "avi") {
    return true;
  }

  if (
    traits.video === "av1" &&
    !deviceProfile?.fireTv &&
    !browserCodecSupport.av1Aac
  ) {
    return true;
  }

  if (
    traits.video === "vp9" &&
    !deviceProfile?.fireTv &&
    !browserCodecSupport.vp9Opus
  ) {
    return true;
  }

  if (
    traits.video === "hevc" &&
    !deviceProfile?.fireTv &&
    !browserCodecSupport.hevcAac
  ) {
    return true;
  }

  if (
    traits.container === "mkv" &&
    traits.video === "av1" &&
    !deviceProfile?.nativeFireTv &&
    !browserCodecSupport.av1Aac
  ) {
    return true;
  }

  return false;
};

export const scoreSourceCompatibility = (
  item,
  extraText = "",
  options = {}
) => {
  const traits =
    detectStreamTraits(
      item,
      extraText
    );

  const type =
    String(
      item?.type ||
        ""
    ).toLowerCase();

  const deviceProfile =
    options?.deviceProfile ||
    getPlaybackDeviceProfile();

  const qualityPreference =
    options?.qualityPreference ||
    "Auto";

  const nativeVideoSupport =
    nativeCodecSupportFor(
      deviceProfile,
      "video",
      traits.video
    );

  let score =
    0;

  if (
    hasSevereVideoRisk(
      item,
      extraText,
      deviceProfile
    )
  ) {
    /*
     * Keep unusual video formats available. Browser/WebView codec probes can
     * under-report Fire TV hardware decode support, so this is a ranking hint,
     * never a reason to effectively blacklist a torrent.
     */
    score -= 9000;
  }

  if (
    item?.viaRealDebrid
  ) {
    score +=
      1800;
  }

  if (
    type ===
      "provider" ||
    type ===
      "youtube" ||
    type ===
      "status"
  ) {
    score -=
      30000;
  }

  /*
   * English first.
   *
   * Multi-audio also gets priority because it commonly contains
   * English and LiveVideo can switch tracks where supported.
   */
  if (
    traits.language ===
    "english"
  ) {
    score +=
      15000;
  } else if (
    traits.language ===
    "multi"
  ) {
    score +=
      6500;
  } else if (
    traits.language ===
    "foreign"
  ) {
    score -=
      11000;
  }

  /*
   * Browser-friendly containers first.
   */
  if (
    traits.container ===
    "hls"
  ) {
    score +=
      7000;
  } else if (
    traits.container ===
    "dash"
  ) {
    score += deviceProfile.nativeFireTv ? 7200 : 6000;
  } else if (
    traits.container ===
      "mp4" ||
    traits.container ===
      "m4v"
  ) {
    score +=
      6500;
  } else if (
    traits.container ===
    "webm"
  ) {
    score +=
      2200;
  } else if (
    [
      "ts",
      "m2ts",
      "mts",
      "flv",
    ].includes(
      traits.container
    )
  ) {
    score +=
      1200;
  } else if (
    traits.container ===
    "mkv"
  ) {
    score += deviceProfile.nativeFireTv ? 2600 : -1200;
  } else if (
    traits.container ===
    "avi"
  ) {
    score -=
      4500;
  } else if (
    ["mov", "f4v", "3gp"].includes(traits.container)
  ) {
    score += 1800;
  } else if (
    traits.container === "ogv"
  ) {
    score += 700;
  } else if (
    ["vob", "wmv", "asf", "mxf", "divx"].includes(traits.container)
  ) {
    score -= 2200;
  }

  if (
    traits.video ===
    "h264"
  ) {
    score += nativeVideoSupport === true ? 7600 : 6500;
  } else if (
    traits.video ===
    "hevc"
  ) {
    score +=
      nativeVideoSupport === true
        ? 5200
        : browserCodecSupport.hevcAac || deviceProfile.fireTv
          ? 3600
          : -1400;
  } else if (
    traits.video ===
    "av1"
  ) {
    score +=
      nativeVideoSupport === true
        ? 4600
        : browserCodecSupport.av1Aac || deviceProfile.nativeFireTv
          ? 3200
          : -1600;
  } else if (
    traits.video ===
    "vp9"
  ) {
    score +=
      nativeVideoSupport === true
        ? 4000
        : browserCodecSupport.vp9Opus || deviceProfile.fireTv
          ? 2200
          : -800;
  } else if (
    traits.video === "vp8"
  ) {
    score +=
      nativeVideoSupport === true
        ? 3000
        : browserCodecSupport.vp8Vorbis || deviceProfile.nativeFireTv
          ? 1800
          : -500;
  } else if (
    traits.video === "h263"
  ) {
    score += nativeVideoSupport === true ? 2000 : deviceProfile.nativeFireTv ? 900 : -300;
  } else if (
    traits.video === "mpeg2"
  ) {
    score +=
      nativeVideoSupport === true
        ? 3400
        : deviceProfile.nativeFireTv
          ? 2200
          : deviceProfile.fireTv
            ? 1400
            : 300;
  } else if (
    traits.video === "mpeg4"
  ) {
    score += nativeVideoSupport === true ? 2200 : 900;
  } else if (
    traits.video === "vc1"
  ) {
    score += nativeVideoSupport === true ? 1200 : -1800;
  } else if (
    traits.video === "theora"
  ) {
    score += 200;
  }

  /*
   * AUDIO IS WEIGHTED ABOVE RESOLUTION.
   *
   * A 1080p AAC source is better than a 4K DTS/TrueHD source
   * that produces a picture with no sound.
   *
   * A 4K source with safe audio still receives the 4K quality
   * bonus below and remains preferred.
   */
  if (
    traits.audio ===
    "aac"
  ) {
    score +=
      12000;
  } else if (
    traits.audio ===
    "mp3"
  ) {
    score +=
      7000;
  } else if (
    traits.audio ===
    "opus"
  ) {
    score +=
      browserCodecSupport.opus
        ? 6500
        : -1200;
  } else if (
    traits.audio ===
    "ac3"
  ) {
    const supported =
      audioSupport(
        "ac3",
        deviceProfile
      );

    score +=
      supported === true
        ? 6500
        : supported === null
          ? 2500
          : -1800;
  } else if (
    traits.audio ===
    "eac3"
  ) {
    const supported =
      audioSupport(
        "eac3",
        deviceProfile
      );

    score +=
      supported === true
        ? 6200
        : supported === null
          ? 2200
          : -2000;
  } else if (
    traits.audio === "ac4"
  ) {
    const supported = audioSupport("ac4", deviceProfile);
    score +=
      supported === true
        ? 5200
        : supported === null
          ? 1700
          : -2600;
  } else if (
    traits.audio === "xheaac"
  ) {
    const supported = audioSupport("xheaac", deviceProfile);
    score +=
      supported === true
        ? 6500
        : supported === null
          ? 1800
          : -1800;
  } else if (
    traits.audio ===
    "flac"
  ) {
    score +=
      browserCodecSupport.flac
        ? 1800
        : deviceProfile.fireTv
          ? 300
          : -1800;
  } else if (traits.audio === "vorbis") {
    score += browserCodecSupport.vorbis ? 1600 : -700;
  } else if (traits.audio === "alac") {
    score += browserCodecSupport.alac ? 1200 : deviceProfile.fireTv ? 200 : -900;
  } else if (traits.audio === "pcm") {
    score += browserCodecSupport.pcm ? 1300 : deviceProfile.fireTv ? 300 : -700;
  } else if (traits.audio === "mp2") {
    score += deviceProfile.fireTv ? 500 : -500;
  } else if (
    traits.audio ===
    "dts"
  ) {
    /*
     * Prefer safer audio when everything else is equal, but positively rank
     * DTS when this exact Fire TV reports a DTS decoder/passthrough MIME type.
     */
    const supported = audioSupport("dts", deviceProfile);
    score +=
      supported === true
        ? 3000
        : deviceProfile.nativeFireTv
          ? -5000
          : -18000;
  } else if (
    traits.audio ===
    "truehd"
  ) {
    const supported = audioSupport("truehd", deviceProfile);
    score +=
      supported === true
        ? 2200
        : deviceProfile.nativeFireTv
          ? -9000
          : -22000;
  }

  if (
    traits.video ===
      "h264" &&
    traits.audio ===
      "aac"
  ) {
    score +=
      10000;
  }

  if (
    (
      traits.container ===
        "mp4" ||
      traits.container ===
        "hls"
    ) &&
    traits.audio ===
      "aac"
  ) {
    score +=
      6000;
  }

  score +=
    qualityScore(
      traits.resolution,
      qualityPreference,
      deviceProfile
    );

  return score;
};

export const orderSourcesForPlayback = (
  items,
  options = {}
) => {
  const deviceProfile =
    options?.deviceProfile ||
    getPlaybackDeviceProfile();

  const list =
    (items || []).map(
      (
        item,
        index
      ) => {
        const severeAudioRisk =
          hasSevereAudioRisk(
            item
          );

        return {
          item,
          index,
          severeAudioRisk,

          score:
            scoreSourceCompatibility(
              item,
              "",
              {
                ...options,
                deviceProfile,
              }
            ),
        };
      }
    );

  return list
    .sort(
      (
        a,
        b
      ) =>
        b.score -
          a.score ||
        Number(a.severeAudioRisk) -
          Number(b.severeAudioRisk) ||
        a.index -
          b.index
    )
    .map(
      ({ item }) =>
        item
    );
};

const prettyContainer = {
  hls:
    "HLS",

  mp4:
    "MP4",

  m4v:
    "M4V",

  webm:
    "WebM",

  ts:
    "MPEG-TS",

  m2ts:
    "M2TS",

  mts:
    "MTS",

  flv:
    "FLV",

  mkv:
    "MKV",

  avi:
    "AVI",

  mov:
    "MOV",

  vob: "VOB",
  ogv: "OGV",
  "3gp": "3GP",
  wmv: "WMV",
  asf: "ASF",
  f4v: "F4V",
  mxf: "MXF",
  divx: "DIVX",
};

const prettyVideo = {
  h264:
    "H.264",

  hevc:
    "HEVC/H.265",

  av1:
    "AV1",

  vp9:
    "VP9",

  mpeg2:
    "MPEG-2",

  mpeg4: "MPEG-4/Xvid",
  vc1: "VC-1",
  theora: "Theora",
};

const prettyAudio = {
  aac:
    "AAC",

  mp3:
    "MP3",

  opus:
    "Opus",

  flac:
    "FLAC",

  ac3:
    "AC-3",

  eac3:
    "E-AC-3",

  dts:
    "DTS/DTS-HD",

  truehd:
    "TrueHD",

  vorbis:
    "Vorbis",

  alac:
    "ALAC",

  pcm:
    "PCM/LPCM",

  mp2:
    "MP2",
};

export const describeSourceCompatibility = (
  item,
  extraText = ""
) => {
  const traits =
    detectStreamTraits(
      item,
      extraText
    );

  const deviceProfile =
    getPlaybackDeviceProfile();

  const parts =
    [];

  if (
    traits.resolution
  ) {
    parts.push(
      `${traits.resolution}p`
    );
  }

  if (
    traits.video
  ) {
    parts.push(
      prettyVideo[
        traits.video
      ] ||
        traits.video
    );
  }

  if (
    traits.audio
  ) {
    parts.push(
      prettyAudio[
        traits.audio
      ] ||
        traits.audio
    );
  }

  if (
    traits.container
  ) {
    parts.push(
      prettyContainer[
        traits.container
      ] ||
        traits.container
    );
  }

  if (
    traits.language ===
    "english"
  ) {
    parts.push(
      "English preferred"
    );
  } else if (
    traits.language ===
    "multi"
  ) {
    parts.push(
      "multi-audio"
    );
  } else if (
    traits.language ===
    "foreign"
  ) {
    parts.push(
      "non-English source"
    );
  }

  if (
    hasSevereAudioRisk(
      item,
      extraText
    )
  ) {
    parts.push(
      "Audio Rescue required"
    );
  } else {
    const supported =
      audioSupport(
        traits.audio,
        deviceProfile
      );

    if (
      supported ===
      false
    ) {
      parts.push(
        "audio support uncertain"
      );
    } else if (
      traits.video ===
        "h264" &&
      traits.audio ===
        "aac"
    ) {
      parts.push(
        "best compatibility"
      );
    }
  }

  return (
    parts.join(
      " · "
    ) ||
    "Codec details not supplied by source"
  );
};

export const isMpegTsLike = (
  src,
  label = ""
) => {
  const text =
    `${String(
      src || ""
    )} ${String(
      label || ""
    )}`.toLowerCase();

  return /\.m2ts(?:[?#\s]|$)|\.mts(?:[?#\s]|$)|\.ts(?:[?#\s]|$)|\bm2ts\b|\bmpeg[ -]?ts\b|\btransport stream\b/i.test(
    text
  );
};

export const isFlvLike = (
  src,
  label = ""
) => {
  const text =
    `${String(
      src || ""
    )} ${String(
      label || ""
    )}`.toLowerCase();

  return /\.flv(?:[?#\s]|$)|\bflv\b/i.test(
    text
  );
};
