import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

import { base44 } from "@/api/base44Client";

import {
  fetchBrowserAddonStreams,
  mergeAddonStreams,
  shouldUseBrowserAddonFallback,
} from "@/components/mg/addonBrowserFallback";

import VideoPlayer from "@/components/mg/VideoPlayer";
import {
  getPlaybackDeviceProfile,
  scoreSourceCompatibility,
} from "@/components/mg/mediaCompatibility";
import { devicePlaybackReliabilityAdjustment } from "@/components/mg/playbackReliability";
import { readPlaybackPreferences } from "@/components/mg/playbackPreferences";
import { debridProviderScoreHints } from "@/components/mg/debridProviderReliability";

const PlayerContext = createContext(null);

const FOREIGN_RE =
  /(truefrench|vostfr|vost|subfrench|\bvf\b|\bvff\b|\bvfi\b|french|spanish|german|italian|\bdubbed\b|multi-audio|multiaudio|dual[ ._-]?audio)/i;

const RES_RE =
  /(2160|1080|720|480)p/i;

const AUDIO_AAC_RE =
  /\b(aac|aac2\.0|aac5\.1|he-aac)\b/i;

const AUDIO_DOLBY_RE =
  /\b(eac3|e-ac-3|ddp|dd\+|ac3|dolby[ ._-]?digital)\b/i;

const AUDIO_RISKY_RE =
  /\b(dts(?:-hd)?|truehd|mlp)\b/i;

const PLAYBACK_RELIABILITY_KEY =
  "mg:playback-reliability-v1";

