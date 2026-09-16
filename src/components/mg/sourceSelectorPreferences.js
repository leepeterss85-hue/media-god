import {
  getPlaybackDeviceProfile,
  scoreSourceCompatibility,
} from "@/components/mg/mediaCompatibility";
import {
  MEDIA_EDITION_OPTIONS,
  mediaEditionSortScore,
} from "@/components/mg/mediaEdition";
import {
  markTrustedCachedPools,
  prioritiseTrustedCachedPools,
} from "@/components/mg/trustedCachedSources";
import { chooseDebridResolutionStrategy } from "@/components/mg/debridResolutionStrategy";

export const SOURCE_SELECTOR_SORT_KEY = "mg:source-selector-sort-v1";
export const SOURCE_SELECTOR_SORT_EVENT = "mg:source-selector-sort-changed";

export const SOURCE_SORT_OPTIONS = [
  { value: "best", label: "Best" },
  { value: "cached", label: "Cached" },
  { value: "4k", label: "4K" },
  { value: "1080p", label: "1080p" },
  { value: "compatible", label: "Compatible" },
  { value: "smallest", label: "Smallest" },
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

const selectableTorrentHash = (item) => {
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

const selectableSourceUrl = (item) =>
  String(
    item?.src ||
      item?.url ||
      item?.magnet ||
      item?.magnetLink ||
      ""
  ).trim();

export const sourceIsUserSelectable = (item) => {
  if (!item) return false;

  // These states are authoritative: the background/foreground RD cache engine
  // has already proved that this torrent is ready for immediate playback.
  if (item?.debridCached === true || item?.runtimeReadyCached === true) {
    return true;
  }

  // Discovery flags identify a torrent that still needs Real-Debrid work. Keep
  // it in the internal source pool so background caching can continue, but do
  // not expose it in any user-facing source chooser yet.
  if (item?.cacheRequired === true || item?.cometUncached === true) {
    return false;
  }

  const hash = selectableTorrentHash(item);
  const url = selectableSourceUrl(item);
  const type = String(item?.type || "").trim().toLowerCase();
  const torrentLike =
    type === "rd" ||
    type === "rd_torrent" ||
    type === "torrent" ||
    type === "magnet" ||
    /^magnet:/i.test(url) ||
    Boolean(hash);

  // Normal direct/provider URLs are not waiting on the torrent cache pipeline.
  if (!torrentLike) return true;

  // A resolved Real-Debrid HTTP stream is already usable even when its original
  // torrent hash is retained as metadata on the source row.
  if (item?.viaRealDebrid === true && /^https?:\/\//i.test(url)) {
    return true;
  }

  const strategy = chooseDebridResolutionStrategy(item, {
    debridCached: false,
  });

  if (strategy === "comet_uncached" || strategy === "rd_magnet") {
    return false;
  }

  if (
    item?.debridCacheChecked === true &&
    item?.debridCached !== true &&
    Boolean(hash)
  ) {
    return false;
  }

  return true;
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
  const list = markTrustedCachedPools(
    (Array.isArray(sources) ? sources : []).map((item, index) => ({
      item,
      index,
      cached: sourceIsCached(item),
      resolution: sourceResolution(item),
      size: sourceSize(item),
      compatibility: compatibilityScore(item),
      reportedSeeders: sourceReportedSeeders(item),
      trackerRich: sourceHasTrackerRichMagnet(item),
      editionScore: String(mode || "").startsWith("edition:")
        ? mediaEditionSortScore(item, String(mode).slice("edition:".length))
        : 0,
    }))
  );

  if (mode === "best") return prioritiseTrustedCachedPools(list);

  return list.slice().sort((a, b) => {
    if (String(mode || "").startsWith("edition:")) {
      return (
        b.editionScore - a.editionScore ||
        Number(b.trustedCached) - Number(a.trustedCached) ||
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
        Number(b.trustedCached) - Number(a.trustedCached) ||
        Number(b.cached) - Number(a.cached) ||
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
