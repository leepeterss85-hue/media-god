import http from "node:http";
import { createHash } from "node:crypto";
import getTmdbMovies from "./getTmdbMovies.mjs";
import resolveImdb from "./resolveImdb.mjs";
import resolveTvImdb from "./resolveTvImdb.mjs";
import fetchAddonStreams from "./fetchAddonStreams.mjs";
import getEntertainmentNews from "./getEntertainmentNews.mjs";
import getSkipSegments from "./getSkipSegments.mjs";
import getFireTvApkLink from "./getFireTvApkLink.mjs";

// Public film/TV metadata only. Personal account history and Real-Debrid
// credentials are never sent to this service.
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ||
    "https://mysterious-media-vault-pro.base44.app,http://localhost:5173")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
);
const cache = new Map();
const rateLimits = new Map();
let tmdbReady = false;
const checkTmdb = async () => {
  if (!process.env.TMDB_API_KEY) {
    tmdbReady = false;
    console.error("[media-api] TMDB key missing");
    return;
  }
  try {
    const url = new URL("https://api.themoviedb.org/3/configuration");
    url.searchParams.set("api_key", process.env.TMDB_API_KEY);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    tmdbReady = response.ok;
    console.info("[media-api] TMDB upstream", response.ok ? "ready" : "unavailable", response.status);
  } catch {
    tmdbReady = false;
    console.error("[media-api] TMDB upstream unreachable");
  }
};
void checkTmdb();
setInterval(() => void checkTmdb(), 10 * 60_000).unref();
const CACHE_MS = 300_000;
const BODY_LIMIT_BYTES = 16 * 1024;
// Apply quotas to uncached upstream work rather than every cached read.
// Many households and Android TV boxes share an ISP/NAT IP. Previously
// unrelated posters/news/IMDb requests exhausted one global 150/min bucket.
const RATE_WINDOW_MS = 60_000;
const ROUTE_LIMITS = {
  "/functions/getTmdbMovies": 300,
  "/functions/resolveImdb": 240,
  "/functions/resolveTvImdb": 240,
  "/functions/fetchAddonStreams": 100,
  "/functions/getEntertainmentNews": 120,
  "/functions/getSkipSegments": 150,
  "/functions/getFireTvApkLink": 90,
  "/functions/publicDiscovery": 60,
};
const inflight = new Map();
const okOrigin = (origin) => !origin || allowedOrigins.has(origin);
const corsHeaders = (origin) => ({
  ...(origin && allowedOrigins.has(origin)
    ? { "Access-Control-Allow-Origin": origin } : {}),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "3600",
  "Vary": "Origin",
});
const sendJson = (res, status, data, origin) => {
  res.writeHead(status, {
    ...corsHeaders(origin),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
};
const ipFor = (req) =>
  String(req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress || "unknown").slice(0, 100);

const serve = async (req, res) => {
  const origin = String(req.headers.origin || "");
  const route = (req.url || "/").split("?")[0];
  if (!okOrigin(origin)) return sendJson(res, 403, { error: "Origin not allowed" });
  if (route === "/health" && req.method === "GET") {
    return sendJson(res, tmdbReady ? 200 : 503, {
      status: tmdbReady ? "ready" : "upstream_unavailable",
      service: "media-god-metadata",
    }, origin);
  }
  const handler = {
    "/functions/getTmdbMovies": getTmdbMovies,
    "/functions/resolveImdb": resolveImdb,
    "/functions/resolveTvImdb": resolveTvImdb,
    "/functions/fetchAddonStreams": fetchAddonStreams,
    "/functions/getEntertainmentNews": getEntertainmentNews,
    "/functions/getSkipSegments": getSkipSegments,
    "/functions/getFireTvApkLink": getFireTvApkLink,
    "/functions/publicDiscovery": publicDiscovery,
  }[route];
  if (!handler) {
    return sendJson(res, 404, { error: "Not found" }, origin);
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin)); res.end(); return;
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "POST required" }, origin);
  if (["/functions/getTmdbMovies", "/functions/resolveImdb", "/functions/resolveTvImdb"].includes(route) && !tmdbReady) {
    return sendJson(res, 503, { error: "Metadata service not configured" }, origin);
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) return sendJson(res, 413, { error: "Request too large" }, origin);
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendJson(res, 400, { error: "Invalid request" }, origin);
    }

    const now = Date.now();
    const key = createHash("sha256").update(route + ":" + JSON.stringify(body)).digest("hex");
    const cached = cache.get(key);
    if (cached && cached.expires > now && !body.forceRefresh) {
      return sendJson(res, cached.status, cached.data, origin);
    }
    if (cached && cached.expires <= now) cache.delete(key);

    // One upstream request per title+route, even when several TV boxes
    // request the same episode simultaneously. A concurrent request reuses
    // the result, but private credentials never enter this public backend.
    const pending = inflight.get(key);
    if (pending && !body.forceRefresh) {
      const shared = await pending;
      return sendJson(res, shared.status, shared.data, origin);
    }

    // Limit truly new upstream work, not cheap cache hits. Separate quotas
    // ensure catalogue image traffic cannot block a film's IMDb resolver.
    const rateKey = `${ipFor(req)}|${route}`;
    const current = rateLimits.get(rateKey);
    const window = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + RATE_WINDOW_MS }
      : { count: current.count + 1, resetAt: current.resetAt };
    rateLimits.set(rateKey, window);
    if (rateLimits.size > 5000) {
      for (const [id, entry] of rateLimits) {
        if (entry.resetAt <= now) rateLimits.delete(id);
      }
      if (rateLimits.size > 5000) rateLimits.clear();
    }
    if (window.count > (ROUTE_LIMITS[route] || 120)) {
      return sendJson(res, 429, {
        error: "Source metadata service is busy; please retry shortly.",
        retry_after_seconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      }, origin);
    }

    const task = (async () => {
      const request = new Request("http://127.0.0.1" + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await handler(request);
      const raw = await result.text();
      let data;
      try { data = JSON.parse(raw); }
      catch { return { status: 502, data: { error: "Invalid metadata response" } }; }

      // A provider can reply 429 inside an HTTP 200 discovery envelope. Never
      // cache that failure for five minutes; recover once the addon is ready.
      const sourceLookup = route === "/functions/fetchAddonStreams";
      const emptySourceLookup = sourceLookup &&
        (!Array.isArray(data?.streams) || data.streams.length === 0);
      const ttl = emptySourceLookup ? 8_000 : CACHE_MS;
      if (result.ok && route !== "/functions/getFireTvApkLink") {
        // Expire old entries before making room rather than clearing valid
        // matches and making the backend stampede on every burst.
        if (cache.size >= 1500) {
          for (const [cacheKey, entry] of cache) {
            if (entry.expires <= Date.now()) cache.delete(cacheKey);
          }
          if (cache.size >= 1500) cache.delete(cache.keys().next().value);
        }
        cache.set(key, { status: result.status, data, expires: Date.now() + ttl });
      }
      return { status: result.status, data };
    })();

    inflight.set(key, task);
    try {
      const result = await task;
      return sendJson(res, result.status, result.data, origin);
    } finally {
      if (inflight.get(key) === task) inflight.delete(key);
    }
  } catch {
    sendJson(res, 502, { error: "Metadata lookup unavailable" }, origin);
  }
};
http.createServer((req, res) => {
  void serve(req, res).catch(() =>
    sendJson(res, 500, { error: "Unexpected service error" }, String(req.headers.origin || "")));
}).listen(Number(process.env.PORT || 3000), "0.0.0.0");

