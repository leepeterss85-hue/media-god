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
