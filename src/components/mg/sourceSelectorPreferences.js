import {
  getPlaybackDeviceProfile,
  scoreSourceCompatibility,
} from "@/components/mg/mediaCompatibility";

export const SOURCE_SELECTOR_SORT_KEY = "mg:source-selector-sort-v1";
export const SOURCE_SELECTOR_SORT_EVENT = "mg:source-selector-sort-changed";

export const SOURCE_SORT_OPTIONS = [
  { value: "best", label: "Best" },
  { value: "cached", label: "Cached" },
  { value: "4k", label: "4K" },
  { value: "1080p", label: "1080p" },
  { value: "compatible", label: "Compatible" },
  { value: "smallest", label: "Smallest" },
];

const allowedModes = new Set(SOURCE_SORT_OPTIONS.map((item) => item.value));

export const readSourceSortMode = () => {
  if (typeof window === "undefined") return "best";

  try {
    const value = String(window.localStorage.getItem(SOURCE_SELECTOR_SORT_KEY) || "best");
    return allowedModes.has(value) ? value : "best";
  } catch {
    return "best";
  }
};

export const writeSourceSortMode = (value) => {
  const next = allowedModes.has(String(value)) ? String(value) : "best";

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SOURCE_SELECTOR_SORT_KEY, next);
    } catch {
      // Device-local preference storage is optional.
    }

    window.dispatchEvent(
      new CustomEvent(SOURCE_SELECTOR_SORT_EVENT, {
        detail: { mode: next },
      })
    );
  }

  return next;
};

const sourceText = (item) =>
  [
    item?.label,
    item?.name,
    item?.title,
    item?.description,
    item?.quality,
    item?.resolution,
    item?.height,
    item?.videoCodec,
    item?.audioCodec,
  ]
    .filter(Boolean)
    .join(" ");

const sourceResolution = (item) => {
  const explicit = Number(item?.resolution || item?.height || 0);
  if (Number.isFinite(explicit) && explicit >= 240) return explicit;

  const text = sourceText(item);
  const match = text.match(/\b(4320|2160|1440|1080|720|576|480|360)p\b/i);
  if (match) return Number(match[1]);
  if (/\b8k\b/i.test(text)) return 4320;
  if (/\b(?:4k|uhd)\b/i.test(text)) return 2160;
  if (/\bfhd\b/i.test(text)) return 1080;
  if (/\bhd\b/i.test(text)) return 720;
  return 0;
};

const sourceSize = (item) => {
  const explicit = Number(
    item?.bytes ||
      item?.size ||
      item?.filesize ||
      item?.fileSize ||
      item?.file_size ||
      0
  );

  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const text = sourceText(item);
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(tb|gb|mb)\b/i);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "tb") return amount * 1024 ** 4;
  if (unit === "gb") return amount * 1024 ** 3;
  return amount * 1024 ** 2;
};

const sourceIsCached = (item) => {
  if (item?.cacheRequired === true || item?.cometUncached === true) {
    return false;
  }

  return (
    item?.debridCached === true ||
    item?.viaRealDebrid === true ||
    /\b(?:cached|instant|ready)\b/i.test(sourceText(item))
  );
};

const sourceReportedSeeders = (item) => {
  const explicit = Number(item?.reportedSeeders || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const match = sourceText(item).match(
    /(?:👤\s*|seeders?\s*:\s*)(\d+)/i
  );

  return match ? Math.max(0, Number(match[1] || 0)) : 0;
};

const sourceHasTrackerRichMagnet = (item) => {
  const raw = String(item?.richMagnet || "").trim();
  return /^magnet:/i.test(raw) && /(?:[?&])tr=/i.test(raw);
};

const compatibilityScore = (item) =>
  scoreSourceCompatibility(item, sourceText(item), {
    deviceProfile: getPlaybackDeviceProfile(),
    qualityPreference: "Auto",
  });

const targetResolutionScore = (resolution, target) => {
  if (!resolution) return -100000;
  if (resolution === target) return 100000;

  const distance = Math.abs(resolution - target);
  const belowBonus = resolution < target ? 3000 : 0;
  return 80000 - distance * 30 + belowBonus;
};

export const sortSourceEntries = (sources, mode = readSourceSortMode()) => {
  const list = (Array.isArray(sources) ? sources : []).map((item, index) => ({
    item,
    index,
    cached: sourceIsCached(item),
    resolution: sourceResolution(item),
    size: sourceSize(item),
    compatibility: compatibilityScore(item),
    reportedSeeders: sourceReportedSeeders(item),
    trackerRich: sourceHasTrackerRichMagnet(item),
  }));

  if (mode === "best") return list;

  return list.slice().sort((a, b) => {
    if (mode === "cached") {
      return (
        Number(b.cached) - Number(a.cached) ||
        Number(b.trackerRich) - Number(a.trackerRich) ||
        b.reportedSeeders - a.reportedSeeders ||
        b.compatibility - a.compatibility ||
        a.index - b.index
      );
    }

    if (mode === "4k" || mode === "1080p") {
      const target = mode === "4k" ? 2160 : 1080;
      return (
        targetResolutionScore(b.resolution, target) -
          targetResolutionScore(a.resolution, target) ||
        Number(b.cached) - Number(a.cached) ||
        Number(b.trackerRich) - Number(a.trackerRich) ||
        b.reportedSeeders - a.reportedSeeders ||
        b.compatibility - a.compatibility ||
        a.index - b.index
      );
    }

    if (mode === "compatible") {
      return (
        b.compatibility - a.compatibility ||
        Number(b.cached) - Number(a.cached) ||
        a.index - b.index
      );
    }

    if (mode === "smallest") {
      const aKnown = a.size > 0;
      const bKnown = b.size > 0;
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return (
        (aKnown && bKnown ? a.size - b.size : 0) ||
        Number(b.cached) - Number(a.cached) ||
        Number(b.trackerRich) - Number(a.trackerRich) ||
        b.reportedSeeders - a.reportedSeeders ||
        b.compatibility - a.compatibility ||
        a.index - b.index
      );
    }

    return a.index - b.index;
  });
};
