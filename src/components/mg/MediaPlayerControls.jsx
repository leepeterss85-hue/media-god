import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
} from "lucide-react";

import { cn } from "@/lib/utils";

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return "0:00";

  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
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

  const hideTimer = useRef(null);
  const barRef = useRef(null);

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

    if (!video) return;

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

  const togglePlay = () => {
    const video = getVideo();

    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = getVideo();

    if (!video) return;

    video.muted = !video.muted;
  };

  const onVolume = (event) => {
    const video = getVideo();

    if (!video) return;

    const nextVolume = Number(event.target.value);

    video.volume = nextVolume;
    video.muted = nextVolume === 0;
  };

  const seekTo = (event) => {
    const video = getVideo();

    if (!video || !video.duration) return;

    const ratio = Number(event.target.value) / 100;

    video.currentTime = ratio * video.duration;
    setCurrent(video.currentTime);
  };

  const skip = (delta) => {
    const video = getVideo();

    if (!video) return;

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

  const progress = duration
    ? (current / duration) * 100
    : 0;

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
        {!isLive && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-white/80 tabular-nums w-12 text-right">
              {formatTime(current)}
            </span>

            <input
              ref={barRef}
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
