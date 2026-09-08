import {
  healthAdjustedPriority,
  readCustomLiveSources,
  recordSourceHealth,
  sourceRegistryEvent,
} from "@/components/mg/sourceRegistry";
import { liveTvUrlScore } from "@/components/mg/liveTvPlaybackLearning";

export const LIVE_TV_SOURCES = [
  {
    id: "free-tv",
    name: "Free-TV",
    url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
    priority: 100,
    category: "General",
  },
  {
    id: "freecasthub",
    name: "FreeCastHub",
    url: "https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u",
    priority: 95,
    category: "General",
  },
  {
    id: "freecasthub-sports",
    name: "FreeCastHub Sports",
    url: "https://raw.githubusercontent.com/freecasthub/public-iptv/main/sports.m3u",
    priority: 96,
    category: "Sports",
  },
  {
    id: "iptv-org-uk",
    name: "IPTV-org UK",
    url: "https://iptv-org.github.io/iptv/countries/uk.m3u",
    priority: 90,
    category: "United Kingdom",
  },
  {
    id: "iptv-org-worldwide",
    name: "IPTV-org Worldwide",
    url: "https://iptv-org.github.io/iptv/index.country.m3u",
    priority: 72,
    category: "Worldwide",
  },
  {
    id: "iptv-org-sports",
    name: "IPTV-org Sports",
    url: "https://iptv-org.github.io/iptv/categories/sports.m3u",
    priority: 80,
    category: "Sports",
  },
  {
    id: "iptv-org-movies",
    name: "IPTV-org Movies",
    url: "https://iptv-org.github.io/iptv/categories/movies.m3u",
    priority: 80,
    category: "Movies",
  },
];

export const FREE_TV_PLAYLIST_URL =
  LIVE_TV_SOURCES[0].url;

export const LIVE_TV_REGION = "GB";

/*
 * Direct public/free fallback feeds. These do not depend on a community M3U
 * staying online, so Live TV still has useful channels when a playlist source
 * is temporarily unavailable. Only free/public broadcaster feeds belong here.
 */
