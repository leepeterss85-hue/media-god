import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Captions,
  Check,
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

const normaliseLanguage = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

const friendlyLanguage = (value) => {
  const language = normaliseLanguage(value);

  const names = {
    en: "English",
    eng: "English",
    "en-gb": "English (UK)",
    "en-us": "English (US)",
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

  if (names[language]) {
    return names[language];
  }

  const base = language.split("-")[0];

  if (names[base]) {
    return names[base];
  }

  return value || "Subtitle";
};

const getTextTracks = (video) => {
  const list = video?.textTracks;

  if (!list || typeof list.length !== "number") {
    return [];
  }

  const tracks = [];

  for (let index = 0; index < list.length; index += 1) {
    const track = list[index];

    if (!track) continue;

    const language = track.language || "";
    const rawLabel = String(track.label || "").trim();
    const languageLabel = friendlyLanguage(language);

    let label =
      rawLabel ||
      languageLabel ||
      `Subtitle ${index + 1}`;

    if (
      rawLabel &&
      language &&
      !rawLabel
        .toLowerCase()
        .includes(
          String(language).toLowerCase()
        ) &&
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

  const barRef =
    useRef(null);

  const subtitleRefreshTimers =
    useRef([]);

  const getVideo = () =>
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
          2800
        );
    };

  const syncSubtitleTracks =
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

      const showing =
        tracks.find(
          (
            track
          ) =>
            track.showing
        );

      setSubtitleTracks(
        tracks
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
      return;
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

    const onTracksChanged =
      () => {
        syncSubtitleTracks();
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
      "loadedmetadata",
      onTracksChanged
    );

    video.addEventListener(
      "loadeddata",
      onTracksChanged
    );

    video.addEventListener(
      "volumechange",
      onVol
    );

    const textTracks =
      video.textTracks;

    if (
      textTracks?.addEventListener
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

    syncSubtitleTracks();

    subtitleRefreshTimers.current.forEach(
      (
        timer
      ) =>
        clearTimeout(
          timer
        )
    );

    subtitleRefreshTimers.current =
      [
        250,
        800,
        1600,
        3000,
      ].map(
        (
          delay
        ) =>
          setTimeout(
            syncSubtitleTracks,
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
        onDur
      );

      video.removeEventListener(
        "loadedmetadata",
        onDur
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
        "volumechange",
        onVol
      );

      if (
        textTracks?.removeEventListener
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

      subtitleRefreshTimers.current.forEach(
        (
          timer
        ) =>
          clearTimeout(
            timer
          )
      );

      subtitleRefreshTimers.current =
        [];

      clearHideTimer();
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
      subtitleMenuOpen
    ) {
      setShowControls(
        true
      );

      clearHideTimer();
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

      if (!video) return;

      if (
        video.paused
      ) {
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

      if (!video) return;

      video.muted =
        !video.muted;
    };

  const onVolume =
    (
      event
    ) => {
      const video =
        getVideo();

      if (!video) return;

      const nextVolume =
        Number(
          event.target
            .value
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
          event.target
            .value
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

      if (!video) return;

      video.currentTime =
        Math.max(
          0,
          Math.min(
            video.duration ||
              0,
            (
              video.currentTime ||
              0
            ) +
              delta
          )
        );
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
          // Some WebViews expose track mode as read-only.
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

      window.dispatchEvent(
        new CustomEvent(
          "mg:subtitle-track-selected",
          {
            detail: {
              index,

              language:
                index >=
                0
                  ? subtitleTracks.find(
                      (
                        track
                      ) =>
                        track.index ===
                        index
                    )
                      ?.language ||
                    ""
                  : "",
            },
          }
        )
      );
    };

  const toggleFullscreen =
    () => {
      if (
        onFullscreen
      ) {
        onFullscreen();

        return;
      }

      stageRef?.current
        ?.requestFullscreen?.()
        .catch(
          () => {}
        );
    };

  const progress =
    duration
      ? (
          current /
          duration
        ) *
        100
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
        clearHideTimer();

        if (
          playing &&
          !seeking &&
          !subtitleMenuOpen
        ) {
          setShowControls(
            false
          );
        }
      }}
      onClick={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          togglePlay();
        }
      }}
    >
      <div className="bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-2 pt-8 select-none">
        {!isLive && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-white/80 tabular-nums w-12 text-right">
              {formatTime(
                current
              )}
            </span>

            <input
              ref={
                barRef
              }
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
              className="w-0 group-hover:w-16 transition-all h-1 accent-mg-green cursor-pointer"
              aria-label="Volume"
            />
          </div>

          <div className="flex-1" />

          {subtitleTracks.length >
            0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setSubtitleMenuOpen(
                    (
                      open
                    ) =>
                      !open
                  );

                  setShowControls(
                    true
                  );
                }}
                className={cn(
                  "transition-colors rounded p-1",

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
                  className="absolute bottom-9 right-0 w-56 max-h-72 overflow-y-auto rounded-lg border border-white/15 bg-black/95 shadow-2xl p-1.5 z-[120]"
                  onClick={(
                    event
                  ) =>
                    event.stopPropagation()
                  }
                >
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Subtitles
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      selectSubtitle(
                        -1
                      )
                    }
                    className={cn(
                      "w-full min-h-10 rounded-md px-2.5 py-2 text-left text-xs flex items-center justify-between gap-3 hover:bg-white/10",

                      activeSubtitle ===
                        -1
                        ? "text-mg-green bg-white/5"
                        : "text-white/80"
                    )}
                    aria-label="Subtitles off"
                  >
                    <span>
                      Off
                    </span>

                    {activeSubtitle ===
                      -1 && (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </button>

                  {subtitleTracks.map(
                    (
                      track
                    ) => (
                      <button
                        key={`${track.index}-${track.language}-${track.label}`}
                        type="button"
                        onClick={() =>
                          selectSubtitle(
                            track.index
                          )
                        }
                        className={cn(
                          "w-full min-h-10 rounded-md px-2.5 py-2 text-left text-xs flex items-center justify-between gap-3 hover:bg-white/10",

                          activeSubtitle ===
                            track.index
                            ? "text-mg-green bg-white/5"
                            : "text-white/80"
                        )}
                        aria-label={`Subtitle ${track.label}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {
                              track.label
                            }
                          </span>

                          {track.kind ===
                            "captions" && (
                            <span className="block text-[9px] text-white/35 mt-0.5">
                              Closed captions
                            </span>
                          )}
                        </span>

                        {activeSubtitle ===
                          track.index && (
                          <Check className="w-3.5 h-3.5 shrink-0" />
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}

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
