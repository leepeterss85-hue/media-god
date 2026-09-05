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
    .replace(
      /\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i,
      ""
    )
    .trim();
};

const normaliseEpisodes = (items) =>
  (Array.isArray(items) ? items : [])
    .filter(
      (item) =>
        positiveInt(item?.episode_number) != null
    )
    .sort(
      (a, b) =>
        Number(a?.episode_number || 0) -
        Number(b?.episode_number || 0)
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
  seasonNumber,
  episodeItem,
}) => {
  const episodeNumber = positiveInt(
    episodeItem?.episode_number
  );

  if (!episodeNumber) {
    return null;
  }

  const seriesTitle =
    seriesTitleFromRequest(current);

  const title =
    `${seriesTitle} — S${String(
      seasonNumber
    ).padStart(2, "0")}E${String(
      episodeNumber
    ).padStart(2, "0")}`;

  return {
    ...current,

    title,

    poster:
      episodeItem?.still_url ||
      current?.poster ||
      "",

    mediaType: "tv",
    type: "series",

    season: seasonNumber,
    episode: episodeNumber,

    rdTitle: seriesTitle,
    rdSeason: seasonNumber,
    rdEpisode: episodeNumber,

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

const findNextEpisodeRequest = async (
  current
) => {
  if (!isTvRequest(current)) {
    return null;
  }

  const tmdbId =
    current?.tmdbId ??
    current?.tmdb_id ??
    current?.id ??
    null;

  const seasonNumber =
    positiveInt(
      current?.season ??
        current?.rdSeason
    );

  const episodeNumber =
    positiveInt(
      current?.episode ??
        current?.rdEpisode
    );

  if (
    !tmdbId ||
    !seasonNumber ||
    !episodeNumber
  ) {
    return null;
  }

  /*
   * First try the next episode
   * in the current season.
   */
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

    const seasonData =
      unwrap(seasonResponse);

    const currentEpisodes =
      normaliseEpisodes(
        seasonData?.episodes
      );

    const nextEpisode =
      currentEpisodes.find(
        (item) =>
          Number(
            item?.episode_number || 0
          ) > episodeNumber
      );

    if (nextEpisode) {
      return episodePlaybackRequest({
        current,
        seasonNumber,
        episodeItem: nextEpisode,
      });
    }
  } catch (error) {
    console.warn(
      "[Media God] Could not inspect current TV season",
      error
    );
  }

  /*
   * No later episode in this season.
   * Look for the next season.
   */
  try {
    const detailsResponse =
      await base44.functions.invoke(
        "getTmdbMovies",
        {
          media_type: "tv",
          movie_id: tmdbId,
        }
      );

    const detailsData =
      unwrap(detailsResponse);

    const seasons =
      normaliseSeasons(
        detailsData?.details?.seasons
      );

    const laterSeasons =
      seasons.filter(
        (item) =>
          Number(
            item?.season_number || 0
          ) > seasonNumber &&
          Number(
            item?.episode_count || 0
          ) > 0
      );

    for (
      const seasonItem
      of laterSeasons
    ) {
      const nextSeasonNumber =
        positiveInt(
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
              season_number:
                nextSeasonNumber,
            }
          );

        const nextSeasonData =
          unwrap(
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
            seasonNumber:
              nextSeasonNumber,
            episodeItem:
              firstEpisode,
          });
        }
      } catch (error) {
        console.warn(
          `[Media God] Could not inspect season ${nextSeasonNumber}`,
          error
        );
      }
    }
  } catch (error) {
    console.warn(
      "[Media God] Could not inspect later TV seasons",
      error
    );
  }

  return null;
};

const readAutoNext = () => {
  if (
    typeof window === "undefined"
  ) {
    return true;
  }

  return (
    window.localStorage.getItem(
      "mg_auto_next"
    ) !== "0"
  );
};

