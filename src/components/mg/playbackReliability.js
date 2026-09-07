import {
  detectStreamTraits,
  getPlaybackDeviceProfile,
} from "@/components/mg/mediaCompatibility";

export const PLAYBACK_RELIABILITY_KEY = "mg:playback-reliability-v1";

const FAILURE_TTL = 12 * 60 * 60 * 1000;
const NO_SOUND_TTL = 7 * 24 * 60 * 60 * 1000;
const GOOD_TTL = 30 * 24 * 60 * 60 * 1000;
const BUFFER_TTL = 48 * 60 * 60 * 1000;
const START_TTL = 30 * 24 * 60 * 60 * 1000;

export const normaliseReliabilityLabel = (value) =>
  String(value || "")
    .replace(/^failed\s*[—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

const baseSourceKey = (value) =>
  normaliseReliabilityLabel(value).toLowerCase().slice(0, 260);

const fireTvModel = () => {
  if (typeof navigator === "undefined") return "";
  return String(navigator.userAgent || "").match(/\b(AFT[A-Z0-9]+)\b/i)?.[1]?.toUpperCase() || "";
};

export const playbackDeviceKey = (profile = getPlaybackDeviceProfile()) => {
  if (profile?.fireTv || profile?.isFireTv) {
    return `fire-tv:${fireTvModel() || "generic"}`;
  }

  return "browser";
};

const sourceDeviceKey = (label, profile) => {
  const source = baseSourceKey(label);
  if (!source) return "";
  return `device:${playbackDeviceKey(profile)}:${source}`;
};

const traitKeysFor = (label, profile) => {
  const traits = detectStreamTraits(
    { label: normaliseReliabilityLabel(label) },
    normaliseReliabilityLabel(label)
  );
  const prefix = `trait:${playbackDeviceKey(profile)}`;
  const keys = [];

  if (traits.audio) keys.push(`${prefix}:audio:${traits.audio}`);
  if (traits.video) keys.push(`${prefix}:video:${traits.video}`);
  if (traits.container) keys.push(`${prefix}:container:${traits.container}`);
  if (traits.resolution) keys.push(`${prefix}:resolution:${traits.resolution}`);

  return keys;
};

const readStore = () => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(PLAYBACK_RELIABILITY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      PLAYBACK_RELIABILITY_KEY,
      JSON.stringify(store)
    );
  } catch {
    // Reliability learning is best effort only.
  }
};

const fresh = (timestamp, ttl) =>
  Number(timestamp || 0) > Date.now() - ttl;

const blankRecord = () => ({
  failures: 0,
  noSound: 0,
  lastFailure: 0,
  lastNoSound: 0,
  lastGood: 0,
  buffers: 0,
  lastBuffer: 0,
  avgStartMs: 0,
  startSamples: 0,
  lastStartAt: 0,
});

const usefulRecord = (record) =>
  record &&
  typeof record === "object" &&
  (
    fresh(record.lastFailure, FAILURE_TTL) ||
    fresh(record.lastNoSound, NO_SOUND_TTL) ||
    fresh(record.lastGood, GOOD_TTL) ||
    fresh(record.lastBuffer, BUFFER_TTL) ||
    fresh(record.lastStartAt, START_TTL)
  );

const cleanStore = (store) => {
  const entries = Object.entries(store || {}).filter(([, record]) => usefulRecord(record));
  return Object.fromEntries(entries.slice(-900));
};

const applyEvent = (record, kind, value) => {
  const current = { ...blankRecord(), ...(record || {}) };
  const now = Date.now();

  if (kind === "failure") {
    current.failures = Number(current.failures || 0) + 1;
    current.lastFailure = now;
  } else if (kind === "no-sound") {
    current.noSound = Number(current.noSound || 0) + 1;
    current.lastNoSound = now;
  } else if (kind === "buffer") {
    current.buffers = Number(current.buffers || 0) + 1;
    current.lastBuffer = now;
  } else if (kind === "startup") {
    const startMs = Math.max(0, Math.min(60000, Number(value || 0)));

    if (startMs > 0) {
      const samples = Number(current.startSamples || 0);
      const previous = Number(current.avgStartMs || 0);
      current.avgStartMs = samples > 0
        ? Math.round(previous * 0.7 + startMs * 0.3)
        : Math.round(startMs);
      current.startSamples = samples + 1;
      current.lastStartAt = now;
    }
  } else if (kind === "good") {
    current.lastGood = now;
    current.failures = Math.max(0, Number(current.failures || 0) - 1);
    current.buffers = Math.max(0, Number(current.buffers || 0) - 1);
  }

  return current;
};

const recordKeys = (label, kind, value, profile, includeGeneric) => {
  const source = baseSourceKey(label);
  if (!source) return;

  const store = cleanStore(readStore());
  const deviceKey = sourceDeviceKey(label, profile);
  const keys = [
    ...(includeGeneric ? [source] : []),
    deviceKey,
    ...traitKeysFor(label, profile),
  ].filter(Boolean);

  keys.forEach((key) => {
    store[key] = applyEvent(store[key], kind, value);
  });

  writeStore(store);
};

export const recordPlaybackReliability = (
  label,
  kind,
  value = null,
  profile = getPlaybackDeviceProfile()
) => {
  recordKeys(label, kind, value, profile, true);
};

export const recordDevicePlaybackReliability = (
  label,
  kind,
  value = null,
  profile = getPlaybackDeviceProfile()
) => {
  recordKeys(label, kind, value, profile, false);
};

const scoreRecord = (record) => {
  if (!record || typeof record !== "object") return 0;

  let score = 0;

  if (fresh(record.lastNoSound, NO_SOUND_TTL)) {
    score -= 500000 + Math.min(200000, Number(record.noSound || 0) * 25000);
  }

  if (fresh(record.lastFailure, FAILURE_TTL)) {
    score -= 220000 + Math.min(150000, Number(record.failures || 0) * 18000);
  }

  if (fresh(record.lastBuffer, BUFFER_TTL)) {
    score -= Math.min(36000, Number(record.buffers || 0) * 4500);
  }

  if (fresh(record.lastStartAt, START_TTL)) {
    const average = Number(record.avgStartMs || 0);
    if (average > 0 && average <= 2500) score += 9000;
    else if (average <= 5000) score += 4500;
    else if (average >= 15000) score -= 16000;
    else if (average >= 9000) score -= 8000;
  }

  if (fresh(record.lastGood, GOOD_TTL)) {
    score += 3500;
  }

  return score;
};

export const playbackReliabilityAdjustment = (
  label,
  profile = getPlaybackDeviceProfile()
) => {
  const source = baseSourceKey(label);
  if (!source) return 0;

  const store = readStore();
  const generic = scoreRecord(store[source]);
  const deviceSpecific = scoreRecord(store[sourceDeviceKey(label, profile)]);
  const traitScores = traitKeysFor(label, profile)
    .map((key) => scoreRecord(store[key]))
    .filter(Number.isFinite);

  const traitAdjustment = traitScores.reduce((total, score) => {
    const capped = Math.max(-180000, Math.min(18000, score));
    return total + capped * 0.16;
  }, 0);

  return Math.round(generic * 0.25 + deviceSpecific + traitAdjustment);
};

export const clearPlaybackReliability = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PLAYBACK_RELIABILITY_KEY);
  } catch {
    // Best effort only.
  }
};