const reliabilityLabel = (item) =>
  String(
    item?.label ||
      item?.name ||
      item?.title ||
      ""
  )
    .replace(/^failed\s*[—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

const readReliabilityStore = () => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(
      PLAYBACK_RELIABILITY_KEY
    );
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const reliabilityAdjustment = (item) => {
  const label = reliabilityLabel(item);
  const key = label.toLowerCase().slice(0, 260);

  if (!key) {
    return 0;
  }

  const record = readReliabilityStore()[key];

  if (!record || typeof record !== "object") {
    return 0;
  }

  const now = Date.now();
  const fresh = (value, ttl) =>
    Number(value || 0) > now - ttl;

  let score = 0;

  if (fresh(record.lastNoSound, 7 * 24 * 60 * 60 * 1000)) {
    score -=
      500000 +
      Math.min(200000, Number(record.noSound || 0) * 25000);
  }

  if (fresh(record.lastFailure, 12 * 60 * 60 * 1000)) {
    score -=
      220000 +
      Math.min(150000, Number(record.failures || 0) * 18000);
  }

  if (fresh(record.lastBuffer, 48 * 60 * 60 * 1000)) {
    score -= Math.min(
      36000,
      Number(record.buffers || 0) * 4500
    );
  }

  if (fresh(record.lastStartAt, 30 * 24 * 60 * 60 * 1000)) {
    const average = Number(record.avgStartMs || 0);

    if (average > 0 && average <= 2500) score += 9000;
    else if (average <= 5000) score += 4500;
    else if (average >= 15000) score -= 16000;
    else if (average >= 9000) score -= 8000;
  }

  if (fresh(record.lastGood, 30 * 24 * 60 * 60 * 1000)) {
    score += 3500;
  }

  return score;
};

const unwrap = (response) =>
  response?.data ??
  response ??
  {};

const getSourceUrl = (item) =>
  String(
    item?.src ||
      item?.url ||
      item?.magnet ||
      item?.magnetLink ||
      ""
  ).trim();

const sourceMagnetHash = (item) => {
  const raw = getSourceUrl(item);
  const match = raw.match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i);
  const hash = String(
    match?.[1] ||
      (/^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(raw) ? raw : "")
  )
    .toLowerCase()
    .trim();

  return hash;
};

const isMagnetSource = (item) => {
  const value =
    getSourceUrl(
      item
    ).toLowerCase();

  return (
    item?.type === "rd" ||
    item?.type === "rd_torrent" ||
    item?.type === "magnet" ||
    item?.type === "torrent" ||
    value.startsWith("magnet:")
  );
};

const isDirectSource = (item) => {
  const value =
    getSourceUrl(item);

  return (
    /^https?:\/\//i.test(value) &&
    !isMagnetSource(item) &&
    item?.type !== "provider" &&
    item?.type !== "youtube"
  );
};

const normaliseSource = (item) => {
  if (!item) {
    return null;
  }

  const url =
    getSourceUrl(item);

  return {
    ...item,

    src:
      item?.src ||
      url,

    url:
      item?.url ||
      url,
  };
};

const dedupeSources = (items) =>
  mergeAddonStreams(items);

const annotateDebridCache = async (items, hasDebrid) => {
  const sources = Array.isArray(items) ? items : [];
  if (!hasDebrid) return sources;

  const hashes = sources
    .filter(isMagnetSource)
    .map(sourceMagnetHash)
    .filter(Boolean)
    .filter((hash, index, list) => list.indexOf(hash) === index)
    .slice(0, 80);

  if (hashes.length === 0) return sources;

  try {
    const response = await base44.functions.invoke(
      "multiDebrid",
      {
        action: "check_cache",
        hashes,
        provider_scores: debridProviderScoreHints(),
      }
    );
    const data = unwrap(response);
    const cached = data?.cached || {};
    const best = data?.bestProviderByHash || {};
    const providerStats = data?.providerStats || {};

    return sources.map((item) => {
      const hash = sourceMagnetHash(item);
      if (!hash) return item;

      const cachedProviders = Object.keys(cached).filter(
        (key) => cached?.[key]?.[hash] === true
      );

      return {
        ...item,
        debridCacheChecked: true,
        debridCached: cachedProviders.length > 0,
        cachedProviders,
        debridProvider: best?.[hash] || item?.debridProvider || "",
        debridProviderStats: providerStats,
      };
    });
  } catch {
    return sources;
  }
};

const scoreSource = (item) => {
  const label =
    String(
      item?.label ||
      item?.name ||
      ""
    );

  const resolution =
    Number(
      (
        label.match(
          RES_RE
        ) ||
        []
      )[1] ||
      0
    );

  const foreignPenalty =
    FOREIGN_RE.test(
      label
    )
      ? 10000
      : 0;

  const rdLibraryBonus =
    item?.viaRealDebrid
      ? 20000
      : 0;

  const directBonus =
    isDirectSource(item)
      ? 5000
      : 0;

  const audioText = String(
    [
      item?.label,
      item?.name,
      item?.title,
      item?.description,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const audioCompatibility =
    AUDIO_AAC_RE.test(audioText)
      ? 3200
      : AUDIO_DOLBY_RE.test(audioText)
        ? 2200
        : AUDIO_RISKY_RE.test(audioText)
          ? -4200
          : 0;

  const deviceProfile = getPlaybackDeviceProfile();
  const playbackPreferences = readPlaybackPreferences();
  const compatibilityScore = scoreSourceCompatibility(
    item,
    audioText,
    {
      deviceProfile,
      qualityPreference: playbackPreferences.quality,
    }
  );
  const deviceLearning = devicePlaybackReliabilityAdjustment(
    label,
    deviceProfile
  );
  const explicitPriority =
    Math.max(
      -100,
      Math.min(
        100,
        Number(item?.playbackPriority || 0)
      )
    ) * 10000;
  const debridCacheScore = item?.debridCached
    ? 32000 + Math.min(6000, Number(item?.cachedProviders?.length || 0) * 1200)
    : item?.debridCacheChecked && isMagnetSource(item)
      ? -9000
      : 0;

  return (
    explicitPriority +
    debridCacheScore +
    rdLibraryBonus +
    directBonus +
    audioCompatibility +
    compatibilityScore +
    reliabilityAdjustment(item) +
    deviceLearning +
    resolution -
    foreignPenalty
  );
};

const sortSources = (items) =>
  [...items].sort(
    (a, b) =>
      scoreSource(b) -
      scoreSource(a)
  );

const resolveImdbInfo = async ({
  id,
  tmdbId,
  tmdb_id,
  imdbId,
  imdb_id,
  mediaType,
  title,
  year,
}) => {
  const supplied =
    String(
      imdbId ||
      imdb_id ||
      ""
    ).trim();

  if (
    /^tt\d+$/i.test(
      supplied
    )
  ) {
    return {
      imdbId:
        supplied,

      status:
        "OK",

      method:
        "supplied",

      error:
        "",
    };
  }

  if (
    id &&
    /^tt\d+$/i.test(
      String(id)
    )
  ) {
    return {
      imdbId:
        String(id),

      status:
        "OK",

      method:
        "item_id",

      error:
        "",
    };
  }

  try {
    const response =
      await base44.functions.invoke(
        "resolveImdb",
        {
          imdb_id:
            supplied,

          tmdb_id:
            tmdbId ??
            tmdb_id ??
            id ??
            "",

          title:
            title ||
            "",

          year:
            year ??
            "",

          media_type:
            mediaType ===
            "tv"
              ? "tv"
              : "movie",
        }
      );

    const data =
      unwrap(
        response
      );

    const resolved =
      String(
        data?.imdb_id ||
        ""
      ).trim();

    if (
      /^tt\d+$/i.test(
        resolved
      )
    ) {
      return {
        imdbId:
          resolved,

        status:
          "OK",

        method:
          data?.source ||
          "resolveImdb",

        error:
          "",
      };
    }

    return {
      imdbId:
        "",

      status:
        "FAILED",

      method:
        "resolveImdb",

      error:
        data?.error ||
        "IMDb id was not returned.",
    };
  } catch (error) {
    return {
      imdbId:
        "",

      status:
        "FAILED",

      method:
        "resolveImdb",

      error:
        error?.message ||
        "IMDb lookup call failed.",
    };
  }
};

const fetchServerAddonSources = async ({
  imdbId,
  tmdbId,
  title,
  year,
  mediaType,
  season,
  episode,
  fastMode = false,
}) => {
  if (!imdbId) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      reason:
        "IMDb id could not be resolved for this title.",

      status:
        "BLOCKED",

      error:
        "IMDb missing",
    };
  }

  if (
    mediaType === "tv" &&
    (
      season == null ||
      episode == null
    )
  ) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      reason:
        "Select a season and episode first.",

      status:
        "BLOCKED",

      error:
        "Episode missing",
    };
  }

  try {
    const response =
      await base44.functions.invoke(
        "fetchAddonStreams",
        {
          imdb_id:
            imdbId,

          tmdb_id:
            tmdbId ??
            "",

          title:
            title ||
            "",

          year:
            year ??
            "",

          media_type:
            mediaType ===
            "tv"
              ? "tv"
              : "movie",

          fast_mode:
            Boolean(fastMode),

          ...(season != null
            ? {
                season,
              }
            : {}),

          ...(episode != null
            ? {
                episode,
              }
            : {}),
        }
      );

    const data =
      unwrap(
        response
      );

    return {
      streams:
        Array.isArray(
          data?.streams
        )
          ? data.streams
          : [],

      diagnostics:
        Array.isArray(
          data?.diagnostics
        )
          ? data.diagnostics
          : [],

      addonsChecked:
        Number(
          data?.addons_checked ||
          0
        ),

      reason:
        data?.reason ||
        data?.error ||
        "",

      status:
        data?.error
          ? "FAILED"
          : "OK",

      error:
        data?.error ||
        "",
    };
  } catch (error) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      reason:
        error?.message ||
        "Configured source lookup failed.",

      status:
        "FAILED",

      error:
        error?.message ||
        "fetchAddonStreams call failed.",
    };
  }
};

