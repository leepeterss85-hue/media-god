import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

/**
 * Opt-in, read-only MANIFEST check for a saved, disabled candidate.
 * This function is deliberately separate from Media God's protected playback
 * and source-discovery backend. Never probes a title, stream URL, or torrent.
 */
const ALLOWED_PROVIDERS = {
  orion: new Set(["5a0d1888fa64-orion.baby-beamup.club"]),
  "stremthru torz": new Set([
    "stremthru.elfhosted.com",
    "stremthru.atbphosting.com",
    "stremthru.safinn.me",
    "stremthru.13377001.xyz",
  ]),
};

const reply = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const clean = value => String(value ?? "").trim();

const manifestUrlFor = addon => {
  const enteredName = clean(addon?.name).toLowerCase();
  const name = /^orion(?:[ _-]?\d+)?$/.test(enteredName) ? "orion" : enteredName;
  const allowedHosts = ALLOWED_PROVIDERS[name];
  if (!allowedHosts) throw new Error("Only the two optional scraper candidates can be checked here.");
  let url;
  try {
    url = new URL(clean(addon?.url));
  } catch {
    throw new Error("Candidate manifest URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Candidate must use a recognised provider HTTPS host.");
  }
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.toLowerCase().endsWith("/manifest.json")) {
    url.pathname += "/manifest.json";
  }
  return url;
};

const hasStreamResource = manifest =>
  Array.isArray(manifest?.resources) &&
  manifest.resources.some(resource =>
    resource === "stream" || (resource && typeof resource === "object" && resource.name === "stream")
  );

const readBoundedJson = async response => {
  const limit = 64 * 1024;
  const length = Number(response.headers.get("content-length") || 0);
  if (length > limit) throw new Error("Manifest is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Manifest is empty.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new Error("Manifest is too large.");
      chunks.push(next.value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
};

export default async function (request) {
  const base44 = createClientFromRequest(request);
  let user = null;
  try { user = await base44.auth.me(); } catch { /* requires signed-in account */ }
  if (!user) return reply({ error: "Sign in to test your saved addon.", diagnostics: [] }, 401);

  let body = {};
  try { body = await request.json(); } catch { /* reject below */ }
  const id = clean(body?.candidate_addon_id);
  if (!id || id.length > 200) return reply({ error: "Select a saved candidate.", diagnostics: [] }, 400);

  // Addon row-level security restricts list to this user. Never accept a URL
  // or credential from the client request.
  let addons;
  try {
    addons = await base44.entities.Addon.list("-created_date", 100);
  } catch {
    return reply({ error: "Could not access your saved addons.", diagnostics: [] }, 503);
  }
  const addon = (Array.isArray(addons) ? addons : []).find(item => clean(item?.id) === id);
  if (!addon) return reply({ error: "Candidate not found in your addons.", diagnostics: [] }, 404);

  let url;
  try {
    url = manifestUrlFor(addon);
  } catch (error) {
    return reply({ diagnostics: [{ name: clean(addon.name), status: "invalid_configuration",
      message: clean(error?.message), stream_count: 0, playable_count: 0 }] }, 200);
  }

  // Independent HTTPS check, no redirects (including redirects to internal
  // hosts), no cookies, no other saved providers, and no arbitrary fetch URL.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return reply({ diagnostics: [{ name: clean(addon.name), status: "http_error",
        message: "Candidate manifest returned HTTP " + response.status + ".",
        stream_count: 0, playable_count: 0 }] });
    }
    const manifest = await readBoundedJson(response);
    const streams = hasStreamResource(manifest);
    const requiresConfiguration = manifest?.behaviorHints?.configurationRequired === true &&
      (
        url.pathname.toLowerCase() === "/manifest.json" ||
        url.pathname.toLowerCase() === "/stremio/torz/manifest.json"
      );
    const status = !streams ? "no_stream_resource" : requiresConfiguration ? "configuration_required" : "ok";
    const message = status === "ok"
      ? "Manifest reachable and stream capability advertised. This has NOT verified any playable media, correct episodes or English audio."
      : status === "configuration_required"
        ? "Public manifest requires a configured account or API key. No streams have been tested."
        : "Manifest reachable but does not advertise stream discovery.";
    return reply({ diagnostics: [{
      name: clean(addon.name), status, message, stream_count: 0, playable_count: 0,
    }], addons_checked: 1 });
  } catch (error) {
    return reply({ diagnostics: [{ name: clean(addon.name), status: "unreachable",
      message: error?.name === "AbortError" ? "Manifest check timed out." : "Manifest could not be checked.",
      stream_count: 0, playable_count: 0 }] });
  } finally {
    clearTimeout(timeout);
  }
}
