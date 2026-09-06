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

const classifyUrl = (url) => {
  const value = String(url || "").trim();
  const lower = value.toLowerCase();

  if (
    /(?:youtube\.com|youtu\.be)/i.test(lower) ||
    /(?:twitch\.tv)/i.test(lower) ||
    /(?:dailymotion\.com|dai\.ly)/i.test(lower)
  ) {
    return "external";
  }

  return "direct";
};

const qualityFromText = (value) => {
  const text = String(value || "").toLowerCase();

  if (/\b(?:2160p?|4k|uhd)\b/.test(text)) {
    return 2160;
  }

  if (/\b1080p?\b|\bfhd\b/.test(text)) {
    return 1080;
  }

  if (/\b720p?\b|\bhd\b/.test(text)) {
    return 720;
  }

  if (/\b576p?\b/.test(text)) {
    return 576;
  }

  if (/\b480p?\b|\bsd\b/.test(text)) {
    return 480;
  }

  return 0;
};

const sourceScore = (channel) => {
  let score =
    Number(channel?.sourcePriority || 0) * 3;

  const quality =
    Number(channel?.quality || 0);

  const url =
    String(channel?.url || "");

  const rawName =
    String(
      channel?.rawName ||
        channel?.name ||
        ""
    );

  if (quality >= 2160) {
    score += 700;
  } else if (quality >= 1080) {
    score += 500;
  } else if (quality >= 720) {
    score += 320;
  } else if (quality >= 576) {
    score += 100;
  } else if (quality > 0) {
    score -= 120;
  }

  if (/^https:\/\//i.test(url)) {
    score += 120;
  }

  if (/\.m3u8(?:[?#]|$)/i.test(url)) {
    score += 100;
  }

  if (/\.mpd(?:[?#]|$)/i.test(url)) {
    score += 70;
  }

  if (
    /\b(?:hevc|h265|h\.265)\b/i.test(
      rawName
    )
  ) {
    score += 20;
  }

  if (channel?.kind === "external") {
    score -= 350;
  }

  if (channel?.insecure) {
    score -= 80;
  }

  if (channel?.geoBlocked) {
    score -= 70;
  }

  if (channel?.notAlwaysOn) {
    score -= 40;
  }

  if (channel?.standardDefinition) {
    score -= 100;
  }

  return score;
};

const inferTags = ({
  sourceCategory,
  group,
  name,
  country,
}) => {
  const tags = new Set();

  const joined =
    `${sourceCategory || ""} ${
      group || ""
    } ${name || ""}`.toLowerCase();

  if (sourceCategory) {
    tags.add(sourceCategory);
  }

  if (/sport/.test(joined)) {
    tags.add("Sports");
  }

  if (/movie|cinema|film/.test(joined)) {
    tags.add("Movies");
  }

  if (/news/.test(joined)) {
    tags.add("News");
  }

  if (/music/.test(joined)) {
    tags.add("Music");
  }

  if (/kids|children|family/.test(joined)) {
    tags.add("Kids");
  }

  if (/documentary|science/.test(joined)) {
    tags.add("Documentary");
  }

  if (/series|entertainment/.test(joined)) {
    tags.add("Entertainment");
  }

  if (
    /united kingdom|\buk\b|great britain/.test(
      joined
    ) ||
    /^(gb|uk)$/i.test(
      String(country || "")
    )
  ) {
    tags.add("United Kingdom");
  }

  return [...tags];
};

export function parseFreeTvPlaylist(
  text,
  source = LIVE_TV_SOURCES[0]
) {
  const lines = String(text || "").split(
    /\r?\n/
  );

  const channels = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",");

      const rawName =
        comma >= 0
          ? line.slice(comma + 1).trim()
          : attr(line, "tvg-name") ||
            "Unknown";

      const name =
        cleanChannelName(rawName) ||
        "Unknown";

      const logo =
        attr(line, "tvg-logo");

      const tvgId =
        attr(line, "tvg-id");

      const country =
        attr(line, "tvg-country");

      const group =
        attr(line, "group-title") ||
        source.category ||
        country ||
        "Other";

      const channelNumber =
        attr(line, "tvg-chno");

      const quality =
        qualityFromText(
          `${rawName} ${line}`
        );

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

        standardDefinition:
          rawName.includes("Ⓢ") ||
          quality === 480,

        geoBlocked:
          rawName.includes("Ⓖ") ||
          /geo[- ]?blocked/i.test(
            rawName
          ),

        notAlwaysOn:
          /not 24\/7/i.test(rawName),

        youtube:
          rawName.includes("Ⓨ"),

        twitch:
          rawName.includes("Ⓣ"),

        insecure: false,
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

    if (line.startsWith("#")) {
      continue;
    }

    if (!current) {
      continue;
    }

    const url = line;

    current.url = url;
    current.kind =
      classifyUrl(url);

    current.insecure =
      /^http:\/\//i.test(url);

    current.tags = inferTags({
      sourceCategory:
        current.sourceCategory,
      group: current.group,
      name: current.name,
      country: current.country,
    });

    current.score =
      sourceScore(current);

    current.id =
      current.id ||
      `${source.id}:${
        current.country ||
        current.group
      }:${current.name}:${url}`;

    if (url) {
      channels.push(current);
    }

    current = null;
  }

  return channels;
}

const dedupeKey = (channel) => {
  const tvgId =
    String(
      channel?.tvgId || ""
    )
      .trim()
      .toLowerCase();

  if (tvgId) {
    return `id:${tvgId}`;
  }

  const name =
    normaliseChannelNameForKey(
      channel?.name
    );

  const country =
    String(
      channel?.country || ""
    )
      .trim()
      .toLowerCase();

  return `name:${name}|country:${country}`;
};

const dedupeMergedChannels = (
  channels
) => {
  const groups = new Map();

  for (const channel of channels || []) {
    if (
      !channel?.url ||
      !channel?.name
    ) {
      continue;
    }

    const key =
      dedupeKey(channel);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(channel);
  }

  const merged = [];

  for (
    const candidates of
    groups.values()
  ) {
    const uniqueByUrl = [];
    const seenUrls = new Set();

    for (const candidate of candidates) {
      const urlKey =
        String(
          candidate?.url || ""
        ).trim();

      if (
        !urlKey ||
        seenUrls.has(urlKey)
      ) {
        continue;
      }

      seenUrls.add(urlKey);
      uniqueByUrl.push(candidate);
    }

    uniqueByUrl.sort(
      (a, b) =>
        Number(b?.score || 0) -
        Number(a?.score || 0)
    );

    const best = uniqueByUrl[0];

    if (!best) {
      continue;
    }

    const tags = new Set();
    const sources = new Set();

    for (
      const candidate of
      uniqueByUrl
    ) {
      (candidate.tags || []).forEach(
        (tag) => tags.add(tag)
      );

      if (candidate.sourceName) {
        sources.add(
          candidate.sourceName
        );
      }
    }

    merged.push({
      ...best,

      tags: [...tags],

      sourceNames: [
        ...sources,
      ],

      alternatives:
        uniqueByUrl.slice(1),

      duplicateCount:
        uniqueByUrl.length,
    });
  }

  return merged.sort((a, b) => {
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

    if (aUk !== bUk) {
      return bUk - aUk;
    }

    const scoreDiff =
      Number(b?.score || 0) -
      Number(a?.score || 0);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return String(
      a?.name || ""
    ).localeCompare(
      String(b?.name || "")
    );
  });
};

const fetchSource = async (source) => {
  try {
    const response = await fetch(
      source.url,
      {
        cache: "no-store",

        headers: {
          Accept:
            "application/vnd.apple.mpegurl,text/plain,*/*",
        },
      }
    );

    if (!response.ok) {
      return {
        source,
        channels: [],
        error:
          `${source.name} returned ${response.status}`,
      };
    }

    const text =
      await response.text();

    return {
      source,

      channels:
        parseFreeTvPlaylist(
          text,
          source
        ),

      error: "",
    };
  } catch (error) {
    return {
      source,
      channels: [],

      error:
        error?.message ||
        `${source.name} could not be loaded`,
    };
  }
};

export async function getFreeTvChannels({
  force = false,
} = {}) {
  const fresh =
    cache &&
    !force &&
    Date.now() - cacheAt < CACHE_MS;

  if (fresh) {
    return cache;
  }

  if (inflight && !force) {
    return inflight;
  }

  inflight = Promise.all(
    LIVE_TV_SOURCES.map(
      (source) =>
        fetchSource(source)
    )
  )
    .then((results) => {
      const allChannels =
        results.flatMap(
          (result) =>
            result.channels || []
        );

      const channels =
        dedupeMergedChannels(
          allChannels
        );

      const sourceStatus =
        results.map(
          (result) => ({
            id: result.source.id,
            name: result.source.name,
            url: result.source.url,

            loaded:
              (
                result.channels || []
              ).length,

            error:
              result.error || "",
          })
        );

      cache = {
        channels,
        sourceStatus,
        rawCount:
          allChannels.length,
        dedupedCount:
          channels.length,
      };

      cacheAt = Date.now();

      return cache;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function clearFreeTvCache() {
  cache = null;
  cacheAt = 0;
  inflight = null;
}

export function findChannelsByTitle(
  title
) {
  const target =
    cleanChannelName(
      title
    ).toLowerCase();

  if (
    !target ||
    target.length < 3
  ) {
    return Promise.resolve([]);
  }

  return getFreeTvChannels().then(
    (result) =>
      (result?.channels || [])
        .filter((channel) => {
          const name =
            cleanChannelName(
              channel?.name
            ).toLowerCase();

          if (!name) {
            return false;
          }

          return (
            (
              name.length >= 4 &&
              name.includes(target)
            ) ||
            (
              target.length >= 4 &&
              target.includes(name)
            )
          );
        })
        .slice(0, 3)
  );
}
