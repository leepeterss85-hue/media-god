import {
  detectStreamTraits,
  getPlaybackDeviceProfile,
} from "@/components/mg/mediaCompatibility";

export const PLAYBACK_RELIABILITY_KEY = "mg:playback-reliability-v2";

const FAILURE_TTL = 20 * 60 * 1000;
const NO_SOUND_TTL = 6 * 60 * 60 * 1000;
const GOOD_TTL = 30 * 24 * 60 * 60 * 1000;
const BUFFER_TTL = 6 * 60 * 60 * 1000;
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

const androidModel = () => {
  if (typeof navigator === "undefined") return "";

  const userAgent = String(navigator.userAgent || "");
  const match = userAgent.match(
    /\bAndroid\b[^;)]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i
  );

  return String(match?.[1] || "")
    .replace(/\bwv\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

export const playbackDeviceKey = (profile = getPlaybackDeviceProfile()) => {
  if (profile?.fireTv || profile?.isFireTv) {
    return `fire-tv:${fireTvModel() || "generic"}`;
  }

  if (profile?.nativeAndroidMobile || profile?.mobileApp) {
    return `android-mobile:${androidModel() || "generic"}`;
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
  if (traits.dolbyVision) keys.push(`${prefix}:hdr:dolby-vision`);
  else if (traits.hdr) keys.push(`${prefix}:hdr:hdr`);
  if (traits.atmos) keys.push(`${prefix}:audio:atmos`);
  if (/\b(?:10[ -]?bit|main[ ._-]?10|p010)\b/i.test(traits.text || "")) {
    keys.push(`${prefix}:bitdepth:10`);
  }

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
    score -= 18000 + Math.min(12000, Number(record.noSound || 0) * 3000);
  }

  if (fresh(record.lastFailure, FAILURE_TTL)) {
    score -= 5000 + Math.min(5000, Number(record.failures || 0) * 1000);
  }

  if (fresh(record.lastBuffer, BUFFER_TTL)) {
    score -= Math.min(6000, Number(record.buffers || 0) * 1500);
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

const deviceAndTraitAdjustment = (label, profile) => {
  const source = baseSourceKey(label);
  if (!source) return 0;

  const store = readStore();
  const deviceSpecific = scoreRecord(store[sourceDeviceKey(label, profile)]);
  const traitScores = traitKeysFor(label, profile)
    .map((key) => scoreRecord(store[key]))
    .filter(Number.isFinite);

  const traitAdjustment = traitScores.reduce((total, score) => {
    const capped = Math.max(-30000, Math.min(12000, score));
    return total + capped * 0.12;
  }, 0);

  return Math.round(deviceSpecific + traitAdjustment);
};

export const devicePlaybackReliabilityAdjustment = (
  label,
  profile = getPlaybackDeviceProfile()
) => deviceAndTraitAdjustment(label, profile);

export const playbackReliabilityAdjustment = (
  label,
  profile = getPlaybackDeviceProfile()
) => {
  const source = baseSourceKey(label);
  if (!source) return 0;

  const store = readStore();
  const generic = scoreRecord(store[source]);

  return Math.round(
    generic * 0.25 +
      deviceAndTraitAdjustment(label, profile)
  );
};

export const hasRecentNoSoundHistory = (
  label,
  profile = getPlaybackDeviceProfile()
) => {
  const source = baseSourceKey(label);
  if (!source) return false;

  const store = readStore();
  const keys = [
    source,
    sourceDeviceKey(label, profile),
    ...traitKeysFor(label, profile),
  ].filter(Boolean);

  return keys.some((key) =>
    fresh(store?.[key]?.lastNoSound, NO_SOUND_TTL)
  );
};

export const clearPlaybackReliability = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PLAYBACK_RELIABILITY_KEY);
  } catch {
    // Best effort only.
  }
};

/*
 * A permanent Real-Debrid rejection is different from an ordinary playback
 * failure or an uncached torrent that simply needs more time. VideoPlayer
 * deliberately keeps normal uncached torrents selected so users can see their
 * cache progress, but RD 451/infringing-file responses can never recover by
 * retrying the same hash. The player UI already renders the source selector in
 * the user's chosen quality order, so this guard advances that existing
 * selector exactly as a manual choice would. VideoPlayer's own onChange path
 * remains the only code that actually changes playback state.
 *
 * This also fixes the contradictory screen that said "trying another source"
 * while leaving the rejected Torrentio row selected.
 */
const installPermanentRdRejectionFailover = () => {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    window.__MG_RD_REJECTION_FAILOVER_INSTALLED__ === true
  ) {
    return;
  }

  window.__MG_RD_REJECTION_FAILOVER_INSTALLED__ = true;

  let scheduled = 0;
  let lastFailureKey = "";
  let lastFailureAt = 0;

  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0.02
    );
  };

  const sourceSelect = (playerRoot) => {
    const selects = Array.from(
      playerRoot.querySelectorAll(
        'select[aria-label="Choose playback source"], select[aria-label="Choose source or quality while loading"]'
      )
    ).filter(visible);

    return selects[selects.length - 1] || null;
  };

  const advance = () => {
    scheduled = 0;

    const playerRoot = document.querySelector('[data-mg-player-root="true"]');
    if (!(playerRoot instanceof HTMLElement) || !visible(playerRoot)) {
      lastFailureKey = "";
      return;
    }

    const text = String(playerRoot.textContent || "").replace(/\s+/g, " ").trim();
    const permanentRejection =
      /rejected by Real-Debrid|\b451\b|infringing[_ -]?file|copyright|infringing/i.test(text);

    if (!permanentRejection) {
      lastFailureKey = "";
      return;
    }

    const select = sourceSelect(playerRoot);
    if (!(select instanceof HTMLSelectElement) || select.options.length < 2) {
      return;
    }

    const currentIndex = select.selectedIndex;
    if (currentIndex < 0) return;

    const currentOption = select.options[currentIndex];
    const currentLabel = normaliseReliabilityLabel(
      currentOption?.dataset?.mgSourceLabel || currentOption?.textContent || ""
    );
    const failureKey = `${String(select.value)}|${currentLabel}`;
    const now = Date.now();

    if (
      failureKey === lastFailureKey &&
      now - lastFailureAt < 12000
    ) {
      return;
    }

    let nextOption = null;
    for (let index = currentIndex + 1; index < select.options.length; index += 1) {
      const option = select.options[index];
      const optionText = String(option?.textContent || "");
      if (
        option &&
        !option.disabled &&
        String(option.value) !== String(select.value) &&
        !/^\s*Unavailable\s*[•·-]/i.test(optionText)
      ) {
        nextOption = option;
        break;
      }
    }

    if (!nextOption) {
      return;
    }

    lastFailureKey = failureKey;
    lastFailureAt = now;

    if (currentLabel) {
      recordPlaybackReliability(currentLabel, "failure");
    }

    select.value = String(nextOption.value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const schedule = () => {
    if (scheduled) window.clearTimeout(scheduled);
    scheduled = window.setTimeout(advance, 80);
  };

  const start = () => {
    if (!document.body) {
      window.setTimeout(start, 50);
      return;
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("mg:player-status", schedule);
    schedule();
  };

  start();
};

installPermanentRdRejectionFailover();
