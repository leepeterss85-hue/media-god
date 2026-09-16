import {
  getPlaybackDeviceProfile,
  scoreSourceCompatibility,
} from "@/components/mg/mediaCompatibility";
import {
  MEDIA_EDITION_OPTIONS,
  detectMediaEdition,
  mediaEditionSortScore,
  sourceHasEdition,
} from "@/components/mg/mediaEdition";

export const SOURCE_SELECTOR_SORT_KEY = "mg:source-selector-sort-v1";
export const SOURCE_SELECTOR_SORT_EVENT = "mg:source-selector-sort-changed";

const BASE_SOURCE_SORT_OPTIONS = [
  { value: "best", label: "Best" },
  { value: "cached", label: "Cached" },
  { value: "4k", label: "4K" },
  { value: "1080p", label: "1080p" },
  { value: "compatible", label: "Compatible" },
  { value: "smallest", label: "Smallest" },
];

export const SOURCE_SORT_OPTIONS = [
  ...BASE_SOURCE_SORT_OPTIONS,
  ...MEDIA_EDITION_OPTIONS.filter((option) => option.value !== "any").map(
    (option) => ({
      value: `edition:${option.value}`,
      label: option.label,
    })
  ),
];

const allowedModes = new Set(SOURCE_SORT_OPTIONS.map((item) => item.value));

