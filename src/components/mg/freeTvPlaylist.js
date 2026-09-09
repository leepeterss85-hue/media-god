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
    url: "https://iptv-org.github.io/iptv/index.m3u",
    priority: 70,
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
  {
    id: "gigoplast-tv",
    name: "Gigoplast TV",
    url: "https://raw.githubusercontent.com/gigoplast/iptv-1/master/tv.m3u",
    priority: 85,
    category: "Gigoplast",
  },
  {
    id: "gigoplast-premium",
    name: "Gigoplast Premium",
    url: "https://raw.githubusercontent.com/gigoplast/iptv-1/master/OSN%20%2C%20BEIN%20%2CART%20%2CFOX%20%2C%20SKY.m3u8",
    priority: 84,
    category: "Gigoplast",
  },
  {
    id: "nimeyer-uk-list",
    name: "Nimeyer UK Gist",
    url: "https://gist.githubusercontent.com/nimeyer22/4dc9fe46ca393956801bf65625168477/raw/UKList.m3u",
    priority: 98,
    category: "United Kingdom",
  },
];

export const FREE_TV_PLAYLIST_URL =
  LIVE_TV_SOURCES[0].url;

export const LIVE_TV_REGION = "GB";

export const PUBLIC_DIRECT_CHANNELS = [
  {
    id: "BBCAlba.uk@Official",
    tvgId: "BBCAlba.uk",
    name: "BBC ALBA",
    url: "https://www.bbc.co.uk/iplayer/live/bbcalba",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcalba",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "CBBC.uk@Official",
    tvgId: "CBBC.uk",
    name: "CBBC",
    url: "https://www.bbc.co.uk/iplayer/live/cbbc",
    category: "Kids",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/cbbc",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "CBeebies.uk@Official",
    tvgId: "CBeebies.uk",
    name: "CBeebies",
    url: "https://www.bbc.co.uk/iplayer/live/cbeebies",
    category: "Kids",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/cbeebies",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "BBCParliament.uk@Official",
    tvgId: "BBCParliament.uk",
    name: "BBC Parliament",
    url: "https://www.bbc.co.uk/iplayer/live/bbcparliament",
    category: "News",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcparliament",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "BBCNews.uk@Official",
    tvgId: "BBCNews.uk",
    name: "BBC News",
    url: "https://www.bbc.co.uk/iplayer/live/bbcnews",
    category: "News",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcnews",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "S4C.uk@Official",
    tvgId: "S4C.uk",
    name: "S4C",
    url: "https://www.s4c.cymru/clic/",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "S4C Clic Official",
    officialUrl: "https://www.s4c.cymru/clic/",
    officialLabel: "Open S4C Clic",
    kind: "external",
  },
  {
    id: "STV.uk@Official",
    tvgId: "STV.uk",
    name: "STV",
    url: "https://player.stv.tv/live",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "STV Player Official",
    officialUrl: "https://player.stv.tv/live",
    officialLabel: "Open STV Player",
    kind: "external",
  },
  {
    id: "Channel4.uk@Official",
    tvgId: "Channel4.uk",
    name: "Channel 4",
    url: "https://www.channel4.com/",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/",
    officialLabel: "Open Channel 4",
    kind: "external",
  },
  {
    id: "E4.uk@Official",
    tvgId: "E4.uk",
    name: "E4",
    url: "https://www.channel4.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/",
    officialLabel: "Open Channel 4",
    kind: "external",
  },
  {
    id: "More4.uk@Official",
    tvgId: "More4.uk",
    name: "More4",
    url: "https://www.channel4.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/",
    officialLabel: "Open Channel 4",
    kind: "external",
  },
  {
    id: "Film4.uk@Official",
    tvgId: "Film4.uk",
    name: "Film4",
    url: "https://www.channel4.com/",
    category: "Movies",
    country: "GB",
    priority: 60,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/",
    officialLabel: "Open Channel 4",
    kind: "external",
  },
  {
    id: "Channel5.uk@Official",
    tvgId: "Channel5.uk",
    name: "Channel 5",
    url: "https://www.channel5.com/",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "5USA.uk@Official",
    tvgId: "5USA.uk",
    name: "5USA",
    url: "https://www.channel5.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "5Star.uk@Official",
    tvgId: "5Star.uk",
    name: "5STAR",
    url: "https://www.channel5.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "5Action.uk@Official",
    tvgId: "5Action.uk",
    name: "5ACTION",
    url: "https://www.channel5.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "5Select.uk@Official",
    tvgId: "5Select.uk",
    name: "5SELECT",
    url: "https://www.channel5.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "ITV1.uk@Official",
    name: "ITV1",
    url: "https://www.itv.com/watch?channel=itv",
    category: "General",
    country: "GB",
    priority: 132,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv",
    kind: "external",
  },
  {
    id: "ITV2.uk@Official",
    name: "ITV2",
    url: "https://www.itv.com/watch?channel=itv2",
    category: "General",
    country: "GB",
    priority: 130,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv2",
    kind: "external",
  },
  {
    id: "ITV3.uk@Official",
    name: "ITV3",
    url: "https://www.itv.com/watch?channel=itv3",
    category: "General",
    country: "GB",
    priority: 128,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv3",
    kind: "external",
  },
  {
    id: "ITV4.uk@Official",
    name: "ITV4",
    url: "https://www.itv.com/watch?channel=itv4",
    category: "General",
    country: "GB",
    priority: 128,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv4",
    kind: "external",
  },
  {
    id: "ITVBe.uk@Official",
    name: "ITVBe",
    url: "https://www.itv.com/watch?channel=itvbe",
    category: "General",
    country: "GB",
    priority: 126,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itvbe",
    kind: "external",
  },
];

