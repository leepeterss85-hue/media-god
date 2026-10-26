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

const canonicalPilotName = (name) => {
  const value = String(name || "").trim().toLowerCase();
  // A user can save a replacement configured Orion as Orion2, Orion-2 etc.
  // Treat only these numbered aliases as the same pilot for safe masking and
  // isolated manifest checks; do not sweep arbitrary unrelated addon names.
  if (/^orion(?:[ _-]?\d+)?$/.test(value)) return "orion";
  return value;
};

export function isOptionalScraperPilot(name) {
  const canonical = canonicalPilotName(name);
  return OPTIONAL_SCRAPER_PILOTS.some(
    candidate => candidate.name.toLowerCase() === canonical
  );
}

export function isBareOptionalPilotManifest(name, url) {
  if (!isOptionalScraperPilot(name)) return false;
  try {
    const parsed = new URL(String(url));
    const path = parsed.pathname.replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
    if (parsed.search) return false;
    if (canonicalPilotName(name) === "orion") {
      return path === "/manifest.json";
    }
    return path === "/stremio/torz/manifest.json" || path === "/manifest.json";
  } catch {
    return false;
  }
}

/**
 * Converts the Orion Stremio addon configuration to *torrent index only*.
 * Orion still finds hashes, but Media God (not Orion) resolves those hashes
 * through the user's existing Real-Debrid integration. The returned manifest
 * remains private: never log, display, or include it in diagnostics.
 * Caller must keep the converted candidate disabled until it is tested.
 */
export function buildOrionTorrentOnlyManifest(manifestUrl) {
  const url = new URL(String(manifestUrl || ""));
  if (url.protocol !== "https:" || url.hostname !== "5a0d1888fa64-orion.baby-beamup.club" ||
      url.username || url.password) throw new Error("Not a supported Orion manifest URL.");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[1] !== "manifest.json" ||
      segments[0].length > 8192) throw new Error("Orion profile is not in the expected format.");

  let config;
  try {
    const encoded = segments[0].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    config = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Cannot read the saved Orion profile. Reconfigure Orion using its official page.");
  }
  if (!config || typeof config !== "object" || Array.isArray(config) ||
      typeof config.listOpt !== "string" || !Array.isArray(config.debridservices)) {
    throw new Error("This Orion profile cannot be converted safely.");
  }
  if (config.listOpt === "torrent") return null;

  const nextConfig = { ...config, listOpt: "torrent" };
  const bytes = new TextEncoder().encode(JSON.stringify(nextConfig));
  const nextProfile = btoa(Array.from(bytes, value => String.fromCharCode(value)).join(""));
  url.pathname = "/" + nextProfile + "/manifest.json";
  return url.toString();
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
