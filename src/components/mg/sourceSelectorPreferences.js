import { prioritiseCompatibleAutoplayEntries } from "@/components/mg/automaticSourceOrder";
import {
  detectLanguagePreference,
  getPlaybackDeviceProfile,
  scoreSourceCompatibility,
  sourcePlaybackCompatibilityTier,
} from "@/components/mg/mediaCompatibility";
import { readTrackPreferences } from "@/components/mg/mediaTrackPreferences";
import {
  MEDIA_EDITION_OPTIONS,
  detectMediaEdition,
  mediaEditionSortScore,
} from "@/components/mg/mediaEdition";
import {
  markTrustedCachedPools,
  prioritiseTrustedCachedPools,
} from "@/components/mg/trustedCachedSources";
import {
  sourceHasPendingCacheSignal,
  sourceIsConfirmedCachedForPlayback,
} from "@/components/mg/sourceCacheVisibility";
import {
  sourceIsAioStreamsCandidate,
  sourceLooksTorrentLike,
} from "@/components/mg/sourceProviderIdentity";

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

export const availableSourceSortOptions = (sources, options = {}) => {
  const mediaType = String(options?.mediaType || "").toLowerCase();
  const items = (Array.isArray(sources) ? sources : []).filter((item) =>
    sourceIsUserSelectable(item)
  );

  const available = [{ value: "best", label: "Best available" }];

  const hasCached = items.some((item) => sourceIsCached(item));

  /*
   * Movies should always expose the Cached / ready filter when a cached source
   * exists, even if it is currently the only selectable source. The old early
   * return hid the entire filter box in exactly that case.
   */
  const movieLike =
    mediaType !== "tv" &&
    mediaType !== "series";

  if (hasCached && (items.length > 1 || movieLike)) {
    available.push({ value: "cached", label: "Cached / ready" });
  }

  if (items.length <= 1) {
    return available;
  }

  const resolutions = items.map(sourceResolution);
  if (resolutions.some((value) => value >= 2000)) {
    available.push({ value: "4k", label: "4K" });
  }
  if (resolutions.some((value) => value >= 900 && value < 2000)) {
    available.push({ value: "1080p", label: "1080p" });
  }

  available.push({ value: "compatible", label: "Most compatible" });

  if (items.filter((item) => sourceSize(item) > 0).length >= 2) {
    available.push({ value: "smallest", label: "Smallest file" });
  }

  /*
   * Film editions are only useful when that edition actually exists in the
   * current source set. TV episodes must never inherit the global movie-edition
   * catalogue (Director's Cut, Roadshow, etc.) just because those modes exist
   * elsewhere in the app.
   */
  if (mediaType !== "tv" && mediaType !== "series") {
    const detected = items.map((item) => detectMediaEdition(item));
    const editionValues = new Set(
      detected
        .filter((entry) => entry?.explicit)
        .map((entry) => entry.value)
    );

    const hasStandard = detected.some(
      (entry) => entry?.value === "standard" && entry?.explicit === false
    );

    if (editionValues.size > 0 && hasStandard) {
      available.push({
        value: "edition:standard",
        label: "Standard / Original",
      });
    }

    MEDIA_EDITION_OPTIONS
      .filter(
        (option) =>
          option.value !== "any" &&
          option.value !== "standard" &&
          editionValues.has(option.value)
      )
      .forEach((option) => {
        available.push({
          value: `edition:${option.value}`,
          label: option.label,
        });
      });
  }

  return available;
};

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

const sourceIsCached = (item) =>
  sourceIsConfirmedCachedForPlayback(item) ||
  (
    !sourceHasPendingCacheSignal(item) &&
    /\b(?:cached|instant|ready)\b/i.test(sourceText(item))
  );

/*
 * Source visibility is intentionally independent of cache/readiness state.
 *
 * The selector is the user's complete discovery list: cached, uncached,
 * downloading, pending, unknown and failed rows all remain visible. Cache
 * metadata is still used for labels, sorting, background caching and automatic
 * playback decisions, but it must never hide a discovered source.
 *
 * Only diagnostic/status placeholder rows are excluded; cache state never is.
 */
export const sourceIsUserSelectable = (item) =>
  Boolean(
    item &&
      !item?.diagnostic &&
      String(item?.type || "").toLowerCase() !== "status"
  );

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

const hardSubtitleRank = (item) =>
  /\b(?:hardsubs?|hard[ ._-]?subbed|hardcoded[ ._-]?subs?|korsub|engsub|subbed)\b/i.test(
    sourceText(item)
  )
    ? 1
    : 0;

