export const DEBRID_PROVIDER_RELIABILITY_KEY =
  "mg:debrid-provider-reliability-v1";

const PROVIDERS = [
  "realdebrid",
  "torbox",
  "alldebrid",
  "premiumize",
  "debridlink",
];

const cleanProvider = (value) => {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return PROVIDERS.includes(key) ? key : "";
};

const readStore = () => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(
      DEBRID_PROVIDER_RELIABILITY_KEY
    );
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
      DEBRID_PROVIDER_RELIABILITY_KEY,
      JSON.stringify(store)
    );
  } catch {
    // Device-local provider learning is best effort only.
  }
};

const blankRecord = () => ({
  successes: 0,
  failures: 0,
  avgResolveMs: 0,
  resolveSamples: 0,
  lastSuccessAt: 0,
  lastFailureAt: 0,
});

export const recordDebridProviderResult = (
  provider,
  { success = false, latencyMs = 0 } = {}
) => {
  const key = cleanProvider(provider);
  if (!key) return;

  const store = readStore();
  const current = {
    ...blankRecord(),
    ...(store[key] || {}),
  };
  const now = Date.now();

  if (success) {
    current.successes = Number(current.successes || 0) + 1;
    current.lastSuccessAt = now;

    const value = Math.max(0, Math.min(60000, Number(latencyMs || 0)));
    if (value > 0) {
      const samples = Number(current.resolveSamples || 0);
      const previous = Number(current.avgResolveMs || 0);
      current.avgResolveMs = samples > 0
        ? Math.round(previous * 0.72 + value * 0.28)
        : Math.round(value);
      current.resolveSamples = samples + 1;
    }

    current.failures = Math.max(0, Number(current.failures || 0) - 1);
  } else {
    current.failures = Number(current.failures || 0) + 1;
    current.lastFailureAt = now;
  }

  store[key] = current;
  writeStore(store);
};

const scoreRecord = (record) => {
  if (!record || typeof record !== "object") return 0;

  const now = Date.now();
  const recentSuccess =
    Number(record.lastSuccessAt || 0) > now - 30 * 24 * 60 * 60 * 1000;
  const recentFailure =
    Number(record.lastFailureAt || 0) > now - 7 * 24 * 60 * 60 * 1000;

  let score = 0;

  if (recentSuccess) {
    score += Math.min(3500, Number(record.successes || 0) * 300);
  }

  if (recentFailure) {
    score -= Math.min(7500, Number(record.failures || 0) * 1800);
  }

  const average = Number(record.avgResolveMs || 0);
  if (average > 0 && average <= 1800) score += 2800;
  else if (average <= 3500) score += 1600;
  else if (average <= 6000) score += 600;
  else if (average >= 15000) score -= 3200;
  else if (average >= 9000) score -= 1500;

  return Math.max(-12000, Math.min(12000, Math.round(score)));
};

export const debridProviderScoreHints = () => {
  const store = readStore();

  return Object.fromEntries(
    PROVIDERS.map((key) => [key, scoreRecord(store[key])])
  );
};