export const PUBLIC_DIRECT_CHANNELS = [
  /*
   * Official BBC television fallbacks.
   *
   * These are BBC CDN feeds, not proxy/unlocked copies. BBC applies its own
   * UK availability rules at the CDN, so Media God does not bypass regional
   * restrictions. Keeping them here means BBC One/Two/etc do not disappear
   * just because a community playlist temporarily drops or changes an entry.
   */
  {
    id: "BBCOne.uk@London",
    name: "BBC One London",
    url: "https://vs-cmaf-push-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_one_london/iptv_hd_abr_v1.mpd",
    category: "General",
    country: "GB",
    priority: 132,
    sourceName: "BBC Official",
    geoRestricted: true,
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcone",
  },
  {
    id: "BBCTwo.uk@HD",
    name: "BBC Two",
    url: "https://vs-cmaf-push-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_two_hd/iptv_hd_abr_v1.mpd",
    category: "General",
    country: "GB",
    priority: 132,
    sourceName: "BBC Official",
    geoRestricted: true,
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbctwo",
  },
  {
    id: "BBCThree.uk@SD",
    name: "BBC Three",
    url: "https://vs-cmaf-pushb-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_three_hd/iptv_hd_abr_v1.mpd",
    category: "General",
    country: "GB",
    priority: 128,
    sourceName: "BBC Official",
    geoRestricted: true,
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcthree",
  },
  {
    id: "BBCFour.uk@UK",
    name: "BBC Four",
    url: "https://vs-cmaf-pushb-uk.live.fastly.md.bbci.co.uk/x=4/i=urn:bbc:pips:service:bbc_four_hd/iptv_hd_abr_v1.mpd",
    category: "Culture",
    country: "GB",
    priority: 128,
    sourceName: "BBC Official",
    geoRestricted: true,
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcfour",
  },
  {
    id: "BBCNews.uk@UK",
    name: "BBC News",
    url: "https://vs-cmaf-push-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/iptv_hd_abr_v1.mpd",
    category: "News",
    country: "GB",
    priority: 130,
    sourceName: "BBC Official",
    geoRestricted: true,
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcnews",
  },
  {
    id: "BBCParliament.uk@SD",
    name: "BBC Parliament",
    url: "https://vs-cmaf-pushb-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_parliament/iptv_hd_abr_v1.mpd",
    category: "Legislative",
    country: "GB",
    priority: 126,
    sourceName: "BBC Official",
    geoRestricted: true,
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcparliament",
  },
  {
    id: "CBBC.uk@HD",
    name: "CBBC",
    url: "https://vs-cmaf-pushb-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:cbbc_hd/iptv_hd_abr_v1.mpd",
    category: "Kids",
    country: "GB",
    priority: 124,
    sourceName: "BBC Official",
    geoRestricted: true,
    officialUrl: "https://www.bbc.co.uk/iplayer/live/cbbc",
  },
  {
    id: "CBeebies.uk@HD",
    name: "CBeebies",
    url: "https://vs-cmaf-pushb-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:cbeebies_hd/iptv_hd_abr_v1.mpd",
    category: "Kids",
    country: "GB",
    priority: 124,
    sourceName: "BBC Official",
    geoRestricted: true,
    officialUrl: "https://www.bbc.co.uk/iplayer/live/cbeebies",
  },
  /*
   * UK commercial public-service broadcasters generally protect their live
   * streams behind the broadcaster's own player/DRM. Keep official launch
   * entries so these channels remain available without relying on unknown
   * relay URLs from community playlists.
   */
  {
    id: "ITV1.uk",
    name: "ITV1",
    url: "https://www.itv.com/watch?channel=itv",
    category: "General",
    country: "GB",
    priority: 126,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv",
  },
  {
    id: "ITV2.uk",
    name: "ITV2",
    url: "https://www.itv.com/watch?channel=itv2",
    category: "General",
    country: "GB",
    priority: 124,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv2",
  },
  {
    id: "ITV3.uk",
    name: "ITV3",
    url: "https://www.itv.com/watch?channel=itv3",
    category: "General",
    country: "GB",
    priority: 122,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv3",
  },
  {
    id: "ITV4.uk",
    name: "ITV4",
    url: "https://www.itv.com/watch?channel=itv4",
    category: "General",
    country: "GB",
    priority: 122,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv4",
  },
  {
    id: "ITVBe.uk",
    name: "ITVBe",
    url: "https://www.itv.com/watch?channel=itvbe",
    category: "General",
    country: "GB",
    priority: 120,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itvbe",
  },
  {
    id: "Channel4.uk",
    name: "Channel 4",
    url: "https://www.channel4.com/now/c4",
    category: "General",
    country: "GB",
    priority: 126,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/now/c4",
  },
  {
    id: "E4.uk",
    name: "E4",
    url: "https://www.channel4.com/now/e4",
    category: "General",
    country: "GB",
    priority: 122,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/now/e4",
  },
  {
    id: "More4.uk",
    name: "More4",
    url: "https://www.channel4.com/now",
    category: "General",
    country: "GB",
    priority: 120,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/now",
  },
  {
    id: "Film4.uk",
    name: "Film4",
    url: "https://www.channel4.com/now",
    category: "Movies",
    country: "GB",
    priority: 120,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/now",
  },
  {
    id: "Channel5.uk",
    name: "Channel 5",
    url: "https://www.5.tv/",
    category: "General",
    country: "GB",
    priority: 126,
    sourceName: "5 Official",
    officialUrl: "https://www.5.tv/",
  },
  {
    id: "5USA.uk",
    name: "5USA",
    url: "https://www.5.tv/",
    category: "General",
    country: "GB",
    priority: 120,
    sourceName: "5 Official",
    officialUrl: "https://www.5.tv/",
  },
  {
    id: "5STAR.uk",
    name: "5STAR",
    url: "https://www.5.tv/",
    category: "General",
    country: "GB",
    priority: 120,
    sourceName: "5 Official",
    officialUrl: "https://www.5.tv/",
  },
  {
    id: "5ACTION.uk",
    name: "5ACTION",
    url: "https://www.5.tv/",
    category: "General",
    country: "GB",
    priority: 118,
    sourceName: "5 Official",
    officialUrl: "https://www.5.tv/",
  },
  {
    id: "5SELECT.uk",
    name: "5SELECT",
    url: "https://www.5.tv/",
    category: "General",
    country: "GB",
    priority: 118,
    sourceName: "5 Official",
    officialUrl: "https://www.5.tv/",
  },
  /*
   * Verified worldwide public/news fallbacks. These sit alongside, rather
   * than replace, playlist candidates. They give major international channels
   * a stable direct source when a community entry changes or disappears.
   */
  {
    id: "AlJazeera.qa@English",
    name: "Al Jazeera English",
    url: "https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8",
    category: "News",
    country: "QA",
    priority: 118,
    sourceName: "Al Jazeera Official",
    officialUrl: "https://www.aljazeera.com/live/",
  },
  {
    id: "NHKWorldJapan.jp@SD",
    name: "NHK World-Japan",
    url: "https://masterpl.hls.nhkworld.jp/hls/w/live/smarttv.m3u8",
    category: "News",
    country: "JP",
    priority: 116,
    sourceName: "NHK World Official",
    officialUrl: "https://www3.nhk.or.jp/nhkworld/en/live/",
  },
  {
    id: "ABCNewsLive1.us@SD",
    name: "ABC News Live",
    url: "https://abcnews-streams.akamaized.net/hls/live/2023560/abcnewshudson1/master.m3u8",
    category: "News",
    country: "US",
    priority: 114,
    sourceName: "ABC News Official",
    officialUrl: "https://abcnews.com/Live",
  },
  {
    id: "VoATV.us@SD",
    name: "VOA TV Africa",
    url: "https://voa-ingest.akamaized.net/hls/live/2033874/tvmc06/playlist.m3u8",
    category: "News",
    country: "US",
    priority: 110,
    sourceName: "VOA Official",
    officialUrl: "https://www.voanews.com/",
  },
  {
    id: "france24-en",
    name: "France 24 English",
    url: "https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_5000.m3u8",
    category: "News",
    country: "FR",
    priority: 108,
    sourceName: "France 24 Official",
    officialUrl: "https://www.france24.com/en/live",
  },
  {
    id: "france24-ar",
    name: "France 24 Arabic",
    url: "https://live.france24.com/hls/live/2037222/F24_AR_HI_HLS/master_5000.m3u8",
    category: "News",
    country: "FR",
    priority: 104,
    sourceName: "France 24 Official",
    officialUrl: "https://www.france24.com/ar/live",
  },
  {
    id: "dw-english",
    name: "DW English",
    url: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/stream03/streamPlaylist.m3u8",
    category: "News",
    country: "DE",
    priority: 106,
    sourceName: "DW Official",
    officialUrl: "https://www.dw.com/en/live-tv/channel-english",
  },
  {
    id: "SkyNews.uk",
    name: "Sky News",
    url: "https://linear021-gb-hls1-prd-ak.cdn.skycdp.com/Content/HLS_001_hd/Live/channel(skynews)/index_mob.m3u8",
    category: "News",
    country: "GB",
    priority: 116,
    sourceName: "Sky News Official",
    geoRestricted: true,
    officialUrl: "https://news.sky.com/watch-live",
  },
  {
    id: "GBNews.uk",
    name: "GB News",
    url: "https://live-gbnews.simplestreamcdn.com/live5/gbnews/bitrate1.isml/manifest.m3u8",
    category: "News",
    country: "GB",
    priority: 114,
    sourceName: "GB News Official",
    officialUrl: "https://www.gbnews.com/",
  },
  {
    id: "TalkTV.uk",
    name: "Talk",
    url: "https://488f4ce4.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctZ2JfVGFsa19ITFM/playlist.m3u8",
    category: "News",
    country: "GB",
    priority: 112,
    sourceName: "Talk Official",
    officialUrl: "https://talk.tv/play/talkradio?video=true",
  },
  {
    id: "BloombergTVEurope.uk",
    name: "Bloomberg TV Europe",
    url: "https://www.bloomberg.com/media-manifest/streams/eu.m3u8",
    category: "News",
    country: "GB",
    priority: 108,
    sourceName: "Bloomberg Official",
    officialUrl: "https://www.bloomberg.com/live",
  },
  {
    id: "TRTWorld.tr",
    name: "TRT World",
    url: "https://tv-trtworld.medya.trt.com.tr/master.m3u8",
    category: "News",
    country: "TR",
    priority: 108,
    sourceName: "TRT World Official",
    officialUrl: "https://www.trtworld.com/live/europe",
  },
  {
    id: "bbc-radio-1",
    name: "BBC Radio 1",
    url: "https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio%3d320000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 112,
  },
  {
    id: "bbc-radio-1xtra",
    name: "BBC Radio 1Xtra",
    url: "https://as-hls-ww-live.akamaized.net/pool_92079267/live/ww/bbc_1xtra/bbc_1xtra.isml/bbc_1xtra-audio%3d96000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 110,
  },
  {
    id: "bbc-radio-2",
    name: "BBC Radio 2",
    url: "https://as-hls-ww-live.akamaized.net/pool_74208725/live/ww/bbc_radio_two/bbc_radio_two.isml/bbc_radio_two-audio%3d320000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 112,
  },
  {
    id: "bbc-radio-3",
    name: "BBC Radio 3",
    url: "https://as-hls-ww-live.akamaized.net/pool_23461179/live/ww/bbc_radio_three/bbc_radio_three.isml/bbc_radio_three-audio%3d320000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 110,
  },
  {
    id: "bbc-radio-4",
    name: "BBC Radio 4",
    url: "https://as-hls-ww-live.akamaized.net/pool_55057080/live/ww/bbc_radio_fourfm/bbc_radio_fourfm.isml/bbc_radio_fourfm-audio%3d320000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 112,
  },
  {
    id: "bbc-radio-4-extra",
    name: "BBC Radio 4 Extra",
    url: "https://as-hls-ww-live.akamaized.net/pool_26173715/live/ww/bbc_radio_four_extra/bbc_radio_four_extra.isml/bbc_radio_four_extra-audio%3d96000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 109,
  },
  {
    id: "bbc-radio-5-live",
    name: "BBC Radio 5 Live",
    url: "https://as-hls-ww-live.akamaized.net/pool_89021708/live/ww/bbc_radio_five_live/bbc_radio_five_live.isml/bbc_radio_five_live-audio%3d320000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 112,
  },
  {
    id: "bbc-radio-5-sports-extra",
    name: "BBC Radio 5 Sports Extra",
    url: "https://as-hls-uk-live.akamaized.net/pool_47700285/live/uk/bbc_radio_five_live_sports_extra/bbc_radio_five_live_sports_extra.isml/bbc_radio_five_live_sports_extra-audio%3d96000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 109,
  },
  {
    id: "bbc-radio-6-music",
    name: "BBC Radio 6 Music",
    url: "https://as-hls-ww-live.akamaized.net/pool_81827798/live/ww/bbc_6music/bbc_6music.isml/bbc_6music-audio%3d320000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 111,
  },
  {
    id: "bbc-asian-network",
    name: "BBC Asian Network",
    url: "https://as-hls-ww-live.akamaized.net/pool_22108647/live/ww/bbc_asian_network/bbc_asian_network.isml/bbc_asian_network-audio%3d96000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 108,
  },
  {
    id: "bbc-world-service",
    name: "BBC World Service",
    url: "https://as-hls-ww-live.akamaized.net/pool_87948813/live/ww/bbc_world_service/bbc_world_service.isml/bbc_world_service-audio%3d96000.norewind.m3u8",
    category: "Radio",
    country: "GB",
    priority: 110,
  },
  {
    id: "greatest-hits-radio",
    name: "Greatest Hits Radio",
    url: "https://www.hellorayo.co.uk/greatest-hits/london",
    category: "Radio",
    country: "GB",
    priority: 103,
    sourceName: "Rayo Official",
    officialUrl: "https://www.hellorayo.co.uk/greatest-hits/london",
  },
];

