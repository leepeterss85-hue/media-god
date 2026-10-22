import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { base44 } from "@/api/base44Client";
import { canonicalizeCatalogPlaybackRequest } from "./catalogMediaIdentity";
import { episodeHasAired, freshEpisodePreparation, resetEpisodePlaybackState, shouldRefreshEpisodePreparation } from "./episodeExperience";
import { restoreResumeSource } from "./resumeSource";

import {
  PlayerProvider as CorePlayerProvider,
  usePlayer as useCorePlayer,
  DEMO_VIDEO,
  buildMediaSources,
} from "./MediaPlayerProvider.jsx";

const EnhancedPlayerContext = createContext(null);

const unwrap = (response) =>
  response?.data ??
  response ??
  {};

const positiveInt = (value) => {
  const number = Number(value);

  return Number.isInteger(number) && number > 0
    ? number
    : null;
};

const finiteSeconds = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? number
    : null;
};

const playbackMarker = (request, type, edge) => {
  const capitalType = `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  const capitalEdge = `${edge.charAt(0).toUpperCase()}${edge.slice(1)}`;
  const markers = request?.skipMarkers || request?.skip_markers || {};
  const nested = markers?.[type] || {};

  return finiteSeconds(
    request?.[`${type}${capitalEdge}`] ??
      request?.[`${type}_${edge}`] ??
      request?.[`skip${capitalType}${capitalEdge}`] ??
      nested?.[edge]
  );
};

const isTvRequest = (request) =>
  request?.mediaType === "tv" ||
  request?.type === "series" ||
  request?.season != null ||
  request?.episode != null ||
  request?.rdSeason != null ||
  request?.rdEpisode != null;

const isLiveRequest = (request) =>
  request?.mediaType === "live" ||
  request?.type === "live" ||
  (Array.isArray(request?.sources) &&
    request.sources.some(
      (item) => item?.live || item?.type === "live"
    ));

const isExplicitDirectPlayback = (request) =>
  request?.verifiedPlaybackPolicy === "manual" ||
  (
    request?.noRd === true &&
    request?.skipRdLookup === true &&
    request?.skipAddonLookup === true
  );

const applyReliableVodPolicy = (request = {}) => {
  request = canonicalizeCatalogPlaybackRequest(request);
  if (
    !request ||
    isLiveRequest(request) ||
    isExplicitDirectPlayback(request)
  ) {
    return request || {};
  }

  return {
    ...request,
    /*
     * Catalogue VOD always enters the same strict pipeline regardless of which
     * UI surface launched it. Individual cards/rows cannot silently opt back
     * into the old "first discovered = playable" behaviour.
     */
    verifiedPlaybackPolicy: "strict",
    allowNonPlaybackFallback: false,
    preferRd:
      request?.preferRd !== false
        ? true
        : request.preferRd,
  };
};

const seriesTitleFromRequest = (request) => {
  const explicit = String(
    request?.rdTitle ||
      request?.seriesTitle ||
      ""
  ).trim();

  if (explicit) {
    return explicit;
  }

  return String(request?.title || "TV Show")
    .replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, "")
    .trim();
};

const episodeNumberFrom = (item) =>
  positiveInt(
    item?.episode_number ??
      item?.episodeNumber ??
      item?.episode ??
      item?.number
  );

const normaliseEpisodes = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => episodeNumberFrom(item) != null && episodeHasAired(item))
    .sort(
      (a, b) =>
        Number(episodeNumberFrom(a) || 0) -
        Number(episodeNumberFrom(b) || 0)
    );

const normaliseSeasons = (items) =>
  (Array.isArray(items) ? items : [])
    .filter(
      (item) =>
        positiveInt(item?.season_number) != null
    )
    .sort(
      (a, b) =>
        Number(a?.season_number || 0) -
        Number(b?.season_number || 0)
    );

const episodePlaybackRequest = ({
  current,
  tmdbId,
  seasonNumber,
  episodeNumber,
  episodeItem,
}) => {
  const resolvedSeason = positiveInt(seasonNumber);
  const resolvedEpisode =
    positiveInt(episodeNumber) ||
    episodeNumberFrom(episodeItem);

  const resolvedTmdbId =
    tmdbId ??
    current?.tmdbId ??
    current?.tmdb_id ??
    current?.id ??
    null;

  if (!resolvedTmdbId || !resolvedSeason || !resolvedEpisode) {
    return null;
  }

  const seriesTitle = seriesTitleFromRequest(current);
  const title = `${seriesTitle} — S${String(
    resolvedSeason
  ).padStart(2, "0")}E${String(
    resolvedEpisode
  ).padStart(2, "0")}`;

  return {
    ...resetEpisodePlaybackState(current),

    id: resolvedTmdbId,
    tmdbId: resolvedTmdbId,
    tmdb_id: resolvedTmdbId,

    title,

    poster:
      episodeItem?.still_url ||
      episodeItem?.still_path ||
      current?.poster ||
      "",

    mediaType: "tv",
    type: "series",

    season: resolvedSeason,
    episode: resolvedEpisode,

    rdTitle: seriesTitle,
    rdSeason: resolvedSeason,
    rdEpisode: resolvedEpisode,

    episodeName:
      String(
        episodeItem?.name ||
          episodeItem?.title ||
          ""
      ).trim(),

    startTime: 0,
    preferRd: true,

    skipAddonLookup: false,
    skipRdLookup: false,
    allowNonPlaybackFallback: false,

    src: "",
    url: "",
    sources: [],
    completeSources: [],
    discoveredSources: [],
    verifiedPlaybackPolicy: "strict",
    noRd: false,
  };
};

const episodeIdentityForRequest = (request) => {
  if (!request || !isTvRequest(request)) return "";

  const tmdbId = String(
    request?.tmdbId ?? request?.tmdb_id ?? request?.id ?? ""
  ).trim();
  const season = positiveInt(request?.season ?? request?.rdSeason);
  const episode = positiveInt(request?.episode ?? request?.rdEpisode);

  return tmdbId && season && episode
    ? `${tmdbId}:s${season}:e${episode}`
    : "";
};

const skipMarkerImdbCache = new Map();
const skipMarkerResultCache = new Map();

const boundedMarkerLookup = async (lookup, timeoutMs) => {
  let timer;
  try {
    return await Promise.race([
      typeof lookup === "function" ? lookup() : lookup,
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const validImdbId = (value) => {
  const id = String(value || "").trim();
  return /^tt\d+$/i.test(id) ? id.toLowerCase() : "";
};

const resolveSkipMarkerImdbId = async (request) => {
  const episodeKey = episodeIdentityForRequest(request);
  if (!episodeKey) return "";

  if (skipMarkerImdbCache.has(episodeKey)) {
    return skipMarkerImdbCache.get(episodeKey);
  }

  const lookup = (async () => {
    const supplied = validImdbId(request?.imdbId ?? request?.imdb_id);
    const tmdbId =
      request?.tmdbId ?? request?.tmdb_id ?? request?.id ?? null;

    if (tmdbId) {
      try {
        const response = await boundedMarkerLookup(() => base44.functions.invoke("resolveTvImdb", {
          tmdb_id: tmdbId,
          title: seriesTitleFromRequest(request),
          year: request?.rdYear ?? request?.year ?? "",
        }), 1500);
        const resolved = validImdbId(unwrap(response)?.imdb_id);
        if (resolved) return resolved;
      } catch {
        // Marker lookup is optional and must never interrupt playback.
      }
    }

    return supplied;
  })();

  skipMarkerImdbCache.set(episodeKey, lookup);
  const resolved = await lookup;
  if (!resolved) skipMarkerImdbCache.delete(episodeKey);
  return resolved;
};

const mergeEpisodeSkipMarkers = (request, lookup) => {
  const databaseMarkers = lookup?.markers || {};
  const existingMarkers = request?.explicitSkipMarkers ?? request?.skipMarkers ?? request?.skip_markers ?? {};

  const mergeType = (type) => ({
    ...(databaseMarkers?.[type] || {}),
    ...(existingMarkers?.[type] || {}),
  });

  return {
    ...request,
    imdbId: validImdbId(lookup?.imdb_id) || request?.imdbId || request?.imdb_id || "",
    explicitSkipMarkers: existingMarkers,
    skipMarkerLookupFailed: false,
    skipMarkers: {
      ...databaseMarkers,
      ...existingMarkers,
      recap: mergeType("recap"),
      intro: mergeType("intro"),
      credits: mergeType("credits"),
    },
    skipMarkerProvenance: lookup?.provenance || request?.skipMarkerProvenance || {},
    skipMarkerProviders: lookup?.providers || request?.skipMarkerProviders || [],
  };
};

const loadEpisodeSkipMarkers = async (request, durationSeconds = null) => {
  if (!isTvRequest(request)) return request;

  const season = positiveInt(request?.season ?? request?.rdSeason);
  const episode = positiveInt(request?.episode ?? request?.rdEpisode);
  if (!season || !episode) return request;

  const imdbId = await resolveSkipMarkerImdbId(request);
  if (!imdbId) return { ...request, skipMarkerLookupFailed: true };

  const duration = Number(durationSeconds);
  const safeDuration =
    Number.isFinite(duration) && duration >= 60
      ? Math.round(duration)
      : null;
  const cacheKey = `${imdbId}:s${season}:e${episode}:d${safeDuration || "any"}`;

  let lookupPromise = skipMarkerResultCache.get(cacheKey);
  if (!lookupPromise) {
    lookupPromise = boundedMarkerLookup(() => base44.functions
      .invoke("getSkipSegments", {
        imdb_id: imdbId,
        season,
        episode,
        ...(safeDuration ? { duration: safeDuration } : {}),
      }), 4000)
      .then((response) => response ? unwrap(response) : null);
    skipMarkerResultCache.set(cacheKey, lookupPromise);
  }

  const lookup = await lookupPromise;
  if (!lookup || typeof lookup !== "object" || lookup.error ||
      (!lookup.markers && !Array.isArray(lookup.providers)) ||
      (!Object.keys(lookup.markers || {}).length && !lookup.providers?.length)) {
    skipMarkerResultCache.delete(cacheKey);
    return {
      ...request,
      imdbId: imdbId || request?.imdbId || "",
      skipMarkerLookupFailed: true,
    };
  }

  return mergeEpisodeSkipMarkers(request, lookup);
};

const continueWatchingKeyForRequest = (request) => {
  if (!request) return "";

  const mediaType = isTvRequest(request) ? "tv" : "movie";
  const tmdbId = String(
    request?.tmdbId ?? request?.tmdb_id ?? request?.id ?? ""
  );
  const year = String(request?.rdYear ?? request?.year ?? "");
  const season = positiveInt(request?.season ?? request?.rdSeason) || "";
  const episode = positiveInt(request?.episode ?? request?.rdEpisode) || "";
  const title = seriesTitleFromRequest(request) || "Video";

  return [
    "mg2",
    tmdbId,
    mediaType,
    year,
    season,
    episode,
    encodeURIComponent(title),
  ].join("|");
};

const queueContinueWatching = async (request) => {
  if (!request || !isTvRequest(request)) return;

  const key = continueWatchingKeyForRequest(request);
  if (!key) return;

  const patch = {
    progress: 5,
    duration: 0,
    video_url: "",
    poster_url: String(request?.poster || request?.poster_url || ""),
    source_type: "queued",
    title: seriesTitleFromRequest(request),
    year: String(request?.rdYear ?? request?.year ?? ""),
    episode_name: String(request?.episodeName || ""),
  };

  try {
    const existing = await base44.entities.ContinueWatching.filter({
      content_key: key,
    });

    if (existing?.length) {
      const row = existing[0];
      const existingProgress = Number(row?.progress || 0);

      await base44.entities.ContinueWatching.update(
        row.id,
        existingProgress > 5
          ? {
              poster_url: patch.poster_url || row?.poster_url || "",
              title: patch.title,
              year: patch.year,
              episode_name: patch.episode_name,
            }
          : patch
      );
      return;
    }

    await base44.entities.ContinueWatching.create({
      content_key: key,
      ...patch,
    });
  } catch {
    // Queueing the next episode must never interrupt playback.
  }
};

const findNextEpisodeRequest = async (current) => {
  if (!isTvRequest(current)) {
    return null;
  }

  const tmdbId =
    current?.tmdbId ??
    current?.tmdb_id ??
    current?.id ??
    null;

  const seasonNumber = positiveInt(
    current?.season ??
      current?.rdSeason
  );

  const episodeNumber = positiveInt(
    current?.episode ??
      current?.rdEpisode
  );

  if (!tmdbId || !seasonNumber || !episodeNumber) {
    return null;
  }

  try {
    const seasonResponse =
      await base44.functions.invoke(
        "getTmdbMovies",
        {
          media_type: "tv",
          movie_id: tmdbId,
          season_number: seasonNumber,
        }
      );

    const seasonData = unwrap(seasonResponse);
    const currentEpisodes = normaliseEpisodes(
      seasonData?.episodes
    );

    const nextEpisode = currentEpisodes.find(
      (item) =>
        Number(episodeNumberFrom(item) || 0) >
        episodeNumber
    );

    if (nextEpisode) {
      return episodePlaybackRequest({
        current,
        tmdbId,
        seasonNumber,
        episodeNumber: episodeNumberFrom(nextEpisode),
        episodeItem: nextEpisode,
      });
    }
  } catch (error) {
    console.warn(
      "[Media God] Could not inspect the current TV season for auto-next",
      error
    );
  }

  try {
    const detailsResponse =
      await base44.functions.invoke(
        "getTmdbMovies",
        {
          media_type: "tv",
          movie_id: tmdbId,
        }
      );

    const detailsData = unwrap(detailsResponse);
    const seasons = normaliseSeasons(
      detailsData?.details?.seasons
    );

    const laterSeasons = seasons.filter(
      (item) =>
        Number(item?.season_number || 0) >
          seasonNumber &&
        Number(item?.episode_count || 0) > 0
    );

    for (const seasonItem of laterSeasons) {
      const nextSeasonNumber = positiveInt(
        seasonItem?.season_number
      );

      if (!nextSeasonNumber) {
        continue;
      }

      try {
        const nextSeasonResponse =
          await base44.functions.invoke(
            "getTmdbMovies",
            {
              media_type: "tv",
              movie_id: tmdbId,
              season_number: nextSeasonNumber,
            }
          );

        const nextSeasonData = unwrap(
          nextSeasonResponse
        );

        const nextSeasonEpisodes =
          normaliseEpisodes(
            nextSeasonData?.episodes
          );

        const firstEpisode =
          nextSeasonEpisodes[0];

        if (firstEpisode) {
          return episodePlaybackRequest({
            current,
            tmdbId,
            seasonNumber: nextSeasonNumber,
            episodeNumber: episodeNumberFrom(firstEpisode),
            episodeItem: firstEpisode,
          });
        }
      } catch (error) {
        console.warn(
          `[Media God] Could not inspect season ${nextSeasonNumber} for auto-next`,
          error
        );
      }
    }
  } catch (error) {
    console.warn(
      "[Media God] Could not inspect later TV seasons for auto-next",
      error
    );
  }

  return null;
};

const readAutoNext = () => {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(
    "mg_auto_next"
  ) !== "0";
};

function PlayerAutomationBridge({ children }) {
  const core = useCorePlayer();

  const currentRequestRef = useRef(null);
  const playbackSessionRef = useRef(0);
  const autoNextCancelledRef = useRef(false);
  const advancingRef = useRef(false);
  const nextEpisodePreloadRef = useRef({
    currentKey: "",
    next: null,
    prepared: null,
    promise: null,
    availability: "unknown",
  });
  const lastPreloadCheckRef = useRef(0);
  const skipMarkerLookupKeysRef = useRef(new Map());
  const appliedMarkerDurationRef = useRef({ sessionId: null, duration: null });

  const [autoNext, setAutoNext] = useState(
    readAutoNext
  );

  const publishContext = useCallback(
    (request, enabled = autoNext) => {
      if (typeof window === "undefined") {
        return;
      }

      const requestKey = episodeIdentityForRequest(request);
      const preloadState = nextEpisodePreloadRef.current;
      const preloadMatches =
        Boolean(requestKey) &&
        preloadState.currentKey === requestKey;
      const knownNext =
        preloadMatches && preloadState.availability === "yes"
          ? preloadState.next
          : null;

      const detail = {
        mediaType:
          request?.mediaType === "live" || request?.type === "live"
            ? "live"
            : isTvRequest(request)
              ? "tv"
              : request
                ? "movie"
                : null,

        tmdbId:
          request?.tmdbId ??
          request?.tmdb_id ??
          request?.id ??
          null,

        imdbId:
          request?.imdbId ??
          request?.imdb_id ??
          null,

        title: request
          ? seriesTitleFromRequest(request)
          : "",

        year:
          request?.rdYear ??
          request?.year ??
          null,

        season:
          request?.season ??
          request?.rdSeason ??
          null,

        episode:
          request?.episode ??
          request?.rdEpisode ??
          null,

        episodeName:
          request?.episodeName ||
          "",

        playbackSessionId: request?.playbackSessionId ?? null,

        autoNext: Boolean(enabled),

        nextEpisodeAvailable:
          preloadMatches && preloadState.availability !== "unknown"
            ? preloadState.availability === "yes"
            : null,
        nextSeason:
          positiveInt(knownNext?.season ?? knownNext?.rdSeason) || null,
        nextEpisode:
          positiveInt(knownNext?.episode ?? knownNext?.rdEpisode) || null,
        nextEpisodeName:
          String(knownNext?.episodeName || "").trim(),

        recapStart: playbackMarker(request, "recap", "start"),
        recapEnd: playbackMarker(request, "recap", "end"),
        introStart: playbackMarker(request, "intro", "start"),
        introEnd: playbackMarker(request, "intro", "end"),
        creditsStart: playbackMarker(request, "credits", "start"),
        skipMarkersPending: Boolean(request?.skipMarkersPending),
        skipMarkerProviders: Array.isArray(request?.skipMarkerProviders)
          ? request.skipMarkerProviders
          : [],
      };

      window.__MG_PLAYER_CONTEXT__ = detail;

      window.dispatchEvent(
        new CustomEvent("mg:player-context", {
          detail,
        })
      );
    },
    [autoNext]
  );

  const publishStatus = useCallback(
    (message) => {
      if (typeof window === "undefined") {
        return;
      }

      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message: String(message || ""),
          },
        })
      );
    },
    []
  );

  const hydrateEpisodeSkipMarkers = useCallback(
    async (request, durationSeconds = null) => {
      const episodeKey = episodeIdentityForRequest(request);
      if (!episodeKey) return;

      const duration = Number(durationSeconds);
      const safeDuration =
        Number.isFinite(duration) && duration >= 60
          ? Math.round(duration)
          : null;
      const lookupKey = `${episodeKey}:${request?.playbackSessionId || ""}:d${safeDuration || "any"}`;
      if (Number(skipMarkerLookupKeysRef.current.get(lookupKey) || 0) > Date.now()) return;
      skipMarkerLookupKeysRef.current.set(lookupKey, Date.now() + 30_000);

      const enriched = await loadEpisodeSkipMarkers(request, safeDuration);
      skipMarkerLookupKeysRef.current.set(lookupKey,
        enriched?.skipMarkerLookupFailed ? Date.now() + 30_000 : Number.POSITIVE_INFINITY);

      if (
        episodeIdentityForRequest(currentRequestRef.current) !== episodeKey ||
        currentRequestRef.current?.playbackSessionId !== request?.playbackSessionId
      ) {
        return;
      }

      const adjustedMarkersAlreadyApplied = !safeDuration &&
        appliedMarkerDurationRef.current.sessionId === request?.playbackSessionId &&
        appliedMarkerDurationRef.current.duration != null;
      const applyMarkers = !enriched?.skipMarkerLookupFailed && !adjustedMarkersAlreadyApplied;
      if (applyMarkers && safeDuration) {
        appliedMarkerDurationRef.current = { sessionId: request?.playbackSessionId, duration: safeDuration };
      }

      currentRequestRef.current = {
        ...currentRequestRef.current,
        imdbId: enriched?.imdbId || currentRequestRef.current?.imdbId || "",
        ...(applyMarkers ? {
          skipMarkers: enriched?.skipMarkers || {},
          explicitSkipMarkers: enriched?.explicitSkipMarkers || {},
          skipMarkerProvenance: enriched?.skipMarkerProvenance || {},
          skipMarkerProviders: enriched?.skipMarkerProviders || [],
        } : {}),
        skipMarkersPending: false,
      };
      publishContext(currentRequestRef.current);
    },
    [publishContext]
  );

  const preloadNextEpisode = useCallback(
    (request) => {
      if (!isTvRequest(request)) {
        return Promise.resolve(null);
      }

      const currentKey = episodeIdentityForRequest(request);
      if (!currentKey) {
        return Promise.resolve(null);
      }

      const existing = nextEpisodePreloadRef.current;
      if (existing.currentKey === currentKey) {
        if (existing.promise) {
          return existing.promise;
        }

        if (!shouldRefreshEpisodePreparation(existing)) {
          return Promise.resolve(existing.prepared || existing.next);
        }
      }

      const attemptedAt = Date.now();
      const preloadPromise = (async () => {
        try {
          const next = await findNextEpisodeRequest(request);
          if (!next) {
            if (nextEpisodePreloadRef.current.currentKey === currentKey) {
              nextEpisodePreloadRef.current = {
                attemptedAt,
                currentKey,
                next: null,
                prepared: null,
                promise: null,
                availability: "no",
              };
              if (episodeIdentityForRequest(currentRequestRef.current) === currentKey) {
                publishContext(currentRequestRef.current || request);
              }
            }
            return null;
          }

          void queueContinueWatching(next);
          if (episodeIdentityForRequest(currentRequestRef.current) !== currentKey) return null;
          nextEpisodePreloadRef.current = {
            ...nextEpisodePreloadRef.current,
            attemptedAt,
            currentKey,
            next,
            availability: "yes",
          };
          publishContext(currentRequestRef.current || request);

          const markerLookup = loadEpisodeSkipMarkers(next).then((enrichedNext) => {
            if (nextEpisodePreloadRef.current.currentKey === currentKey) {
              nextEpisodePreloadRef.current.next = enrichedNext;
            }
            return enrichedNext;
          });
          const preparation = typeof core.prepare === "function"
            ? core.prepare(applyReliableVodPolicy(next))
            : Promise.resolve(null);
          const [enrichedNext, prepared] = await Promise.all([markerLookup, preparation]);

          if (episodeIdentityForRequest(currentRequestRef.current) !== currentKey) return null;

          nextEpisodePreloadRef.current = {
            attemptedAt,
            currentKey,
            next: enrichedNext,
            prepared,
            promise: null,
            availability: "yes",
          };
          publishContext(currentRequestRef.current || request);

          return prepared || next;
        } catch (error) {
          console.warn(
            "[Media God] Could not prepare the next episode in advance",
            error
          );

          if (nextEpisodePreloadRef.current.currentKey === currentKey) {
            const knownNext = nextEpisodePreloadRef.current.next;
            nextEpisodePreloadRef.current = {
              attemptedAt,
              currentKey,
              next: knownNext || null,
              prepared: null,
              promise: null,
              availability: knownNext ? "yes" : "unknown",
            };
            if (episodeIdentityForRequest(currentRequestRef.current) === currentKey) {
              publishContext(currentRequestRef.current || request);
            }
          }

          return null;
        }
      })();

      nextEpisodePreloadRef.current = {
        attemptedAt,
        currentKey,
        next: existing.currentKey === currentKey ? existing.next : null,
        prepared: existing.currentKey === currentKey ? existing.prepared : null,
        promise: preloadPromise,
        availability: "unknown",
      };

      return preloadPromise;
    },
    [core, publishContext]
  );

  const play = useCallback(
    async (request = {}) => {
      const reliableRequest = {
        ...applyReliableVodPolicy(request),
        playbackSessionId: ++playbackSessionRef.current,
      };
      autoNextCancelledRef.current = false;
      const contextRequest =
        isTvRequest(reliableRequest)
          ? {
              ...reliableRequest,
              skipMarkersPending: true,
            }
          : reliableRequest;

      currentRequestRef.current = contextRequest;
      publishContext(contextRequest);

      if (isTvRequest(contextRequest)) {
        void hydrateEpisodeSkipMarkers(contextRequest);
      }

      const playbackPromise =
        core.play(reliableRequest);

      /*
       * Prepare the following episode as soon as playback begins. This is
       * especially important on Fire TV because Media3 pauses the WebView while
       * it owns the screen, so waiting for browser timeupdate events meant the
       * next source was never actually ready when the native player finished.
       */
      if (isTvRequest(reliableRequest)) {
        void preloadNextEpisode(reliableRequest);
      }

      return playbackPromise;
    },
    [core, hydrateEpisodeSkipMarkers, preloadNextEpisode, publishContext]
  );

  const resetEnhancedPlayerState = useCallback(() => {
    currentRequestRef.current = null;
    autoNextCancelledRef.current = false;
    advancingRef.current = false;
    nextEpisodePreloadRef.current = {
      currentKey: "",
      next: null,
      prepared: null,
      promise: null,
      availability: "unknown",
    };
    publishContext(null);
  }, [publishContext]);

  const close = useCallback(() => {
    resetEnhancedPlayerState();
    core.close();
  }, [core, resetEnhancedPlayerState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    /*
     * The core provider owns the actual VideoPlayer portal. Its close event
     * therefore has to clear the enhanced TV/auto-next request state too.
     * This prevents an ended/stale episode request from surviving after Exit
     * and trying to reopen or blank the next title.
     */
    const onCorePlayerClosed = () => {
      resetEnhancedPlayerState();
    };

    window.addEventListener(
      "mg:core-player-closed",
      onCorePlayerClosed
    );

    return () => {
      window.removeEventListener(
        "mg:core-player-closed",
        onCorePlayerClosed
      );
    };
  }, [resetEnhancedPlayerState]);

  const advanceToNext = useCallback(
    async (manual = false) => {
      if (advancingRef.current) {
        return;
      }

      const current = currentRequestRef.current;

      if (!isTvRequest(current)) {
        return;
      }

      advancingRef.current = true;

      try {
        publishStatus(
          manual
            ? "Loading next episode…"
            : "Episode finished — loading next episode…"
        );

        const currentKey = episodeIdentityForRequest(current);
        const preload = nextEpisodePreloadRef.current;
        let cachedPreload =
          currentKey && preload.currentKey === currentKey
            ? preload
            : null;

        if (cachedPreload?.promise && !cachedPreload?.next) {
          await Promise.race([
            cachedPreload.promise,
            new Promise((resolve) => window.setTimeout(resolve, 1200)),
          ]);

          const refreshed = nextEpisodePreloadRef.current;
          cachedPreload =
            currentKey && refreshed.currentKey === currentKey
              ? refreshed
              : cachedPreload;
        }

        const next =
          cachedPreload?.next ||
          (await findNextEpisodeRequest(
            current
          ));

        if (!next) {
          publishStatus(
            "There is no later episode available."
          );

          return;
        }

        const prepared = freshEpisodePreparation(cachedPreload?.prepared);
        const preparedFresh = Boolean(prepared);
        const stalePreparation = cachedPreload?.prepared;
        const durableCandidates = [
          ...(Array.isArray(stalePreparation?.completeSources) ? stalePreparation.completeSources : []),
          ...(Array.isArray(stalePreparation?.sources) ? stalePreparation.sources : []),
          ...(Array.isArray(stalePreparation?.discoveredSources) ? stalePreparation.discoveredSources : []),
        ].filter((candidate) => candidate?.infoHash || candidate?.info_hash || candidate?.magnet ||
          candidate?.magnetLink || candidate?.richMagnet || candidate?.rdTorrentId || candidate?.torrentId ||
          /^magnet:/i.test(String(candidate?.src || candidate?.url || "")))
          .map((candidate) => {
            const restored = restoreResumeSource(candidate);
            if (!restored || /^https?:/i.test(String(restored.src || restored.url || ""))) return null;
            for (const key of ["expiresAt", "expires_at", "expiration", "expiry"]) delete restored[key];
            return restored;
          }).filter(Boolean);

        const nextRequest = preparedFresh
          ? {
              ...next,
              imdbId: prepared?.imdbId || next?.imdbId || next?.imdb_id || "",
              sources: prepared.sources,
              completeSources: [
                ...(Array.isArray(prepared?.completeSources) && prepared.completeSources.length > 0
                  ? prepared.completeSources : prepared.sources),
                ...(prepared.refreshRequired ? durableCandidates : []),
              ],

              /*
               * The prepare pass already completed the full addon/RD source
               * search. Reusing it avoids repeating network discovery while
               * the viewer is waiting for the handoff.
               */
              skipAddonLookup: true,
              skipRdLookup: true,
              ...(prepared.refreshRequired ? { skipAddonLookup: false, skipRdLookup: false } : {}),
              preparedEpisodeHandoff: true,
              verifiedPlaybackPolicy:
                prepared?.verifiedPlaybackPolicy ||
                next?.verifiedPlaybackPolicy ||
                "strict",
            }
          : { ...next, sources: durableCandidates };

        nextEpisodePreloadRef.current = {
          currentKey: "",
          next: null,
          prepared: null,
          promise: null,
          availability: "unknown",
        };

        void queueContinueWatching(nextRequest);
        await play(nextRequest);
      } catch (error) {
        console.error(
          "[Media God] Next episode failed",
          error
        );

        publishStatus(
          error?.message ||
            "Could not load the next episode."
        );
      } finally {
        advancingRef.current = false;
      }
    },
    [play, publishStatus]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onChooseEpisode = () => {
      const current = currentRequestRef.current;

      if (!isTvRequest(current)) {
        return;
      }

      const detail = {
        mediaType: "tv",
        tmdbId:
          current?.tmdbId ??
          current?.tmdb_id ??
          current?.id ??
          null,
        title: seriesTitleFromRequest(current),
        year: current?.rdYear ?? current?.year ?? null,
        poster: current?.poster || "",
        season: current?.season ?? current?.rdSeason ?? null,
        episode: current?.episode ?? current?.rdEpisode ?? null,
      };

      /*
       * Publish the destination before closing playback. The core close clears
       * shared player state immediately; restoring the show first prevents a
       * Back action from briefly or permanently falling through to Home.
       */
      window.dispatchEvent(
        new CustomEvent("mg:return-to-episode-selector", {
          detail,
        })
      );

      close();
    };

    const onPlaySpecificEpisode = async (event) => {
      if (advancingRef.current) {
        return;
      }

      const detail = event?.detail || {};
      const savedContext =
        typeof window !== "undefined"
          ? window.__MG_PLAYER_CONTEXT__ || {}
          : {};

      const current =
        currentRequestRef.current || {
          id:
            detail?.tmdbId ??
            savedContext?.tmdbId ??
            null,

          tmdbId:
            detail?.tmdbId ??
            savedContext?.tmdbId ??
            null,

          title:
            detail?.seriesTitle ||
            savedContext?.title ||
            "TV Show",

          rdTitle:
            detail?.seriesTitle ||
            savedContext?.title ||
            "TV Show",

          year:
            detail?.year ??
            savedContext?.year ??
            null,

          rdYear:
            detail?.year ??
            savedContext?.year ??
            null,

          mediaType: "tv",
          type: "series",
        };

      const tmdbId =
        detail?.tmdbId ??
        current?.tmdbId ??
        current?.tmdb_id ??
        current?.id ??
        savedContext?.tmdbId ??
        null;

      const seasonNumber = positiveInt(
        detail?.seasonNumber ??
          detail?.season
      );

      const episodeNumber =
        positiveInt(
          detail?.episodeNumber ??
            detail?.episode
        ) ||
        episodeNumberFrom(
          detail?.episodeItem
        );

      if (
        !tmdbId ||
        !seasonNumber ||
        !episodeNumber
      ) {
        publishStatus(
          "Could not switch episode because the show, season or episode number was missing."
        );

        return;
      }

      const next = episodePlaybackRequest({
        current,
        tmdbId,
        seasonNumber,
        episodeNumber,
        episodeItem:
          detail?.episodeItem ||
          null,
      });

      if (!next) {
        publishStatus(
          "Could not build the selected episode request."
        );

        return;
      }

      advancingRef.current = true;

      try {
        publishStatus(
          `Loading S${String(
            seasonNumber
          ).padStart(
            2,
            "0"
          )}E${String(
            episodeNumber
          ).padStart(
            2,
            "0"
          )}…`
        );

        await play(next);
      } catch (error) {
        console.error(
          "[Media God] Episode switch failed",
          error
        );

        publishStatus(
          error?.message ||
            "Could not load that episode."
        );
      } finally {
        advancingRef.current = false;
      }
    };

    const onPlayNextEpisode = () => {
      advanceToNext(true);
    };

    const onCancelNextEpisode = (event) => {
      if (event?.detail?.playbackSessionId === currentRequestRef.current?.playbackSessionId) {
        autoNextCancelledRef.current = true;
      }
    };

    const onEpisodeCompleted = async (event) => {
      const detail = event?.detail || {};
      const current = currentRequestRef.current;

      if (!isTvRequest(current)) {
        return;
      }

      const currentSeason = positiveInt(
        current?.season ?? current?.rdSeason
      );
      const currentEpisode = positiveInt(
        current?.episode ?? current?.rdEpisode
      );

      if (
        detail?.season &&
        detail?.episode &&
        (
          positiveInt(detail.season) !== currentSeason ||
          positiveInt(detail.episode) !== currentEpisode
        )
      ) {
        return;
      }

      try {
        const next = await findNextEpisodeRequest(current);
        if (next) {
          await queueContinueWatching(next);
        }
      } catch {
        // Continue Watching queue is best effort only.
      }
    };

    const onRemotePlayMedia = async (event) => {
      const detail = event?.detail || {};
      const mediaType = detail?.mediaType === "tv" ? "tv" : "movie";
      const tmdbId =
        detail?.tmdbId ?? detail?.tmdb_id ?? detail?.id ?? null;
      const title = String(detail?.title || detail?.name || "").trim();
      const incomingResume = Number(detail?.startTime || 0);
      const remoteStartTime = Number.isFinite(incomingResume)
        ? Math.min(24 * 60 * 60, Math.max(0, incomingResume))
        : 0;

      if (!tmdbId || !title) {
        publishStatus("Could not send that title to the TV.");
        return;
      }

      if (mediaType === "tv") {
        const seasonNumber = positiveInt(
          detail?.seasonNumber ?? detail?.season
        );
        const episodeNumber = positiveInt(
          detail?.episodeNumber ?? detail?.episode
        );

        if (!seasonNumber || !episodeNumber) {
          publishStatus("Choose a season and episode on your phone first.");
          return;
        }

        const request = episodePlaybackRequest({
          current: {
            id: tmdbId,
            tmdbId,
            title,
            rdTitle: title,
            year: detail?.year ?? null,
            rdYear: detail?.year ?? null,
            poster: detail?.poster || detail?.poster_url || "",
            mediaType: "tv",
            type: "series",
          },
          tmdbId,
          seasonNumber,
          episodeNumber,
          episodeItem: detail?.episodeItem || null,
        });

        if (request) {
          publishStatus(`Sending ${title} to the TV…`);
          await play({ ...request, startTime: remoteStartTime });
        }
        return;
      }

      publishStatus(`Sending ${title} to the TV…`);
      await play({
        id: tmdbId,
        tmdbId,
        tmdb_id: tmdbId,
        title,
        poster: detail?.poster || detail?.poster_url || "",
        year: detail?.year ?? null,
        mediaType: "movie",
        type: "movie",
        rdTitle: title,
        rdYear: detail?.year ?? null,
        preferRd: true,
        sources: [],
        startTime: remoteStartTime,
      });
    };

    const onSetAutoNext = (event) => {
      const enabled = Boolean(
        event?.detail?.enabled
      );

      setAutoNext(enabled);

      try {
        window.localStorage.setItem(
          "mg_auto_next",
          enabled ? "1" : "0"
        );
      } catch {
        // Local storage may not be available.
      }

      publishContext(
        currentRequestRef.current,
        enabled
      );
    };

    const onTimeUpdate = (event) => {
      const target = event?.target;
      if (
        typeof HTMLVideoElement !== "undefined" &&
        !(target instanceof HTMLVideoElement)
      ) {
        return;
      }

      const duration = Number(target?.duration || 0);
      const currentTime = Number(target?.currentTime || 0);

      if (
        typeof window !== "undefined" &&
        Number.isFinite(duration) &&
        duration > 0 &&
        Number.isFinite(currentTime)
      ) {
        window.dispatchEvent(
          new CustomEvent("mg:playback-position", {
            detail: {
              currentTime: Math.max(0, currentTime),
              duration,
              remaining: Math.max(0, duration - currentTime),
            },
          })
        );
      }

      const current = currentRequestRef.current;
      if (isTvRequest(current) && duration >= 60) {
        void hydrateEpisodeSkipMarkers(current, duration);
      }

      if (!autoNext || advancingRef.current) {
        return;
      }

      if (!isTvRequest(current)) {
        return;
      }

      /*
       * Start preparing the following episode once this one has been playing
       * for a minute. That gives Real-Debrid/torrent sources almost the whole
       * episode to become ready instead of waiting for the closing credits.
       */
      if (!Number.isFinite(duration) || duration < 180 || currentTime < 60) {
        return;
      }

      const remaining = duration - currentTime;

      if (!Number.isFinite(remaining) || remaining <= 5) {
        return;
      }

      const now = Date.now();
      if (now - Number(lastPreloadCheckRef.current || 0) < 8000) {
        return;
      }
      lastPreloadCheckRef.current = now;

      void preloadNextEpisode(current);
    };

    const onNativePlaybackProgress = (event) => {
      const detail = event?.detail || {};
      const current = currentRequestRef.current;
      const currentKey = episodeIdentityForRequest(current);
      if (!currentKey || episodeIdentityForRequest(detail) !== currentKey) return;

      const duration = Number(detail.durationSeconds);
      if (Number.isFinite(duration) && duration >= 60) {
        void hydrateEpisodeSkipMarkers(current, duration);
      }
      if (autoNext && !advancingRef.current) void preloadNextEpisode(current);
    };

    const onEnded = (event) => {
      if (!autoNext || autoNextCancelledRef.current) {
        return;
      }

      if (
        !isTvRequest(
          currentRequestRef.current
        )
      ) {
        return;
      }

      const target = event?.target;

      if (
        typeof HTMLMediaElement !==
          "undefined" &&
        !(
          target instanceof
          HTMLMediaElement
        )
      ) {
        return;
      }

      advanceToNext(false);
    };

    /*
     * Android/Fire TV Media3 playback happens outside the WebView, so its
     * natural end does not produce an HTMLMediaElement `ended` event. The
     * native player reports the end back to VideoPlayer, which forwards this
     * dedicated event so TV episodes use the exact same auto-next pipeline as
     * browser playback.
     */
    const onNativePlaybackEnded = (event) => {
      if (!autoNext || advancingRef.current || autoNextCancelledRef.current ||
          event?.detail?.autoNextCancelled === true) {
        return;
      }

      if (!isTvRequest(currentRequestRef.current)) {
        return;
      }

      advanceToNext(false);
    };

    window.addEventListener(
      "mg:choose-episode",
      onChooseEpisode
    );

    window.addEventListener(
      "mg:play-specific-episode",
      onPlaySpecificEpisode
    );

    window.addEventListener(
      "mg:play-next-episode",
      onPlayNextEpisode
    );

    window.addEventListener("mg:cancel-next-episode", onCancelNextEpisode);

    window.addEventListener(
      "mg:set-auto-next",
      onSetAutoNext
    );

    window.addEventListener(
      "mg:episode-completed",
      onEpisodeCompleted
    );

    window.addEventListener(
      "mg:remote-play-media",
      onRemotePlayMedia
    );

    document.addEventListener(
      "timeupdate",
      onTimeUpdate,
      true
    );

    document.addEventListener(
      "ended",
      onEnded,
      true
    );

    window.addEventListener(
      "mg:native-playback-ended",
      onNativePlaybackEnded
    );

    window.addEventListener("mg:native-playback-progress", onNativePlaybackProgress);

    return () => {
      window.removeEventListener(
        "mg:choose-episode",
        onChooseEpisode
      );

      window.removeEventListener(
        "mg:play-specific-episode",
        onPlaySpecificEpisode
      );

      window.removeEventListener(
        "mg:play-next-episode",
        onPlayNextEpisode
      );

      window.removeEventListener("mg:cancel-next-episode", onCancelNextEpisode);

      window.removeEventListener(
        "mg:set-auto-next",
        onSetAutoNext
      );

      window.removeEventListener(
        "mg:episode-completed",
        onEpisodeCompleted
      );

      window.removeEventListener(
        "mg:remote-play-media",
        onRemotePlayMedia
      );

      document.removeEventListener(
        "timeupdate",
        onTimeUpdate,
        true
      );

      document.removeEventListener(
        "ended",
        onEnded,
        true
      );

      window.removeEventListener(
        "mg:native-playback-ended",
        onNativePlaybackEnded
      );

      window.removeEventListener("mg:native-playback-progress", onNativePlaybackProgress);
    };
  }, [
    advanceToNext,
    autoNext,
    close,
    hydrateEpisodeSkipMarkers,
    play,
    preloadNextEpisode,
    publishContext,
    publishStatus,
  ]);

  const prepare = useCallback(
    async (request = {}) => {
      if (typeof core.prepare !== "function") {
        return null;
      }

      return core.prepare(
        applyReliableVodPolicy(request)
      );
    },
    [core]
  );

  const value = useMemo(
    () => ({
      ...core,
      play,
      prepare,
      close,
      autoNext,
    }),
    [
      core,
      play,
      prepare,
      close,
      autoNext,
    ]
  );

  return (
    <EnhancedPlayerContext.Provider
      value={value}
    >
      {children}
    </EnhancedPlayerContext.Provider>
  );
}

export function PlayerProvider({
  children,
}) {
  return (
    <CorePlayerProvider>
      <PlayerAutomationBridge>
        {children}
      </PlayerAutomationBridge>
    </CorePlayerProvider>
  );
}

export function usePlayer() {
  const context = useContext(
    EnhancedPlayerContext
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

export {
  DEMO_VIDEO,
  buildMediaSources,
};