export const readSourceSortMode = () => {
  if (typeof window === "undefined") return "best";

  try {
    const value = String(
      window.localStorage.getItem(SOURCE_SELECTOR_SORT_KEY) || "best"
    );
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

export const sourceIsCached = (item) => {
  if (item?.cacheRequired === true || item?.cometUncached === true) {
    return false;
  }

  return (
    item?.debridCached === true ||
    item?.viaRealDebrid === true ||
    item?.runtimeReadyCached === true ||
    /\b(?:cached|instant|ready)\b/i.test(sourceText(item))
  );
};

const itemTorrentHash = (item) => {
  const raw = String(
    item?.infoHash ||
      item?.info_hash ||
      item?.hash ||
      item?.magnet ||
      item?.magnetLink ||
      item?.richMagnet ||
      item?.src ||
      item?.url ||
      ""
  );

  return raw.match(/(?:btih:)?([a-f0-9]{40,64})/i)?.[1]?.toLowerCase() || "";
};

export const sourceNeedsCachePreparation = (item) => {
  if (!item || sourceIsCached(item)) return false;

  const strategy = String(
    item?.resolutionStrategy || item?.resolution_strategy || ""
  )
    .trim()
    .toLowerCase();

  return (
    strategy === "comet_uncached" ||
    strategy === "rd_magnet" ||
    item?.cacheRequired === true ||
    item?.cometUncached === true ||
    (
      item?.debridCacheChecked === true &&
      Boolean(itemTorrentHash(item))
    )
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
  const list = (Array.isArray(sources) ? sources : []).map((item, index) => {
    const cached = sourceIsCached(item);
    const pendingCache = sourceNeedsCachePreparation(item);
    const edition = detectMediaEdition(item);

    return {
      item,
      index,
      cached,
      pendingCache,
      readyForUser: !pendingCache,
      editionValue: edition.value,
      editionLabel: edition.label,
      resolution: sourceResolution(item),
      size: sourceSize(item),
      compatibility: compatibilityScore(item),
      reportedSeeders: sourceReportedSeeders(item),
      trackerRich: sourceHasTrackerRichMagnet(item),
      editionScore: String(mode || "").startsWith("edition:")
        ? mediaEditionSortScore(item, String(mode).slice("edition:".length))
        : 0,
    };
  });

  if (mode === "best") {
    return list.slice().sort((a, b) =>
      Number(b.readyForUser) - Number(a.readyForUser) ||
      Number(b.cached) - Number(a.cached) ||
      b.compatibility - a.compatibility ||
      b.resolution - a.resolution ||
      Number(b.trackerRich) - Number(a.trackerRich) ||
      b.reportedSeeders - a.reportedSeeders ||
      a.index - b.index
    );
  }

  return list.slice().sort((a, b) => {
    if (String(mode || "").startsWith("edition:")) {
      return (
        b.editionScore - a.editionScore ||
        Number(b.readyForUser) - Number(a.readyForUser) ||
        Number(b.cached) - Number(a.cached) ||
        b.compatibility - a.compatibility ||
        b.resolution - a.resolution ||
        Number(b.trackerRich) - Number(a.trackerRich) ||
        b.reportedSeeders - a.reportedSeeders ||
        a.index - b.index
      );
    }

    if (mode === "cached") {
      return (
        Number(b.cached) - Number(a.cached) ||
        Number(b.readyForUser) - Number(a.readyForUser) ||
        b.compatibility - a.compatibility ||
        Number(b.trackerRich) - Number(a.trackerRich) ||
        b.reportedSeeders - a.reportedSeeders ||
        a.index - b.index
      );
    }

    if (mode === "4k" || mode === "1080p") {
      const target = mode === "4k" ? 2160 : 1080;
      return (
        targetResolutionScore(b.resolution, target) -
          targetResolutionScore(a.resolution, target) ||
        b.compatibility - a.compatibility ||
        Number(b.cached) - Number(a.cached) ||
        Number(b.trackerRich) - Number(a.trackerRich) ||
        b.reportedSeeders - a.reportedSeeders ||
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

export const sourceEntriesForPresentation = (entries, mode = "best") => {
  const list = (Array.isArray(entries) ? entries : []).filter(
    (entry) =>
      entry?.readyForUser === true &&
      entry?.item &&
      !entry.item?.diagnostic &&
      entry.item?.type !== "status"
  );

  const value = String(mode || "best");
  if (!value.startsWith("edition:")) return list;

  const edition = value.slice("edition:".length);
  return list.filter((entry) => sourceHasEdition(entry.item, edition));
};

export const editionPresentationState = (entries, mode = "best") => {
  const value = String(mode || "best");
  if (!value.startsWith("edition:")) {
    return {
      edition: "",
      label: "",
      discovered: false,
      readyCount: 0,
      pendingCount: 0,
      preparing: false,
    };
  }

  const edition = value.slice("edition:".length);
  const option = MEDIA_EDITION_OPTIONS.find((item) => item.value === edition);
  const matching = (Array.isArray(entries) ? entries : []).filter(
    (entry) => sourceHasEdition(entry?.item, edition)
  );
  const readyCount = matching.filter((entry) => entry.readyForUser === true).length;
  const pendingCount = matching.filter((entry) => entry.pendingCache === true).length;

  return {
    edition,
    label: option?.label || matching[0]?.editionLabel || edition,
    discovered: matching.length > 0,
    readyCount,
    pendingCount,
    preparing: readyCount === 0 && pendingCount > 0,
  };
};

export const sourceSortOptionsForEntries = (entries, currentMode = "best") => {
  const list = Array.isArray(entries) ? entries : [];
  const discovered = new Set(
    list
      .filter(
        (entry) =>
          entry?.item &&
          !entry.item?.diagnostic &&
          entry.item?.type !== "status"
      )
      .map((entry) => entry.editionValue || detectMediaEdition(entry.item).value)
  );

  const currentEdition = String(currentMode || "").startsWith("edition:")
    ? String(currentMode).slice("edition:".length)
    : "";

  if (currentEdition) discovered.add(currentEdition);

  const editionOptions = MEDIA_EDITION_OPTIONS
    .filter((option) => option.value !== "any" && discovered.has(option.value))
    .map((option) => {
      const mode = `edition:${option.value}`;
      const state = editionPresentationState(list, mode);

      return {
        value: mode,
        label: state.preparing
          ? `${option.label} • Preparing`
          : option.label,
        preparing: state.preparing,
        readyCount: state.readyCount,
        pendingCount: state.pendingCount,
      };
    });

  return [...BASE_SOURCE_SORT_OPTIONS, ...editionOptions];
};
