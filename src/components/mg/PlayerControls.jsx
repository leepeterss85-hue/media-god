import React, {
  useEffect,
  useRef,
  useState,import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Captions,
  Check,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";

import { cn } from "@/lib/utils";

const formatTime = (seconds) => {
  if (
    !seconds ||
    !Number.isFinite(seconds)
  ) {
    return "0:00";
  }

  const s =
    Math.floor(seconds % 60);

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

const normaliseLanguage = (
  value
) =>
  String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /_/g,
      "-"
    );

const friendlyLanguage = (
  value
) => {
  const language =
    normaliseLanguage(
      value
    );

  const names = {
    en: "English",
    eng: "English",
    "en-gb":
      "English (UK)",
    "en-us":
      "English (US)",

    es: "Spanish",
    spa: "Spanish",

    fr: "French",
    fra: "French",
    fre: "French",

    de: "German",
    deu: "German",
    ger: "German",

    it: "Italian",
    ita: "Italian",

    pt: "Portuguese",
    por: "Portuguese",

    nl: "Dutch",
    nld: "Dutch",
    dut: "Dutch",

    pl: "Polish",
    pol: "Polish",

    sv: "Swedish",
    swe: "Swedish",

    da: "Danish",
    dan: "Danish",

    no: "Norwegian",
    nor: "Norwegian",

    fi: "Finnish",
    fin: "Finnish",

    cs: "Czech",
    ces: "Czech",
    cze: "Czech",

    ro: "Romanian",
    ron: "Romanian",
    rum: "Romanian",

    hu: "Hungarian",
    hun: "Hungarian",

    tr: "Turkish",
    tur: "Turkish",

    ar: "Arabic",
    ara: "Arabic",

    he: "Hebrew",
    heb: "Hebrew",

    ja: "Japanese",
    jpn: "Japanese",

    ko: "Korean",
    kor: "Korean",

    zh: "Chinese",
    zho: "Chinese",
    chi: "Chinese",

    ru: "Russian",
    rus: "Russian",

    uk: "Ukrainian",
    ukr: "Ukrainian",
  };

  if (
    names[language]
  ) {
    return names[
      language
    ];
  }

  const base =
    language.split(
      "-"
    )[0];

  if (
    names[base]
  ) {
    return names[
      base
    ];
  }

  return (
    value ||
    "Subtitle"
  );
};

const getTextTracks = (
  video
) => {
  const list =
    video?.textTracks;

  if (
    !list ||
    typeof list.length !==
      "number"
  ) {
    return [];
  }

  const tracks =
    [];

  for (
    let index = 0;
    index <
    list.length;
    index += 1
  ) {
    const track =
      list[index];

    if (!track) {
      continue;
    }

    const language =
      track.language ||
      "";

    const rawLabel =
      String(
        track.label ||
          ""
      ).trim();

    const languageLabel =
      friendlyLanguage(
        language
      );

    let label =
      rawLabel ||
      languageLabel ||
      `Subtitle ${
        index + 1
      }`;

    if (
      rawLabel &&
      language &&
      rawLabel.toLowerCase() !==
        languageLabel.toLowerCase()
    ) {
      label =
        `${rawLabel} • ${languageLabel}`;
    }

    tracks.push({
      index,

      label,

      language,

      kind:
        track.kind ||
        "subtitles",

      showing:
        track.mode ===
        "showing",
    });
  }

  return tracks;
};

export default function PlayerControls({
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
    showControls,
    setShowControls,
  ] = useState(true);

  const [
    seeking,
    setSeeking,
  ] = useState(false);

  const [
    subtitleTracks,
    setSubtitleTracks,
  ] = useState([]);

  const [
    activeSubtitle,
    setActiveSubtitle,
  ] = useState(-1);

  const [
    subtitleMenuOpen,
    setSubtitleMenuOpen,
  ] = useState(false);

  const hideTimer =
    useRef(null);

  const refreshTimers =
    useRef([]);

  const getVideo =
    () =>
      videoRef?.current;

  const clearHideTimer =
    () => {
      if (
        hideTimer.current
      ) {
        clearTimeout(
          hideTimer.current
        );

        hideTimer.current =
          null;
      }
    };

  const revealControls =
    () => {
      setShowControls(
        true
      );

      clearHideTimer();

      if (
        subtitleMenuOpen
      ) {
        return;
      }

      hideTimer.current =
        setTimeout(
          () => {
            if (
              playing &&
              !seeking &&
              !subtitleMenuOpen
            ) {
              setShowControls(
                false
              );
            }
          },
          3000
        );
    };

  const syncSubtitles =
    () => {
      const video =
        getVideo();

      if (!video) {
        setSubtitleTracks(
          []
        );

        setActiveSubtitle(
          -1
        );

        return;
      }

      const tracks =
        getTextTracks(
          video
        );

      setSubtitleTracks(
        tracks
      );

      const showing =
        tracks.find(
          (
            track
          ) =>
            track.showing
        );

      setActiveSubtitle(
        showing
          ? showing.index
          : -1
      );
    };

  useEffect(() => {
    const video =
      getVideo();

    if (!video) {
      return undefined;
    }

    const onPlay =
      () => {
        setPlaying(
          true
        );
      };

    const onPause =
      () => {
        setPlaying(
          false
        );

        setShowControls(
          true
        );
      };

    const onTime =
      () => {
        if (
          !seeking
        ) {
          setCurrent(
            video.currentTime ||
              0
          );
        }
      };

    const onDuration =
      () => {
        setDuration(
          video.duration ||
            0
        );
      };

    const onVolumeChanged =
      () => {
        setMuted(
          Boolean(
            video.muted
          )
        );

        setVolume(
          Number(
            video.volume ??
              1
          )
        );
      };

    const onTracksChanged =
      () => {
        syncSubtitles();
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
      onDuration
    );

    video.addEventListener(
      "loadedmetadata",
      onDuration
    );

    video.addEventListener(
      "loadedmetadata",
      onTracksChanged
    );

    video.addEventListener(
      "loadeddata",
      onTracksChanged
    );

    video.addEventListener(
      "canplay",
      onTracksChanged
    );

    video.addEventListener(
      "volumechange",
      onVolumeChanged
    );

    const textTracks =
      video.textTracks;

    if (
      textTracks
        ?.addEventListener
    ) {
      textTracks.addEventListener(
        "addtrack",
        onTracksChanged
      );

      textTracks.addEventListener(
        "removetrack",
        onTracksChanged
      );

      textTracks.addEventListener(
        "change",
        onTracksChanged
      );
    }

    setPlaying(
      !video.paused
    );

    setMuted(
      Boolean(
        video.muted
      )
    );

    setVolume(
      Number(
        video.volume ??
          1
      )
    );

    setCurrent(
      video.currentTime ||
        0
    );

    setDuration(
      video.duration ||
        0
    );

    syncSubtitles();

    refreshTimers.current.forEach(
      (
        timer
      ) => {
        clearTimeout(
          timer
        );
      }
    );

    refreshTimers.current =
      [
        250,
        700,
        1500,
        3000,
        5000,
      ].map(
        (
          delay
        ) =>
          setTimeout(
            syncSubtitles,
            delay
          )
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
        onDuration
      );

      video.removeEventListener(
        "loadedmetadata",
        onDuration
      );

      video.removeEventListener(
        "loadedmetadata",
        onTracksChanged
      );

      video.removeEventListener(
        "loadeddata",
        onTracksChanged
      );

      video.removeEventListener(
        "canplay",
        onTracksChanged
      );

      video.removeEventListener(
        "volumechange",
        onVolumeChanged
      );

      if (
        textTracks
          ?.removeEventListener
      ) {
        textTracks.removeEventListener(
          "addtrack",
          onTracksChanged
        );

        textTracks.removeEventListener(
          "removetrack",
          onTracksChanged
        );

        textTracks.removeEventListener(
          "change",
          onTracksChanged
        );
      }

      refreshTimers.current.forEach(
        (
          timer
        ) => {
          clearTimeout(
            timer
          );
        }
      );

      refreshTimers.current =
        [];

      clearHideTimer();
    };
  }, [
    videoRef,
    seeking,
  ]);

  useEffect(() => {
    if (
      subtitleMenuOpen
    ) {
      clearHideTimer();

      setShowControls(
        true
      );
    } else {
      revealControls();
    }
  }, [
    subtitleMenuOpen,
  ]);

  const togglePlay =
    () => {
      const video =
        getVideo();

      if (!video) {
        return;
      }

      if (
        video.paused
      ) {
        if (
          video.dataset
            ?.mgAutoplayMuted ===
          "true"
        ) {
          video.muted =
            false;

          delete video
            .dataset
            .mgAutoplayMuted;
        }

        video
          .play()
          .catch(
            () => {}
          );
      } else {
        video.pause();
      }
    };

  const toggleMute =
    () => {
      const video =
        getVideo();

      if (!video) {
        return;
      }

      video.muted =
        !video.muted;
    };

  const onVolume =
    (
      event
    ) => {
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
        nextVolume ===
        0;
    };

  const seekTo =
    (
      event
    ) => {
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
        ) /
        100;

      video.currentTime =
        ratio *
        video.duration;

      setCurrent(
        video.currentTime
      );
    };

  const skip =
    (
      delta
    ) => {
      const video =
        getVideo();

      if (!video) {
        return;
      }

      const durationValue =
        Number(
          video.duration ||
            0
        );

      let next =
        Number(
          video.currentTime ||
            0
        ) +
        delta;

      next =
        Math.max(
          0,
          next
        );

      if (
        Number.isFinite(
          durationValue
        ) &&
        durationValue >
          0
      ) {
        next =
          Math.min(
            durationValue,
            next
          );
      }

      video.currentTime =
        next;
    };

  const selectSubtitle =
    (
      index
    ) => {
      const video =
        getVideo();

      const tracks =
        video?.textTracks;

      if (
        !tracks ||
        typeof tracks.length !==
          "number"
      ) {
        return;
      }

      for (
        let trackIndex =
          0;
        trackIndex <
        tracks.length;
        trackIndex += 1
      ) {
        try {
          tracks[
            trackIndex
          ].mode =
            trackIndex ===
            index
              ? "showing"
              : "disabled";
        } catch {
          // Track switching can be read-only in some WebViews.
        }
      }

      setActiveSubtitle(
        index
      );

      setSubtitleMenuOpen(
        false
      );

      setShowControls(
        true
      );

      const selected =
        subtitleTracks.find(
          (
            track
          ) =>
            track.index ===
            index
        );

      window.dispatchEvent(
        new CustomEvent(
          "mg:subtitle-track-selected",
          {
            detail: {
              index,

              language:
                selected?.language ||
                "",

              label:
                selected?.label ||
                "",
            },
          }
        )
      );
    };

  const toggleFullscreen =
    () => {
      /*
       * Media God deliberately uses CSS/viewport fullscreen.
       * Do not call requestFullscreen or orientation APIs here:
       * those previously caused reload/crash problems on Fire TV.
       */
      onFullscreen?.();
  };

  const progress =
    duration &&
    Number.isFinite(
      duration
    )
      ? Math.max(
          0,
          Math.min(
            100,
            (
              current /
              duration
            ) *
              100
          )
        )
      : 0;

  return (
    <div
      className={cn(
        "absolute inset-0 z-30 flex flex-col justify-end transition-opacity duration-200",

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
      onClick={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          revealControls();
        }
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

      <div className="relative z-10 px-3 sm:px-4 pb-3 pt-12 select-none">
        {!isLive && (
          <div className="flex items-center gap-2 mb-2">
            <span className="w-12 sm:w-14 text-right text-[10px] sm:text-xs text-white/80 tabular-nums">
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
              onPointerDown={() => {
                setSeeking(
                  true
                );

                setShowControls(
                  true
                );
              }}
              onPointerUp={() => {
                setSeeking(
                  false
                );

                revealControls();
              }}
              className="flex-1 h-1.5 accent-mg-green cursor-pointer"
              aria-label="Seek"
            />

            <span className="w-12 sm:w-14 text-[10px] sm:text-xs text-white/60 tabular-nums">
              {formatTime(
                duration
              )}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={
              togglePlay
            }
            className="min-w-10 min-h-10 flex items-center justify-center rounded-md text-white hover:text-mg-green hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green"
            aria-label={
              playing
                ? "Pause"
                : "Play"
            }
          >
            {playing ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current" />
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
                className="min-w-10 min-h-10 flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green"
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
                className="min-w-10 min-h-10 flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green"
                aria-label="Forward 10 seconds"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </>
          )}

          <div className="flex items-center group">
            <button
              type="button"
              onClick={
                toggleMute
              }
              className="min-w-10 min-h-10 flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green"
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
              className="hidden sm:block w-16 h-1 accent-mg-green cursor-pointer"
              aria-label="Volume"
            />
          </div>

          <div className="flex-1" />

          {subtitleTracks.length >
            0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setSubtitleMenuOpen(
                    (
                      open
                    ) =>
                      !open
                  )
                }
                className={cn(
                  "min-w-10 min-h-10 flex items-center justify-center rounded-md hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green",

                  activeSubtitle >=
                  0
                    ? "text-mg-green"
                    : "text-white/80 hover:text-white"
                )}
                aria-label="Subtitles"
                aria-expanded={
                  subtitleMenuOpen
                }
                title="Subtitles"
              >
                <Captions className="w-5 h-5" />
              </button>

              {subtitleMenuOpen && (
                <div
                  className="absolute bottom-12 right-0 w-56 max-h-72 overflow-y-auto rounded-lg border border-white/15 bg-black/95 shadow-2xl p-1.5 z-[120]"
                  onClick={(
      
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

export default function PlayerControls({
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

    if (hideTimer.current) clearTimeout(hideTimer.current);

    hideTimer.current = setTimeout(() => {
      if (playing && !seeking) setShowControls(false);
    }, 2800);
  };

  useEffect(() => {
    const video = getVideo();

    if (!video) return;

    const onPlay = () => setPlaying(true);

    const onPause = () => setPlaying(false);

    const onTime = () => {
      if (!seeking) setCurrent(video.currentTime || 0);
    };

    const onDur = () => setDuration(video.duration || 0);

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

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("loadedmetadata", onDur);
      video.removeEventListener("volumechange", onVol);

      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [videoRef, seeking]);

  useEffect(() => {
    const onFs = () =>
      setFullscreen(!!document.fullscreenElement);

    document.addEventListener("fullscreenchange", onFs);

    return () =>
      document.removeEventListener("fullscreenchange", onFs);
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

  const onVolume = (e) => {
    const video = getVideo();

    if (!video) return;

    const v = Number(e.target.value);

    video.volume = v;
    video.muted = v === 0;
  };

  const seekTo = (e) => {
    const video = getVideo();

    if (!video || !video.duration) return;

    const ratio = Number(e.target.value) / 100;

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
    } else {
      stageRef?.current?.requestFullscreen?.().catch(() => {});
    }
  };

  const progress =
    duration
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
      onMouseLeave={() => {
        if (hideTimer.current) {
          clearTimeout(hideTimer.current);
        }

        if (playing && !seeking) {
          setShowControls(false);
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
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
                onClick={() => skip(-10)}
                className="text-white/80 hover:text-white transition-colors"
                aria-label="Back 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
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