// Public discovery handler bundled inline to avoid Railway isolated-build missing modules.
// Public discovery only: no accounts, RD credentials, or playback URLs.
const json = (data, status = 200) => Response.json(data, { status });
const pickCountry = value => ["GB", "US", "CA", "AU"].includes(String(value || "").toUpperCase()) ? String(value).toUpperCase() : "GB";
const today = () => new Date().toISOString().slice(0, 10);
const cleanText = value => String(value ?? "").replace(/<[^>]*>/g, "").trim().slice(0, 500);
async function read(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error("Provider temporarily unavailable");
  return response.json();
}
const tvRow = episode => ({
  id: "tvmaze-" + episode.id,
  title: episode.name ? (episode._embedded?.show?.name || episode.show?.name || "TV") + " — " + episode.name : (episode.show?.name || "Episode"),
  description: cleanText(episode.summary),
  start_time: episode.airstamp || episode.airdate,
  source_name: "TVmaze",
  poster_url: episode.show?.image?.medium || episode._embedded?.show?.image?.medium || "",
  web_url: episode.url || "",
  status: "Scheduled TV episode",
});
const sportRow = item => ({
  id: "sportsdb-" + item.idEvent,
  title: cleanText(item.strEvent),
  description: cleanText(item.strLeague),
  start_time: item.strTimestamp || (item.dateEvent ? item.dateEvent + "T" + (item.strTime || "00:00:00") + "Z" : ""),
  source_name: "TheSportsDB",
  league_name: cleanText(item.strLeague),
  poster_url: item.strThumb || "",
  web_url: item.strVideo && /^https:\/\//.test(item.strVideo) ? item.strVideo : "",
  status: "Scheduled sports fixture",
});
const LEAGUES = Object.freeze([4328, 4335, 4387, 4391, 4424]);
async function publicDiscovery(req) {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const action = String(body?.action || "");
  const region = pickCountry(body?.region);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body?.date || "") ? body.date : today();
  if (!["tv", "sports", "status"].includes(action)) return json({ error: "Unsupported discovery action" }, 400);
  if (action === "status") return json({ configured: true, sources: ["TMDB", "TVmaze", "TheSportsDB"], liveSports: false });
  if (action === "tv") {
    try {
      const url = new URL("https://api.tvmaze.com/schedule");
      url.searchParams.set("country", region);
      url.searchParams.set("date", date);
      const data = await read(url);
      const rows = Array.isArray(data) ? data.slice(0, 100).map(tvRow) : [];
      return json({ results: rows, source: "TVmaze", region, date, liveSports: false });
    } catch { return json({ results: [], source: "TVmaze", error: "TV episode schedule temporarily unavailable" }, 502); }
  }
  // TheSportsDB v1 free plan exposes only limited upcoming fixtures per league.
  // Never represent this as a comprehensive or live sports guide.
  const settled = await Promise.allSettled(LEAGUES.map(async id => {
    const url = new URL("https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php");
    url.searchParams.set("id", String(id));
    const data = await read(url);
    return Array.isArray(data?.events) ? data.events : [];
  }));
  const rows = settled.filter(r => r.status === "fulfilled").flatMap(r => r.value).filter(e => e?.idEvent);
  const unique = [...new Map(rows.map(e => [e.idEvent, e])).values()]
    .map(sportRow).sort((a,b) => String(a.start_time).localeCompare(String(b.start_time)));
  if (!settled.some(r => r.status === "fulfilled")) {
    return json({ results: [], source: "TheSportsDB", error: "Sports schedules temporarily unavailable" }, 502);
  }
  return json({ results: unique, source: "TheSportsDB", limited: true, liveSports: false });
}

