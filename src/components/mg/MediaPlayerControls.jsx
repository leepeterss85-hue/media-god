import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Calendar,
  ListVideo,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

const EMPTY_CONTEXT = {
  mediaType: null,

  tmdbId: null,
  imdbId: "",

  title: "",
  seriesTitle: "",

  poster: "",
  year: null,

  season: null,
  episode: null,

  autoNext: true,
};

const formatTime = (seconds) => {
  if (
    !seconds ||
    !isFinite(seconds)
  ) {
    return "0:00";
  }

  const s =
    Math.floor(
      seconds % 60
    );

  const m =
    Math.floor(
      (seconds / 60) %
        60
    );

  const h =
    Math.floor(
      seconds / 3600
    );

  if (h > 0) {
    return `${h}:${String(
      m
    ).padStart(
      2,
      "0"
    )}:${String(
      s
    ).padStart(
      2,
      "0"
    )}`;
  }

  return `${m}:${String(
    s
  ).padStart(
    2,
    "0"
  )}`;
};

const readPlayerContext = () => {
  if (
    typeof window ===
    "undefined"
  ) {
    return EMPTY_CONTEXT;
  }

  return (
    window.__MG_PLAYER_CONTEXT__ ||
    EMPTY_CONTEXT
  );
};

const positiveInt = (value) => {
  const number =
    Number(value);

  return (
    Number.isInteger(
      number
    ) &&
    number > 0
      ? number
      : null
  );
};

const normaliseSeasons = (items) =>
  (
    Array.isArray(items)
      ? items
      : []
  )
    .filter(
      (item) =>
        positiveInt(
          item?.season_number
        ) != null
    )
    .map(
      (item) => ({
        ...item,

        season_number:
          Number(
            item.season_number
          ),

        episode_count:
          Number(
            item?.episode_count ||
              0
          ),
      })
    )
    .sort(
      (a, b) =>
        a.season_number -
        b.season_number
    );