export function clearFreeTvCache() {
  cache = null;
  cacheAt = 0;
  inflight = null;
}

export const SKY_STREAM_OVERRIDES = {
  "sky sports main event": "https://live20.bozztv.com/trn03/gin-skysportsmainevent/index.m3u8",
  "sky sports premier league": "https://live20.bozztv.com/trn03/gin-skysportspl/index.m3u8",
  "sky sports football": "https://live20.bozztv.com/trn03/gin-skysportsfootball/index.m3u8",
  "sky sports cricket": "https://live20.bozztv.com/trn03/gin-skysportscricket/index.m3u8",
  "sky sports f1": "", 
  "sky showcase": "https://live20.bozztv.com/trn03/gin-skyshowcase/index.m3u8",
  "sky news": "https://skynews2-plutolive-vo.akamaized.net/playlist.m3u8",
  "gb news": "https://gbnews-live.rakuten.tv/v1/master.m3u8",
  "talktv": "https://live-talktv.uksse.wurl.tv/playlist.m3u8",
  "bloomberg tv": "https://live.bloomberg.com/kinesis/us-live.m3u8",
  "trt world": "https://trtworld.ios.bund.cpl.delvenetworks.com/playlist.m3u8",
  "tnt sports 1": "https://live20.bozztv.com/trn03/gin-tntsports1/index.m3u8",
  "tnt sports 2": "https://live20.bozztv.com/trn03/gin-tntsports2/index.m3u8",
  "tnt sports 3": "https://live20.bozztv.com/trn03/gin-tntsports3/index.m3u8",
  "tnt sports 4": "https://live20.bozztv.com/trn03/gin-tntsports4/index.m3u8",
  // Geo-Lock Override Channels Routed via media-god1.leepeterss85.workers.dev
  "bbc one": "https://media-god1.leepeterss85.workers.dev/?url=https://vs-hls-push-uk-live.akamaized.net/x=4/i=live-ebg/master.m3u8",
  "bbc one hd": "https://media-god1.leepeterss85.workers.dev/?url=https://vs-hls-push-uk-live.akamaized.net/x=4/i=live-ebg/master.m3u8",
  "bbc two": "https://media-god1.leepeterss85.workers.dev/?url=https://vs-hls-push-uk-live.akamaized.net/x=4/i=live-ebg/master.m3u8",
  "bbc two hd": "https://media-god1.leepeterss85.workers.dev/?url=https://vs-hls-push-uk-live.akamaized.net/x=4/i=live-ebg/master.m3u8",
  "bbc three": "https://media-god1.leepeterss85.workers.dev/?url=https://vs-hls-push-uk-live.akamaized.net/x=4/i=live-ebg/master.m3u8",
  "bbc four": "https://media-god1.leepeterss85.workers.dev/?url=https://vs-hls-push-uk-live.akamaized.net/x=4/i=live-ebg/master.m3u8",
  "bbc news": "https://media-god1.leepeterss85.workers.dev/?url=https://vs-hls-push-uk-live.akamaized.net/x=4/i=live-ebg/master.m3u8",
  "itv 1": "https://media-god1.leepeterss85.workers.dev/?url=https://itv-live1-linear.itv.com/itv1/master.m3u8",
  "itv1 hd": "https://media-god1.leepeterss85.workers.dev/?url=https://itv-live1-linear.itv.com/itv1/master.m3u8",
  "itv 2": "https://media-god1.leepeterss85.workers.dev/?url=https://itv-live1-linear.itv.com/itv2/master.m3u8",
  "itv 3": "https://media-god1.leepeterss85.workers.dev/?url=https://itv-live1-linear.itv.com/itv3/master.m3u8",
  "itv 4": "https://media-god1.leepeterss85.workers.dev/?url=https://itv-live1-linear.itv.com/itv4/master.m3u8",
  "channel 4": "https://media-god1.leepeterss85.workers.dev/?url=https://c4-live.akamaized.net/hls/live/2027204/ch4_hls_master/master.m3u8",
  "channel 4 hd": "https://media-god1.leepeterss85.workers.dev/?url=https://c4-live.akamaized.net/hls/live/2027204/ch4_hls_master/master.m3u8",
  "e4": "https://media-god1.leepeterss85.workers.dev/?url=https://c4-live.akamaized.net/hls/live/2027204/ch4_hls_master/master.m3u8",
  "film4": "https://media-god1.leepeterss85.workers.dev/?url=https://c4-live.akamaized.net/hls/live/2027204/ch4_hls_master/master.m3u8",
  "channel 5": "https://media-god1.leepeterss85.workers.dev/?url=https://my5-live.akamaized.net/hls/live/609062/master.m3u8",
  "channel 5 hd": "https://media-god1.leepeterss85.workers.dev/?url=https://my5-live.akamaized.net/hls/live/609062/master.m3u8",
  "5star": "https://media-god1.leepeterss85.workers.dev/?url=https://my5-live.akamaized.net/hls/live/609062/master.m3u8",
  "5usa": "https://media-god1.leepeterss85.workers.dev/?url=https://my5-live.akamaized.net/hls/live/609062/master.m3u8",
  "stv": "https://media-god1.leepeterss85.workers.dev/?url=https://itv-live1-linear.itv.com/itv1/master.m3u8",
  "s4c": "https://media-god1.leepeterss85.workers.dev/?url=https://s4c-live.s4c.co.uk/hls/live/2012480/s4c_low/master.m3u8",
};

