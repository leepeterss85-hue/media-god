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

const getTmdbId = (request) =>
  request?.tmdbId ??
  request?.tmdb_id ??
  request?.id ??
  null;

const seriesTitleFromRequest = (request) => {
  const explicit = String(
    request?.seriesTitle ||
      request?.rdTitle ||
      ""
  ).trim();

  if (explicit) {
    return explicit;
  }

  return String(
    request?.title ||
      "TV Show"
  )
    .replace(
      /\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i,
      ""
    )
    .trim();
};

const normaliseEpisodes = (items) =>
  (Array.isArray(items)
    ? items
    : []
  )
    .filter(
      (item) =>
        positiveInt(
          item?.episode_number
        ) != null
    )
    .sort(
      (a, b) =>
        Number(
          a?.episode_number ||
            0
        ) -
        Number(
          b?.episode_number ||
            0
        )
    );

const normaliseSeasons = (items) =>
  (Array.isArray(items)
    ? items
    : []
  )
    .filter(
      (item) =>
        positiveInt(
          item?.season_number
        ) != null
    )
    .sort(
      (a, b) =>
        Number(
          a?.season_number ||
            0
        ) -
        Number(
          b?.season_number ||
            0
        )
    );

const episodePlaybackRequest = ({
  current,
  seasonNumber,
  episodeItem,
}) => {
  const episodeNumber =
    positiveInt(
      episodeItem?.episode_number
    );

  if (!episodeNumber) {
    return null;
  }

  const seriesTitle =
    seriesTitleFromRequest(
      current
    );

  const tmdbId =
    getTmdbId(
      current
    );

  const title =
    `${seriesTitle} — S${String(
      seasonNumber
    ).padStart(
      2,
      "0"
    )}E${String(
      episodeNumber
    ).padStart(
      2,
      "0"
    )}`;

  return {
    ...current,

    id:
      tmdbId ??
      current?.id,

    tmdbId:
      tmdbId,

    tmdb_id:
      tmdbId,

    title,

    seriesTitle,

    poster:
      episodeItem?.still_url ||
      current?.poster ||
      current?.poster_url ||
      "",

    mediaType: "tv",
    type: "series",

    season:
      seasonNumber,

    episode:
      episodeNumber,

    rdTitle:
      seriesTitle,

    rdYear:
      current?.rdYear ??
      current?.year ??
      null,

    rdSeason:
      seasonNumber,

    rdEpisode:
      episodeNumber,

    startTime: 0,

    preferRd: true,

    skipAddonLookup: false,
    skipRdLookup: false,

    allowNonPlaybackFallback:
      false,

    src: "",
    url: "",

    sources: [],
  };
};

const findNextEpisodeRequest =
  async (current) => {
    if (
      !isTvRequest(
        current
      )
    ) {
      return null;
    }

    const tmdbId =
      getTmdbId(
        current
      );

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
     * Look for the next episode
     * in the current season first.
     */
    try {
      const response =
        await base44.functions.invoke(
          "getTmdbMovies",
          {
            media_type:
              "tv",

            movie_id:
              tmdbId,

            season_number:
              seasonNumber,
          }
        );

      const data =
        unwrap(
          response
        );

      const episodes =
        normaliseEpisodes(
          data?.episodes
        );

      const nextEpisode =
        episodes.find(
          (item) =>
            Number(
              item?.episode_number ||
                0
            ) >
            episodeNumber
        );

      if (nextEpisode) {
        return episodePlaybackRequest({
          current,
          seasonNumber,
          episodeItem:
            nextEpisode,
        });
      }
    } catch (error) {
      console.warn(
        "[Media God] Could not inspect current season",
        error
      );
    }

    /*
     * Current season finished.
     * Retrieve ALL seasons and move
     * to the first episode of the
     * next available season.
     */
    try {
      const response =
        await base44.functions.invoke(
          "getTmdbMovies",
          {
            media_type:
              "tv",

            movie_id:
              tmdbId,
          }
        );

      const data =
        unwrap(
          response
        );

      const seasons =
        normaliseSeasons(
          data?.details
            ?.seasons
        );

      const laterSeasons =
        seasons.filter(
          (item) =>
            Number(
              item
                ?.season_number ||
                0
            ) >
              seasonNumber &&
            Number(
              item
                ?.episode_count ||
                0
            ) >
              0
        );

      for (
        const seasonItem
        of laterSeasons
      ) {
        const nextSeason =
          positiveInt(
            seasonItem
              ?.season_number
          );

        if (!nextSeason) {
          continue;
        }

        try {
          const seasonResponse =
            await base44.functions.invoke(
              "getTmdbMovies",
              {
                media_type:
                  "tv",

                movie_id:
                  tmdbId,

                season_number:
                  nextSeason,
              }
            );

          const seasonData =
            unwrap(
              seasonResponse
            );

          const episodes =
            normaliseEpisodes(
              seasonData
                ?.episodes
            );

          const firstEpisode =
            episodes[0];

          if (firstEpisode) {
            return episodePlaybackRequest({
              current,

              seasonNumber:
                nextSeason,

              episodeItem:
                firstEpisode,
            });
          }
        } catch (
          error
        ) {
          console.warn(
            `[Media God] Could not inspect season ${nextSeason}`,
            error
          );
        }
      }
    } catch (error) {
      console.warn(
        "[Media God] Could not inspect later seasons",
        error
      );
    }

    return null;
  };