const CACHE_MS =
  15 * 60 * 1000;

let cache = null;
let cacheAt = 0;
let inflight = null;

const attr = (
  line,
  name
) => {
  const match =
    String(
      line || ""
    ).match(
      new RegExp(
        `${name}="([^"]*)"`,
        "i"
      )
    );

  return match?.[1] || "";
};

const cleanChannelName = (
  value
) =>
  String(
    value || ""
  )
    .replace(
      /[ⓈⒼⓎⓉ]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

const normaliseChannelNameForKey =
  (
    value
  ) =>
    cleanChannelName(
      value
    )
      .toLowerCase()
      .replace(
        /\[[^\]]*(?:geo|not 24\/7|sd|hd|fhd|uhd|4k|1080|720|576|480)[^\]]*\]/gi,
        " "
      )
      .replace(
        /\([^)]*(?:geo|not 24\/7|sd|hd|fhd|uhd|4k|1080|720|576|480)[^)]*\)/gi,
        " "
      )
      .replace(
        /\b(?:2160p?|4k|uhd|1080p?|fhd|720p?|hd|576p?|480p?|sd)\b/gi,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

const classifyUrl = (
  url
) => {
  const value =
    String(
      url || ""
    ).trim();

  const lower =
    value.toLowerCase();

  if (
    /(?:youtube\.com|youtu\.be)/i.test(
      lower
    ) ||
    /(?:twitch\.tv)/i.test(
      lower
    ) ||
    /(?:dailymotion\.com|dai\.ly)/i.test(
      lower
    )
  ) {
    return "external";
  }

  return "direct";
};

const streamFormat = (
  url
) => {
  const value =
    String(
      url || ""
    ).toLowerCase();

  if (
    /\.m3u8(?:[?#]|$)/i.test(
      value
    )
  ) {
    return "hls";
  }

  if (
    /\.mpd(?:[?#]|$)/i.test(
      value
    )
  ) {
    return "dash";
  }

  if (
    /\.(?:mp3|aac|m4a|ogg|opus)(?:[?#]|$)/i.test(
      value
    )
  ) {
    return "audio";
  }

  if (
    /\.(?:mp4|m4v|webm)(?:[?#]|$)/i.test(
      value
    )
  ) {
    return "file";
  }

  if (
    /\.(?:ts|m2ts)(?:[?#]|$)/i.test(
      value
    )
  ) {
    return "mpegts";
  }

  return "unknown";
};

const isUnsupportedProtocol = (
  url
) =>
  /^(?:rtmp|rtsp|udp|rtp|acestream|sop):/i.test(
    String(
      url || ""
    ).trim()
  );

const pageIsHttps = () => {
  if (
    typeof window ===
    "undefined"
  ) {
    return true;
  }

  return (
    String(
      window.location
        ?.protocol ||
        "https:"
    ) === "https:"
  );
};

const isMixedContentUrl = (
  url
) =>
  pageIsHttps() &&
  /^http:\/\//i.test(
    String(
      url || ""
    ).trim()
  );

const qualityFromText = (
  value
) => {
  const text =
    String(
      value || ""
    ).toLowerCase();

  if (
    /\b(?:2160p?|4k|uhd)\b/.test(
      text
    )
  ) {
    return 2160;
  }

  if (
    /\b1080p?\b|\bfhd\b/.test(
      text
    )
  ) {
    return 1080;
  }

  if (
    /\b720p?\b|\bhd\b/.test(
      text
    )
  ) {
    return 720;
  }

  if (
    /\b576p?\b/.test(
      text
    )
  ) {
    return 576;
  }

  if (
    /\b480p?\b|\bsd\b/.test(
      text
    )
  ) {
    return 480;
  }

  return 0;
};

const feedSuffix = (
  tvgId
) => {
  const id =
    String(
      tvgId || ""
    );

  const at =
    id.indexOf(
      "@"
    );

  return at >= 0
    ? id
        .slice(
          at + 1
        )
        .trim()
        .toUpperCase()
    : "";
};

const looksLikeUkFeed = (
  channel
) => {
  const country =
    String(
      channel?.country ||
        ""
    ).toUpperCase();

  const group =
    String(
      channel?.group ||
        ""
    ).toLowerCase();

  const id =
    String(
      channel?.tvgId ||
        channel?.id ||
        ""
    ).toLowerCase();

  const suffix =
    feedSuffix(
      channel?.tvgId ||
        channel?.id
    );

  if (
    /^(?:US|USA|CA|CANADA|AU|AUS|NZ|IN|INDIA|ASIA|AFRICA)$/i.test(
      suffix
    )
  ) {
    return false;
  }

  return (
    country === "GB" ||
    country === "UK" ||
    /(?:^|\.)uk(?:@|$)/i.test(
      id
    ) ||
    group === "uk" ||
    group.includes(
      "united kingdom"
    ) ||
    group.includes(
      "great britain"
    )
  );
};

const requiresOfficialUkPlatform = (channel) => {
  const name = String(channel?.name || "").trim();

  return /^(?:ITV(?:1|2|3|4|Be)?|Channel\s*4|E4|More4|Film4|Channel\s*5|5USA|5STAR|5ACTION|5SELECT)\b/i.test(
    name
  );
};

const browserCompatibility = (
  channel
) => {
  const url =
    String(
      channel?.url ||
        ""
    ).trim();

  const kind =
    channel?.kind ||
    classifyUrl(
      url
    );

  const format =
    streamFormat(
      url
    );

  if (!url) {
    return {
      browserPlayable:
        false,

      browserReason:
        "Missing URL",

      format,
    };
  }

  if (
    kind ===
    "external"
  ) {
    return {
      browserPlayable:
        true,

      browserReason:
        "",

      format:
        "external",
    };
  }

  /*
   * ITV, Channel 4 and 5 normally deliver live television through their own
   * authenticated/DRM web players. Do not promote unknown relay URLs from
   * community playlists as if they were official streams. Their official
   * launch entries remain visible and open the broadcaster's own player.
   */
  if (
    kind === "direct" &&
    requiresOfficialUkPlatform(channel)
  ) {
    return {
      browserPlayable: false,
      browserReason: "Use the broadcaster's official live service",
      format,
    };
  }

  if (
    isUnsupportedProtocol(
      url
    )
  ) {
    return {
      browserPlayable:
        false,

      browserReason:
        "Unsupported stream protocol",

      format,
    };
  }

  if (
    format ===
    "dash"
  ) {
    const mseAvailable =
      typeof window !== "undefined" &&
      Boolean(
        window.MediaSource ||
          window.WebKitMediaSource
      );

    return {
      browserPlayable:
        mseAvailable,

      browserReason:
        mseAvailable
          ? ""
          : "MPEG-DASH needs Media Source Extensions on this device",

      format,
    };
  }

  if (
    isMixedContentUrl(
      url
    )
  ) {
    return {
      browserPlayable:
        false,

      browserReason:
        "HTTP stream blocked on HTTPS app",

      format,
    };
  }

  if (
    channel?.requiresHeaders
  ) {
    return {
      browserPlayable:
        false,

      browserReason:
        "Stream requires custom request headers",

      format,
    };
  }

  return {
    browserPlayable:
      true,

    browserReason:
      "",

    format,
  };
};

const sourceScore = (
  channel
) => {
  let score =
    Number(
      channel?.sourcePriority ||
        0
    ) * 12;

  score += Math.round(
    liveTvUrlScore(channel?.url) * 0.35
  );

  const quality =
    Number(
      channel?.quality ||
        0
    );

  const url =
    String(
      channel?.url ||
        ""
    );

  const format =
    channel?.format ||
    streamFormat(
      url
    );

  if (
    /^https:\/\//i.test(
      url
    )
  ) {
    score +=
      1800;
  }

  if (
    format ===
    "hls"
  ) {
    score +=
      1600;
  }

  if (
    format ===
    "audio"
  ) {
    score +=
      1400;
  }

  if (
    format ===
    "file"
  ) {
    score +=
      900;
  }

  if (
    format ===
    "mpegts"
  ) {
    score +=
      700;
  }

  if (
    quality >=
    2160
  ) {
    score +=
      800;
  } else if (
    quality >=
    1080
  ) {
    score +=
      650;
  } else if (
    quality >=
    720
  ) {
    score +=
      500;
  } else if (
    quality >=
    576
  ) {
    score +=
      250;
  } else if (
    quality > 0
  ) {
    score +=
      80;
  }

  if (
    channel?.kind ===
    "external"
  ) {
    score -=
      400;
  }

  if (
    channel?.notAlwaysOn
  ) {
    score -=
      250;
  }

  if (
    channel?.standardDefinition
  ) {
    score -=
      80;
  }

  if (
    channel
      ?.geoAvailableHere
  ) {
    score +=
      450;
  } else if (
    channel?.geoBlocked
  ) {
    score -=
      1800;
  }

  if (
    looksLikeUkFeed(
      channel
    ) &&
    LIVE_TV_REGION ===
      "GB"
  ) {
    score +=
      1000;
  }

  if (
    channel
      ?.browserPlayable ===
    false
  ) {
    score -=
      100000;
  }

  return score;
};

const inferTags = ({
  sourceCategory,
  group,
  name,
  country,
}) => {
  const tags =
    new Set();

  const joined =
    `${sourceCategory || ""} ${
      group || ""
    } ${
      name || ""
    }`.toLowerCase();

  if (
    sourceCategory
  ) {
    tags.add(
      sourceCategory
    );
  }

  if (
    /sport/.test(
      joined
    )
  ) {
    tags.add(
      "Sports"
    );
  }

  if (
    /movie|cinema|film/.test(
      joined
    )
  ) {
    tags.add(
      "Movies"
    );
  }

  if (
    /news/.test(
      joined
    )
  ) {
    tags.add(
      "News"
    );
  }

  if (
    /radio|\bfm\b/.test(
      joined
    )
  ) {
    tags.add(
      "Radio"
    );
  }

  if (
    /music/.test(
      joined
    )
  ) {
    tags.add(
      "Music"
    );
  }

  if (
    /kids|children|family/.test(
      joined
    )
  ) {
    tags.add(
      "Kids"
    );
  }

  if (
    /documentary|science/.test(
      joined
    )
  ) {
    tags.add(
      "Documentary"
    );
  }

  if (
    /series|entertainment/.test(
      joined
    )
  ) {
    tags.add(
      "Entertainment"
    );
  }

  if (
    /united kingdom|\buk\b|great britain/.test(
      joined
    ) ||
    /^(gb|uk)$/i.test(
      String(
        country || ""
      )
    )
  ) {
    tags.add(
      "United Kingdom"
    );
  }

  return [
    ...tags,
  ];
};

const parseExtHttp = (
  line
) => {
  const raw =
    String(
      line || ""
    )
      .replace(
        /^#EXTHTTP:/i,
        ""
      )
      .trim();

  if (!raw) {
    return {};
  }

  try {
    const data =
      JSON.parse(
        raw
      );

    return {
      referrer:
        data?.referrer ||
        data?.referer ||
        data?.Referer ||
        data?.Referrer ||
        "",

      userAgent:
        data?.[
          "user-agent"
        ] ||
        data?.userAgent ||
        data?.UserAgent ||
        "",
    };
  } catch {
    return {};
  }
};

export function parseFreeTvPlaylist(
  text,
  source =
    LIVE_TV_SOURCES[0]
) {
  const lines =
    String(
      text || ""
    ).split(
      /\r?\n/
    );

  const channels =
    [];

  let current =
    null;

  for (
    const rawLine of
    lines
  ) {
    const line =
      rawLine.trim();

    if (!line) {
      continue;
    }

    if (
      line.startsWith(
        "#EXTINF"
      )
    ) {
      const comma =
        line.indexOf(
          ","
        );

      const rawName =
        comma >= 0
          ? line
              .slice(
                comma + 1
              )
              .trim()
          : attr(
              line,
              "tvg-name"
            ) ||
            "Unknown";

      const name =
        cleanChannelName(
          rawName
        ) ||
        "Unknown";

      const logo =
        attr(
          line,
          "tvg-logo"
        );

      const tvgId =
        attr(
          line,
          "tvg-id"
        );

      const country =
        attr(
          line,
          "tvg-country"
        );

      const group =
        attr(
          line,
          "group-title"
        ) ||
        source.category ||
        country ||
        "Other";

      const channelNumber =
        attr(
          line,
          "tvg-chno"
        );

      const quality =
        qualityFromText(
          `${rawName} ${line}`
        );

      const geoRestricted =
        rawName.includes(
          "Ⓖ"
        ) ||
        /\bgeo[- ]?blocked\b/i.test(
          rawName
        ) ||
        /\bgeo[- ]?restricted\b/i.test(
          rawName
        );

      current = {
        id:
          tvgId ||
          "",

        name,
        rawName,
        logo,
        tvgId,
        country,
        group,
        channelNumber,

        url:
          "",

        kind:
          "direct",

        format:
          "unknown",

        standardDefinition:
          rawName.includes(
            "Ⓢ"
          ) ||
          quality ===
            480,

        geoRestricted,

        geoAvailableHere:
          false,

        geoBlocked:
          false,

        notAlwaysOn:
          /not 24\/7/i.test(
            rawName
          ),

        youtube:
          rawName.includes(
            "Ⓨ"
          ),

        twitch:
          rawName.includes(
            "Ⓣ"
          ),

        insecure:
          false,

        mixedContent:
          false,

        requiresHeaders:
          false,

        referrer:
          "",

        userAgent:
          "",

        browserPlayable:
          true,

        browserReason:
          "",

        quality,

        sourceId:
          source.id,

        sourceName:
          source.name,

        sourcePriority:
          source.priority,

        sourceCategory:
          source.category,

        tags:
          [],

        alternatives:
          [],
      };

      continue;
    }

    if (!current) {
      continue;
    }

    if (
      /^#EXTVLCOPT:http-referrer=/i.test(
        line
      )
    ) {
      current.referrer =
        line
          .replace(
            /^#EXTVLCOPT:http-referrer=/i,
            ""
          )
          .trim();

      continue;
    }

    if (
      /^#EXTVLCOPT:http-user-agent=/i.test(
        line
      )
    ) {
      current.userAgent =
        line
          .replace(
            /^#EXTVLCOPT:http-user-agent=/i,
            ""
          )
          .trim();

      continue;
    }

    if (
      /^#EXTHTTP:/i.test(
        line
      )
    ) {
      const headers =
        parseExtHttp(
          line
        );

      current.referrer =
        headers.referrer ||
        current.referrer;

      current.userAgent =
        headers.userAgent ||
        current.userAgent;

      continue;
    }

    if (
      line.startsWith(
        "#"
      )
    ) {
      continue;
    }

    const url =
      line;

    current.url =
      url;

    current.kind =
      classifyUrl(
        url
      );

    current.insecure =
      /^http:\/\//i.test(
        url
      );

    current.mixedContent =
      isMixedContentUrl(
        url
      );

    current.requiresHeaders =
      Boolean(
        current.referrer ||
        current.userAgent
      );

    current.geoAvailableHere =
      current.geoRestricted &&
      LIVE_TV_REGION ===
        "GB" &&
      looksLikeUkFeed(
        current
      );

    current.geoBlocked =
      current.geoRestricted &&
      !current
        .geoAvailableHere;

    current.tags =
      inferTags({
        sourceCategory:
          current
            .sourceCategory,

        group:
          current.group,

        name:
          current.name,

        country:
          current.country,
      });

    const compatibility =
      browserCompatibility(
        current
      );

    current.browserPlayable =
      compatibility
        .browserPlayable;

    current.browserReason =
      compatibility
        .browserReason;

    current.format =
      compatibility.format;

    current.score =
      sourceScore(
        current
      );

    current.id =
      current.id ||
      `${source.id}:${
        current.country ||
        current.group
      }:${
        current.name
      }:${url}`;

    if (url) {
      channels.push(
        current
      );
    }

    current =
      null;
  }

  return channels;
}

