const idText = (value) => String(value ?? "").trim();

const tmdbId = (media) => {
  const id = idText(media?.tmdbId ?? media?.tmdb_id ?? media?.id);
  return /^[1-9][0-9]{0,8}$/.test(id) ? id : "";
};

const index = (value, minimum) => {
  const valueText = idText(value);
  if (!/^(0|[1-9][0-9]*)$/.test(valueText)) return null;
  const number = Number(valueText);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
};

/** Embed.su addresses a title with a TMDb ID and TV with one exact episode. */
export const buildEmbedSuEmbedUrl = (media = {}) => {
  const type = idText(media.mediaType).toLowerCase();
  if (!["movie", "tv", "episode"].includes(type)) return "";
  const id = tmdbId(media);
  if (!id) return "";
  if (type === "movie") return `https://embed.su/embed/movie/${id}`;

  const season = index(media.season ?? media.rdSeason, 0);
  const episode = index(media.episode ?? media.rdEpisode, 1);
  return season === null || episode === null
    ? ""
    : `https://embed.su/embed/tv/${id}/${season}/${episode}`;
};

const serverHosts = {
  upstream: new Set(["upstream.to"]),
  mixdrop: new Set(["mixdrop.ag", "mixdrop.co"]),
  vidcloud: new Set(["vidcloud.org"]),
};

/**
 * Server buttons are shown only for concrete, recognised embed pages.
 * A provider name alone cannot produce a file ID or a playable URL.
 */
export const hostedEmbedPage = (value) => {
  if (typeof value !== "string" || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const provider = Object.keys(serverHosts).find((key) => serverHosts[key].has(host));
  if (!provider) return null;

  let path = url.pathname;
  if (provider === "mixdrop") {
    const match = path.match(/^\/(?:e|f)\/([a-zA-Z0-9_-]{4,80})\/?$/);
    if (!match) return null;
    path = `/e/${match[1]}`;
  } else if (provider === "upstream") {
    if (!/^\/(?:e\/[a-zA-Z0-9_-]{4,80}(?:\.html)?|embed-[a-zA-Z0-9_-]{4,80}\.html)\/?$/.test(path)) return null;
  } else if (!/^\/(?:embed|e)\/[a-zA-Z0-9_/-]{4,120}\/?$/.test(path)) {
    return null;
  }

  url.pathname = path;
  url.search = "";
  url.hash = "";
  return { provider, url: url.toString() };
};

export const hostedEmbedLabel = {
  upstream: "UpStream",
  mixdrop: "MixDrop",
  vidcloud: "VidCloud",
};
