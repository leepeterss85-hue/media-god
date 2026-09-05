import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ListVideo,
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
} from "lucide-react";

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

const readPlayerContext = () => {
  if (typeof window === "undefined") {
    return {
      mediaType: null,
      season: null,
      episode: null,
      autoNext: true,
    };
  }

  return (
    window.__MG_PLAYER_CONTEXT__ || {
      mediaType: null,
      season: null,
      episode: null,
      autoNext: true,
    }
  );
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

  const hideTimer = useRef(null);
  const statusTimer = useRef(null);

  const getVideo = () => videoRef?.current;

  const revealControls = () => {
    setShowControls(true);

    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
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
      setPlayerContext(
        event?.detail || readPlayerContext()
      );
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

  const chooseEpisode = () => {
    window.dispatchEvent(
      new CustomEvent("mg:choose-episode")
    );
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

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col justify-end transition-opacity duration-200",
        showControls
          ? "opacity-100"
          : "opacity-0 pointer-events-none"
      )}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onMouseLeave={() => {
        if (hideTimer.current) {
          clearTimeout(hideTimer.current);
        }

        if (playing && !seeking) {
          setShowControls(false);
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          togglePlay();
        }
      }}
    >
      <div className="bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-2 pt-8 select-none">
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
              onClick={chooseEpisode}
              className="flex items-center gap-1.5 rounded-md bg-black/60 border border-white/15 px-2.5 py-1.5 text-[11px] text-white hover:border-mg-green/60 hover:text-mg-green transition-colors"
              aria-label="Choose another season or episode"
            >
              <ListVideo className="w-3.5 h-3.5" />
              Episodes
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
