import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Tv,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  friendlyTrackLabel,
  readTrackPreferences,
  subtitleCueStyle,
  trackLanguage,
  trackLooksForced,
  writeTrackPreferences,
} from "@/components/mg/mediaTrackPreferences";

const formatTime = (seconds) => {
  if (!seconds || !Number.isFinite(Number(seconds))) {
    return "0:00";
  }

  const total = Math.max(0, Math.floor(Number(seconds)));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(
      2,
      "0"
    )}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
};

const sourceLabel = (item, index) => {
  const label =
    item?.label ||
    item?.name ||
    item?.title ||
    `Source ${index + 1}`;

  return String(label)
    .replace(/\s+/g, " ")
    .trim();
};

const normaliseExternalSubtitle = (item, index) => {
  if (!item) return null;

  if (typeof item === "string") {
    return {
      src: item,
      lang: "en",
      label: `Subtitle ${index + 1}`,
    };
  }

  const src =
    item.url ||
    item.src ||
    item.file ||
    item.link ||
    "";

  if (!src) return null;

  const lang =
    item.lang ||
    item.language ||
    item.srclang ||
    "en";

  const label =
    item.label ||
    item.name ||
    item.language ||
    item.lang ||
    `Subtitle ${index + 1}`;

  return {
    src,
    lang: String(lang || "en"),
    label: String(label),
  };
};

