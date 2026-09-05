import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
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

import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) {
    return "0:00";
  }

  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
};

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

const normaliseSeasons = (items) =>
  (Array.isArray(items) ? items : [])
    .filter(
      (item) =>
        positiveInt(item?.season_number) != null &&
        Number(item?.episode_count || 0) > 0
    )
    .sort(
      (a, b) =>
        Number(a?.season_number || 0) -
        Number(b?.season_number || 0)
    );

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

const readPlayerContext = () => {
  const fallback = {
    mediaType: null,
    tmdbId: null,
    imdbId: null,
    title: "",
    year: null,
    season: null,
    episode: null,
    autoNext: true,
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  return window.__MG_PLAYER_CONTEXT__ || fallback;
};

const seasonName = (season) => {
  const number = positiveInt(
    season?.season_number
  );

  if (!number) {
    return season?.name || "Season";
  }

  const supplied = String(
    season?.name || ""
  ).trim();

  if (supplied) {
    return supplied;
  }

  return `Season ${number}`;
};

const episodeName = (episode) => {
  const number = positiveInt(
    episode?.episode_number
  );

  if (!number) {
    return "Episode";
  }

  const title = String(
    episode?.name ||
      episode?.title ||
      ""
  ).trim();

  return title
    ? `E${String(number).padStart(2, "0")} · ${title}`
    : `Episode ${number}`;
};

export default function MediaPlayerControls({
  videoRef,
  stageRef,
  isLive = false,
  onFullscreen,
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [seeking, setSeeking] = useState(false);

  const [playerContext, setPlayerContext] = useState(
    readPlayerContext
  );

  const [statusMessage, setStatusMessage] = useState("");

  const [episodePickerOpen, setEpisodePickerOpen] =
    useState(false);

  const [seasonOptions, setSeasonOptions] = useState([]);
  const [episodeOptions, setEpisodeOptions] = useState([]);

  const [selectedSeason, setSelectedSeason] = useState("");
  const [selectedEpisode, setSelectedEpisode] = useState("");

  const [seasonLoading, setSeasonLoading] = useState(false);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");

  const hideTimer = useRef(null);
  const statusTimer = useRef(null);

  const getVideo = () => videoRef?.current;

  const revealControls = () => {
    setShowControls(true);

    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }

    if (episodePickerOpen) {
      return;
    }

    hideTimer.current = setTimeout(() => {
      if (playing && !seeking) {
        setShowControls(false);
      }
    }, 2800);
  };

  useEffect(() => {
    const video = getVideo();

    if (!video) {
      return undefined;
    }

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    const onTime = () => {
      if (!seeking) {
        setCurrent(video.currentTime || 0);
      }
    };

    const onDur = () => {
      setDuration(video.duration || 0);
    };

    const onVol = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("loadedmetadata", onDur);
    video.addEventListener("volumechange", onVol);

    setMuted(video.muted);
    setVolume(video.volume);
    setPlaying(!video.paused);
    setCurrent(video.currentTime || 0);
    setDuration(video.duration || 0);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("loadedmetadata", onDur);
      video.removeEventListener("volumechange", onVol);

      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [videoRef, seeking]);

  useEffect(() => {
    const onFs = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", onFs);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    setPlayerContext(readPlayerContext());

    const onContext = (event) => {
      const next = event?.detail || readPlayerContext();

      setPlayerContext(next);

      if (next?.season != null) {
        setSelectedSeason(String(next.season));
      }

      if (next?.episode != null) {
        setSelectedEpisode(String(next.episode));
      }

      setEpisodePickerOpen(false);
    };

    const onStatus = (event) => {
      const message = String(
        event?.detail?.message || ""
      );

      setStatusMessage(message);
      setShowControls(true);

      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
      }

      if (message) {
        statusTimer.current = setTimeout(() => {
          setStatusMessage("");
        }, 3500);
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

      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !episodePickerOpen ||
      playerContext?.mediaType !== "tv" ||
      !playerContext?.tmdbId ||
      !selectedSeason
    ) {
      return undefined;
    }

    let cancelled = false;

    setEpisodeLoading(true);
    setEpisodeOptions([]);
    setPickerError("");

    base44.functions
      .invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: playerContext.tmdbId,
        season_number: Number(selectedSeason),
      })
      .then((response) => {
        if (cancelled) {
          return;
        }

        const data = unwrap(response);
        const episodes = normaliseEpisodes(
          data?.episodes
        );

        setEpisodeOptions(episodes);

        const currentSeason = String(
          playerContext?.season ?? ""
        );

        const currentEpisode = String(
          playerContext?.episode ?? ""
        );

        if (
          String(selectedSeason) === currentSeason &&
          episodes.some(
            (item) =>
              String(item?.episode_number) ===
              currentEpisode
          )
        ) {
          setSelectedEpisode(currentEpisode);
        } else {
          setSelectedEpisode("");
        }

        if (episodes.length === 0) {
          setPickerError(
            "No episodes were returned for that season."
          );
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setEpisodeOptions([]);
        setSelectedEpisode("");
        setPickerError(
          error?.message ||
            "Could not load episodes for that season."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setEpisodeLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    episodePickerOpen,
    playerContext?.episode,
    playerContext?.mediaType,
    playerContext?.season,
    playerContext?.tmdbId,
    selectedSeason,
  ]);

  const togglePlay = () => {
    const video = getVideo();

    if (!video) {
      return;
    }

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = getVideo();

    if (!video) {
      return;
    }

    video.muted = !video.muted;
  };

  const onVolume = (event) => {
    const video = getVideo();

    if (!video) {
      return;
    }

    const nextVolume = Number(event.target.value);

    video.volume = nextVolume;
    video.muted = nextVolume === 0;
  };

  const seekTo = (event) => {
    const video = getVideo();

    if (!video || !video.duration) {
      return;
    }

    const ratio = Number(event.target.value) / 100;

    video.currentTime = ratio * video.duration;
    setCurrent(video.currentTime);
  };

  const skip = (delta) => {
    const video = getVideo();

    if (!video) {
      return;
    }

    video.currentTime = Math.max(
      0,
      Math.min(
        video.duration || 0,
        (video.currentTime || 0) + delta
      )
    );
  };

  const toggleFullscreen = () => {
    if (onFullscreen) {
      onFullscreen();
      return;
    }

    stageRef?.current?.requestFullscreen?.().catch(() => {});
  };

  const openEpisodePicker = useCallback(async () => {
    if (playerContext?.mediaType !== "tv") {
      return;
    }

    if (!playerContext?.tmdbId) {
      setStatusMessage(
        "This TV item is missing its TMDB id, so seasons cannot be loaded."
      );
      setShowControls(true);
      return;
    }

    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }

    setShowControls(true);
    setEpisodePickerOpen(true);
    setPickerError("");

    const currentSeason = positiveInt(
      playerContext?.season
    );

    if (currentSeason) {
      setSelectedSeason(String(currentSeason));
    }

    setSeasonLoading(true);

    try {
      const response = await base44.functions.invoke(
        "getTmdbMovies",
        {
          media_type: "tv",
          movie_id: playerContext.tmdbId,
        }
      );

      const data = unwrap(response);
      let seasons = normaliseSeasons(
        data?.details?.seasons
      );

      if (
        currentSeason &&
        !seasons.some(
          (item) =>
            Number(item?.season_number) ===
            currentSeason
        )
      ) {
        seasons = normaliseSeasons([
          ...seasons,
          {
            season_number: currentSeason,
            name: `Season ${currentSeason}`,
            episode_count: 1,
          },
        ]);
      }

      setSeasonOptions(seasons);

      const requestedSeason = currentSeason
        ? String(currentSeason)
        : seasons[0]?.season_number != null
          ? String(seasons[0].season_number)
          : "";

      setSelectedSeason(requestedSeason);

      if (seasons.length === 0) {
        setPickerError(
          "No seasons were returned for this show."
        );
      }
    } catch (error) {
      setSeasonOptions([]);
      setEpisodeOptions([]);
      setPickerError(
        error?.message ||
          "Could not load the season list."
      );
    } finally {
      setSeasonLoading(false);
    }
  }, [
    playerContext?.mediaType,
    playerContext?.season,
    playerContext?.tmdbId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onOpenPicker = () => {
      openEpisodePicker();
    };

    window.addEventListener(
      "mg:open-episode-picker",
      onOpenPicker
    );

    return () => {
      window.removeEventListener(
        "mg:open-episode-picker",
        onOpenPicker
      );
    };
  }, [openEpisodePicker]);

  const closeEpisodePicker = () => {
    setEpisodePickerOpen(false);
    setPickerError("");
    revealControls();
  };

  const chooseSeason = (event) => {
    setSelectedSeason(event.target.value);
    setSelectedEpisode("");
    setPickerError("");
  };

  const chooseEpisode = (event) => {
    const value = event.target.value;

    setSelectedEpisode(value);

    const episodeItem = episodeOptions.find(
      (item) =>
        String(item?.episode_number) === value
    );

    const seasonNumber = positiveInt(
      selectedSeason
    );

    if (!episodeItem || !seasonNumber) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("mg:play-specific-episode", {
        detail: {
          seasonNumber,
          episodeItem,
        },
      })
    );

    setEpisodePickerOpen(false);
    setShowControls(true);
  };

  const playNextEpisode = () => {
    window.dispatchEvent(
      new CustomEvent("mg:play-next-episode")
    );
  };

  const toggleAutoNext = () => {
    window.dispatchEvent(
      new CustomEvent("mg:set-auto-next", {
        detail: {
          enabled: !playerContext?.autoNext,
        },
      })
    );
  };

  const progress = duration
    ? (current / duration) * 100
    : 0;

  const isTv = playerContext?.mediaType === "tv";

  const controlsVisible =
    showControls || episodePickerOpen;

  return (
    <div
      className="absolute inset-0 flex flex-col justify-end"
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onMouseLeave={() => {
        if (episodePickerOpen) {
          return;
        }

        if (hideTimer.current) {
          clearTimeout(hideTimer.current);
        }

        if (playing && !seeking) {
          setShowControls(false);
        }
      }}
      onClick={(event) => {
        if (
          !episodePickerOpen &&
          event.target === event.currentTarget
        ) {
          togglePlay();
        }
      }}
    >
      {isTv && !episodePickerOpen && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openEpisodePicker();
          }}
          className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/75 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm hover:border-mg-green/60 hover:text-mg-green"
          aria-label="Choose season and episode"
        >
          <ListVideo className="w-3.5 h-3.5" />
          Seasons & episodes
          {playerContext?.season != null &&
            playerContext?.episode != null && (
              <span className="text-white/50">
                S{String(playerContext.season).padStart(2, "0")}
                E{String(playerContext.episode).padStart(2, "0")}
              </span>
            )}
        </button>
      )}

      {episodePickerOpen && isTv && (
        <div
          className="absolute inset-0 z-30 flex items-end sm:items-center justify-center bg-black/75 p-3 pointer-events-auto"
          onClick={closeEpisodePicker}
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/15 bg-mg-surface/95 backdrop-blur-md p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold">
                  Season & Episode
                </p>
                <p className="text-white/45 text-[10px] mt-0.5 truncate">
                  {playerContext?.title || "Choose what to play"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEpisodePicker}
                className="shrink-0 rounded-md p-1.5 text-white/60 hover:text-white hover:bg-white/10"
                aria-label="Close season and episode picker"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/50 mb-1">
                  Season
                </span>

                <div className="relative">
                  <select
                    value={selectedSeason}
                    onChange={chooseSeason}
                    disabled={seasonLoading}
                    className="w-full appearance-none rounded-lg border border-white/15 bg-black/60 px-3 py-2.5 pr-9 text-sm text-white outline-none focus:border-mg-green disabled:opacity-60"
                    aria-label="Choose season"
                  >
                    <option value="">
                      {seasonLoading
                        ? "Loading seasons…"
                        : "Choose season"}
                    </option>

                    {seasonOptions.map((season) => (
                      <option
                        key={season.season_number}
                        value={String(season.season_number)}
                      >
                        {seasonName(season)}
                        {Number(season?.episode_count || 0) > 0
                          ? ` · ${season.episode_count} ep`
                          : ""}
                      </option>
                    ))}
                  </select>

                  {seasonLoading && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-mg-green" />
                  )}
                </div>
              </label>

              <label className="block min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/50 mb-1">
                  Episode
                </span>

                <div className="relative">
                  <select
                    value={selectedEpisode}
                    onChange={chooseEpisode}
                    disabled={
                      !selectedSeason ||
                      episodeLoading ||
                      episodeOptions.length === 0
                    }
                    className="w-full appearance-none rounded-lg border border-white/15 bg-black/60 px-3 py-2.5 pr-9 text-sm text-white outline-none focus:border-mg-green disabled:opacity-60"
                    aria-label="Choose episode"
                  >
                    <option value="">
                      {episodeLoading
                        ? "Loading episodes…"
                        : "Choose episode"}
                    </option>

                    {episodeOptions.map((episode) => (
                      <option
                        key={episode.episode_number}
                        value={String(episode.episode_number)}
                      >
                        {episodeName(episode)}
                      </option>
                    ))}
                  </select>

                  {episodeLoading && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-mg-green" />
                  )}
                </div>
              </label>
            </div>

            {pickerError && (
              <p className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
                {pickerError}
              </p>
            )}

            <p className="mt-2 text-[10px] leading-relaxed text-white/40">
              Picking an episode starts a fresh source search for that exact season and episode. The Real-Debrid file list below the player is only the files inside the currently selected torrent.
            </p>
          </div>
        </div>
      )}

      <div
        className={cn(
          "bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-2 pt-8 select-none transition-opacity duration-200",
          controlsVisible
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        )}
      >
        {statusMessage && (
          <div className="mb-2 inline-flex max-w-full rounded-md bg-black/70 border border-white/10 px-2.5 py-1.5 text-[11px] text-white/80">
            <span className="truncate">
              {statusMessage}
            </span>
          </div>
        )}

        {isTv && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <button
              type="button"
              onClick={openEpisodePicker}
              className="flex items-center gap-1.5 rounded-md bg-black/60 border border-white/15 px-2.5 py-1.5 text-[11px] text-white hover:border-mg-green/60 hover:text-mg-green transition-colors"
              aria-label="Choose another season or episode"
            >
              <ListVideo className="w-3.5 h-3.5" />
              Seasons & episodes
            </button>

            <button
              type="button"
              onClick={playNextEpisode}
              className="flex items-center gap-1.5 rounded-md bg-black/60 border border-white/15 px-2.5 py-1.5 text-[11px] text-white hover:border-mg-green/60 hover:text-mg-green transition-colors"
              aria-label="Play next episode"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Next episode
            </button>

            <button
              type="button"
              onClick={toggleAutoNext}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors",
                playerContext?.autoNext
                  ? "bg-mg-green/15 border-mg-green/40 text-mg-green"
                  : "bg-black/60 border-white/15 text-white/60 hover:text-white"
              )}
              aria-label="Toggle automatic next episode"
            >
              <Repeat2 className="w-3.5 h-3.5" />
              Auto next {playerContext?.autoNext ? "On" : "Off"}
            </button>

            {playerContext?.season != null &&
              playerContext?.episode != null && (
                <span className="text-[10px] text-white/50 ml-1">
                  S{String(playerContext.season).padStart(2, "0")}
                  E{String(playerContext.episode).padStart(2, "0")}
                </span>
              )}
          </div>
        )}

        {!isLive && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-white/80 tabular-nums w-12 text-right">
              {formatTime(current)}
            </span>

            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={seekTo}
              onPointerDown={() => setSeeking(true)}
              onPointerUp={() => setSeeking(false)}
              className="flex-1 h-1.5 accent-mg-green cursor-pointer"
              aria-label="Seek"
            />

            <span className="text-[10px] text-white/60 tabular-nums w-12">
              {formatTime(duration)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="text-white hover:text-mg-green transition-colors"
            aria-label={playing ? "Pause" : "Play"}
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
                onClick={() => skip(-10)}
                className="text-white/80 hover:text-white transition-colors"
                aria-label="Back 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => skip(10)}
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
              onClick={toggleMute}
              className="text-white/80 hover:text-white transition-colors"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? (
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
              value={muted ? 0 : volume}
              onChange={onVolume}
              className="w-0 group-hover:w-16 transition-all h-1 accent-mg-green cursor-pointer"
              aria-label="Volume"
            />
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={toggleFullscreen}
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
