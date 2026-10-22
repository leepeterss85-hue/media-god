/*
 * Stateless parsing for the self-hosted Vyla Stream API.
 * The HTTP/SSE boundary is deliberately independent of Media God's player.
 * Sources are candidates, NOT playback-verified English episodes.
 */
const clean = value => String(value ?? "").trim();
const positive = value => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const safeHttps = input => {
  try {
    const url = new URL(clean(input));
    if (url.protocol !== "https:" || url.username || url.password ||
        /^(?:localhost|.*\.localhost|.*\.local)$/i.test(url.hostname) ||
        /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname) ||
        url.hostname.includes(":") || url.port && url.port !== "443") return "";
    return url.toString();
  } catch { return ""; }
};

export const parseVylaSseFrame = frame => {
  const lines = String(frame ?? "").split(/\r?\n/);
  const data = lines.filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart()).join("\n");
  if (!data || data.length > 32000) return null;
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return null;
    const eventType = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
    return { ...parsed, type: parsed.type || eventType || "" };
  } catch { return null; }
};

export const normaliseVylaEpisodeCandidate = (event, context) => {
  if (event?.type !== "source") return null;
  const row = event?.source;
  if (!row || typeof row !== "object") return null;
  const season = positive(context?.season), episode = positive(context?.episode);
  if (!season || !episode || (positive(row.season) && positive(row.season) !== season) ||
      (positive(row.episode) && positive(row.episode) !== episode)) return null;
  const url = safeHttps(row.url);
  if (!url || row.requiresHeaders === true ||
      row.proxyHeaders && Object.keys(row.proxyHeaders).length > 0) return null;
  const declaredLanguage = clean(row.audioLanguage || row.language || row.lang).toLowerCase();
  if (declaredLanguage && !/^(?:en|eng|english|en-[a-z]{2}|multi|mul|und|unknown)$/i.test(declaredLanguage))
    return null;
  const label = clean(row.label || row.quality || "Direct episode").replace(/[\r\n\t]/g, " ").slice(0,150);
  const provider = clean(row.provider || row.source || row.name || "Vyla").replace(/[\r\n\t]/g, " ").slice(0,70);
  if (/\b(?:trailer|teaser|commentary|preview|sample|stream not found)\b/i.test(label)) return null;
  return {
    label: `Vyla · ${label}`, addon: "Vyla",
    provider, type: "url", src: url, url,
    season, episode,
    audioLanguage: declaredLanguage || undefined,
    episodeResolver: "vyla",
    vylaPilotCandidate: true,
    // The API checked the link; the media decoder must STILL prove it works.
    launchQualified: false,
    runtimeQualificationFallback: true,
    runtimeNativeDirect: true,
    runtimeNativeEnglishValidation: true,
  };
};

export const validVylaPilotBase = raw => {
  const url = safeHttps(raw);
  if (!url) return "";
  const parsed = new URL(url);
  if (parsed.search || parsed.hash) return "";
  return url.replace(/\/+$/, "") + "/";
};