const readAutoNext = () => {
  if (
    typeof window ===
    "undefined"
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
   * This is the important part.
   *
   * The player now receives the show
   * TMDB id as well as the current
   * season and episode.
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

        const tv =
          isTvRequest(
            request
          );

        const tmdbId =
          getTmdbId(
            request
          );

        const seriesTitle =
          tv
            ? seriesTitleFromRequest(
                request
              )
            : "";

        const detail = {
          mediaType:
            tv
              ? "tv"
              : request
                ? "movie"
                : null,

          tmdbId:
            tmdbId,

          tmdb_id:
            tmdbId,

          id:
            tmdbId,

          imdbId:
            request?.imdbId ??
            request?.imdb_id ??
            "",

          title:
            request?.title ||
            "",

          seriesTitle,

          poster:
            request?.poster ??
            request?.poster_url ??
            "",

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

          autoNext:
            Boolean(
              enabled
            ),
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
      [
        autoNext,
      ]
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
                    message ||
                      ""
                  ),
              },
            }
          )
        );
      },
      []
    );

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
     * Old external Episodes button.
     * Keep this for compatibility.
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

    /*
     * NEW:
     * Called by the in-player season
     * and episode browser.
     */
    const onPlaySpecificEpisode =
      async (
        event
      ) => {
        const current =
          currentRequestRef.current;

        if (
          !current ||
          !isTvRequest(
            current
          )
        ) {
          publishStatus(
            "TV programme information is unavailable."
          );

          return;
        }

        const seasonNumber =
          positiveInt(
            event?.detail
              ?.season
          );

        const supplied =
          event?.detail
            ?.episodeItem ||
          {};

        const episodeNumber =
          positiveInt(
            supplied
              ?.episode_number ??
              event?.detail
                ?.episode
          );

        if (
          !seasonNumber ||
          !episodeNumber
        ) {
          publishStatus(
            "Could not identify that episode."
          );

          return;
        }

        const episodeItem = {
          ...supplied,

          episode_number:
            episodeNumber,
        };

        const nextRequest =
          episodePlaybackRequest({
            current,
            seasonNumber,
            episodeItem,
          });

        if (!nextRequest) {
          publishStatus(
            "Could not prepare that episode."
          );

          return;
        }

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

          await play(
            nextRequest
          );
        } catch (error) {
          console.error(
            "[Media God] Selected episode failed",
            error
          );

          publishStatus(
            error?.message ||
              "Could not load that episode."
          );
        }
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
          // Ignore unavailable storage.
        }

        publishContext(
          currentRequestRef.current,
          enabled
        );
      };

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
    core,
    play,
    publishContext,
    publishStatus,
  ]);

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
