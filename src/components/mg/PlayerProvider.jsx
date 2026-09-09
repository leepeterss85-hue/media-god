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

const isTvRequest = (request) =>
  request?.mediaType === "tv" ||
  request?.type === "series" ||
  request?.season != null ||
  request?.episode != null ||
  request?.rdSeason != null ||
  request?.rdEpisode != null;

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
    .filter((item) => episodeNumberFrom(item) != null)
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
    ...current,

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
  const advancingRef = useRef(false);
  const nextEpisodePreloadRef = useRef({
    currentKey: "",
    next: null,
    prepared: null,
    promise: null,
  });
  const lastPreloadCheckRef = useRef(0);

  const [autoNext, setAutoNext] = useState(
    readAutoNext
  );

  const publishContext = useCallback(
    (request, enabled = autoNext) => {
      if (typeof window === "undefined") {
        return;
      }

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

        autoNext: Boolean(enabled),
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

  const play = useCallback(
    async (request = {}) => {
      currentRequestRef.current = request;
      publishContext(request);

      return core.play(request);
    },
    [core, publishContext]
  );

  const resetEnhancedPlayerState = useCallback(() => {
    currentRequestRef.current = null;
    advancingRef.current = false;
    nextEpisodePreloadRef.current = {
      currentKey: "",
      next: null,
      prepared: null,
      promise: null,
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

        const prepared = cachedPreload?.prepared;
        const preparedFresh =
          prepared &&
          Number(prepared?.preparedAt || 0) > Date.now() - 15 * 60 * 1000 &&
          Array.isArray(prepared?.sources) &&
          prepared.sources.length > 0;

        const nextRequest = preparedFresh
          ? {
              ...next,
              imdbId: prepared?.imdbId || next?.imdbId || next?.imdb_id || "",
              sources: prepared.sources,
            }
          : next;

        nextEpisodePreloadRef.current = {
          currentKey: "",
          next: null,
          prepared: null,
          promise: null,
        };

        await queueContinueWatching(nextRequest);
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
      window.dispatchEvent(
        new CustomEvent("mg:open-episode-picker")
      );
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
          await play(request);
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
      if (!autoNext || advancingRef.current) {
        return;
      }

      const current = currentRequestRef.current;
      if (!isTvRequest(current)) {
        return;
      }

      const target = event?.target;
      if (
        typeof HTMLVideoElement !== "undefined" &&
        !(target instanceof HTMLVideoElement)
      ) {
        return;
      }

      const duration = Number(target?.duration || 0);
      const currentTime = Number(target?.currentTime || 0);

      if (!Number.isFinite(duration) || duration < 180 || currentTime < 60) {
        return;
      }

      const remaining = duration - currentTime;
      const preloadWindow = Math.min(150, Math.max(75, duration * 0.12));

      if (remaining > preloadWindow) {
        return;
      }

      const now = Date.now();
      if (now - Number(lastPreloadCheckRef.current || 0) < 8000) {
        return;
      }
      lastPreloadCheckRef.current = now;

      const currentKey = episodeIdentityForRequest(current);
      if (!currentKey) return;

      const existing = nextEpisodePreloadRef.current;
      if (
        existing.currentKey === currentKey &&
        (existing.prepared || existing.promise)
      ) {
        return;
      }

      const preloadPromise = (async () => {
        try {
          const next = await findNextEpisodeRequest(current);
          if (!next) return null;

          const prepared =
            typeof core.prepare === "function"
              ? await core.prepare(next)
              : null;

          if (
            episodeIdentityForRequest(currentRequestRef.current) !== currentKey
          ) {
            return null;
          }

          nextEpisodePreloadRef.current = {
            currentKey,
            next,
            prepared,
            promise: null,
          };

          return prepared;
        } catch {
          if (nextEpisodePreloadRef.current.currentKey === currentKey) {
            nextEpisodePreloadRef.current = {
              currentKey,
              next: null,
              prepared: null,
              promise: null,
            };
          }
          return null;
        }
      })();

      nextEpisodePreloadRef.current = {
        currentKey,
        next: null,
        prepared: null,
        promise: preloadPromise,
      };
    };

    const onEnded = (event) => {
      if (!autoNext) {
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
    };
  }, [
    advanceToNext,
    autoNext,
    play,
    publishContext,
    publishStatus,
  ]);

  const value = useMemo(
    () => ({
      ...core,
      play,
      close,
      autoNext,
    }),
    [
      core,
      play,
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
