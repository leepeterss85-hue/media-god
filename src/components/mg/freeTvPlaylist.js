export const FREE_TV_PLAYLIST_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

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

export function parseFreeTvPlaylist(text) {
  const lines = String(text || "").split(/\r?\n/);
  const channels = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",");

      const rawName =
        comma >= 0
          ? line.slice(comma + 1).trim()
          : attr(line, "tvg-name") || "Unknown";

      const name = cleanChannelName(rawName) || "Unknown";
      const logo = attr(line, "tvg-logo");
      const tvgId = attr(line, "tvg-id");
      const country = attr(line, "tvg-country");
      const group =
        attr(line, "group-title") ||
        country ||
        "Other";

      const channelNumber = attr(
        line,
        "tvg-chno"
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
          rawName.includes("Ⓢ"),
        geoBlocked:
          rawName.includes("Ⓖ"),
        youtube:
          rawName.includes("Ⓨ"),
        twitch:
          rawName.includes("Ⓣ"),
        insecure: false,
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
    current.kind = classifyUrl(url);
    current.insecure =
      /^http:\/\//i.test(url);

    current.id =
      current.id ||
      `${current.country || current.group}:${current.name}:${url}`;

    if (url) {
      channels.push(current);
    }

    current = null;
  }

  return channels;
}

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

  inflight = fetch(FREE_TV_PLAYLIST_URL, {
    cache: "no-store",
    headers: {
      Accept:
        "application/vnd.apple.mpegurl,text/plain,*/*",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Free-TV playlist request failed (${response.status})`
        );
      }

      return response.text();
    })
    .then((text) => {
      const parsed =
        parseFreeTvPlaylist(text);

      cache = parsed;
      cacheAt = Date.now();

      return parsed;
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

export function findChannelsByTitle(title) {
  const target =
    cleanChannelName(title)
      .toLowerCase();

  if (!target || target.length < 3) {
    return Promise.resolve([]);
  }

  return getFreeTvChannels().then(
    (channels) =>
      channels
        .filter((channel) => {
          const name =
            cleanChannelName(
              channel?.name
            ).toLowerCase();

          if (!name) {
            return false;
          }

          return (
            (name.length >= 4 &&
              name.includes(target)) ||
            (target.length >= 4 &&
              target.includes(name))
          );
        })
        .slice(0, 3)
  );
}