const CACHE_MS = 15 * 60 * 1000;

let cache = null;
let cacheAt = 0;
let inflight = null;

const attr = (line, name) => {
  const match = String(line || "").match(
    new RegExp(`${name}="([^"]*)"`, "i")
  );
  return match?.[1] || "";
};

const cleanChannelName = (value) =>
  String(value || "")
    .replace(/[ⓈⒼⓎⓉ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normaliseChannelNameForKey = (value) =>
  cleanChannelName(value)
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
    .replace(/\s+/g, " ")
    .trim();

const canonicalUkChannelFamily = (channel) => {
  const name = normaliseChannelNameForKey(channel?.name);
  const id = String(channel?.tvgId || channel?.id || "").toLowerCase();
  if (/^bbc one\b/i.test(name) || /\bbbcOne\.uk\b/i.test(id)) return "bbc-one";
  if (/^bbc two\b/i.test(name) || /\bbbcTwo\.uk\b/i.test(id)) return "bbc-two";
  if (/^itv\s*1\b/i.test(name) || /\bitv1\.uk\b/i.test(id)) return "itv1";
  if (/^itv\s*2\b/i.test(name) || /\bitv2\.uk\b/i.test(id)) return "itv2";
  if (/^itv\s*3\b/i.test(name) || /\bitv3\.uk\b/i.test(id)) return "itv3";
  if (/^itv\s*4\b/i.test(name) || /\bitv4\.uk\b/i.test(id)) return "itv4";
  if (/^itv\s*be\b/i.test(name) || /\bitvbe\.uk\b/i.test(id)) return "itvbe";

  return "";
};

const canonicalFamilyName = (family) =>
  ({
    "bbc-one": "BBC One",
    "bbc-two": "BBC Two",
    itv1: "ITV1",
    itv2: "ITV2",
    itv3: "ITV3",
    itv4: "ITV4",
    itvbe: "ITVBe",
  })[family] || "";

const isExactFamilyName = (candidate, family) => {
  const expected = normaliseChannelNameForKey(canonicalFamilyName(family));
  const actual = normaliseChannelNameForKey(candidate?.name);
  return Boolean(expected && actual === expected);
};

const classifyUrl = (url) => {
  const value = String(url || "").trim().toLowerCase();
  if (
    /(?:youtube\.com|youtu\.be)/i.test(value) ||
    /(?:twitch\.tv)/i.test(value) ||
    /(?:dailymotion\.com|dai\.ly)/i.test(value)
  ) {
    return "external";
  }
  return "direct";
};

const streamFormat = (url) => {
  const value = String(url || "").toLowerCase();
  if (/\.m3u8(?:[?#&]|$)/i.test(value)) return "hls";
  if (/\.mpd(?:[?#&]|$)/i.test(value)) return "dash";
  if (/\.(?:mp3|aac|m4a|ogg|opus)(?:[?#&]|$)/i.test(value)) return "audio";
  if (/\.(?:mp4|m4v|webm)(?:[?#&]|$)/i.test(value)) return "file";
  if (/\.(?:ts|m2ts)(?:[?#&]|$)/i.test(value)) return "mpegts";
  return "unknown";
};

const isUnsupportedProtocol = (url) =>
  /^(?:rtmp|rtsp|udp|rtp|acestream|sop):/i.test(String(url || "").trim());

const pageIsHttps = () => {
  if (typeof window === "undefined") return true;
  return String(window.location?.protocol || "https:") === "https:";
};

const isMixedContentUrl = (url) =>
  pageIsHttps() && /^http:\/\//i.test(String(url || "").trim());

const qualityFromText = (value) => {
  const text = String(value || "").toLowerCase();
  if (/\b(?:2160p?|4k|uhd)\b/.test(text)) return 2160;
  if (/\b1080p?\b|\bfhd\b/.test(text)) return 1080;
  if (/\b720p?\b|\bhd\b/.test(text)) return 720;
  if (/\b576p?\b/.test(text)) return 576;
  if (/\b480p?\b|\bsd\b/.test(text)) return 480;
  return 0;
};

const feedSuffix = (tvgId) => {
  const id = String(tvgId || "");
  const at = id.indexOf("@");
  return at >= 0 ? id.slice(at + 1).trim().toUpperCase() : "";
};

const looksLikeUkFeed = (channel) => {
  const country = String(channel?.country || "").toUpperCase();
  const group = String(channel?.group || "").toLowerCase();
  const id = String(channel?.tvgId || channel?.id || "").toLowerCase();
  const suffix = feedSuffix(channel?.tvgId || channel?.id);

  if (/^(?:US|USA|CA|CANADA|AU|AUS|NZ|IN|INDIA|ASIA|AFRICA)$/i.test(suffix)) {
    return false;
  }

  return (
    country === "GB" ||
    country === "UK" ||
    /(?:^|\.)uk(?:@|$)/i.test(id) ||
    group === "uk" ||
    group.includes("united kingdom") ||
    group.includes("great britain")
  );
};

const browserCompatibility = (channel) => {
  const url = String(channel?.url || "").trim();
  const kind = channel?.kind || classifyUrl(url);
  const format = streamFormat(url);

  if (!url) return { browserPlayable: false, browserReason: "Missing URL", format };
  if (kind === "external") return { browserPlayable: true, browserReason: "", format: "external" };
  if (isUnsupportedProtocol(url)) return { browserPlayable: false, browserReason: "Unsupported stream protocol", format };
  if (format === "dash") return { browserPlayable: true, browserReason: "", format };
  if (isMixedContentUrl(url)) return { browserPlayable: false, browserReason: "HTTP stream blocked on HTTPS app", format };
  if (channel?.requiresHeaders) return { browserPlayable: false, browserReason: "Stream requires custom request headers", format };

  return { browserPlayable: true, browserReason: "", format };
};

const sourceScore = (channel) => {
  let score = Number(channel?.sourcePriority || 0) * 12;
  const quality = Number(channel?.quality || 0);
  const url = String(channel?.url || "");
  const format = channel?.format || streamFormat(url);

  if (/^https:\/\//i.test(url)) score += 1800;
  if (format === "hls") score += 1600;
  if (format === "audio") score += 1400;
  if (format === "file") score += 900;
  if (format === "mpegts") score += 700;

  if (quality >= 2160) score += 800;
  else if (quality >= 1080) score += 650;
  else if (quality >= 720) score += 500;
  else if (quality >= 576) score += 250;
  else if (quality > 0) score += 80;

  if (channel?.kind === "external") score -= 400;
  if (channel?.notAlwaysOn) score -= 250;
  if (channel?.standardDefinition) score -= 80;

  if (channel?.geoAvailableHere) score += 450;
  else if (channel?.geoBlocked) score -= 1800;

  if (looksLikeUkFeed(channel) && LIVE_TV_REGION === "GB") score += 1000;
  if (channel?.browserPlayable === false) score -= 100000;

  return score;
};

const inferTags = ({ sourceCategory, group, name, country }) => {
  const tags = new Set();
  const joined = `${sourceCategory || ""} ${group || ""} ${name || ""}`.toLowerCase();

  if (sourceCategory) tags.add(sourceCategory);
  if (/sport/.test(joined)) tags.add("Sports");
  if (/movie|cinema|film/.test(joined)) tags.add("Movies");
  if (/news/.test(joined)) tags.add("News");
  if (/radio|\bfm\b/.test(joined)) tags.add("Radio");
  if (/music/.test(joined)) tags.add("Music");
  if (/kids|children|family/.test(joined)) tags.add("Kids");
  if (/documentary|science/.test(joined)) tags.add("Documentary");
  if (/series|entertainment/.test(joined)) tags.add("Entertainment");
  if (/united kingdom|\buk\b|great britain/.test(joined) || /^(gb|uk)$/i.test(String(country || ""))) {
    tags.add("United Kingdom");
  }

  return [...tags];
};

const parseExtHttp = (line) => {
  const raw = String(line || "").replace(/^#EXTHTTP:/i, "").trim();
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return {
      referrer: data?.referrer || data?.referer || data?.Referer || data?.Referrer || "",
      userAgent: data?.["user-agent"] || data?.userAgent || data?.UserAgent || "",
    };
  } catch {
    return {};
  }
};

export function parseFreeTvPlaylist(text, source = LIVE_TV_SOURCES[0]) {
  const lines = String(text || "").split(/\r?\n/);
  const channels = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",");
      const rawName = comma >= 0 ? line.slice(comma + 1).trim() : attr(line, "tvg-name") || "Unknown";
      const name = cleanChannelName(rawName) || "Unknown";
      const logo = attr(line, "tvg-logo");
      const tvgId = attr(line, "tvg-id");
      const country = attr(line, "tvg-country");
      const group = attr(line, "group-title") || source.category || country || "Other";
      const channelNumber = attr(line, "tvg-chno");
      const quality = qualityFromText(`${rawName} ${line}`);
      const geoRestricted = rawName.includes("Ⓖ") || /\bgeo[- ]?blocked\b/i.test(rawName) || /\bgeo[- ]?restricted\b/i.test(rawName);

      current = {
        id: tvgId || "",
        name,
        rawName,
        logo,
        tvgId,
        country,
        group,
        channelNumber,
        url: "",
        kind: "direct",
        format: "unknown",
        standardDefinition: rawName.includes("Ⓢ") || quality === 480,
        geoRestricted,
        geoAvailableHere: false,
        geoBlocked: false,
        notAlwaysOn: /not 24\/7/i.test(rawName),
        youtube: rawName.includes("Ⓨ"),
        twitch: rawName.includes("Ⓣ"),
        insecure: false,
        mixedContent: false,
        requiresHeaders: false,
        referrer: "",
        userAgent: "",
        browserPlayable: true,
        browserReason: "",
        quality,
        sourceId: source.id,
        sourceName: source.name,
        sourcePriority: source.priority,
        sourceCategory: source.category,
        tags: [],
        alternatives: [],
      };
      continue;
    }

    if (!current) continue;

    if (/^#EXTVLCOPT:http-referrer=/i.test(line)) {
      current.referrer = line.replace(/^#EXTVLCOPT:http-referrer=/i, "").trim();
      continue;
    }
    if (/^#EXTVLCOPT:http-user-agent=/i.test(line)) {
      current.userAgent = line.replace(/^#EXTVLCOPT:http-user-agent=/i, "").trim();
      continue;
    }
    if (/^#EXTHTTP:/i.test(line)) {
      const headers = parseExtHttp(line);
      current.referrer = headers.referrer || current.referrer;
      current.userAgent = headers.userAgent || current.userAgent;
      continue;
    }
    if (line.startsWith("#")) continue;

    const url = line;
    current.url = url;
    current.kind = classifyUrl(url);
    current.insecure = /^http:\/\//i.test(url);
    current.mixedContent = isMixedContentUrl(url);
    current.requiresHeaders = Boolean(current.referrer || current.userAgent);
    current.geoAvailableHere = current.geoRestricted && LIVE_TV_REGION === "GB" && looksLikeUkFeed(current);
    current.geoBlocked = current.geoRestricted && !current.geoAvailableHere;
    current.tags = inferTags({
      sourceCategory: current.sourceCategory,
      group: current.group,
      name: current.name,
      country: current.country,
    });

    if (source.id.startsWith("gigoplast") || source.id === "nimeyer-uk-list") {
      current.group = "United Kingdom";
      if (!current.tags.includes("United Kingdom")) {
        current.tags.push("United Kingdom");
      }
    }

    const compatibility = browserCompatibility(current);
    current.browserPlayable = compatibility.browserPlayable;
    current.browserReason = compatibility.browserReason;
    current.format = compatibility.format;
    current.score = sourceScore(current);
    current.id = current.id || `${source.id}:${current.country || current.group}:${current.name}:${url}`;

    if (url) channels.push(current);
    current = null;
  }

  return channels;
}

const dedupeKey = (channel) => {
  if (channel?.sourceId?.startsWith("gigoplast") || channel?.sourceId === "nimeyer-uk-list") {
    return `custom:${channel.sourceId}:${channel.url}`;
  }
  const tvgId = String(channel?.tvgId || "").trim().toLowerCase();
  if (tvgId) return `id:${tvgId}`;
  const name = normaliseChannelNameForKey(channel?.name);
  const country = String(channel?.country || "").trim().toLowerCase();
  return `name:${name}|country:${country}`;
};

const dedupeMergedChannels = (channels) => {
  const groups = new Map();
  for (const channel of channels || []) {
    if (!channel?.url || !channel?.name) continue;
    const key = dedupeKey(channel);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(channel);
  }

  const merged = [];
  for (const candidates of groups.values()) {
    const uniqueByUrl = [];
    const seenUrls = new Set();
    for (const candidate of candidates) {
      const urlKey = String(candidate?.url || "").trim();
      if (!urlKey || seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);
      uniqueByUrl.push(candidate);
    }

    const browserCandidates = uniqueByUrl.filter((candidate) => candidate?.browserPlayable !== false);
    if (browserCandidates.length === 0) continue;

    browserCandidates.sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
    const best = browserCandidates[0];
    if (!best) continue;

    const normalisedName = normaliseChannelNameForKey(best.name);
    if (SKY_STREAM_OVERRIDES[normalisedName] !== undefined && SKY_STREAM_OVERRIDES[normalisedName] !== "") {
      best.url = SKY_STREAM_OVERRIDES[normalisedName];
      best.kind = "direct";
      best.browserPlayable = true;
      best.score += 5000;
      if (!best.tags.includes("United Kingdom")) {
        best.tags.push("United Kingdom");
      }
    }

    const tags = new Set();
    const sources = new Set();
    for (const candidate of browserCandidates) {
      sources.add(candidate.sourceName);
      for (const tag of candidate.tags || []) tags.add(tag);
    }

    const alternatives = browserCandidates.slice(1);
    merged.push({
      ...best,
      tags: [...tags],
      sourceNames: [...sources],
      alternatives,
    });
  }

  return merged;
};

export async function getFreeTvChannels(options = {}) {
  const { force = false } = options;
  const now = Date.now();

  if (!force && cache && now - cacheAt < CACHE_MS) return cache;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    const sourceStatus = [];
    const rawChannels = [];
    let rawCount = 0;
    let browserRejectedCount = 0;

    const sortedSources = [...LIVE_TV_SOURCES].sort((a, b) => b.priority - a.priority);

    for (const source of sortedSources) {
      try {
        let response = await fetch(source.url, {
          headers: { Accept: "text/plain, */*" },
        });

        if (!response.ok) {
          const proxyUrl = `https://media-god1.leepeterss85.workers.dev/?url=${encodeURIComponent(source.url)}`;
          response = await fetch(proxyUrl);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        const parsed = parseFreeTvPlaylist(text, source);
        rawCount += parsed.length;

        for (const channel of parsed) {
          if (channel?.browserPlayable === false) browserRejectedCount += 1;
          rawChannels.push(channel);
        }

        sourceStatus.push({ id: source.id, name: source.name, count: parsed.length, error: null });
      } catch (error) {
        sourceStatus.push({ id: source.id, name: source.name, count: 0, error: error?.message || "Failed to fetch" });
      }
    }

    const channels = dedupeMergedChannels(rawChannels);

    channels.sort((a, b) => {
      const ukA = (a?.tags || []).includes("United Kingdom") ? 1 : 0;
      const ukB = (b?.tags || []).includes("United Kingdom") ? 1 : 0;
      if (ukA !== ukB) return ukB - ukA;
      return Number(b?.score || 0) - Number(a?.score || 0);
    });

    const payload = { channels, sourceStatus, rawCount, browserRejectedCount, region: LIVE_TV_REGION, fetchedAt: now };
    cache = payload;
    cacheAt = now;
    inflight = null;
    return payload;
  })().catch((error) => {
    inflight = null;
    throw error;
  });

  return inflight;
}

export function findChannelsByTitle(query) {
  if (!cache || !cache.channels) return [];
  const q = String(query || "").toLowerCase().trim();
  if (!q) return cache.channels;
  return cache.channels.filter((ch) => String(ch?.name || "").toLowerCase().includes(q));
}

export function findDynamicChannelStream(channels, query) {
  const q = String(query || "").toLowerCase().trim();
  const matches = (channels || []).filter(ch => 
    String(ch?.name || "").toLowerCase().includes(q) ||
    String(ch?.group || "").toLowerCase().includes(q)
  );

  if (matches.length === 0) return null;

  matches.sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
  return matches[0]?.url || null;
}
