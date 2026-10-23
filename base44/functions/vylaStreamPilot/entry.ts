import { secrets } from "base44:runtime";

/**
 * Opt-in manual movie/episode Vyla source discovery. The Railway gateway
 * token stays in Base44 secrets and is never sent to the browser.
 * Returned candidates are NOT playback- or English-audio-verified.
 */
const reply = (value: unknown, code = 200) => Response.json(value, {
  status: code,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const positive = (value: unknown, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
};
const safeUrl = (value: unknown) => {
  try {
    const u = new URL(String(value ?? "").trim());
    if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443" ||
        /^(?:localhost|.*\.local|.*\.localhost)$/i.test(u.hostname) ||
        /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname) ||
        u.hostname.includes(":")) return "";
    return u.toString();
  } catch { return ""; }
};
const normalise = (event: any, type: string, season: number | null, episode: number | null) => {
  if (event?.type !== "source" || !event.source || typeof event.source !== "object") return null;
  const src = event.source;
  if (type === "tv" && (
    positive(src.season, 100) && positive(src.season, 100) !== season ||
    positive(src.episode, 1000) && positive(src.episode, 1000) !== episode
  )) return null;
  const url = safeUrl(src.url);
  // Vyla runs on Railway. ElfHosted/Comet/MediaFusion direct links minted
  // there can be tied to Railway's IP rather than the viewer's device.
  // Skip only those server-bound candidates; other Vyla links remain available.
  const urlHost = (() => {
    try { return new URL(url).hostname; } catch { return ""; }
  })();
  const sourceProvider = [
    src.addon, src.provider, src.providerName, src.sourceName, src.source_name,
  ].filter(Boolean).join(" ");
  if (/(^|\.)elfhosted\.com$/i.test(urlHost) ||
      /\b(?:elf\s*hosted|aiostreams?|aio\s*streams?|media\s*fusion|mediafusion)\b/i.test(sourceProvider) ||
      !url || src.requiresHeaders === true ||
      src.proxyHeaders && Object.keys(src.proxyHeaders).length > 0) return null;
  const lang = String(src.audioLanguage || src.language || src.lang || "").trim().toLowerCase();
  if (lang && !/^(?:en|eng|english|en-[a-z]{2}|multi|mul|und|unknown)$/i.test(lang)) return null;
  const label = String(src.label || src.quality || "Direct source")
    .replace(/[\r\n\t]/g, " ").slice(0, 140);
  if (/\b(?:trailer|teaser|commentary|preview|sample|stream not found)\b/i.test(label)) return null;
  return {
    label: `Vyla · ${label}`,
    addon: "Vyla (test)",
    type: "url",
    src: url,
    url,
    ...(type === "tv" ? { season, episode } : {}),
    audioLanguage: lang || undefined,
    verifiedPlaybackPolicy: "strict",
    launchQualified: false,
    runtimeQualificationFallback: true,
  };
};
export default async function (request: Request) {
  if (request.method !== "POST") return reply({ status: "METHOD_NOT_ALLOWED", streams: [] }, 405);
  const enabled = String(secrets.get("VYLA_MANUAL_TEST_ENABLED") || "").toLowerCase() === "true";
  const base = safeUrl(secrets.get("VYLA_STREAM_API_URL"));
  const token = String(secrets.get("VYLA_STREAM_API_TOKEN") || "").trim();
  if (!enabled || !base || !token) return reply({ status: "DISABLED", streams: [] });
  let input: any;
  try { input = await request.json(); } catch { return reply({ status: "INVALID_INPUT", streams: [] }, 400); }
  const type = input?.media_type === "tv" ? "tv" : input?.media_type === "movie" ? "movie" : "";
  const id = positive(input?.tmdb_id ?? input?.tmdbId, 999999999);
  const season = type === "tv" ? positive(input?.season, 100) : null;
  const episode = type === "tv" ? positive(input?.episode, 1000) : null;
  if (!type || !id || type === "tv" && (!season || !episode))
    return reply({ status: "INVALID_IDENTITY", streams: [] }, 400);
  const endpoint = new URL(type, base.endsWith("/") ? base : base + "/");
  endpoint.searchParams.set("id", String(id));
  if (type === "tv") {
    endpoint.searchParams.set("season", String(season));
    endpoint.searchParams.set("episode", String(episode));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  let bytes = 0, buffer = "", done = false, upstreamStatus = 0;
  const streams: any[] = [];
  const seen = new Set<string>();
  try {
    const response = await fetch(endpoint.toString(), {
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
    });
    upstreamStatus = response.status;
    if (!response.ok || !response.body)
      return reply({ status: "UPSTREAM_UNAVAILABLE", streams: [], http_status: upstreamStatus });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (!done && streams.length < 6 && bytes < 262144) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 65536) break;
        buffer = buffer.replace(/\r\n/g, "\n");
        while (buffer.includes("\n\n")) {
          const cut = buffer.indexOf("\n\n");
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const payload = frame.split("\n").filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim()).join("\n");
          if (!payload || payload.length > 32000) continue;
          let value: any;
          try { value = JSON.parse(payload); } catch { continue; }
          if (value?.type === "done") { done = true; break; }
          const candidate = normalise(value, type, season, episode);
          if (candidate && !seen.has(candidate.url)) {
            seen.add(candidate.url);
            streams.push(candidate);
          }
          if (streams.length >= 6) break;
        }
      }
    } finally {
      try { await reader.cancel(); } catch { /* upstream already closed */ }
    }
    return reply({
      status: streams.length ? "CANDIDATES" : "NO_CANDIDATES",
      streams, upstream_finished: done, http_status: upstreamStatus,
    });
  } catch (error: any) {
    // Harmless diagnostics: error category only, never include credentials,
    // request headers, stream URLs, or exception text in responses.
    const category = String(error?.name || "Unknown").slice(0, 40);
    const cause = String(error?.cause?.code || error?.code || "unknown").slice(0, 40);
    return reply({ status: streams.length ? "PARTIAL" : "UPSTREAM_UNAVAILABLE", streams,
      http_status: upstreamStatus, diagnostic: { category, cause } });
  } finally {
    clearTimeout(timeout);
  }
}