const dedupeKey = (
  channel
) => {
  const tvgId =
    String(
      channel?.tvgId ||
        ""
    )
      .trim()
      .toLowerCase()
      // Resolution-only suffixes describe the same station, not a region.
      // Keeping them separate produced duplicate ITV/5 rows when an official
      // launch entry and an HD community entry were both present.
      .replace(/@(sd|hd|fhd|uhd|4k)$/i, "");

  if (tvgId) {
    return `id:${tvgId}`;
  }

  const name =
    normaliseChannelNameForKey(
      channel?.name
    );

  const country =
    String(
      channel?.country ||
        ""
    )
      .trim()
      .toLowerCase();

  return `name:${name}|country:${country}`;
};

const dedupeMergedChannels =
  (
    channels
  ) => {
    const groups =
      new Map();

    for (
      const channel of
      channels || []
    ) {
      if (
        !channel?.url ||
        !channel?.name
      ) {
        continue;
      }

      const key =
        dedupeKey(
          channel
        );

      if (
        !groups.has(
          key
        )
      ) {
        groups.set(
          key,
          []
        );
      }

      groups
        .get(
          key
        )
        .push(
          channel
        );
    }

    const merged =
      [];

    for (
      const candidates of
      groups.values()
    ) {
      const uniqueByUrl =
        [];

      const seenUrls =
        new Set();

      for (
        const candidate of
        candidates
      ) {
        const urlKey =
          String(
            candidate?.url ||
              ""
          ).trim();

        if (
          !urlKey ||
          seenUrls.has(
            urlKey
          )
        ) {
          continue;
        }

        seenUrls.add(
          urlKey
        );

        uniqueByUrl.push(
          candidate
        );
      }

      const browserCandidates =
        uniqueByUrl.filter(
          (
            candidate
          ) =>
            candidate
              ?.browserPlayable !==
            false
        );

      /*
       * Keep an official broadcaster row visible even on an older browser
       * that cannot play its MPEG-DASH feed itself. Live TV can then offer
       * the broadcaster's official viewing page instead of making BBC One,
       * BBC Two, etc. disappear completely from the catalogue.
       */
      const visibleCandidates =
        browserCandidates.length > 0
          ? [...browserCandidates]
          : uniqueByUrl.filter((candidate) =>
              Boolean(candidate?.officialUrl)
            );

      if (
        visibleCandidates.length ===
        0
      ) {
        continue;
      }

      visibleCandidates.sort(
        (
          a,
          b
        ) =>
          Number(
            b?.score ||
              0
          ) -
          Number(
            a?.score ||
              0
          )
      );

      const best =
        visibleCandidates[0];

      if (!best) {
        continue;
      }

      const tags =
        new Set();

      const sources =
        new Set();

      for (
        const candidate of
        uniqueByUrl
      ) {
        (
          candidate.tags ||
          []
        ).forEach(
          (
            tag
          ) =>
            tags.add(
              tag
            )
        );

        if (
          candidate.sourceName
        ) {
          sources.add(
            candidate.sourceName
          );
        }
      }

      const rankedAlternatives = uniqueByUrl
        .filter((candidate) => candidate !== best)
        .sort(
          (a, b) =>
            Number(b?.browserPlayable !== false) -
              Number(a?.browserPlayable !== false) ||
            Number(b?.score || 0) - Number(a?.score || 0)
        );

      const officialCandidate =
        uniqueByUrl.find((candidate) => Boolean(candidate?.officialUrl)) ||
        null;

      merged.push({
        ...best,

        tags: [
          ...tags,
        ],

        sourceNames: [
          ...sources,
        ],

        /*
         * Keep device-only/header-required candidates as backups. Browser
         * playback filters them back out, while the native Fire TV bridge can
         * pass their headers and cleartext URL to Media3 when appropriate.
         */
        alternatives: rankedAlternatives,

        officialUrl:
          best?.officialUrl || officialCandidate?.officialUrl || "",

        officialLabel:
          best?.officialLabel || officialCandidate?.officialLabel || "",

        duplicateCount:
          uniqueByUrl.length,

        rejectedSourceCount:
          Math.max(
            0,
            uniqueByUrl.length -
              browserCandidates.length
          ),
      });
    }

    return merged.sort(
      (
        a,
        b
      ) => {
        const aUk =
          a.tags?.includes(
            "United Kingdom"
          )
            ? 1
            : 0;

        const bUk =
          b.tags?.includes(
            "United Kingdom"
          )
            ? 1
            : 0;

        if (
          aUk !==
          bUk
        ) {
          return (
            bUk -
            aUk
          );
        }

        const scoreDiff =
          Number(
            b?.score ||
              0
          ) -
          Number(
            a?.score ||
              0
          );

        if (
          scoreDiff !==
          0
        ) {
          return scoreDiff;
        }

        return String(
          a?.name ||
            ""
        ).localeCompare(
          String(
            b?.name ||
              ""
          )
        );
      }
    );
  };