function PlayerAutomationBridge({
  children,
}) {
  const core =
    useCorePlayer();

  const currentRequestRef =
    useRef(null);

  const advancingRef =
    useRef(false);

  const [
    autoNext,
    setAutoNext,
  ] = useState(
    readAutoNext
  );

  /*
   * Tell the player controls whether
   * this is a movie or TV episode.
   */
  const publishContext =
    useCallback(
      (
        request,
        enabled = autoNext
      ) => {
        if (
          typeof window ===
          "undefined"
        ) {
          return;
        }

        const detail = {
          mediaType:
            isTvRequest(request)
              ? "tv"
              : request
                ? "movie"
                : null,

          season:
            request?.season ??
            request?.rdSeason ??
            null,

          episode:
            request?.episode ??
            request?.rdEpisode ??
            null,

          autoNext:
            Boolean(enabled),
        };

        window.__MG_PLAYER_CONTEXT__ =
          detail;

        window.dispatchEvent(
          new CustomEvent(
            "mg:player-context",
            {
              detail,
            }
          )
        );
      },
      [autoNext]
    );

  const publishStatus =
    useCallback(
      (message) => {
        if (
          typeof window ===
          "undefined"
        ) {
          return;
        }

        window.dispatchEvent(
          new CustomEvent(
            "mg:player-status",
            {
              detail: {
                message:
                  String(
                    message || ""
                  ),
              },
            }
          )
        );
      },
      []
    );

  /*
   * Every playback request passes
   * through here so we remember which
   * series / season / episode is active.
   */
  const play =
    useCallback(
      async (
        request = {}
      ) => {
        currentRequestRef.current =
          request;

        publishContext(
          request
        );

        return core.play(
          request
        );
      },
      [
        core,
        publishContext,
      ]
    );

  const close =
    useCallback(
      () => {
        currentRequestRef.current =
          null;

        publishContext(
          null
        );

        core.close();
      },
      [
        core,
        publishContext,
      ]
    );

  /*
   * Find and play the following episode.
   */
  const advanceToNext =
    useCallback(
      async (
        manual = false
      ) => {
        if (
          advancingRef.current
        ) {
          return;
        }

        const current =
          currentRequestRef.current;

        if (
          !isTvRequest(
            current
          )
        ) {
          return;
        }

        advancingRef.current =
          true;

        try {
          publishStatus(
            manual
              ? "Loading next episode…"
              : "Episode finished — loading next episode…"
          );

          const next =
            await findNextEpisodeRequest(
              current
            );

          if (!next) {
            publishStatus(
              "There is no later episode available."
            );

            return;
          }

          await play(
            next
          );
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
          advancingRef.current =
            false;
        }
      },
      [
        play,
        publishStatus,
      ]
    );

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return undefined;
    }

    /*
     * Episodes button inside
     * the video player.
     *
     * Close the player and reveal
     * the existing EpisodeSelector
     * inside DetailModal.
     */
    const onChooseEpisode =
      () => {
        core.close();

        window.setTimeout(
          () => {
            const selector =
              document.getElementById(
                "mg-episode-selector"
              );

            selector
              ?.scrollIntoView?.({
                behavior:
                  "smooth",
                block:
                  "start",
              });
          },
          100
        );
      };

    const onPlayNextEpisode =
      () => {
        advanceToNext(
          true
        );
      };

    const onSetAutoNext =
      (event) => {
        const enabled =
          Boolean(
            event?.detail
              ?.enabled
          );

        setAutoNext(
          enabled
        );

        try {
          window.localStorage.setItem(
            "mg_auto_next",
            enabled
              ? "1"
              : "0"
          );
        } catch {
          // Storage may be unavailable.
        }

        publishContext(
          currentRequestRef.current,
          enabled
        );
      };

    /*
     * VideoPlayer's underlying <video>
     * bubbles/captures an ended event.
     * Use it for TV auto-next.
     */
    const onEnded =
      (event) => {
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

        const target =
          event?.target;

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

        advanceToNext(
          false
        );
      };

    window.addEventListener(
      "mg:choose-episode",
      onChooseEpisode
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
    core,
    publishContext,
  ]);

  /*
   * Keep player controls synced if
   * auto-next changes.
   */
  useEffect(() => {
    publishContext(
      currentRequestRef.current
    );
  }, [
    autoNext,
    publishContext,
  ]);

  const value =
    useMemo(
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
  const context =
    useContext(
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
