import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import Hls from "hls.js";
import {
  isFlvLike,
  isMpegTsLike,
} from "@/components/mg/mediaCompatibility";

/*
 * Extra container / codec bridge for Chromium and Fire TV.
 *
 * HLS.js keeps HLS support.
 * mpegts.js adds a transmux path for MPEG-TS / M2TS / FLV streams and can
 * expose more combinations (including AC-3/E-AC-3 in MPEG-TS) to MSE when
 * the device/browser decoder supports them.
 *
 * We load mpegts.js only when a TS/M2TS/FLV source actually needs it, so the
 * normal player stays light and existing MP4/HLS playback is unchanged.
 */
const MPEGTS_CDN =
  "https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.min.js";

let mpegTsLoader = null;

const loadMpegTs = () => {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  if (window.mpegts) {
    return Promise.resolve(window.mpegts);
  }

  if (mpegTsLoader) {
    return mpegTsLoader;
  }

  mpegTsLoader = new Promise((resolve) => {
    const existing = document.querySelector(
      'script[data-mg-mpegts="true"]'
    );

    const finish = () => resolve(window.mpegts || null);

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => resolve(null), {
        once: true,
      });

      window.setTimeout(finish, 2500);
      return;
    }

    const script = document.createElement("script");
    script.src = MPEGTS_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.mgMpegts = "true";
    script.onload = finish;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return mpegTsLoader;
};