const runtimePlaylistSources = () => {
  const custom = readCustomLiveSources()
    .filter((source) => source.active !== false && source.kind === "playlist")
    .map((source) => ({
      ...source,
      priority: healthAdjustedPriority(source),
      category: source.category || "Custom",
    }));

  return [
    ...LIVE_TV_SOURCES.map((source) => ({
      ...source,
      priority: healthAdjustedPriority(source),
    })),
    ...custom,
  ];
};

const directChannelRows = () => {
  const custom = readCustomLiveSources()
    .filter((source) => source.active !== false && source.kind === "direct")
    .map((source) => ({
      id: source.tvgId || source.id,
      name: source.name,
      url: source.url,
      logo: source.logo || "",
      category: source.category || "Custom",
      country: "",
      priority: healthAdjustedPriority(source),
      sourceId: source.id,
      sourceName: source.name,
    }));

  const direct = [
    ...PUBLIC_DIRECT_CHANNELS.map((channel) => ({
      ...channel,
      sourceId: `public-direct:${channel.id}`,
      sourceName: channel.sourceName || "Public Direct",
    })),
    ...custom,
  ];

  return direct.flatMap((channel) => {
    const source = {
      id: channel.sourceId || channel.id,
      name: channel.sourceName || channel.name,
      priority: Number(channel.priority || 100),
      category: channel.category || "Other",
    };

    const attributes = [
      channel.id ? `tvg-id="${channel.id}"` : "",
      channel.logo ? `tvg-logo="${channel.logo}"` : "",
      channel.country ? `tvg-country="${channel.country}"` : "",
      channel.category ? `group-title="${channel.category}"` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return parseFreeTvPlaylist(
      `#EXTM3U\n#EXTINF:-1 ${attributes},${channel.name}\n${channel.url}\n`,
      source
    ).map((row) => ({
      ...row,
      geoRestricted: Boolean(channel.geoRestricted || row.geoRestricted),
      geoAvailableHere:
        Boolean(channel.geoRestricted) && LIVE_TV_REGION === "GB"
          ? true
          : row.geoAvailableHere,
      geoBlocked:
        Boolean(channel.geoRestricted) && LIVE_TV_REGION !== "GB"
          ? true
          : row.geoBlocked,
      officialUrl: channel.officialUrl || row.officialUrl || "",
      officialSource: Boolean(channel.sourceName === "BBC Official"),
    }));
  });
};

const fetchSource =
  async (
    source
  ) => {
    const startedAt = Date.now();

    try {
      const response =
        await fetch(
          source.url,
          {
            cache:
              "no-store",

            headers: {
              Accept:
                "application/vnd.apple.mpegurl,text/plain,*/*",
            },
          }
        );

      if (
        !response.ok
      ) {
        const error = `${source.name} returned ${response.status}`;

        recordSourceHealth(source.id, {
          success: false,
          error,
          latencyMs: Date.now() - startedAt,
        });

        return {
          source,
          channels: [],
          error,
        };
      }

      const text =
        await response.text();

      const channels = parseFreeTvPlaylist(
        text,
        source
      );

      recordSourceHealth(source.id, {
        success: channels.length > 0,
        error: channels.length > 0 ? "" : "Playlist contained no playable channels",
        latencyMs: Date.now() - startedAt,
        loaded: channels.length,
      });

      return {
        source,
        channels,
        error: channels.length > 0 ? "" : "Playlist contained no playable channels",
      };
    } catch (
      error
    ) {
      const message =
        error?.message ||
        `${source.name} could not be loaded`;

      recordSourceHealth(source.id, {
        success: false,
        error: message,
        latencyMs: Date.now() - startedAt,
      });

      return {
        source,
        channels: [],
        error: message,
      };
    }
  };

export async function getFreeTvChannels({
  force = false,
} = {}) {
  const fresh =
    cache &&
    !force &&
    Date.now() -
      cacheAt <
      CACHE_MS;

  if (fresh) {
    return cache;
  }

  if (
    inflight &&
    !force
  ) {
    return inflight;
  }

  const playlistSources = runtimePlaylistSources();
  const directChannels = directChannelRows();

  inflight =
    Promise.all(
      playlistSources.map(
        (
          source
        ) =>
          fetchSource(
            source
          )
      )
    )
      .then(
        (
          results
        ) => {
          const allChannels = [
            ...directChannels,
            ...results.flatMap(
              (
                result
              ) =>
                result.channels ||
                []
            ),
          ];

          const channels =
            dedupeMergedChannels(
              allChannels
            );

          const sourceStatus =
            results.map(
              (
                result
              ) => ({
                id:
                  result
                    .source
                    .id,

                name:
                  result
                    .source
                    .name,

                url:
                  result
                    .source
                    .url,

                loaded:
                  (
                    result.channels ||
                    []
                  ).length,

                error:
                  result.error ||
                  "",
              })
            );

          const browserRejectedCount =
            allChannels.filter(
              (
                channel
              ) =>
                channel
                  ?.browserPlayable ===
                false
            ).length;

          cache = {
            channels,
            sourceStatus,

            rawCount:
              allChannels.length,

            dedupedCount:
              channels.length,

            browserRejectedCount,

            region:
              LIVE_TV_REGION,
          };

          cacheAt =
            Date.now();

          return cache;
        }
      )
      .finally(
        () => {
          inflight =
            null;
        }
      );

  return inflight;
}

export function clearFreeTvCache() {
  cache =
    null;

  cacheAt =
    0;

  inflight =
    null;
}

if (typeof window !== "undefined") {
  const marker = "__MG_SOURCE_REGISTRY_CACHE_LISTENER__";

  if (!window[marker]) {
    window[marker] = true;
    window.addEventListener(sourceRegistryEvent, clearFreeTvCache);
  }
}

export async function findChannelsByTitle(
  title
) {
  const target =
    cleanChannelName(
      title
    ).toLowerCase();

  if (
    !target ||
    target.length <
      3
  ) {
    return [];
  }

  const result =
    await getFreeTvChannels();

  return (
    result?.channels ||
    []
  )
    .filter(
      (
        channel
      ) => {
        const name =
          cleanChannelName(
            channel?.name
          ).toLowerCase();

        if (!name) {
          return false;
        }

        return (
          (
            name.length >=
              4 &&
            name.includes(
              target
            )
          ) ||
          (
            target.length >=
              4 &&
            target.includes(
              name
            )
          )
        );
      }
    )
    .slice(
      0,
      3
    );
}