const normaliseEpisodes = (items) =>
  (
    Array.isArray(items)
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

export default function MediaPlayerControls({
  videoRef,
  stageRef,
  isLive = false,
  onFullscreen,
}) {
  const [
    playing,
    setPlaying,
  ] = useState(false);

  const [
    muted,
    setMuted,
  ] = useState(false);

  const [
    volume,
    setVolume,
  ] = useState(1);

  const [
    current,
    setCurrent,
  ] = useState(0);

  const [
    duration,
    setDuration,
  ] = useState(0);

  const [
    fullscreen,
    setFullscreen,
  ] = useState(false);

  const [
    showControls,
    setShowControls,
  ] = useState(true);

  const [
    seeking,
    setSeeking,
  ] = useState(false);

  const [
    playerContext,
    setPlayerContext,
  ] = useState(
    readPlayerContext
  );

  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");

  /*
   * NEW IN-PLAYER EPISODE BROWSER.
   */
  const [
    episodePickerOpen,
    setEpisodePickerOpen,
  ] = useState(false);

  const [
    seasons,
    setSeasons,
  ] = useState([]);

  const [
    seasonsLoading,
    setSeasonsLoading,
  ] = useState(false);

  const [
    selectedSeason,
    setSelectedSeason,
  ] = useState("");

  const [
    episodes,
    setEpisodes,
  ] = useState([]);

  const [
    episodesLoading,
    setEpisodesLoading,
  ] = useState(false);

  const [
    episodeError,
    setEpisodeError,
  ] = useState("");

  const [
    startingEpisode,
    setStartingEpisode,
  ] = useState(null);

  const hideTimer =
    useRef(null);

  const statusTimer =
    useRef(null);

  const getVideo = () =>
    videoRef?.current;

  const isTv =
    playerContext
      ?.mediaType ===
    "tv";

  const revealControls =
    useCallback(
      () => {
        setShowControls(
          true
        );

        if (
          hideTimer.current
        ) {
          clearTimeout(
            hideTimer.current
          );
        }

        if (
          episodePickerOpen
        ) {
          return;
        }

        hideTimer.current =
          setTimeout(
            () => {
              if (
                playing &&
                !seeking &&
                !episodePickerOpen
              ) {
                setShowControls(
                  false
                );
              }
            },
            2800
          );
      },
      [
        episodePickerOpen,
        playing,
        seeking,
      ]
    );

  useEffect(() => {
    const video =
      getVideo();

    if (!video) {
      return undefined;
    }

    const onPlay =
      () =>
        setPlaying(
          true
        );

    const onPause =
      () =>
        setPlaying(
          false
        );

    const onTime =
      () => {
        if (!seeking) {
          setCurrent(
            video.currentTime ||
              0
          );
        }
      };

    const onDur =
      () => {
        setDuration(
          video.duration ||
            0
        );
      };

    const onVol =
      () => {
        setMuted(
          video.muted
        );

        setVolume(
          video.volume
        );
      };

    video.addEventListener(
      "play",
      onPlay
    );

    video.addEventListener(
      "pause",
      onPause
    );

    video.addEventListener(
      "timeupdate",
      onTime
    );

    video.addEventListener(
      "durationchange",
      onDur
    );

    video.addEventListener(
      "loadedmetadata",
      onDur
    );

    video.addEventListener(
      "volumechange",
      onVol
    );

    setMuted(
      video.muted
    );

    setVolume(
      video.volume
    );

    setPlaying(
      !video.paused
    );

    setCurrent(
      video.currentTime ||
        0
    );

    setDuration(
      video.duration ||
        0
    );

    return () => {
      video.removeEventListener(
        "play",
        onPlay
      );

      video.removeEventListener(
        "pause",
        onPause
      );

      video.removeEventListener(
        "timeupdate",
        onTime
      );

      video.removeEventListener(
        "durationchange",
        onDur
      );

      video.removeEventListener(
        "loadedmetadata",
        onDur
      );

      video.removeEventListener(
        "volumechange",
        onVol
      );

      if (
        hideTimer.current
      ) {
        clearTimeout(
          hideTimer.current
        );
      }
    };
  }, [
    videoRef,
    seeking,
  ]);

  useEffect(() => {
    const onFs =
      () => {
        setFullscreen(
          Boolean(
            document.fullscreenElement
          )
        );
      };

    document.addEventListener(
      "fullscreenchange",
      onFs
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        onFs
      );
    };
  }, []);

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return undefined;
    }

    setPlayerContext(
      readPlayerContext()
    );

    const onContext =
      (event) => {
        const detail =
          event?.detail ||
          readPlayerContext();

        setPlayerContext(
          detail
        );

        /*
         * If an episode was just
         * changed from inside the
         * picker, close the picker.
         */
        setStartingEpisode(
          null
        );
      };

    const onStatus =
      (event) => {
        const message =
          String(
            event?.detail
              ?.message ||
              ""
          );

        setStatusMessage(
          message
        );

        setShowControls(
          true
        );

        if (
          statusTimer.current
        ) {
          clearTimeout(
            statusTimer.current
          );
        }

        if (message) {
          statusTimer.current =
            setTimeout(
              () => {
                setStatusMessage(
                  ""
                );
              },
              3500
            );
        }
      };

    window.addEventListener(
      "mg:player-context",
      onContext
    );

    window.addEventListener(
      "mg:player-status",
      onStatus
    );

    return () => {
      window.removeEventListener(
        "mg:player-context",
        onContext
      );

      window.removeEventListener(
        "mg:player-status",
        onStatus
      );

      if (
        statusTimer.current
      ) {
        clearTimeout(
          statusTimer.current
        );
      }
    };
  }, []);

  /*
   * Whenever a new TV show starts,
   * reset the in-player browser.
   */
  useEffect(() => {
    setSeasons([]);
    setEpisodes([]);
    setEpisodeError("");

    if (
      playerContext
        ?.season != null
    ) {
      setSelectedSeason(
        String(
          playerContext.season
        )
      );
    }
  }, [
    playerContext
      ?.tmdbId,
  ]);

  /*
   * Load ALL seasons when the
   * Episodes panel is opened.
   */
  useEffect(() => {
    let cancelled =
      false;

    if (
      !episodePickerOpen ||
      !isTv
    ) {
      return undefined;
    }

    const tmdbId =
      playerContext
        ?.tmdbId;

    if (!tmdbId) {
      setEpisodeError(
        "Media God does not have the TMDB id for this TV show."
      );

      return undefined;
    }

    const load =
      async () => {
        setSeasonsLoading(
          true
        );

        setEpisodeError(
          ""
        );

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

          if (cancelled) {
            return;
          }

          const data =
            response?.data ??
            response ??
            {};

          let found =
            normaliseSeasons(
              data?.details
                ?.seasons
            );

          /*
           * Never lose the currently
           * playing season even if TMDB
           * returns incomplete data.
           */
          const currentSeason =
            positiveInt(
              playerContext
                ?.season
            );

          if (
            currentSeason &&
            !found.some(
              (item) =>
                Number(
                  item
                    .season_number
                ) ===
                currentSeason
            )
          ) {
            found = [
              ...found,
              {
                season_number:
                  currentSeason,

                name:
                  `Season ${currentSeason}`,

                episode_count:
                  0,
              },
            ].sort(
              (a, b) =>
                Number(
                  a.season_number
                ) -
                Number(
                  b.season_number
                )
            );
          }

          setSeasons(
            found
          );

          if (
            found.length ===
            0
          ) {
            setEpisodeError(
              data?.error ||
                "No seasons were returned for this show."
            );

            return;
          }

          const selectedExists =
            found.some(
              (item) =>
                String(
                  item
                    .season_number
                ) ===
                String(
                  selectedSeason
                )
            );

          if (
            !selectedExists
          ) {
            const preferred =
              found.find(
                (item) =>
                  Number(
                    item
                      .season_number
                  ) ===
                  Number(
                    playerContext
                      ?.season
                  )
              ) ||
              found[0];

            setSelectedSeason(
              String(
                preferred
                  .season_number
              )
            );
          }
        } catch (error) {
          if (
            !cancelled
          ) {
            setEpisodeError(
              error?.message ||
                "Could not load all seasons."
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setSeasonsLoading(
              false
            );
          }
        }
      };

    load();

    return () => {
      cancelled =
        true;
    };
  }, [
    episodePickerOpen,
    isTv,
    playerContext
      ?.tmdbId,
    playerContext
      ?.season,
  ]);

  /*
   * Load episodes for whichever
   * season the user chooses.
   */
  useEffect(() => {
    let cancelled =
      false;

    if (
      !episodePickerOpen ||
      !isTv ||
      !selectedSeason ||
      !playerContext
        ?.tmdbId
    ) {
      return undefined;
    }

    const load =
      async () => {
        setEpisodesLoading(
          true
        );

        setEpisodes(
          []
        );

        setEpisodeError(
          ""
        );

        try {
          const response =
            await base44.functions.invoke(
              "getTmdbMovies",
              {
                media_type:
                  "tv",

                movie_id:
                  playerContext.tmdbId,

                season_number:
                  Number(
                    selectedSeason
                  ),
              }
            );

          if (cancelled) {
            return;
          }

          const data =
            response?.data ??
            response ??
            {};

          const found =
            normaliseEpisodes(
              data?.episodes
            );

          setEpisodes(
            found
          );

          if (
            found.length ===
            0
          ) {
            setEpisodeError(
              data?.error ||
                "No episodes were returned for this season."
            );
          }
        } catch (error) {
          if (
            !cancelled
          ) {
            setEpisodes(
              []
            );

            setEpisodeError(
              error?.message ||
                "Could not load episodes."
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setEpisodesLoading(
              false
            );
          }
        }
      };

    load();

    return () => {
      cancelled =
        true;
    };
  }, [
    episodePickerOpen,
    isTv,
    selectedSeason,
    playerContext
      ?.tmdbId,
  ]);

  const togglePlay = () => {
    const video =
      getVideo();

    if (!video) {
      return;
    }

    if (video.paused) {
      video
        .play()
        .catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video =
      getVideo();

    if (!video) {
      return;
    }

    video.muted =
      !video.muted;
  };

  const onVolume =
    (event) => {
      const video =
        getVideo();

      if (!video) {
        return;
      }

      const nextVolume =
        Number(
          event.target.value
        );

      video.volume =
        nextVolume;

      video.muted =
        nextVolume === 0;
    };

  const seekTo =
    (event) => {
      const video =
        getVideo();

      if (
        !video ||
        !video.duration
      ) {
        return;
      }

      const ratio =
        Number(
          event.target.value
        ) / 100;

      video.currentTime =
        ratio *
        video.duration;

      setCurrent(
        video.currentTime
      );
    };

  const skip =
    (delta) => {
      const video =
        getVideo();

      if (!video) {
        return;
      }

      video.currentTime =
        Math.max(
          0,

          Math.min(
            video.duration ||
              0,

            (video.currentTime ||
              0) +
              delta
          )
        );
    };

  const toggleFullscreen =
    () => {
      if (onFullscreen) {
        onFullscreen();
        return;
      }

      stageRef
        ?.current
        ?.requestFullscreen
        ?.()
        .catch(
          () => {}
        );
    };

  const toggleEpisodePicker =
    () => {
      setShowControls(
        true
      );

      setEpisodePickerOpen(
        (value) =>
          !value
      );

      if (
        playerContext
          ?.season != null
      ) {
        setSelectedSeason(
          String(
            playerContext.season
          )
        );
      }
    };

  const playEpisode =
    (
      episodeItem
    ) => {
      const seasonNumber =
        positiveInt(
          selectedSeason
        );

      const episodeNumber =
        positiveInt(
          episodeItem
            ?.episode_number
        );

      if (
        !seasonNumber ||
        !episodeNumber
      ) {
        return;
      }

      const key =
        `${seasonNumber}:${episodeNumber}`;

      setStartingEpisode(
        key
      );

      window.dispatchEvent(
        new CustomEvent(
          "mg:play-specific-episode",
          {
            detail: {
              season:
                seasonNumber,

              episode:
                episodeNumber,

              episodeItem,
            },
          }
        )
      );

      setEpisodePickerOpen(
        false
      );
    };

  const playNextEpisode =
    () => {
      window.dispatchEvent(
        new CustomEvent(
          "mg:play-next-episode"
        )
      );
    };

  const toggleAutoNext =
    () => {
      window.dispatchEvent(
        new CustomEvent(
          "mg:set-auto-next",
          {
            detail: {
              enabled:
                !playerContext
                  ?.autoNext,
            },
          }
        )
      );
    };

  const progress =
    duration
      ? (
          current /
          duration
        ) * 100
      : 0;

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col justify-end transition-opacity duration-200",

        showControls
          ? "opacity-100"
          : "opacity-0 pointer-events-none"
      )}
      onMouseMove={
        revealControls
      }
      onTouchStart={
        revealControls
      }
      onMouseLeave={() => {
        if (
          hideTimer.current
        ) {
          clearTimeout(
            hideTimer.current
          );
        }

        if (
          playing &&
          !seeking &&
          !episodePickerOpen
        ) {
          setShowControls(
            false
          );
        }
      }}
      onClick={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          togglePlay();
        }
      }}
    >
      {/* ALL-SEASON EPISODE PICKER */}
      {isTv &&
        episodePickerOpen && (
          <div
            className="absolute left-2 right-2 sm:left-4 sm:right-4 bottom-24 sm:bottom-20 z-30 max-h-[68vh] bg-black/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl overflow-hidden"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 border-b border-white/10">
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {playerContext
                    ?.seriesTitle ||
                    playerContext
                      ?.title ||
                    "TV Show"}
                </p>

                <p className="text-white/45 text-[10px] mt-0.5">
                  Choose any
                  season and
                  episode
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEpisodePickerOpen(
                    false
                  )
                }
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-white/70 flex items-center justify-center shrink-0"
                aria-label="Close episode selector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {seasonsLoading &&
            seasons.length ===
              0 ? (
              <div className="p-6 flex items-center justify-center gap-2 text-white/60 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-mg-green" />
                Loading all
                seasons…
              </div>
            ) : (
              <>
                {/* EVERY SEASON */}
                <div className="px-3 sm:px-4 pt-3 border-b border-white/10">
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3">
                    {seasons.map(
                      (
                        seasonItem
                      ) => {
                        const number =
                          Number(
                            seasonItem
                              .season_number
                          );

                        const selected =
                          String(
                            number
                          ) ===
                          String(
                            selectedSeason
                          );

                        return (
                          <button
                            type="button"
                            key={
                              number
                            }
                            onClick={() =>
                              setSelectedSeason(
                                String(
                                  number
                                )
                              )
                            }
                            className={cn(
                              "shrink-0 min-h-10 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors",

                              selected
                                ? "bg-mg-green text-black border-mg-green"
                                : "bg-white/5 text-white/75 border-white/10 hover:border-mg-green/50 hover:text-white"
                            )}
                          >
                            Season{" "}
                            {
                              number
                            }

                            {Number(
                              seasonItem
                                ?.episode_count ||
                                0
                            ) >
                              0 && (
                              <span
                                className={cn(
                                  "ml-1 font-normal",

                                  selected
                                    ? "text-black/60"
                                    : "text-white/35"
                                )}
                              >
                                (
                                {
                                  seasonItem
                                    .episode_count
                                }
                                )
                              </span>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* EPISODES FOR SELECTED SEASON */}
                <div className="max-h-[44vh] overflow-y-auto p-2 sm:p-3">
                  {episodesLoading ? (
                    <div className="p-6 flex items-center justify-center gap-2 text-white/60 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-mg-green" />

                      Loading
                      Season{" "}
                      {
                        selectedSeason
                      }
                      …
                    </div>
                  ) : episodes.length >
                    0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {episodes.map(
                        (
                          episodeItem
                        ) => {
                          const episodeNumber =
                            Number(
                              episodeItem
                                ?.episode_number
                            );

                          const currentEpisode =
                            Number(
                              playerContext
                                ?.season
                            ) ===
                              Number(
                                selectedSeason
                              ) &&
                            Number(
                              playerContext
                                ?.episode
                            ) ===
                              episodeNumber;

                          const key =
                            `${selectedSeason}:${episodeNumber}`;

                          const starting =
                            startingEpisode ===
                            key;

                          return (
                            <button
                              type="button"
                              key={
                                episodeNumber
                              }
                              onClick={() =>
                                playEpisode(
                                  episodeItem
                                )
                              }
                              disabled={
                                starting
                              }
                              className={cn(
                                "flex gap-2.5 text-left rounded-lg border p-2 transition-colors min-w-0",

                                currentEpisode
                                  ? "border-mg-green/50 bg-mg-green/10"
                                  : "border-white/10 bg-white/5 hover:border-mg-green/40 hover:bg-white/10",

                                starting &&
                                  "opacity-60"
                              )}
                            >
                              <div className="relative w-24 sm:w-28 aspect-video bg-black rounded-md overflow-hidden shrink-0">
                                {episodeItem
                                  ?.still_url ? (
                                  <img
                                    src={
                                      episodeItem
                                        .still_url
                                    }
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white/25">
                                    <Play className="w-5 h-5" />
                                  </div>
                                )}

                                <span className="absolute bottom-1 left-1 bg-black/75 rounded px-1.5 py-0.5 text-[9px] text-white font-semibold">
                                  E
                                  {
                                    episodeNumber
                                  }
                                </span>
                              </div>

                              <div className="min-w-0 flex-1 py-0.5">
                                <p className="text-white text-xs font-semibold line-clamp-2">
                                  Episode{" "}
                                  {
                                    episodeNumber
                                  }

                                  {episodeItem
                                    ?.name
                                    ? ` — ${episodeItem.name}`
                                    : ""}
                                </p>

                                {episodeItem
                                  ?.air_date && (
                                  <p className="flex items-center gap-1 text-white/35 text-[9px] mt-1">
                                    <Calendar className="w-3 h-3" />

                                    {
                                      episodeItem
                                        .air_date
                                    }
                                  </p>
                                )}

                                {currentEpisode && (
                                  <p className="text-mg-green text-[9px] mt-1 font-semibold">
                                    Playing now
                                  </p>
                                )}

                                {starting && (
                                  <p className="flex items-center gap-1 text-mg-green text-[9px] mt-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />

                                    Loading…
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <div className="p-5 text-center">
                      <p className="text-white/45 text-xs">
                        {episodeError ||
                          "No episodes found for this season."}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      <div className="bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3 pb-2 pt-8 select-none">
        {statusMessage && (
          <div className="mb-2 inline-flex max-w-full rounded-md bg-black/70 border border-white/10 px-2.5 py-1.5 text-[11px] text-white/80">
            <span className="truncate">
              {
                statusMessage
              }
            </span>
          </div>
        )}

        {isTv && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <button
              type="button"
              onClick={
                toggleEpisodePicker
              }
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors",

                episodePickerOpen
                  ? "bg-mg-green/15 border-mg-green/50 text-mg-green"
                  : "bg-black/60 border-white/15 text-white hover:border-mg-green/60 hover:text-mg-green"
              )}
              aria-label="Choose season or episode"
            >
              <ListVideo className="w-3.5 h-3.5" />

              Seasons &
              Episodes
            </button>

            <button
              type="button"
              onClick={
                playNextEpisode
              }
              className="flex items-center gap-1.5 rounded-md bg-black/60 border border-white/15 px-2.5 py-1.5 text-[11px] text-white hover:border-mg-green/60 hover:text-mg-green transition-colors"
              aria-label="Play next episode"
            >
              <SkipForward className="w-3.5 h-3.5" />

              Next episode
            </button>

            <button
              type="button"
              onClick={
                toggleAutoNext
              }
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors",

                playerContext
                  ?.autoNext
                  ? "bg-mg-green/15 border-mg-green/40 text-mg-green"
                  : "bg-black/60 border-white/15 text-white/60 hover:text-white"
              )}
              aria-label="Toggle automatic next episode"
            >
              <Repeat2 className="w-3.5 h-3.5" />

              Auto next{" "}
              {playerContext
                ?.autoNext
                ? "On"
                : "Off"}
            </button>

            {playerContext
              ?.season !=
              null &&
              playerContext
                ?.episode !=
                null && (
                <span className="text-[10px] text-white/50 ml-1">
                  S
                  {String(
                    playerContext
                      .season
                  ).padStart(
                    2,
                    "0"
                  )}
                  E
                  {String(
                    playerContext
                      .episode
                  ).padStart(
                    2,
                    "0"
                  )}
                </span>
              )}
          </div>
        )}

        {!isLive && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-white/80 tabular-nums w-12 text-right">
              {formatTime(
                current
              )}
            </span>

            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={
                progress
              }
              onChange={
                seekTo
              }
              onPointerDown={() =>
                setSeeking(
                  true
                )
              }
              onPointerUp={() =>
                setSeeking(
                  false
                )
              }
              className="flex-1 h-1.5 accent-mg-green cursor-pointer"
              aria-label="Seek"
            />

            <span className="text-[10px] text-white/60 tabular-nums w-12">
              {formatTime(
                duration
              )}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={
              togglePlay
            }
            className="text-white hover:text-mg-green transition-colors"
            aria-label={
              playing
                ? "Pause"
                : "Play"
            }
          >
            {playing ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>

          {!isLive && (
            <>
              <button
                type="button"
                onClick={() =>
                  skip(
                    -10
                  )
                }
                className="text-white/80 hover:text-white transition-colors"
                aria-label="Back 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() =>
                  skip(
                    10
                  )
                }
                className="text-white/80 hover:text-white transition-colors"
                aria-label="Forward 10 seconds"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </>
          )}

          <div className="flex items-center gap-1.5 group">
            <button
              type="button"
              onClick={
                toggleMute
              }
              className="text-white/80 hover:text-white transition-colors"
              aria-label={
                muted
                  ? "Unmute"
                  : "Mute"
              }
            >
              {muted ||
              volume ===
                0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={
                muted
                  ? 0
                  : volume
              }
              onChange={
                onVolume
              }
              className="w-0 group-hover:w-16 focus:w-16 transition-all h-1 accent-mg-green cursor-pointer"
              aria-label="Volume"
            />
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={
              toggleFullscreen
            }
            className="text-white/80 hover:text-white transition-colors"
            aria-label="Fullscreen"
          >
            {fullscreen ? (
              <Minimize className="w-4 h-4" />
            ) : (
              <Maximize className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
