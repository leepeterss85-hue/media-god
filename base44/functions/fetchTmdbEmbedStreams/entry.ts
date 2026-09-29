import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";

const trim = (value) => String(value ?? "").trim();

const validTmdbId = (value) => {
  const id = trim(value);
  return /^[1-9][0-9]{0,9}$/.test(id) ? id : "";
};

const validIndex = (value) => {
  const text = trim(value);
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const normalizeBase = (value) => {
  let url;
  try {
    url = new URL(trim(value));
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};

const sanitizeHeaders = (headers) => {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    if (key.length > 200 || value.length > 4000) continue;
    out[key] = value;
  }
  return out;
};

const normalizeStream = (raw, index) => {
  const url = trim(raw?.url || raw?.src);
  if (!/^https?:\/\//i.test(url)) return null;

  const provider = trim(raw?.provider || raw?.name || "tmdb-embed");
  const quality = trim(raw?.quality);
  const title = trim(raw?.title);

  const labelParts = [provider];
  if (quality) labelParts.push(quality);
  if (title && !title.toLowerCase().includes(provider.toLowerCase())) {
    labelParts.push(title.slice(0, 80));
  }

  return {
    id: `tmdb-embed-${provider}-${index}`,
    label: labelParts.join(" • "),
    type: "provider",
    src: url,
    url,
    addon: `TMDB Embed • ${provider}`,
    provider,
    quality: quality || "",
    headers: sanitizeHeaders(raw?.headers),
    subtitles: Array.isArray(raw?.subtitles)
      ? raw.subtitles
          .map((sub) => ({
            url: trim(sub?.url),
            language: trim(sub?.lang || sub?.language || ""),
            label: trim(sub?.lang || sub?.language || sub?.label || ""),
          }))
          .filter((sub) => /^https?:\/\//i.test(sub.url))
          .slice(0, 12)
      : [],
    browserFallback: false,
  };
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const tmdbId = validTmdbId(body?.tmdb_id ?? body?.tmdbId);
    if (!tmdbId) {
      return Response.json({ error: "A valid tmdb_id is required." }, { status: 400 });
    }

    const rawType = trim(body?.media_type ?? body?.mediaType).toLowerCase();
    const mediaType = rawType === "tv" || rawType === "series" || rawType === "episode" ? "series" : "movie";

    const season = validIndex(body?.season);
    const episode = validIndex(body?.episode);

    const baseUrl = normalizeBase(secrets.get("TMDB_EMBED_API_URL"));
    if (!baseUrl) {
      return Response.json({
        streams: [],
        diagnostics: [{ name: "TMDB Embed API", status: "disabled", message: "TMDB_EMBED_API_URL not configured." }],
        addons_checked: 0,
        reason: "TMDB Embed API URL is not configured.",
      });
    }

    const target = new URL(`${baseUrl}/api/streams/${mediaType}/${tmdbId}`);
    if (mediaType === "series" && season != null && episode != null) {
      target.searchParams.set("season", String(season));
      target.searchParams.set("episode", String(episode));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let response;
    try {
      response = await fetch(target.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return Response.json({
        streams: [],
        diagnostics: [{
          name: "TMDB Embed API",
          status: "error",
          message: `Upstream returned ${response.status} ${response.statusText}.`,
        }],
        addons_checked: 1,
        reason: `TMDB Embed API responded ${response.status}.`,
      });
    }

    const data = await response.json().catch(() => null);
    const rawStreams = Array.isArray(data) ? data : Array.isArray(data?.streams) ? data.streams : [];

    const streams = rawStreams
      .map((raw, index) => normalizeStream(raw, index))
      .filter(Boolean)
      .slice(0, 60);

    return Response.json({
      streams,
      diagnostics: [{
        name: "TMDB Embed API",
        status: streams.length > 0 ? "ok" : "empty",
        message: `${streams.length} stream${streams.length === 1 ? "" : "s"} from ${baseUrl}`,
      }],
      addons_checked: 1,
      reason: streams.length > 0 ? "" : "TMDB Embed API returned no playable streams.",
    });
  } catch (error) {
    return Response.json({ error: error?.message || "TMDB Embed lookup failed." }, { status: 500 });
  }
}