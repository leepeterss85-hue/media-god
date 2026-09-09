import { readLiveTvSettings } from "@/components/mg/liveTvPreferences";

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
    priority: 99,
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
  cacheRegionalLock = null;
  inflight = null;
}

export const SKY_STREAM_OVERRIDES = {
  "sky mix": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skyshowcase/index.m3u8",
  "sky sports main event": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skysportsmainevent/index.m3u8",
  "sky sports premier league": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skysportspl/index.m3u8",
  "sky sports football": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skysportsfootball/index.m3u8",
  "sky sports cricket": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skysportscricket/index.m3u8",
  "sky sports f1": "", 
  "sky sports arena": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skysportsarena/index.m3u8",
  "sky sports golf": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skysportsgolf/index.m3u8",
  "sky sports action": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skysportsaction/index.m3u8",
  "sky showcase": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-skyshowcase/index.m3u8",
  "bt sport 1": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-tntsports1/index.m3u8",
  "bt sport 2": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-tntsports2/index.m3u8",
  "tnt sports 1": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-tntsports1/index.m3u8",
  "tnt sports 2": "https://media-god1.leepeterss85.workers.dev/?url=https://live20.bozztv.com/trn03/gin-tntsports2/index.m3u8",
};

const CACHE_MS = 15 * 60 * 1000;

let cache = null;
let cacheAt = 0;
let cacheRegionalLock = null;
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
    .replace(/\|\.uk\.\|/gi, "")
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
    group.includes("great britain") ||
    group.includes("sport")
  );
};

const regionalAvailability = (channel) => {
  const regionalLock = Boolean(readLiveTvSettings().regionalLock);
  const restricted = Boolean(channel?.geoRestricted);
  const availableInConfiguredRegion =
    LIVE_TV_REGION === "GB" && looksLikeUkFeed(channel);

  return {
    geoAvailableHere:
      restricted && (!regionalLock || availableInConfiguredRegion),
    geoBlocked:
      restricted && regionalLock && !availableInConfiguredRegion,
  };
};

const browserCompatibility = (channel) => {
  const url = String(channel?.url || "").trim();
  const kind = channel?.kind || classifyUrl(url);
  const format = streamFormat(url);

  if (!url) return { browserPlayable: false, browserReason: "Missing URL", format };
  if (kind === "external") return { browserPlayable: true, browserReason: "", format: "external" };
  if (isUnsupportedProtocol(url)) return { browserPlayable: false, browserReason: "Unsupported stream protocol", format };
  if (format === "dash") return { browserPlayable: true, browserReason: "", format };
  if (isMixedContentUrl(url)) return { browserPlayable: true, browserReason: "", format }; // Allow via worker proxy
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
  if (format === "mpegts") score += 1500;
  if (format === "audio") score += 1400;
  if (format === "file") score += 900;

  if (quality >= 2160) score += 800;
  else if (quality >= 1080) score += 650;
  else if (quality >= 720) score += 500;
  else if (quality > 0) score += 80;

  if (looksLikeUkFeed(channel) && LIVE_TV_REGION === "GB") score += 2000;
  if (channel?.browserPlayable === false) score -= 100000;

  return score;
};

const inferTags = ({ sourceCategory, group, name, country }) => {
  const tags = new Set();
  const joined = `${sourceCategory || ""} ${group || ""} ${name || ""}`.toLowerCase();

  if (sourceCategory) tags.add(sourceCategory);
  if (/sport|football|cricket|golf|f1/.test(joined)) tags.add("Sports");
  if (/movie|cinema|film/.test(joined)) tags.add("Movies");
  if (/news/.test(joined)) tags.add("News");
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
      const geoRestricted = rawName.includes("Ⓖ") || /\bgeo[- ]?blocked\b/i.test(rawName) || /\bgeo[- ]?restricted\b/i.test(rawName) || source.id === "nimeyer-uk-list";

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
        standardDefinition: quality === 480,
        geoRestricted,
        geoAvailableHere: false,
        geoBlocked: false,
        notAlwaysOn: false,
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

    let url = line;
    // Route all custom or Gist stream URLs through your Cloudflare Worker proxy to bypass geo/IP limits
    if (/^(?:http|https):\/\//i.test(url) && !url.includes("media-god1.leepeterss85.workers.dev")) {
      if (source.id === "nimeyer-uk-list" || source.id.includes("gigoplast") || current.geoRestricted || looksLikeUkFeed(current)) {
        url = `https://media-god1.leepeterss85.workers.dev/?url=${encodeURIComponent(url)}`;
      }
    }

    current.url = url;
    current.kind = classifyUrl(url);
    current.insecure = /^http:\/\//i.test(url);
    current.mixedContent = false; // Handled by worker proxy wrapper
    current.requiresHeaders = Boolean(current.referrer || current.userAgent);

    const geoState = regionalAvailability(current);
    current.geoAvailableHere = geoState.geoAvailableHere;
    current.geoBlocked = geoState.geoBlocked;

    current.tags = inferTags({
      sourceCategory: current.sourceCategory,
      group: current.group,
      name: current.name,
      country: current.country,
    });

    if (source.id === "nimeyer-uk-list" || source.id.startsWith("gigoplast")) {
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
  // Ensure unique stream paths from custom repository lists don't overwrite each other
  if (channel?.sourceId === "nimeyer-uk-list" || channel?.sourceId?.startsWith("gigoplast")) {
    return `repo:${channel.sourceId}:${channel.url}`;
  }
  const tvgId = String(channel?.tvgId || "").trim().toLowerCase();
  if (tvgId && !tvgId.includes("01tv.fr")) return `id:${tvgId}`;
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
  const regionalLock = Boolean(readLiveTvSettings().regionalLock);

  if (
    !force &&
    cache &&
    cacheRegionalLock === regionalLock &&
    now - cacheAt < CACHE_MS
  ) {
    return cache;
  }

  if (!force && inflight && cacheRegionalLock === regionalLock) return inflight;

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
    cacheRegionalLock = regionalLock;
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