const fetchAddonSources = async (
  args
) => {
  const server =
    await fetchServerAddonSources(
      args
    );

  if (
    args?.fastMode ||
    !shouldUseBrowserAddonFallback(
      server
    )
  ) {
    return {
      ...server,

      browserAttempted:
        false,

      browserRecovered:
        0,

      browserDiagnostics:
        [],
    };
  }

  const browser =
    await fetchBrowserAddonStreams({
      imdbId:
        args.imdbId,

      mediaType:
        args.mediaType,

      season:
        args.season,

      episode:
        args.episode,
    });

  const streams =
    mergeAddonStreams(
      server.streams,
      browser.streams
    );

  return {
    ...server,

    streams,

    diagnostics: [
      ...(
        server.diagnostics ||
        []
      ),

      ...(
        browser.diagnostics ||
        []
      ),
    ],

    addonsChecked:
      Math.max(
        Number(
          server.addonsChecked ||
          0
        ),

        Number(
          browser.addonsChecked ||
          0
        )
      ),

    status:
      streams.length > 0
        ? "OK"
        : server.status,

    reason:
      browser.streams
        ?.length > 0
        ? `Browser fallback recovered ${browser.streams.length} playable source${
            browser.streams.length ===
            1
              ? ""
              : "s"
          }.`
        : server.reason ||
          browser.error ||
          "",

    browserAttempted:
      Boolean(
        browser.attempted
      ),

    browserRecovered:
      Array.isArray(
        browser.streams
      )
        ? browser.streams.length
        : 0,

    browserDiagnostics:
      browser.diagnostics ||
      [],
  };
};