const sourceHasPlaybackProof = (item) =>
  Boolean(
    item?.launchQualified === true ||
      item?.playbackVerified === true ||
      item?.runtimePlaybackVerified === true
  );

const preferredSourceLanguageRank = (
  item,
  preferredAudioLanguage = "en"
) => {
  if (String(preferredAudioLanguage || "en").toLowerCase() !== "en") {
    return 0;
  }

  const language = detectLanguagePreference(item);
  if (language === "english") return 0;
  if (language === "multi") return 1;
  if (language === "unknown") return 2;
  if (language === "foreign") return 3;
  return 2;
};

const targetResolutionScore = (resolution, target) => {
  if (!resolution) return -100000;
  if (resolution === target) return 100000;

  const distance = Math.abs(resolution - target);
  const belowBonus = resolution < target ? 3000 : 0;
  return 80000 - distance * 30 + belowBonus;
};

export const sortSourceEntries = (sources, mode = readSourceSortMode()) => {
  const deviceProfile = getPlaybackDeviceProfile();
  const preferredAudioLanguage = String(
    readTrackPreferences()?.audioLanguage || "en"
  ).toLowerCase();
  const list = markTrustedCachedPools(
    (Array.isArray(sources) ? sources : []).map((item, index) => ({
      item,
      index,
      cached: sourceIsCached(item),
      resolution: sourceResolution(item),
      size: sourceSize(item),
      compatibility: scoreSourceCompatibility(item, sourceText(item), {
        deviceProfile,
        qualityPreference: "Auto",
      }),
      compatibilityTier: sourcePlaybackCompatibilityTier(item, sourceText(item), {
        deviceProfile,
      }),
      provenWorking: sourceHasPlaybackProof(item),
      languageRank: preferredSourceLanguageRank(item, preferredAudioLanguage),
      hardSubtitleRank: hardSubtitleRank(item),
      reportedSeeders: sourceReportedSeeders(item),
      trackerRich: sourceHasTrackerRichMagnet(item),
      aioStreamsFallback: sourceIsAioStreamsCandidate(item),
      editionScore: String(mode || "").startsWith("edition:")
        ? mediaEditionSortScore(item, String(mode).slice("edition:".length))
        : 0,
    }))
  );

  const hasNonAioTorrentCandidate = list.some(
    (entry) =>
      sourceIsUserSelectable(entry.item) &&
      sourceLooksTorrentLike(entry.item) &&
      entry.aioStreamsFallback !== true &&
      Number(entry.languageRank ?? 3) <= 2
  );

  if (mode === "best") {
    const trustedFirst = prioritiseTrustedCachedPools(list).map((entry) => ({
      ...entry,
      autoplayReady:
        sourceIsUserSelectable(entry.item) &&
        !(
          hasNonAioTorrentCandidate &&
          entry.aioStreamsFallback === true
        ) &&
        entry.cached === true &&
        (
          (
            entry.successfulPlayback === true &&
            Number(entry.successfulPlaybackLanguageRank ?? 3) <= 1
          ) ||
          entry.item?.launchQualified === true ||
          entry.item?.runtimeQualificationFallback === true ||
          (
            entry.languageRank === 0 &&
            (
              entry.provenWorking === true ||
              entry.compatibilityTier <= 1
            )
          )
        ),
    }));

    /*
     * AIOStreams remains a manual/final fallback, but it must never sit above a
     * normal torrent candidate merely because it was the first addon response.
     * This matters most while every source is still uncached: without this
     * explicit fallback rank there may be no autoplayReady rows yet, so the
     * original addon order would otherwise keep AIOStreams at the top.
     */
    const fallbackRanked = trustedFirst.slice().sort(
      (left, right) =>
        Number(
          Boolean(
            hasNonAioTorrentCandidate &&
              left.aioStreamsFallback === true
          )
        ) -
        Number(
          Boolean(
            hasNonAioTorrentCandidate &&
              right.aioStreamsFallback === true
          )
        )
    );

    return prioritiseCompatibleAutoplayEntries(fallbackRanked);
  }

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
        Number(b.provenWorking) - Number(a.provenWorking) ||
        a.compatibilityTier - b.compatibilityTier ||
        a.languageRank - b.languageRank ||
        a.hardSubtitleRank - b.hardSubtitleRank ||
        Number(b.cached) - Number(a.cached) ||
        b.compatibility - a.compatibility ||
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
