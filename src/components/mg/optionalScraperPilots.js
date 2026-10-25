/**
 * Optional source-discovery pilots, deliberately excluded from the built-in
 * auto-play/discovery manifest list. Users supply their own configured manifests.
 * Never display a configured manifest path or query: both may contain secrets.
 */
export const OPTIONAL_SCRAPER_PILOTS = Object.freeze([
  {
    name: "Orion",
    configureUrl: "https://5a0d1888fa64-orion.baby-beamup.club/configure",
    description: "Separate indexed search. Requires your own Orion API key; results and debrid use can have provider limits.",
  },
  {
    name: "StremThru Torz",
    configureUrl: "https://stremthru.elfhosted.com/stremio/torz/configure",
    description: "Crowdsourced search, potentially useful for older seasons. Overlaps with some existing addon results.",
  },
]);

export function isOptionalScraperPilot(name) {
  return OPTIONAL_SCRAPER_PILOTS.some(
    candidate => candidate.name.toLowerCase() === String(name || "").trim().toLowerCase()
  );
}

export function isBareOptionalPilotManifest(name, url) {
  if (!isOptionalScraperPilot(name)) return false;
  try {
    const parsed = new URL(String(url));
    const path = parsed.pathname.replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
    if (parsed.search) return false;
    if (String(name).trim().toLowerCase() === "orion") {
      return path === "/manifest.json";
    }
    return path === "/stremio/torz/manifest.json" || path === "/manifest.json";
  } catch {
    return false;
  }
}

export function redactOptionalPilotManifest(name, url) {
  if (!isOptionalScraperPilot(name)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "Configured manifest (hidden)";
    // The full URL is never suitable for display: query, pathname, and userinfo
    // can carry tokens, device-specific store keys, or other account parameters.
    return `${parsed.origin}/[configured-profile]/manifest.json`;
  } catch {
    return "Configured manifest (hidden)";
  }
}