const findRdLibrarySource = async ({
  title,
  year,
  season,
  episode,
}) => {
  if (!title) {
    return {
      source:
        null,

      status:
        "SKIPPED",

      detail:
        "No title",
    };
  }

  try {
    const response =
      await base44.functions.invoke(
        "realDebrid",
        {
          action:
            "find_cached",

          title,

          ...(year != null
            ? {
                year,
              }
            : {}),

          ...(season != null
            ? {
                season,
              }
            : {}),

          ...(episode != null
            ? {
                episode,
              }
            : {}),
        }
      );

    const data =
      unwrap(
        response
      );

    if (
      data?.status ===
        "ready" &&
      data?.stream_url
    ) {
      return {
        source: {
          label:
            data?.filename ||
            "Real-Debrid Library",

          type:
            "url",

          src:
            data.stream_url,

          url:
            data.stream_url,

          addon:
            "Real-Debrid Library",

          viaRealDebrid:
            true,

          rdTorrentId:
            data?.torrent_id ||
            "",

          audioRescue:
            data?.audio_rescue ||
            null,

          mediaInfo:
            data?.media_info ||
            null,
        },

        status:
          "FOUND",

        detail:
          "Library match ready",
      };
    }

    if (data?.error) {
      return {
        source:
          null,

        status:
          "FAILED",

        detail:
          data.error,
      };
    }

    return {
      source:
        null,

      status:
        "CONNECTED",

      detail:
        data?.status ||
        "No library match",
    };
  } catch (error) {
    return {
      source:
        null,

      status:
        "FAILED",

      detail:
        error?.message ||
        "Real-Debrid lookup failed.",
    };
  }
};

const orderSources = ({
  sources,
  hasDebrid,
  preferRd,
}) => {
  const usable =
    hasDebrid
      ? sources
      : sources.filter(
          (item) =>
            !isMagnetSource(
              item
            )
        );

  const rdLibrary =
    usable.filter(
      (item) =>
        item?.viaRealDebrid &&
        isDirectSource(
          item
        )
    );

  const direct =
    usable.filter(
      (item) =>
        !item?.viaRealDebrid &&
        isDirectSource(
          item
        )
    );

  const rdMagnets =
    hasDebrid
      ? usable.filter(
          isMagnetSource
        )
      : [];

  const live =
    usable.filter(
      (item) =>
        item?.type ===
          "live" ||
        item?.live
    );

  const youtube =
    usable.filter(
      (item) =>
        item?.type ===
        "youtube"
    );

  const providers =
    usable.filter(
      (item) =>
        item?.type ===
        "provider"
    );

  const other =
    usable.filter(
      (item) =>
        !rdLibrary.includes(
          item
        ) &&
        !direct.includes(
          item
        ) &&
        !rdMagnets.includes(
          item
        ) &&
        !live.includes(
          item
        ) &&
        !youtube.includes(
          item
        ) &&
        !providers.includes(
          item
        )
    );

  if (preferRd) {
    return [
      ...rdLibrary,

      ...sortSources(
        rdMagnets
      ),

      ...sortSources(
        direct
      ),

      ...live,

      ...other,

      ...youtube,

      ...providers,
    ];
  }

  return [
    ...rdLibrary,

    ...sortSources(
      direct
    ),

    ...sortSources(
      rdMagnets
    ),

    ...live,

    ...other,

    ...youtube,

    ...providers,
  ];
};

const compactAddonDiagnostics = (
  diagnostics
) => {
  const browserRecovered =
    (
      diagnostics ||
      []
    ).filter(
      (item) =>
        item?.status ===
        "browser_ok"
    );

  if (
    browserRecovered.length >
    0
  ) {
    return browserRecovered
      .slice(
        0,
        4
      )
      .map(
        (item) =>
          `${String(
            item?.name ||
            "Addon"
          ).trim()}: ${Number(
            item?.playable_count ||
            0
          )} browser usable`
      )
      .join(
        " · "
      );
  }

  return (
    diagnostics ||
    []
  )
    .filter(
      (item) =>
        !item?.browser
    )
    .slice(
      0,
      4
    )
    .map(
      (item) => {
        const name =
          String(
            item?.name ||
            "Addon"
          ).trim();

        const status =
          String(
            item?.status ||
            "unknown"
          ).trim();

        const playable =
          Number(
            item?.playable_count ||
            0
          );

        if (
          status === "ok"
        ) {
          return `${name}: ${playable} usable`;
        }

        return `${name}: ${status}`;
      }
    )
    .join(
      " · "
    );
};