export default function MediaPlayerControls({
  videoRef,
  stageRef,
  isLive = false,
  onFullscreen,
  isAppFullscreen = false,
  onBack,
  title = "",
  sources = [],
  activeIdx = 0,
  failedSources,
  onSelectSource,
  onNoSound,
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [seeking, setSeeking] = useState(false);
  const [openMenu, setOpenMenu] = useState("");
  const [playbackRate, setPlaybackRate] = useState(1);

  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);

  const [audioTracks, setAudioTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [trackPreferences, setTrackPreferences] = useState(
    () => readTrackPreferences()
  );

  const hideTimerRef = useRef(null);
  const trackPreferencesRef = useRef(trackPreferences);
  trackPreferencesRef.current = trackPreferences;

  const playingRef = useRef(false);
  const seekingRef = useRef(false);
  const menuOpenRef = useRef(false);
  const mountedRef = useRef(true);

  const getVideo = () => {
    return videoRef?.current || null;
  };

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(
        hideTimerRef.current
      );

      hideTimerRef.current = null;
    }
  };

  const scheduleHide = (delay = 3000) => {
    clearHideTimer();

    if (
      !playingRef.current ||
      seekingRef.current ||
      menuOpenRef.current
    ) {
      return;
    }

    hideTimerRef.current =
      window.setTimeout(() => {
        if (
          mountedRef.current &&
          playingRef.current &&
          !seekingRef.current &&
          !menuOpenRef.current
        ) {
          setShowControls(false);
        }
      }, delay);
  };

  const revealControls = (delay = 3000) => {
    setShowControls(true);
    scheduleHide(delay);
  };

  const refreshTrackLists = () => {
    const video = getVideo();

    if (!video) {
      setSubtitleTracks([]);
      setSelectedSubtitle(-1);

      setAudioTracks([]);
      setSelectedAudio(-1);

      return;
    }

    const nextSubtitles = [];
    let activeSubtitle = -1;

    if (video.textTracks) {
      for (
        let index = 0;
        index < video.textTracks.length;
        index += 1
      ) {
        const track =
          video.textTracks[index];

        nextSubtitles.push({
          index,
          label: friendlyTrackLabel(track, "Subtitle", index),
          language: track?.language || "",
          forced: trackLooksForced(track),
        });

        if (
          track?.mode === "showing"
        ) {
          activeSubtitle = index;
        }
      }
    }

    const nextAudio = [];
    let activeAudio = -1;

    const nativeAudioTracks =
      video.audioTracks;

    if (
      nativeAudioTracks &&
      typeof nativeAudioTracks.length ===
        "number"
    ) {
      for (
        let index = 0;
        index < nativeAudioTracks.length;
        index += 1
      ) {
        const track =
          nativeAudioTracks[index];

        nextAudio.push({
          index,
          label: friendlyTrackLabel(track, "Audio", index),
          language: track?.language || "",
        });

        if (track?.enabled) {
          activeAudio = index;
        }
      }
    }

    const preferences = trackPreferencesRef.current;

    if (
      activeSubtitle < 0 &&
      preferences.subtitlesEnabled &&
      nextSubtitles.length > 0
    ) {
      const preferredLanguage = preferences.subtitleLanguage;
      const forcedMatch = preferences.preferForcedSubtitles
        ? nextSubtitles.find(
            (item) =>
              item.forced &&
              (!preferredLanguage || trackLanguage(item) === preferredLanguage)
          )
        : null;
      const languageMatch = nextSubtitles.find(
        (item) =>
          !preferredLanguage || trackLanguage(item) === preferredLanguage
      );
      const preferred = forcedMatch || languageMatch || nextSubtitles[0];

      if (preferred) {
        try {
          video.textTracks[preferred.index].mode = "showing";
          activeSubtitle = preferred.index;
        } catch {
          // Some WebViews expose read-only text track state.
        }
      }
    }

    if (activeAudio < 0 && nextAudio.length > 0) {
      const preferredLanguage = preferences.audioLanguage;
      const preferred =
        nextAudio.find(
          (item) =>
            !preferredLanguage || trackLanguage(item) === preferredLanguage
        ) || nextAudio[0];

      if (preferred) {
        try {
          for (let index = 0; index < nativeAudioTracks.length; index += 1) {
            nativeAudioTracks[index].enabled = index === preferred.index;
          }
          activeAudio = preferred.index;
        } catch {
          // Some Android WebViews expose read-only audio track state.
        }
      }
    }

    setSubtitleTracks(nextSubtitles);
    setSelectedSubtitle(activeSubtitle);
    setAudioTracks(nextAudio);
    setSelectedAudio(activeAudio);

    setPlaybackRate(
      video.playbackRate || 1
    );
  };

  useEffect(() => {
    mountedRef.current = true;

    const onPreferencesChanged = (event) => {
      const next = event?.detail || readTrackPreferences();
      trackPreferencesRef.current = next;
      setTrackPreferences(next);
      window.setTimeout(refreshTrackLists, 30);
    };

    window.addEventListener(
      "mg:media-track-preferences-changed",
      onPreferencesChanged
    );

    return () => {
      mountedRef.current = false;
      clearHideTimer();
      window.removeEventListener(
        "mg:media-track-preferences-changed",
        onPreferencesChanged
      );
    };
  }, []);

  /*
   * Add subtitles supplied by an add-on
   * to the actual HTML video element.
   */
  useEffect(() => {
    const video = getVideo();

    const activeSource =
      sources?.[activeIdx];

    if (!video) {
      return undefined;
    }

    const existing =
      Array.from(
        video.querySelectorAll(
          "track[data-mg-external-subtitle='true']"
        )
      );

    existing.forEach((track) => {
      track.remove();
    });

    const raw =
      Array.isArray(
        activeSource?.subtitles
      )
        ? activeSource.subtitles
        : [];

    const externalTracks =
      raw
        .map(
          normaliseExternalSubtitle
        )
        .filter(Boolean);

    const created =
      externalTracks.map(
        (track) => {
          const element =
            document.createElement(
              "track"
            );

          element.kind =
            "subtitles";

          element.src =
            track.src;

          element.srclang =
            track.lang;

          element.label =
            track.label;

          element.default =
            false;

          element.dataset.mgExternalSubtitle =
            "true";

          video.appendChild(
            element
          );

          return element;
        }
      );

    const timer =
      window.setTimeout(
        () => {
          refreshTrackLists();
        },
        250
      );

    return () => {
      window.clearTimeout(timer);

      created.forEach(
        (track) => {
          try {
            track.remove();
          } catch {
            // Ignore cleanup errors.
          }
        }
      );
    };
  }, [
    videoRef,
    sources,
    activeIdx,
  ]);

  /*
   * Keep controls synced with the
   * real video element.
   */
  useEffect(() => {
    const video = getVideo();

    if (!video) {
      return undefined;
    }

    const onPlay = () => {
      playingRef.current = true;

      setPlaying(true);
      setShowControls(true);

      scheduleHide(2200);
    };

    const onPlaying = () => {
      playingRef.current = true;

      setPlaying(true);

      scheduleHide(2200);
    };

    const onPause = () => {
      playingRef.current = false;

      setPlaying(false);

      clearHideTimer();

      setShowControls(true);
    };

    const onEnded = () => {
      playingRef.current = false;

      setPlaying(false);

      clearHideTimer();

      setShowControls(true);
    };

    const onWaiting = () => {
      setShowControls(true);
    };

    const onTime = () => {
      if (
        !seekingRef.current
      ) {
        setCurrent(
          video.currentTime || 0
        );
      }
    };

    const onDuration = () => {
      setDuration(
        video.duration || 0
      );

      refreshTrackLists();
    };

    const onVolumeChange = () => {
      setMuted(
        Boolean(video.muted)
      );

      setVolume(
        Number.isFinite(
          video.volume
        )
          ? video.volume
          : 1
      );
    };

    const onRateChange = () => {
      setPlaybackRate(
        video.playbackRate || 1
      );
    };

    video.addEventListener(
      "play",
      onPlay
    );

    video.addEventListener(
      "playing",
      onPlaying
    );

    video.addEventListener(
      "pause",
      onPause
    );

    video.addEventListener(
      "ended",
      onEnded
    );

    video.addEventListener(
      "waiting",
      onWaiting
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
      "loadeddata",
      refreshTrackLists
    );

    video.addEventListener(
      "volumechange",
      onVolumeChange
    );

    video.addEventListener(
      "ratechange",
      onRateChange
    );

    playingRef.current =
      !video.paused &&
      !video.ended;

    setPlaying(
      playingRef.current
    );

    setMuted(
      Boolean(video.muted)
    );

    setVolume(
      Number.isFinite(
        video.volume
      )
        ? video.volume
        : 1
    );

    setCurrent(
      video.currentTime || 0
    );

    setDuration(
      video.duration || 0
    );

    setPlaybackRate(
      video.playbackRate || 1
    );

    refreshTrackLists();

    if (
      playingRef.current
    ) {
      scheduleHide(2600);
    } else {
      setShowControls(true);
    }

    return () => {
      video.removeEventListener(
        "play",
        onPlay
      );

      video.removeEventListener(
        "playing",
        onPlaying
      );

      video.removeEventListener(
        "pause",
        onPause
      );

      video.removeEventListener(
        "ended",
        onEnded
      );

      video.removeEventListener(
        "waiting",
        onWaiting
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
        "loadeddata",
        refreshTrackLists
      );

      video.removeEventListener(
        "volumechange",
        onVolumeChange
      );

      video.removeEventListener(
        "ratechange",
        onRateChange
      );

      clearHideTimer();
    };
  }, [
    videoRef,
  ]);

  /*
   * Backup wake-up listeners.
   *
   * These remain on the video stage for
   * desktop mouse, TV remote and browsers
   * where pointer events work normally.
   */
  useEffect(() => {
    const stage =
      stageRef?.current;

    if (!stage) {
      return undefined;
    }

    const wake = () => {
      revealControls();
    };

    const wakeLonger = () => {
      revealControls(4200);
    };

    stage.addEventListener(
      "pointerdown",
      wakeLonger,
      true
    );

    stage.addEventListener(
      "pointermove",
      wake,
      true
    );

    stage.addEventListener(
      "touchstart",
      wakeLonger,
      {
        passive: true,
        capture: true,
      }
    );

    stage.addEventListener(
      "mousemove",
      wake,
      true
    );

    stage.addEventListener(
      "wheel",
      wake,
      {
        passive: true,
        capture: true,
      }
    );

    window.addEventListener(
      "keydown",
      wakeLonger,
      true
    );

    return () => {
      stage.removeEventListener(
        "pointerdown",
        wakeLonger,
        true
      );

      stage.removeEventListener(
        "pointermove",
        wake,
        true
      );

      stage.removeEventListener(
        "touchstart",
        wakeLonger,
        true
      );

      stage.removeEventListener(
        "mousemove",
        wake,
        true
      );

      stage.removeEventListener(
        "wheel",
        wake,
        true
      );

      window.removeEventListener(
        "keydown",
        wakeLonger,
        true
      );
    };
  }, [
    stageRef,
  ]);

  /*
   * Show controls briefly when fullscreen
   * mode changes.
   */
  useEffect(() => {
    setShowControls(true);

    if (
      playingRef.current
    ) {
      scheduleHide(
        isAppFullscreen
          ? 3000
          : 3600
      );
    }
  }, [
    isAppFullscreen,
  ]);

  const togglePlay = () => {
    const video = getVideo();

    if (!video) return;

    revealControls();

    if (
      video.paused ||
      video.ended
    ) {
      if (
        video.dataset
          ?.mgAutoplayMuted ===
        "true"
      ) {
        video.muted = false;

        delete video.dataset
          .mgAutoplayMuted;
      }

      video
        .play()
        .catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = getVideo();

    if (!video) return;

    video.muted =
      !video.muted;

    revealControls();
  };

  const onVolume = (event) => {
    const video = getVideo();

    if (!video) return;

    const nextVolume =
      Number(
        event.target.value
      );

    video.volume =
      nextVolume;

    video.muted =
      nextVolume === 0;

    revealControls();
  };

  const seekTo = (event) => {
    const video = getVideo();

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

    revealControls(4200);
  };

  const startSeeking = () => {
    seekingRef.current = true;

    setSeeking(true);

    clearHideTimer();

    setShowControls(true);
  };

  const finishSeeking = () => {
    seekingRef.current = false;

    setSeeking(false);

    revealControls();
  };

  const skip = (delta) => {
    const video = getVideo();

    if (!video) return;

    const next =
      Math.max(
        0,
        Math.min(
          video.duration ||
            Number.MAX_SAFE_INTEGER,

          (video.currentTime || 0) +
            delta
        )
      );

    video.currentTime =
      next;

    setCurrent(next);

    revealControls();
  };

  const changeRate = (event) => {
    const video = getVideo();

    if (!video) return;

    const rate =
      Number(
        event.target.value
      ) || 1;

    video.playbackRate =
      rate;

    setPlaybackRate(rate);

    revealControls();
  };

  const toggleFullscreen = () => {
    revealControls(4200);

    /*
     * IMPORTANT:
     * Do not call requestFullscreen here.
     * VideoPlayer supplies the safe
     * in-app fullscreen function.
     */
    if (
      typeof onFullscreen ===
      "function"
    ) {
      onFullscreen();
    }
  };

  const chooseSubtitle = (index) => {
    const video = getVideo();

    if (
      !video?.textTracks
    ) {
      return;
    }

    for (
      let trackIndex = 0;
      trackIndex <
      video.textTracks.length;
      trackIndex += 1
    ) {
      try {
        video.textTracks[
          trackIndex
        ].mode =
          trackIndex === index
            ? "showing"
            : "disabled";
      } catch {
        // Some WebViews expose read-only tracks.
      }
    }

    setSelectedSubtitle(index);

    const chosenTrack =
      index >= 0 ? video.textTracks[index] : null;
    const nextPreferences = writeTrackPreferences({
      ...trackPreferencesRef.current,
      subtitlesEnabled: index >= 0,
      ...(chosenTrack
        ? { subtitleLanguage: trackLanguage(chosenTrack) || "en" }
        : {}),
    });
    trackPreferencesRef.current = nextPreferences;
    setTrackPreferences(nextPreferences);

    setOpenMenu("");

    menuOpenRef.current =
      false;

    revealControls();
  };

  const chooseAudio = (index) => {
    const video = getVideo();

    const tracks =
      video?.audioTracks;

    if (
      !tracks ||
      typeof tracks.length !==
        "number"
    ) {
      return;
    }

    for (
      let trackIndex = 0;
      trackIndex <
      tracks.length;
      trackIndex += 1
    ) {
      try {
        tracks[
          trackIndex
        ].enabled =
          trackIndex === index;
      } catch {
        // Some Android WebViews expose audio tracks as read-only.
      }
    }

    setSelectedAudio(index);

    const chosenTrack = tracks[index];
    const nextPreferences = writeTrackPreferences({
      ...trackPreferencesRef.current,
      audioLanguage:
        trackLanguage(chosenTrack) ||
        trackPreferencesRef.current.audioLanguage ||
        "en",
    });
    trackPreferencesRef.current = nextPreferences;
    setTrackPreferences(nextPreferences);

    setOpenMenu("");

    menuOpenRef.current =
      false;

    revealControls();
  };

  const toggleMenu = (name) => {
    setOpenMenu(
      (currentMenu) => {
        const nextMenu =
          currentMenu === name
            ? ""
            : name;

        menuOpenRef.current =
          Boolean(nextMenu);

        if (nextMenu) {
          clearHideTimer();
          setShowControls(true);
        } else {
          scheduleHide();
        }

        return nextMenu;
      }
    );
  };

  const focusControl = () => {
    clearHideTimer();

    setShowControls(true);
  };

  const blurControl = () => {
    if (
      !menuOpenRef.current
    ) {
      scheduleHide();
    }
  };

  const sourceFailed = (index) => {
    if (!failedSources) {
      return false;
    }

    if (
      typeof failedSources.has ===
      "function"
    ) {
      return failedSources.has(
        index
      );
    }

    if (
      Array.isArray(
        failedSources
      )
    ) {
      return failedSources.includes(
        index
      );
    }

    return false;
  };

  const progress =
    duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (current / duration) *
              100
          )
        )
      : 0;

  const controlsVisible =
    showControls ||
    !playing ||
    seeking ||
    Boolean(openMenu);

  const cueStyle = subtitleCueStyle(trackPreferences);

  return (
    <div
      data-mg-player-controls="true"
      className="absolute inset-0 z-[60] pointer-events-none"
    >
      {/*
       * MOBILE WAKE LAYER
       *
       * This is the important phone/tablet fix.
       *
       * When controls disappear this transparent
       * button remains over the WHOLE video.
       *
       * Android WebView therefore does not need
       * to pass the touch through the <video>.
       *
       * One tap wakes the controls.
       */}
      {!controlsVisible && (
        <button
          type="button"
          className="absolute inset-0 z-[61] h-full w-full border-0 bg-transparent p-0 pointer-events-auto touch-manipulation"
          aria-label="Show playback controls"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();

            revealControls(
              4200
            );
          }}
          onTouchStart={(event) => {
            event.stopPropagation();

            revealControls(
              4200
            );
          }}
          onTouchEnd={(event) => {
            event.preventDefault();
            event.stopPropagation();

            revealControls(
              4200
            );
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();

            revealControls(
              4200
            );
          }}
        />
      )}

      <div
        className={cn(
          "absolute inset-0 z-[62] flex flex-col justify-between transition-opacity duration-200 pointer-events-none",

          controlsVisible
            ? "opacity-100"
            : "opacity-0"
        )}
      >
        {isAppFullscreen ? (
          <div data-mg-player-control-topbar="true" className="pointer-events-auto flex items-center gap-2 bg-gradient-to-b from-black/90 via-black/55 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
            <button
              type="button"
              onClick={() => {
                onBack?.();
              }}
              onFocus={
                focusControl
              }
              onBlur={
                blurControl
              }
              className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-mg-green/60 sm:text-sm"
              aria-label="Back to main menu"
              title="Back to main menu"
            >
              <ArrowLeft className="h-4 w-4" />

              <span className="hidden sm:inline">
                Back
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white sm:text-base">
                {title ||
                  "Now playing"}
              </p>
            </div>

            {sources.length > 1 ? (
              <div className="relative min-w-[7.5rem] max-w-[42vw] sm:min-w-[13rem] sm:max-w-sm">
                <select
                  value={
                    activeIdx
                  }
                  onChange={(event) => {
                    onSelectSource?.(
                      event.target
                        .value
                    );
                  }}
                  onFocus={
                    focusControl
                  }
                  onBlur={
                    blurControl
                  }
                  className="w-full appearance-none rounded-lg border border-white/15 bg-black/55 py-2.5 pl-3 pr-8 text-xs text-white outline-none backdrop-blur focus:border-mg-green sm:text-sm"
                  aria-label="Choose source or quality"
                  title="Choose source or quality"
                >
                  {sources.map(
                    (
                      item,
                      index
                    ) => (
                      <option
                        key={`${index}-${sourceLabel(
                          item,
                          index
                        )}`}
                        value={
                          index
                        }
                      >
                        {sourceFailed(
                          index
                        )
                          ? "Failed — "
                          : ""}

                        {sourceLabel(
                          item,
                          index
                        )}
                      </option>
                    )
                  )}
                </select>

                <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-white/60">
                  <Tv className="h-4 w-4" />
                </div>
              </div>
            ) : null}

            {typeof onNoSound ===
            "function" ? (
              <button
                type="button"
                onClick={
                  onNoSound
                }
                onFocus={
                  focusControl
                }
                onBlur={
                  blurControl
                }
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-black/45 px-2.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-mg-green/60"
                aria-label="No sound"
                title="No sound"
              >
                <VolumeX className="h-4 w-4" />

                <span className="hidden md:inline">
                  No sound?
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={
                toggleFullscreen
              }
              onFocus={
                focusControl
              }
              onBlur={
                blurControl
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-mg-green/60"
              aria-label="Exit fullscreen"
              title="Exit fullscreen"
            >
              <Minimize className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div />
        )}

        <div data-mg-player-controls-bottom="true" className="pointer-events-auto relative bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-12 select-none sm:px-5 sm:pt-16">
          {!isLive ? (
            <div className="mb-2 flex items-center gap-2 sm:mb-3">
              <span className="w-11 shrink-0 text-right text-[10px] tabular-nums text-white/85 sm:w-14 sm:text-xs">
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
                onPointerDown={
                  startSeeking
                }
                onPointerUp={
                  finishSeeking
                }
                onTouchStart={
                  startSeeking
                }
                onTouchEnd={
                  finishSeeking
                }
                onFocus={
                  focusControl
                }
                onBlur={
                  blurControl
                }
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-mg-green sm:h-2"
                aria-label="Seek through video"
              />

              <span className="w-11 shrink-0 text-[10px] tabular-nums text-white/65 sm:w-14 sm:text-xs">
                {formatTime(
                  duration
                )}
              </span>
            </div>
          ) : null}

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={
                togglePlay
              }
              onFocus={
                focusControl
              }
              onBlur={
                blurControl
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-mg-green sm:h-11 sm:w-11"
              aria-label={
                playing
                  ? "Pause"
                  : "Play"
              }
              title={
                playing
                  ? "Pause"
                  : "Play"
              }
            >
              {playing ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              )}
            </button>

            {!isLive ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    skip(-10);
                  }}
                  onFocus={
                    focusControl
                  }
                  onBlur={
                    blurControl
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40 text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green/60 sm:h-10 sm:w-10"
                  aria-label="Back 10 seconds"
                  title="Back 10 seconds"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    skip(10);
                  }}
                  onFocus={
                    focusControl
                  }
                  onBlur={
                    blurControl
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40 text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green/60 sm:h-10 sm:w-10"
                  aria-label="Forward 10 seconds"
                  title="Forward 10 seconds"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </>
            ) : null}

            <div className="group flex items-center gap-1.5">
              <button
                type="button"
                onClick={
                  toggleMute
                }
                onFocus={
                  focusControl
                }
                onBlur={
                  blurControl
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40 text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green/60 sm:h-10 sm:w-10"
                aria-label={
                  muted
                    ? "Unmute"
                    : "Mute"
                }
                title={
                  muted
                    ? "Unmute"
                    : "Mute"
                }
              >
                {muted ||
                volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
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
                onFocus={
                  focusControl
                }
                onBlur={
                  blurControl
                }
                className="hidden h-1 w-16 cursor-pointer accent-mg-green sm:block lg:w-20"
                aria-label="Volume"
              />
            </div>

            <div className="min-w-0 flex-1" />

            {!isLive ? (
              <select
                value={
                  playbackRate
                }
                onChange={
                  changeRate
                }
                onFocus={
                  focusControl
                }
                onBlur={
                  blurControl
                }
                className="h-9 rounded-lg border border-white/15 bg-black/45 px-2 text-xs font-semibold text-white outline-none focus:border-mg-green sm:h-10"
                aria-label="Playback speed"
                title="Playback speed"
              >
                <option value={0.5}>
                  0.5x
                </option>

                <option value={0.75}>
                  0.75x
                </option>

                <option value={1}>
                  1x
                </option>

                <option value={1.25}>
                  1.25x
                </option>

                <option value={1.5}>
                  1.5x
                </option>

                <option value={2}>
                  2x
                </option>
              </select>
            ) : null}

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  toggleMenu(
                    "subtitles"
                  );
                }}
                onFocus={
                  focusControl
                }
                className={cn(
                  "h-9 rounded-lg border px-2.5 text-xs font-semibold outline-none sm:h-10",

                  selectedSubtitle >=
                    0
                    ? "border-mg-green/60 bg-mg-green/15 text-mg-green"
                    : "border-white/15 bg-black/45 text-white"
                )}
                aria-label="Subtitles"
                title="Subtitles"
              >
                CC
              </button>

              {openMenu ===
              "subtitles" ? (
                <div className="absolute bottom-12 right-0 z-[80] max-h-64 w-52 overflow-y-auto rounded-xl border border-white/15 bg-black/95 p-1.5 shadow-2xl backdrop-blur sm:w-60">
                  <button
                    type="button"
                    onClick={() => {
                      chooseSubtitle(
                        -1
                      );
                    }}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/10",

                      selectedSubtitle <
                        0
                        ? "text-mg-green"
                        : "text-white"
                    )}
                  >
                    Off
                  </button>

                  {subtitleTracks.length >
                  0 ? (
                    subtitleTracks.map(
                      (track) => (
                        <button
                          type="button"
                          key={`subtitle-${track.index}`}
                          onClick={() => {
                            chooseSubtitle(
                              track.index
                            );
                          }}
                          className={cn(
                            "w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/10",

                            selectedSubtitle ===
                              track.index
                              ? "text-mg-green"
                              : "text-white"
                          )}
                        >
                          {
                            track.label
                          }

                          {track.language
                            ? ` · ${track.language}`
                            : ""}
                        </button>
                      )
                    )
                  ) : (
                    <p className="px-3 py-2 text-xs leading-relaxed text-white/45">
                      No subtitle tracks are available from this source.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  toggleMenu(
                    "audio"
                  );
                }}
                onFocus={
                  focusControl
                }
                className="h-9 rounded-lg border border-white/15 bg-black/45 px-2.5 text-xs font-semibold text-white outline-none focus:border-mg-green sm:h-10"
                aria-label="Audio track"
                title="Audio track"
              >
                Audio
              </button>

              {openMenu ===
              "audio" ? (
                <div className="absolute bottom-12 right-0 z-[80] max-h-64 w-52 overflow-y-auto rounded-xl border border-white/15 bg-black/95 p-1.5 shadow-2xl backdrop-blur sm:w-60">
                  {audioTracks.length >
                  0 ? (
                    audioTracks.map(
                      (track) => (
                        <button
                          type="button"
                          key={`audio-${track.index}`}
                          onClick={() => {
                            chooseAudio(
                              track.index
                            );
                          }}
                          className={cn(
                            "w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/10",

                            selectedAudio ===
                              track.index
                              ? "text-mg-green"
                              : "text-white"
                          )}
                        >
                          {
                            track.label
                          }

                          {track.language
                            ? ` · ${track.language}`
                            : ""}
                        </button>
                      )
                    )
                  ) : (
                    <p className="px-3 py-2 text-xs leading-relaxed text-white/45">
                      This browser or source does not expose separate audio tracks.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={
                toggleFullscreen
              }
              onFocus={
                focusControl
              }
              onBlur={
                blurControl
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40 text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green/60 sm:h-10 sm:w-10"
              aria-label={
                isAppFullscreen
                  ? "Exit fullscreen"
                  : "Fullscreen"
              }
              title={
                isAppFullscreen
                  ? "Exit fullscreen"
                  : "Fullscreen"
              }
            >
              {isAppFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
