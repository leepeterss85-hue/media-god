import http from "node:http";
import { deviceClient } from "./deviceClient.mjs";
import { createClient } from "@base44/sdk";
import realDebrid from "./realDebrid.mjs";
import realDebridAuth from "./realDebridAuth.mjs";
import findRdLibrary from "./findRdLibrary.mjs";
import multiDebrid from "./multiDebrid.mjs";
import fetchAddonStreams from "./fetchAddonStreams.mjs";

const APP_ID = process.env.BASE44_APP_ID || "6a95b85c1b5a8657bf3906c8";
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ||
    "https://mysterious-media-vault-pro.base44.app,http://localhost:5173")
    .split(",").map(v => v.trim()).filter(Boolean)
);
const HANDLERS = Object.freeze({
  "/functions/realDebrid": realDebrid,
  "/functions/realDebridAuth": realDebridAuth,
  "/functions/findRdLibrary": findRdLibrary,
  "/functions/multiDebrid": multiDebrid,
  "/functions/fetchAddonStreams": fetchAddonStreams,
});
const MAX_BODY = 128 * 1024;
const rate = new Map();
const deviceQueues = new Map();
async function runHandler(handler, request, deviceId) {
  if (!deviceId) return handler(request);
  const previous = deviceQueues.get(deviceId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  deviceQueues.set(deviceId, current);
  await previous;
  try { return await handler(request); }
  finally {
    release();
    if (deviceQueues.get(deviceId) === current) deviceQueues.delete(deviceId);
  }
}
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_USER = 220;

function allowedOrigin(origin, authorization = "") {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Installed Android/Fire TV WebViews may send an opaque origin rather
  // than the hosted app's URL. Only permit that origin for device-bound
  // capabilities, never for user bearer sessions.
  if (origin === "null") return /^Device [a-f0-9]{64}$/.test(authorization);
  // Base44 preview/published app origins can change independently of
  // Railway deploys. Restrict this exception to HTTPS Base44 hosts.
  try {
    const url = new URL(origin);
    return url.protocol === "https:" &&
      /^[a-z0-9-]+\\.base44\\.app$/i.test(url.hostname) &&
      url.origin === origin;
  } catch { return false; }
}
function cors(origin, authorization = "") {
  return {
    ...(origin && allowedOrigin(origin, authorization)
      ? {"Access-Control-Allow-Origin": origin} : {}),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "3600",
    "Vary": "Origin",
  };
}
function respond(res, status, payload, origin = "", authorization = "") {
  res.writeHead(status, {
    ...cors(origin, authorization),
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(JSON.stringify(payload));
}
function limited(userId) {
  const now = Date.now();
  const previous = rate.get(userId);
  const next = previous && previous.ends > now
    ? {count: previous.count + 1, ends: previous.ends}
    : {count: 1, ends: now + RATE_WINDOW_MS};
  rate.set(userId, next);
  if (rate.size > 5000) {
    for (const [id, item] of rate) if (item.ends <= now) rate.delete(id);
    if (rate.size > 5000) rate.clear();
  }
  return next.count > MAX_REQUESTS_PER_USER;
}
async function verifiedClient(header) {
  // Authenticate using the existing Media God account, not a client supplied
  // user_id, RD token, or arbitrary device key. Base44 validates this token.
  const match = /^Bearer ([A-Za-z0-9._~-]{32,8192})$/.exec(String(header || ""));
  if (!match) return null;
  const client = createClient({appId: APP_ID, token: match[1]});
  try {
    const user = await client.auth.me();
    if (!user || !user.id || typeof user.id !== "string") return null;
    return {client, user};
  } catch {
    return null;
  }
}
async function serve(req, res) {
  const origin = String(req.headers.origin || "");
  if (!allowedOrigin(origin, String(req.headers.authorization || ""))) {
    return respond(res, 403, {error: "Origin not allowed"});
  }
  const path = (req.url || "/").split("?")[0];
  if (path === "/health" && req.method === "GET") {
    return respond(res, 200, {status: "ready", service: "media-god-rd", auth: "required"}, origin, String(req.headers.authorization || ""));
  }
  const handler = HANDLERS[path];
  if (!handler) return respond(res, 404, {error: "Not found"}, origin);
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors(origin, String(req.headers.authorization || ""))); res.end(); return;
  }
  if (req.method !== "POST") return respond(res, 405, {error: "POST required"}, origin);
  const isDevice = String(req.headers.authorization || "").startsWith("Device ");
  if (isDevice && limited("ip:" + String(req.headers["x-real-ip"] || req.socket.remoteAddress))) {
    return respond(res, 429, {error: "Too many device requests. Retry shortly."}, origin);
  }
  const verified = isDevice
    ? await deviceClient(req.headers.authorization)
    : await verifiedClient(req.headers.authorization);
  if (!verified) return respond(res, 401, {error: "Sign in to Media God to use Real-Debrid."}, origin);
  if (limited(verified.user.id)) {
    return respond(res, 429, {error: "Too many Real-Debrid requests. Retry shortly."}, origin);
  }

  let body = {};
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) return respond(res, 413, {error: "Request too large"}, origin);
      chunks.push(chunk);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!body || Array.isArray(body) || typeof body !== "object") {
      return respond(res, 400, {error: "Invalid request"}, origin);
    }
  } catch {
    return respond(res, 400, {error: "Invalid JSON"}, origin);
  }
  // Do not accept a private RD credential, arbitrary account ID or guest
  // impersonation from the caller: the account is resolved via auth.me.
  if (["rd_token", "rd_refresh_token", "rd_client_secret", "user_id"].some(k => k in body)) {
    return respond(res, 400, {error: "Credentials must not be supplied in request bodies."}, origin);
  }
  try {
    const request = new Request("http://127.0.0.1" + path, {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
    Object.defineProperties(request, {
      __mediaGodVerifiedClient: {value: verified.client},
      __mediaGodVerifiedUserId: {value: verified.user.id},
      __mediaGodVerifiedUser: {value: verified.user},
    });
    const result = await runHandler(handler, request, isDevice ? verified.user.id : "");
    const raw = await result.text();
    if (raw.length > 2_000_000) {
      return respond(res, 502, {error: "Real-Debrid response too large"}, origin);
    }
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { return respond(res, 502, {error: "Unexpected Real-Debrid response"}, origin); }
    return respond(res, result.status, data, origin);
  } catch {
    // Never include a token, user ID or upstream URL in an error or log.
    return respond(res, 502, {error: "Real-Debrid request unavailable. Retry or check your RD connection."}, origin);
  }
}
http.createServer((req, res) => {
  res.setTimeout(125_000);
  void serve(req, res).catch(() =>
    respond(res, 500, {error: "Unexpected Real-Debrid server error"}, String(req.headers.origin || "")));
}).listen(Number(process.env.PORT || 3000), "0.0.0.0");