const buildDiagnosticLabel = ({
  imdbInfo,
  addonLookup,
  rdLookup,
  hasRd,
}) => {
  const parts = [];

  parts.push(
    imdbInfo?.imdbId
      ? `IMDb ${imdbInfo.imdbId} ✓`
      : "IMDb FAILED"
  );

  parts.push(
    addonLookup?.status ===
    "OK"
      ? "Source search ✓"
      : addonLookup?.status ===
          "BLOCKED"
        ? "Source search BLOCKED"
        : "Source search FAILED"
  );

  parts.push(
    `Addons ${Number(
      addonLookup?.addonsChecked ||
      0
    )}`
  );

  parts.push(
    `Returned ${
      Array.isArray(
        addonLookup?.streams
      )
        ? addonLookup
            .streams
            .length
        : 0
    }`
  );

  if (
    addonLookup
      ?.browserAttempted
  ) {
    parts.push(
      `Browser ${Number(
        addonLookup
          ?.browserRecovered ||
        0
      )}`
    );
  }

  parts.push(
    hasRd
      ? `RD ${
          rdLookup?.status ||
          "CONNECTED"
        }`
      : "RD NOT CONNECTED"
  );

  const addonDetails =
    compactAddonDiagnostics(
      addonLookup?.diagnostics
    );

  if (addonDetails) {
    parts.push(
      addonDetails
    );
  }

  const reason =
    addonLookup?.reason ||
    imdbInfo?.error ||
    rdLookup?.detail ||
    "No playable source was returned.";

  if (reason) {
    parts.push(
      reason
    );
  }

  return parts.join(
    " | "
  );
};

