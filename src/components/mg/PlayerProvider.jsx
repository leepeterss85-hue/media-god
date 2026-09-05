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

  const [autoNext, setAutoNext] = useState(
    readAutoNext
  );

  const publishContext = useCallback(
    (request, enabled = autoNext) => {
      if (typeof window === "undefined") {
        return;
      }

      const detail = {
        mediaType: isTvRequest(request)
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

  const close = useCallback(() => {
    currentRequestRef.current = null;
    publishContext(null);
    core.close();
  }, [core, publishContext]);

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

        const next = await findNextEpisodeRequest(
          current
        );

        if (!next) {
          publishStatus(
            "There is no later episode available."
          );

          return;
        }

        await play(next);
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
