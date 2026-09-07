const LIVE_SOURCES_KEY = "mg:custom-live-sources-v1";
const MEDIA_SERVERS_KEY = "mg:personal-media-servers-v1";
const SOURCE_HEALTH_KEY = "mg:live-source-health-v1";
const SOURCE_EVENT = "mg:source-registry-changed";

const clean = (value) => String(value || "").trim();

const readJson = (key, fallback) => {
  if (typeof window === "undefined") return fallback;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value, notify = true) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    if (notify) {
      window.dispatchEvent(new CustomEvent(SOURCE_EVENT));
    }
  } catch {
    // Device-local source persistence is best effort only.
  }
};

const safePriority = (value, fallback = 85) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(150, Math.round(number)));
};

const idFor = (prefix = "source") => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
};

export const sourceRegistryEvent = SOURCE_EVENT;

export const normaliseLiveSource = (value = {}) => {
  const requestedKind = clean(value?.kind).toLowerCase();
  const kind = ["playlist", "direct", "magnet"].includes(requestedKind)
    ? requestedKind
    : "playlist";

  const defaultName =
    kind === "direct"
      ? "Custom channel"
      : kind === "magnet"
        ? "Debrid source"
        : "Custom playlist";

  return {
    id: clean(value?.id) || idFor(kind),
    kind,
    name: clean(value?.name) || defaultName,
    url: clean(value?.url),
    category: clean(value?.category) || (kind === "magnet" ? "Debrid" : "Custom"),
    priority: safePriority(value?.priority, 85),
    active: value?.active !== false,
    logo: clean(value?.logo),
    tvgId: clean(value?.tvgId),
  };
};

export const readCustomLiveSources = () => {
  const rows = readJson(LIVE_SOURCES_KEY, []);

  return (Array.isArray(rows) ? rows : [])
    .map(normaliseLiveSource)
    .filter((item) => item.url);
};

export const writeCustomLiveSources = (rows) => {
  const next = (Array.isArray(rows) ? rows : [])
    .map(normaliseLiveSource)
    .filter((item) => item.url);

  writeJson(LIVE_SOURCES_KEY, next);
  return next;
};

export const addCustomLiveSource = (value) => {
  const source = normaliseLiveSource(value);
  const next = [source, ...readCustomLiveSources()];
  writeCustomLiveSources(next);
  return source;
};

export const updateCustomLiveSource = (id, patch) => {
  const next = readCustomLiveSources().map((source) =>
    source.id === id ? normaliseLiveSource({ ...source, ...patch, id }) : source
  );

  writeCustomLiveSources(next);
  return next;
};

export const removeCustomLiveSource = (id) => {
  const next = readCustomLiveSources().filter((source) => source.id !== id);
  writeCustomLiveSources(next);
  return next;
};

export const normaliseMediaServer = (value = {}) => {
  const type = ["plex", "jellyfin", "emby"].includes(value?.type)
    ? value.type
    : "jellyfin";

  return {
    id: clean(value?.id) || idFor(type),
    type,
    name: clean(value?.name) || type.charAt(0).toUpperCase() + type.slice(1),
    baseUrl: clean(value?.baseUrl).replace(/\/+$/, ""),
    apiKey: clean(value?.apiKey),
    userId: clean(value?.userId),
    active: value?.active !== false,
  };
};

export const readMediaServers = () => {
  const rows = readJson(MEDIA_SERVERS_KEY, []);

  return (Array.isArray(rows) ? rows : [])
    .map(normaliseMediaServer)
    .filter((item) => item.baseUrl);
};

export const writeMediaServers = (rows) => {
  const next = (Array.isArray(rows) ? rows : [])
    .map(normaliseMediaServer)
    .filter((item) => item.baseUrl);

  writeJson(MEDIA_SERVERS_KEY, next);
  return next;
};

export const addMediaServer = (value) => {
  const server = normaliseMediaServer(value);
  const next = [server, ...readMediaServers()];
  writeMediaServers(next);
  return server;
};

export const updateMediaServer = (id, patch) => {
  const next = readMediaServers().map((server) =>
    server.id === id ? normaliseMediaServer({ ...server, ...patch, id }) : server
  );

  writeMediaServers(next);
  return next;
};

export const removeMediaServer = (id) => {
  const next = readMediaServers().filter((server) => server.id !== id);
  writeMediaServers(next);
  return next;
};

export const readSourceHealth = () => {
  const value = readJson(SOURCE_HEALTH_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};

export const sourceHealthFor = (id) => readSourceHealth()[clean(id)] || null;

export const recordSourceHealth = (id, patch = {}) => {
  const sourceId = clean(id);
  if (!sourceId) return null;

  const all = readSourceHealth();
  const previous = all[sourceId] || {};
  const success = patch?.success === true;
  const failed = patch?.success === false;

  const next = {
    ...previous,
    ...patch,
    successes: Number(previous?.successes || 0) + (success ? 1 : 0),
    failures: Number(previous?.failures || 0) + (failed ? 1 : 0),
    lastCheckedAt: new Date().toISOString(),
    lastError: failed ? clean(patch?.error) : "",
    lastLatencyMs: Number.isFinite(Number(patch?.latencyMs))
      ? Number(patch.latencyMs)
      : Number(previous?.lastLatencyMs || 0),
  };

  all[sourceId] = next;
  writeJson(SOURCE_HEALTH_KEY, all, false);
  return next;
};

export const healthAdjustedPriority = (source) => {
  const base = safePriority(source?.priority, 85);
  const health = sourceHealthFor(source?.id);

  if (!health) return base;

  const failures = Number(health?.failures || 0);
  const successes = Number(health?.successes || 0);
  const latency = Number(health?.lastLatencyMs || 0);

  let adjustment = Math.min(8, successes) - Math.min(35, failures * 6);

  if (latency > 6000) adjustment -= 12;
  else if (latency > 3000) adjustment -= 6;
  else if (latency > 0 && latency < 1000) adjustment += 3;

  return Math.max(1, Math.min(150, base + adjustment));
};