export function PlayerProvider({
  children,
}) {
  const [
    source,
    setSource,
  ] =
    useState(
      null
    );

  const [
    hasRd,
    setHasRd,
  ] =
    useState(
      false
    );

  const [
    hasDebrid,
    setHasDebrid,
  ] =
    useState(
      false
    );

  const playSequenceRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const syncDebridConnections = () => {
      base44.auth
        .me()
        .then((user) => {
          if (!mounted) return;

          const realDebridConnected = Boolean(user?.rd_token);
          const configuredByKey = {
            realdebrid: realDebridConnected,
            alldebrid: Boolean(user?.alldebrid_token),
            torbox: Boolean(user?.torbox_token),
            premiumize: Boolean(user?.premiumize_token),
            debridlink: Boolean(user?.debridlink_token),
          };
          const anyDebridConnected = Object.values(configuredByKey).some(Boolean);

          setHasRd(realDebridConnected);
          setHasDebrid(anyDebridConnected);
        })
        .catch(() => {
          if (!mounted) return;
          setHasRd(false);
          setHasDebrid(false);
        });
    };

    syncDebridConnections();
    window.addEventListener(
      "mg:debrid-providers-changed",
      syncDebridConnections
    );

    return () => {
      mounted = false;
      window.removeEventListener(
        "mg:debrid-providers-changed",
        syncDebridConnections
      );
    };
  }, []);

  const play =
    useCallback(
      async (
        request = {}
      ) => {
        const playId = ++playSequenceRef.current;
        const isCurrentPlay = () =>
          playSequenceRef.current === playId;

        const originalSources =
          Array.isArray(
            request?.sources
          )
            ? request.sources
                .map(
                  normaliseSource
                )
                .filter(
                  Boolean
                )
            : [];

        const isLive =
          request?.type ===
            "live" ||
          originalSources.some(
            (item) =>
              item?.live ||
              item?.type ===
                "live"
          );

        const mediaType =
          request?.mediaType ===
            "tv" ||
          request?.type ===
            "series" ||
          request?.season !=
            null ||
          request?.episode !=
            null ||
          request?.rdSeason !=
            null ||
          request?.rdEpisode !=
            null
            ? "tv"
            : "movie";

        const season =
          request?.season ??
          request?.rdSeason ??
          null;

        const episode =
          request?.episode ??
          request?.rdEpisode ??
          null;

        const tmdbId =
          request?.tmdbId ??
          request?.tmdb_id ??
          request?.id ??
          "";

        const initialOrderedSources =
          orderSources({
            sources: dedupeSources(originalSources),
            hasDebrid,
            preferRd: Boolean(request?.preferRd),
          });

        const initialPlayableSources =
          initialOrderedSources.filter(
            (item) =>
              isDirectSource(item) ||
              isMagnetSource(item) ||
              item?.type === "live" ||
              item?.live
          );

        const initialSources =
          initialPlayableSources.length > 0
            ? initialPlayableSources
            : [
                {
                  label: "Finding the fastest source…",
                  type: "status",
                  src: "",
                  url: "",
                  diagnostic: true,
                },
              ];

        const initialPrimary = initialSources[0] || {};
        let fastStartPrimaryUrl = getSourceUrl(initialPrimary);
        const suppliedImdbId = String(
          request?.imdbId || request?.imdb_id || ""
        ).trim();

        /*
         * FAST START: open the player immediately. Source discovery continues
         * in the background and replaces this loading row as soon as either
         * Real-Debrid or an addon returns something playable.
         */
        setSource({
          ...request,
          playRequestId: playId,
          id: request?.id,
          tmdbId,
          imdbId: suppliedImdbId,
          title: request?.title || "Video",
          poster: request?.poster || request?.poster_url || "",
          year: request?.year,
          mediaType,
          season,
          episode,
          rdTitle: request?.rdTitle || request?.title || "",
          rdYear: request?.rdYear ?? request?.year ?? null,
          rdSeason: request?.rdSeason ?? season,
          rdEpisode: request?.rdEpisode ?? episode,
          sources: initialSources,
          src: getSourceUrl(initialPrimary),
          url: getSourceUrl(initialPrimary),
          hasRd,
          hasDebrid,
          sourceDiagnostics: {
            phase: "searching",
            tmdbId,
            mediaType,
            season,
            episode,
            rdConnected: hasRd,
            debridConnected: hasDebrid,
          },
        });

        const publishEarlySources = (
          incomingSources,
          diagnosticsPatch = {}
        ) => {
          if (!isCurrentPlay()) {
            return;
          }

          const incoming = Array.isArray(incomingSources)
            ? incomingSources.filter(Boolean)
            : [];

          if (incoming.length === 0) {
            return;
          }

          setSource((current) => {
            if (
              !current ||
              current.playRequestId !== playId ||
              !isCurrentPlay()
            ) {
              return current;
            }

            const existing = Array.isArray(current.sources)
              ? current.sources.filter((item) => !item?.diagnostic)
              : [];

            const ordered = orderSources({
              sources: dedupeSources([
                ...incoming,
                ...existing,
                ...originalSources,
              ]),
              hasDebrid,
              preferRd: Boolean(request?.preferRd),
            });

            const playable = ordered.filter(
              (item) =>
                isDirectSource(item) ||
                isMagnetSource(item) ||
                item?.type === "live" ||
                item?.live
            );

            if (playable.length === 0) {
              return {
                ...current,
                sourceDiagnostics: {
                  ...(current.sourceDiagnostics || {}),
                  ...diagnosticsPatch,
                },
              };
            }

            if (fastStartPrimaryUrl) {
              const lockedIndex = ordered.findIndex(
                (item) => getSourceUrl(item) === fastStartPrimaryUrl
              );

              if (lockedIndex > 0) {
                const [locked] = ordered.splice(lockedIndex, 1);
                ordered.unshift(locked);
              }
            }

            const primary = ordered[0] || {};

            if (!fastStartPrimaryUrl) {
              fastStartPrimaryUrl = getSourceUrl(primary);
            }

            return {
              ...current,
              sources: ordered,
              src: getSourceUrl(primary),
              url: getSourceUrl(primary),
              sourceDiagnostics: {
                ...(current.sourceDiagnostics || {}),
                phase: "fast-start",
                ...diagnosticsPatch,
              },
            };
          });
        };

        const rdPromise =
          !isLive &&
          hasRd &&
          !request?.noRd &&
          !request?.skipRdLookup
            ? findRdLibrarySource({
                title: request?.rdTitle || request?.title || "",
                year: request?.rdYear ?? request?.year ?? null,
                season,
                episode,
              })
            : Promise.resolve({
                source: null,
                status: hasRd ? "SKIPPED" : "NOT CONNECTED",
                detail: hasRd ? "RD lookup skipped" : "No RD token",
              });

        rdPromise.then((rdLookup) => {
          if (rdLookup?.source) {
            publishEarlySources([rdLookup.source], {
              rdLookupStatus: rdLookup?.status || "READY",
              rdLookupDetail: rdLookup?.detail || "",
            });
          }
        });

        const imdbInfo =
          isLive
            ? {
                imdbId:
                  request?.imdbId ||
                  request?.imdb_id ||
                  "",

                status:
                  "SKIPPED",

                method:
                  "live",

                error:
                  "",
              }
            : await resolveImdbInfo(
                {
                  ...request,

                  tmdbId,

                  mediaType,
                }
              );

        const imdbId =
          imdbInfo.imdbId;

        const addonArgs = {
          imdbId,
          tmdbId,
          title:
            request?.rdTitle ||
            request?.title ||
            "",
          year:
            request?.rdYear ??
            request?.year ??
            "",
          mediaType,
          season,
          episode,
        };

        const skippedAddonLookup = {
          streams: [],
          diagnostics: [],
          addonsChecked: 0,
          reason: "Source lookup skipped.",
          status: "SKIPPED",
          error: "",
          browserAttempted: false,
          browserRecovered: 0,
          browserDiagnostics: [],
        };

        const fastAddonPromise =
          !isLive &&
          !request?.skipAddonLookup
            ? fetchAddonSources({
                ...addonArgs,
                fastMode: true,
              })
            : Promise.resolve(skippedAddonLookup);

        fastAddonPromise.then((addonLookup) => {
          if (
            Array.isArray(addonLookup?.streams) &&
            addonLookup.streams.length > 0
          ) {
            publishEarlySources(addonLookup.streams, {
              imdbId,
              imdbStatus: imdbInfo?.status || "UNKNOWN",
              addonLookupStatus: "FAST READY",
              addonsChecked: Number(addonLookup?.addonsChecked || 0),
              discoveredCount: addonLookup.streams.length,
            });
          }
        });

        const addonPromise =
          !isLive &&
          !request?.skipAddonLookup
            ? fetchAddonSources({
                ...addonArgs,
                fastMode: false,
              })
            : Promise.resolve(skippedAddonLookup);

        addonPromise.then((addonLookup) => {
          if (
            Array.isArray(addonLookup?.streams) &&
            addonLookup.streams.length > 0
          ) {
            publishEarlySources(addonLookup.streams, {
              imdbId,
              imdbStatus: imdbInfo?.status || "UNKNOWN",
              addonLookupStatus: addonLookup?.status || "READY",
              addonsChecked: Number(addonLookup?.addonsChecked || 0),
              discoveredCount: addonLookup.streams.length,
            });
          }
        });

        const [
          addonLookup,
          rdLookup,
        ] =
          await Promise.all(
            [
              addonPromise,

              rdPromise,
            ]
          );

        const combined =
          dedupeSources(
            [
              ...(rdLookup
                ?.source
                ? [
                    rdLookup
                      .source,
                  ]
                : []),

              ...(
                addonLookup
                  ?.streams ||
                []
              ),

              ...originalSources,
            ]
          );

        const cacheAnnotatedCombined =
          await annotateDebridCache(
            combined,
            hasDebrid
          );

        if (!isCurrentPlay()) {
          return;
        }

        let orderedSources =
          orderSources({
            sources:
              cacheAnnotatedCombined,

            hasDebrid,

            preferRd:
              Boolean(
                request
                  ?.preferRd
              ),
          });

        const playbackSources =
          orderedSources.filter(
            (item) =>
              isDirectSource(
                item
              ) ||
              isMagnetSource(
                item
              ) ||
              item?.type ===
                "live" ||
              item?.live
          );

        const nonPlaybackSources =
          orderedSources.filter(
            (item) =>
              !playbackSources.includes(
                item
              )
          );

        const diagnosticLabel =
          buildDiagnosticLabel(
            {
              imdbInfo,

              addonLookup,

              rdLookup,

              hasRd,
            }
          );

        if (
          playbackSources.length ===
            0 &&
          !request
            ?.allowNonPlaybackFallback
        ) {
          orderedSources = [
            {
              label:
                diagnosticLabel,

              type:
                "status",

              src:
                "",

              url:
                "",

              diagnostic:
                true,
            },

            ...nonPlaybackSources,
          ];
        }

        if (
          orderedSources.length ===
          0
        ) {
          orderedSources = [
            {
              label:
                diagnosticLabel,

              type:
                "status",

              src:
                "",

              url:
                "",

              diagnostic:
                true,
            },
          ];
        }

        if (fastStartPrimaryUrl) {
          const lockedIndex = orderedSources.findIndex(
            (item) => getSourceUrl(item) === fastStartPrimaryUrl
          );
          const lockedItem = lockedIndex >= 0 ? orderedSources[lockedIndex] : null;
          const lockedIsKnownUncachedMagnet = Boolean(
            lockedItem &&
              isMagnetSource(lockedItem) &&
              lockedItem?.debridCacheChecked &&
              !lockedItem?.debridCached
          );
          const cachedAlternativeExists = orderedSources.some(
            (item, index) => index !== lockedIndex && item?.debridCached === true
          );

          if (
            lockedIndex > 0 &&
            !(lockedIsKnownUncachedMagnet && cachedAlternativeExists)
          ) {
            const [locked] = orderedSources.splice(lockedIndex, 1);
            orderedSources.unshift(locked);
          }
        }

        const primary =
          orderedSources[0] ||
          {};

        const activeUrl =
          getSourceUrl(
            primary
          );

        if (!isCurrentPlay()) {
          return false;
        }

        setSource({
          ...request,

          playRequestId:
            playId,

          id:
            request?.id,

          tmdbId,

          imdbId,

          title:
            request?.title ||
            "Video",

          poster:
            request?.poster ||
            request?.poster_url ||
            "",

          year:
            request?.year,

          mediaType,

          season,

          episode,

          rdTitle:
            request?.rdTitle ||
            request?.title ||
            "",

          rdYear:
            request?.rdYear ??
            request?.year ??
            null,

          rdSeason:
            request?.rdSeason ??
            season,

          rdEpisode:
            request?.rdEpisode ??
            episode,

          sources:
            orderedSources,

          src:
            activeUrl,

          url:
            activeUrl,

          hasRd,

          sourceDiagnostics: {
            imdbId,

            tmdbId,

            mediaType,

            season,

            episode,

            imdbStatus:
              imdbInfo?.status ||
              "UNKNOWN",

            imdbMethod:
              imdbInfo?.method ||
              "",

            imdbError:
              imdbInfo?.error ||
              "",

            addonLookupStatus:
              addonLookup?.status ||
              "UNKNOWN",

            addonsChecked:
              Number(
                addonLookup
                  ?.addonsChecked ||
                0
              ),

            diagnostics:
              addonLookup
                ?.diagnostics ||
              [],

            reason:
              addonLookup
                ?.reason ||
              "",

            discoveredCount:
              Array.isArray(
                addonLookup
                  ?.streams
              )
                ? addonLookup
                    .streams
                    .length
                : 0,

            browserAttempted:
              Boolean(
                addonLookup
                  ?.browserAttempted
              ),

            browserRecovered:
              Number(
                addonLookup
                  ?.browserRecovered ||
                0
              ),

            browserDiagnostics:
              addonLookup
                ?.browserDiagnostics ||
              [],

            rdConnected:
              hasRd,

            rdLookupStatus:
              rdLookup?.status ||
              (
                hasRd
                  ? "UNKNOWN"
                  : "NOT CONNECTED"
              ),

            rdLookupDetail:
              rdLookup?.detail ||
              "",

            diagnosticLabel,
          },
        });

        console.info(
          "[Media God] Playback diagnostics",
          {
            title:
              request?.title,

            tmdbId,

            imdbId,

            mediaType,

            season,

            episode,

            imdbStatus:
              imdbInfo?.status,

            addonLookupStatus:
              addonLookup
                ?.status,

            addonsChecked:
              addonLookup
                ?.addonsChecked,

            discoveredCount:
              Array.isArray(
                addonLookup
                  ?.streams
              )
                ? addonLookup
                    .streams
                    .length
                : 0,

            browserAttempted:
              addonLookup
                ?.browserAttempted,

            browserRecovered:
              addonLookup
                ?.browserRecovered,

            addonDiagnostics:
              addonLookup
                ?.diagnostics ||
              [],

            rdConnected:
              hasRd,

            rdLookupStatus:
              rdLookup
                ?.status,

            rdLookupDetail:
              rdLookup
                ?.detail,
          }
        );

        return true;
      },
      [
        hasRd,
        hasDebrid,
      ]
    );

  const close =
    useCallback(
      () => {
        playSequenceRef.current += 1;

        setSource(
          null
        );
      },
      []
    );

  const value =
    useMemo(
      () => ({
        play,

        close,

        hasRd,

        hasDebrid,

        isOpen:
          Boolean(source),
      }),
      [
        play,

        close,

        hasRd,

        hasDebrid,

        source,
      ]
    );

  return (
    <PlayerContext.Provider
      value={value}
    >
      {children}

      {source &&
        typeof document !== "undefined" &&
        createPortal(
          <VideoPlayer
            source={
              source
            }
            onClose={
              close
            }
          />,
          document.body
        )}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context =
    useContext(
      PlayerContext
    );

  if (!context) {
    throw new Error(
      "usePlayer must be used within a PlayerProvider"
    );
  }

  return context;
}

usePlayer.displayName =
  "usePlayer";

export const DEMO_VIDEO =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export function buildMediaSources({
  trailerUrl,
  providers,
}) {
  const sources =
    [];

  if (trailerUrl) {
    sources.push({
      label:
        "Trailer",

      type:
        "youtube",

      src:
        trailerUrl,

      url:
        trailerUrl,
    });
  }

  (
    providers ||
    []
  ).forEach(
    (provider) => {
      if (
        !provider?.link
      ) {
        return;
      }

      sources.push({
        label:
          provider?.name ||
          "Provider",

        type:
          "provider",

        src:
          provider.link,

        url:
          provider.link,

        logo:
          provider.logo,

        tier:
          provider.tier,
      });
    }
  );

  return sources;
}
