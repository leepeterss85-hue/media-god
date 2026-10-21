import { isFlixQuestEpisodeSource } from "./episodeSourcePolicy.js";

/*
 * Store a short fingerprint, never a URL, signed query string, account token
 * or torrent label. Keep this module independently testable in Node as well as
 * in the browser; its keying mirrors the playback reliability exact-source key.
 */
const exactEpisodeSourceFingerprint = source => {
  const hash = String(source?.infoHash || source?.info_hash || "").trim() ||
    String(source?.magnet || source?.magnetLink || "").match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i)?.[1] || "";
  const identity = hash || String(source?.id || source?.src || source?.url || "").trim();
  if (!identity) return "";
  const file = String(source?.fileIdx || source?.file_idx || "");
  const raw = [source?.addon || source?.debridProvider || source?.sourceName || "",
    identity, file].join("|");
  let first = 2166136261;
  let second = 0x811c9dc7 ^ 0x9e3779b9;
  for (let index = 0; index < raw.length; index += 1) {
    first = Math.imul(first ^ raw.charCodeAt(index), 16777619);
    second = Math.imul(second ^ raw.charCodeAt(index), 16777619);
  }
  return `exact:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
};

const STORAGE_KEY = "mg:episode-source-health:v1";
const TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 400;
const clean = v => String(v ?? "").trim();
const positive = value => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function episodeHealthProvider(source) {
  if (isFlixQuestEpisodeSource(source)) return "FlixQuest";
  const label = [
    source?.addon, source?.provider, source?.sourceName, source?.debridProvider,
  ].map(clean).join(" ").toLowerCase();
  for (const [name, pattern] of [
    ["Torrentio", /torrentio/], ["Comet", /comet/],
    ["MediaFusion", /mediafusion/], ["StremSRC", /stremsrc/],
    ["AIOStreams", /aiostreams|aio streams/], ["Real-Debrid", /real.debrid|^rd\b/],
  ]) if (pattern.test(label)) return name;
  return "Other";
}

function sourceKey(source, context) {
  const tmdb = clean(context?.tmdbId ?? context?.tmdb_id ?? context?.id);
  const season = positive(context?.season ?? context?.rdSeason);
  const episode = positive(context?.episode ?? context?.rdEpisode);
  const exact = exactEpisodeSourceFingerprint(source);
  // Never persist a URL, bearer token, manifest or full torrent title.
  if (!/^\d{1,9}$/.test(tmdb) || !season || !episode || !exact) return "";
  return [tmdb, season, episode, exact].join(":");
}

const readStore = () => {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
const saveStore = store => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private browsing and full storage should never break playback.
  }
};

export function recordEpisodeSourceHealth(source, context, kind, details = {}) {
  const key = sourceKey(source, context);
  if (!key || !["good", "failure", "no-sound"].includes(kind)) return false;
  const now = Date.now();
  const store = readStore();
  const old = store[key] || {};
  const row = {
    provider: episodeHealthProvider(source),
    successes: Number(old.successes || 0),
    failures: Number(old.failures || 0),
    noSound: Number(old.noSound || 0),
    lastGood: Number(old.lastGood || 0),
    lastFailure: Number(old.lastFailure || 0),
    lastNoSound: Number(old.lastNoSound || 0),
    audioDecoded: old.audioDecoded === true,
    updatedAt: now,
  };
  if (kind === "good") {
    // 20+ seconds of continuous playback is evidence, not a repeated render.
    if (now - row.lastGood < 10 * 60 * 1000) return false;
    row.successes += 1;
    row.lastGood = now;
    row.audioDecoded ||= details?.audioDecoded === true;
    row.failures = 0;
    row.lastFailure = 0;
    // Decoding video does not prove the speakers produced sound. Preserve an
    // explicit no-sound report unless native audio output is confirmed.
    if (details?.audioDecoded === true) {
      row.noSound = 0;
      row.lastNoSound = 0;
    }
  } else if (kind === "failure") {
    if (now - row.lastFailure < 30_000) return false;
    row.failures += 1;
    row.lastFailure = now;
  } else {
    if (now - row.lastNoSound < 30_000) return false;
    row.noSound += 1;
    row.lastNoSound = now;
  }
  store[key] = row;
  const recent = Object.entries(store)
    .filter(([, entry]) => Number(entry?.updatedAt || 0) > now - TTL)
    .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
    .slice(0, MAX_ENTRIES);
  saveStore(Object.fromEntries(recent));
  return true;
}

export function episodeSourceHealthScore(source, context) {
  const key = sourceKey(source, context);
  if (!key) return 0;
  const row = readStore()[key];
  if (!row || Number(row.updatedAt || 0) < Date.now() - TTL) return 0;
  let score = 0;
  if (row.lastGood && row.lastGood > Date.now() - TTL) {
    score += Math.min(7000, 3500 + Number(row.successes || 0) * 700);
    if (row.audioDecoded === true) score += 1500;
  }
  if (row.lastFailure > Date.now() - 20 * 60 * 1000)
    score -= Math.min(9000, 4000 + Number(row.failures || 0) * 1500);
  if (row.lastNoSound > Date.now() - 6 * 60 * 60 * 1000)
    score -= 16000;
  return score;
}

export function episodeProviderHealthSummary() {
  const now = Date.now();
  const output = {};
  for (const row of Object.values(readStore())) {
    if (!row || Number(row.updatedAt || 0) < now - TTL) continue;
    const provider = clean(row.provider) || "Other";
    const entry = output[provider] || { successes: 0, failures: 0, noSound: 0 };
    entry.successes += Number(row.successes || 0);
    entry.failures += Number(row.failures || 0);
    entry.noSound += Number(row.noSound || 0);
    output[provider] = entry;
  }
  return output;
}
