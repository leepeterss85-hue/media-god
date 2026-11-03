import http from "node:http";
import { createHash } from "node:crypto";
import getTmdbMovies from "./getTmdbMovies.mjs";

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
const RATE_LIMIT = 150;
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
  if (route !== "/functions/getTmdbMovies") {
    return sendJson(res, 404, { error: "Not found" }, origin);
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin)); res.end(); return;
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "POST required" }, origin);
  if (!process.env.TMDB_API_KEY) {
    return sendJson(res, 503, { error: "Metadata service not configured" }, origin);
  }
  const ip = ipFor(req);
  const now = Date.now();
  const entry = rateLimits.get(ip);
  const quota = !entry || entry.resetAt < now
    ? { count: 1, resetAt: now + 60_000 }
    : { count: entry.count + 1, resetAt: entry.resetAt };
  rateLimits.set(ip, quota);
  if (rateLimits.size > 5000) rateLimits.clear();
  if (quota.count > RATE_LIMIT) return sendJson(res, 429, { error: "Too many requests" }, origin);

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
    const key = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const cached = cache.get(key);
    if (cached && cached.expires > now) {
      return sendJson(res, cached.status, cached.data, origin);
    }
    const request = new Request("http://127.0.0.1/functions/getTmdbMovies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await getTmdbMovies(request);
    const text = await result.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return sendJson(res, 502, { error: "Invalid metadata response" }, origin); }
    if (result.ok && cache.size < 1500) {
      cache.set(key, { status: result.status, data, expires: now + CACHE_MS });
    }
    sendJson(res, result.status, data, origin);
  } catch {
    sendJson(res, 502, { error: "Metadata lookup unavailable" }, origin);
  }
};
http.createServer((req, res) => {
  void serve(req, res).catch(() =>
    sendJson(res, 500, { error: "Unexpected service error" }, String(req.headers.origin || "")));
}).listen(Number(process.env.PORT || 3000), "0.0.0.0");