const isHlsUrl = (src, sourceLabel = "") =>
  /\.m3u8(?:[?#\s]|$)|\bhls\b/i.test(
    `${String(src || "")} ${String(sourceLabel || "")}`
  );

const mpegTsType = (src, sourceLabel = "") => {
  const text = `${String(src || "")} ${String(sourceLabel || "")}`.toLowerCase();

  if (/\.flv(?:[?#\s]|$)|\bflv\b/i.test(text)) return "flv";
  if (/\.m2ts(?:[?#\s]|$)|\bm2ts\b/i.test(text)) return "m2ts";
  return "mpegts";
};

const normaliseLanguage = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

const isEnglishLanguage = (value) => {
  const language = normaliseLanguage(value);

  return (
    language === "en" ||
    language === "eng" ||
    language.startsWith("en-") ||
    language === "english" ||
    /\benglish\b/i.test(String(value || ""))
  );
};

const hlsTrackText = (track) =>
  [
    track?.lang,
    track?.name,
    track?.audioCodec,
    track?.attrs?.LANGUAGE,
    track?.attrs?.NAME,
    track?.attrs?.GROUP_ID,
  ]
    .filter(Boolean)
    .join(" ");

const chooseEnglishHlsTrack = (tracks) => {
  let bestIndex = -1;
  let bestScore = -Infinity;

  (tracks || []).forEach((track, index) => {
    const text = hlsTrackText(track);
    const language = track?.lang || track?.attrs?.LANGUAGE || track?.name || "";
    let score = 0;

    if (isEnglishLanguage(language) || /\b(?:eng|english)\b/i.test(text)) {
      score += 10000;
    } else {
      return;
    }

    if (/aac|mp4a/i.test(text)) score += 1200;
    if (/ac-?3|e-?ac-?3|eac3|ddp/i.test(text)) score += 500;
    if (track?.default || track?.attrs?.DEFAULT === "YES") score += 100;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const selectEnglishNativeAudioTrack = (video) => {
  const tracks = video?.audioTracks;

  if (!tracks || typeof tracks.length !== "number" || tracks.length < 2) {
    return false;
  }

  let englishIndex = -1;

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    const text = `${track?.language || ""} ${track?.label || ""}`;

    if (isEnglishLanguage(track?.language) || /\b(?:eng|english)\b/i.test(text)) {
      englishIndex = index;
      break;
    }
  }

  if (englishIndex < 0) return false;

  for (let index = 0; index < tracks.length; index += 1) {
    try {
      tracks[index].enabled = index === englishIndex;
    } catch {
      // Some WebViews expose audioTracks as read-only.
    }
  }

  return true;
};

const LiveVideo = forwardRef(function LiveVideo(
  {
    src,
    poster,
    className,
    sourceLabel = "",
    isLive = false,
    onLoadedMetadata,
    onTimeUpdate,
    onError,
    onEnded,
    controls = true,
  },
  ref
) {
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => videoRef.current);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !src) {
      return undefined;
    }

    let cancelled = false;
    let hls = null;
    let mpegPlayer = null;
    let reported = false;
    let nativeFallbackUsed = false;
    let hlsMediaRecovery = 0;
    let hlsNetworkRecovery = 0;
    let nativeAudioTimer = null;

    const source = String(src).trim();
    const hlsSource = isHlsUrl(source, sourceLabel);
    const tsSource = isMpegTsLike(source, sourceLabel);
    const flvSource = isFlvLike(source, sourceLabel);

    const preferEnglishNativeAudio = () => {
      selectEnglishNativeAudioTrack(video);

      if (nativeAudioTimer) {
        window.clearTimeout(nativeAudioTimer);
      }

      nativeAudioTimer = window.setTimeout(() => {
        selectEnglishNativeAudioTrack(video);
      }, 700);
    };

    const reportError = (error) => {
      if (cancelled || reported) return;
      reported = true;

      if (typeof onError === "function") {
        onError(
          error instanceof Error
            ? error
            : new Error(
                String(error || "The video source could not be played.")
              )
        );
      }
    };

    const playAutomatically = async () => {
      if (cancelled) return;

      try {
        video.muted = false;
        delete video.dataset.mgAutoplayMuted;
        await video.play();
      } catch {
        /*
         * On Fire TV, do not "succeed" by silently starting muted. Leave the
         * stream ready and let the next Select/Play gesture start it with
         * sound. On phones/desktops we retain muted-autoplay fallback and mark
         * it so a later remote/user Play action can restore audio.
         */
        const fireTvLayout =
          document.documentElement.classList.contains("mg-tv-layout") ||
          document.body.classList.contains("mg-tv-layout");

        if (fireTvLayout) {
          video.muted = false;
          delete video.dataset.mgAutoplayMuted;
          return;
        }

        try {
          video.muted = true;
          video.dataset.mgAutoplayMuted = "true";
          await video.play();
        } catch {
          video.muted = false;
          delete video.dataset.mgAutoplayMuted;
        }
      }
    };

    const resetVideo = () => {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Ignore teardown errors from a source that already failed.
      }
    };

    const startNative = () => {
      if (cancelled) return;

      nativeFallbackUsed = true;
      resetVideo();
      video.src = source;
      video.load();
      preferEnglishNativeAudio();
      playAutomatically();
    };

    const onNativeError = () => {
      reportError(
        new Error(
          nativeFallbackUsed
            ? "This device could not decode the selected video/audio format."
            : "The video source could not be played."
        )
      );
    };

    video.addEventListener("error", onNativeError);
    video.addEventListener("loadedmetadata", preferEnglishNativeAudio);
    video.addEventListener("canplay", preferEnglishNativeAudio);

    const startHls = () => {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: Boolean(isLive),
          backBufferLength: 30,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          capLevelToPlayerSize: true,
          startLevel: -1,
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data?.fatal || cancelled) return;

          try {
            if (
              data.type === Hls.ErrorTypes.MEDIA_ERROR &&
              hlsMediaRecovery < 2
            ) {
              hlsMediaRecovery += 1;
              hls.recoverMediaError();
              return;
            }

            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              hlsNetworkRecovery < 2
            ) {
              hlsNetworkRecovery += 1;
              hls.startLoad();
              return;
            }
          } catch {
            // Fall through to the normal source failover.
          }

          reportError(
            new Error(data?.details || "HLS playback failed.")
          );
        });

        const preferEnglishHlsAudio = () => {
          const tracks = hls?.audioTracks || [];
          const englishIndex = chooseEnglishHlsTrack(tracks);

          if (englishIndex >= 0) {
            try {
              hls.audioTrack = englishIndex;
              return;
            } catch {
              // Continue to codec-only fallback below.
            }
          }

          /*
           * If no English-labelled track exists, keep the existing codec
           * compatibility behaviour and prefer AAC when it is available.
           */
          const aacIndex = tracks.findIndex((track) =>
            /aac|mp4a/i.test(hlsTrackText(track))
          );

          if (aacIndex >= 0) {
            try {
              hls.audioTrack = aacIndex;
            } catch {
              // Track selection is optional.
            }
          }
        };

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          preferEnglishHlsAudio();
          preferEnglishNativeAudio();
          playAutomatically();
        });

        if (Hls.Events.AUDIO_TRACKS_UPDATED) {
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
            preferEnglishHlsAudio();
          });
        }

        hls.loadSource(source);
        hls.attachMedia(video);
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        startNative();
        return;
      }

      reportError(new Error("HLS is not supported by this device."));
    };

    const startMpegTs = async () => {
      const mpegts = await loadMpegTs();

      if (cancelled) return;

      if (
        !mpegts?.isSupported?.() ||
        typeof mpegts?.createPlayer !== "function"
      ) {
        startNative();
        return;
      }

      try {
        const type = mpegTsType(source, sourceLabel);

        mpegPlayer = mpegts.createPlayer(
          {
            type,
            isLive: Boolean(isLive),
            url: source,
            cors: true,
            withCredentials: false,
          },
          {
            enableWorker: true,
            enableStashBuffer: !isLive,
            stashInitialSize: 384 * 1024,
            lazyLoad: !isLive,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 60,
            autoCleanupMinBackwardDuration: 30,
            fixAudioTimestampGap: true,
          }
        );

        if (mpegts.Events?.ERROR) {
          mpegPlayer.on(
            mpegts.Events.ERROR,
            (_errorType, errorDetail, errorInfo) => {
              if (cancelled) return;

              try {
                mpegPlayer?.destroy?.();
              } catch {
                // Ignore.
              }

              mpegPlayer = null;

              /*
               * A plain .ts URL may still be natively supported even when
               * MSE transmuxing rejects it, so try native once before moving
               * to the next Media God source.
               */
              if (!nativeFallbackUsed) {
                startNative();
                return;
              }

              reportError(
                new Error(
                  String(
                    errorDetail ||
                      errorInfo?.msg ||
                      "MPEG-TS/FLV playback failed."
                  )
                )
              );
            }
          );
        }

        mpegPlayer.attachMediaElement(video);
        mpegPlayer.load();
        playAutomatically();
      } catch {
        startNative();
      }
    };

    resetVideo();

    if (hlsSource) {
      startHls();
    } else if (tsSource || flvSource) {
      startMpegTs();
    } else {
      startNative();
    }

    return () => {
      cancelled = true;

      video.removeEventListener("error", onNativeError);
      video.removeEventListener("loadedmetadata", preferEnglishNativeAudio);
      video.removeEventListener("canplay", preferEnglishNativeAudio);

      if (nativeAudioTimer) {
        window.clearTimeout(nativeAudioTimer);
        nativeAudioTimer = null;
      }

      if (hls) {
        try {
          hls.destroy();
        } catch {
          // Ignore.
        }
        hls = null;
      }

      if (mpegPlayer) {
        try {
          mpegPlayer.pause?.();
          mpegPlayer.unload?.();
          mpegPlayer.detachMediaElement?.();
          mpegPlayer.destroy?.();
        } catch {
          // Ignore.
        }
        mpegPlayer = null;
      }

      resetVideo();
    };
  }, [src, sourceLabel, isLive, onError]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls={controls}
      playsInline
      preload="auto"
      className={className}
      onLoadedMetadata={onLoadedMetadata}
      onTimeUpdate={onTimeUpdate}
      onEnded={onEnded}
    />
  );
});

LiveVideo.displayName = "LiveVideo";

export default LiveVideo;
