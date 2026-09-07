import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
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
  const text =
    `${String(src || "")} ${String(sourceLabel || "")}`.toLowerCase();

  if (/\.flv(?:[?#\s]|$)|\bflv\b/i.test(text)) return "flv";
  if (/\.m2ts(?:[?#\s]|$)|\bm2ts\b/i.test(text)) return "m2ts";

  return "mpegts";
};

const normaliseLanguage = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

const languageMatches = (value, preferredLanguage = "en") => {
  const language = normaliseLanguage(value);
  const preferred = normaliseLanguage(preferredLanguage || "en");

  if (preferred === "en") {
    return (
      language === "en" ||
      language === "eng" ||
      language.startsWith("en-") ||
      language === "english" ||
      /\benglish\b/i.test(String(value || ""))
    );
  }

  return language === preferred || language.startsWith(`${preferred}-`);
};

const isEnglishLanguage = (value) => languageMatches(value, "en");

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

const audioCodecSafetyScore = (value) => {
  const text = String(value || "");

  if (/\b(?:truehd|mlp|dts(?:-?hd)?|dts:x|dca)\b/i.test(text)) {
    return -9000;
  }

  if (/\b(?:aac|he-?aac|mp4a)\b/i.test(text)) return 2600;
  if (/\b(?:e-?ac-?3|eac3|ec-?3|ddp|dd\+)\b/i.test(text)) return 1400;
  if (/\b(?:ac-?3|ac3|dolby digital)\b/i.test(text)) return 1200;
  if (/\bopus\b/i.test(text)) return 900;
  if (/\b(?:mp3|mpeg audio)\b/i.test(text)) return 700;
  if (/\bflac\b/i.test(text)) return 150;

  return 0;
};

const audioTrackPreferenceScore = (
  track,
  preferredLanguage = "en"
) => {
  const text = [
    track?.language,
    track?.lang,
    track?.label,
    track?.name,
    track?.audioCodec,
    track?.attrs?.LANGUAGE,
    track?.attrs?.NAME,
    track?.attrs?.GROUP_ID,
  ]
    .filter(Boolean)
    .join(" ");

  const language =
    track?.language ||
    track?.lang ||
    track?.attrs?.LANGUAGE ||
    track?.name ||
    "";

  let score = audioCodecSafetyScore(text);

  if (
    languageMatches(language, preferredLanguage) ||
    (normaliseLanguage(preferredLanguage) === "en" &&
      /\b(?:eng|english)\b/i.test(text))
  ) {
    score += 10000;
  }

  if (/\b(?:commentary|audio description|descriptive|visually impaired)\b/i.test(text)) {
    score -= 3200;
  }

  if (track?.default || track?.attrs?.DEFAULT === "YES") score += 120;
  if (track?.autoselect || track?.attrs?.AUTOSELECT === "YES") score += 60;

  return score;
};

const choosePreferredHlsAudioTrack = (
  tracks,
  preferredLanguage = "en",
  excludeIndex = -1
) => {
  let bestIndex = -1;
  let bestScore = -Infinity;

  (tracks || []).forEach((track, index) => {
    if (index === excludeIndex) return;

    const score = audioTrackPreferenceScore(
      track,
      preferredLanguage
    );

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const selectPreferredNativeAudioTrack = (
  video,
  preferredLanguage = "en",
  excludeIndex = -1
) => {
  const tracks =
    video?.audioTracks;

  if (
    !tracks ||
    typeof tracks.length !== "number" ||
    tracks.length < 1
  ) {
    return false;
  }

  let bestIndex = -1;
  let bestScore = -Infinity;

  for (
    let index = 0;
    index < tracks.length;
    index += 1
  ) {
    if (index === excludeIndex) continue;

    const score = audioTrackPreferenceScore(
      tracks[index],
      preferredLanguage
    );

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestIndex < 0) return false;

  for (
    let index = 0;
    index < tracks.length;
    index += 1
  ) {
    try {
      tracks[index].enabled =
        index === bestIndex;
    } catch {
      // Some WebViews expose audioTracks as read-only.
    }
  }

  return Boolean(tracks[bestIndex]?.enabled);
};

const subtitleTrackText = (track) =>
  [
    track?.lang,
    track?.language,
    track?.name,
    track?.label,
    track?.attrs?.LANGUAGE,
    track?.attrs?.NAME,
    track?.attrs?.GROUP_ID,
  ]
    .filter(Boolean)
    .join(" ");

const choosePreferredHlsSubtitleTrack = (
  tracks,
  preferredLanguage = "en"
) => {
  const preferred =
    normaliseLanguage(
      preferredLanguage
    );

  let bestIndex = -1;
  let bestScore = -Infinity;

  (tracks || []).forEach(
    (track, index) => {
      const text =
        subtitleTrackText(
          track
        );

      const language =
        normaliseLanguage(
          track?.lang ||
            track?.language ||
            track?.attrs?.LANGUAGE ||
            ""
        );

      let score = 0;

      if (
        preferred &&
        (
          language === preferred ||
          language.startsWith(
            `${preferred}-`
          ) ||
          preferred.startsWith(
            `${language}-`
          )
        )
      ) {
        score += 12000;
      } else if (
        preferred === "en" &&
        (
          isEnglishLanguage(
            language
          ) ||
          /\b(?:eng|english)\b/i.test(
            text
          )
        )
      ) {
        score += 11000;
      } else {
        return;
      }

      if (
        /\b(?:forced|force)\b/i.test(
          text
        )
      ) {
        score -= 500;
      }

      if (
        /\b(?:sdh|cc|closed captions?)\b/i.test(
          text
        )
      ) {
        score += 150;
      }

      if (
        track?.default ||
        track?.attrs?.DEFAULT ===
          "YES"
      ) {
        score += 100;
      }

      if (
        track?.autoselect ||
        track?.attrs?.AUTOSELECT ===
          "YES"
      ) {
        score += 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
  );

  return bestIndex;
};

const subtitleUrl = (track) =>
  String(
    track?.url ||
      track?.src ||
      track?.file ||
      track?.link ||
      ""
  ).trim();

const subtitleLanguage = (track) =>
  String(
    track?.lang ||
      track?.language ||
      track?.languageCode ||
      track?.langCode ||
      ""
  ).trim();

const subtitleLabel = (track, index) =>
  String(
    track?.label ||
      track?.name ||
      track?.title ||
      subtitleLanguage(track) ||
      `Subtitle ${index + 1}`
  ).trim();

const normaliseSubtitleList = (subtitles) => {
  const seen =
    new Set();

  return (
    Array.isArray(subtitles)
      ? subtitles
      : []
  )
    .map(
      (
        track,
        index
      ) => {
        const raw =
          typeof track === "string"
            ? {
                url: track,
              }
            : track || {};

        const src =
          subtitleUrl(raw);

        if (
          !src ||
          seen.has(src)
        ) {
          return null;
        }

        seen.add(src);

        return {
          id:
            raw.id ||
            `subtitle-${index}-${src}`,

          src,

          lang:
            subtitleLanguage(
              raw
            ),

          label:
            subtitleLabel(
              raw,
              index
            ),

          kind:
            raw.kind ===
            "captions"
              ? "captions"
              : "subtitles",

          default:
            Boolean(
              raw.default
            ),
        };
      }
    )
    .filter(Boolean);
};

const isSrtSubtitleUrl = (value) =>
  /\.srt(?:[?#]|$)/i.test(
    String(value || "")
  );

const isVttSubtitleUrl = (value) =>
  /\.vtt(?:[?#]|$)/i.test(
    String(value || "")
  );

const srtToVtt = (text) => {
  const body =
    String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(
        /\r\n?/g,
        "\n"
      )
      .replace(
        /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
        "$1.$2"
      );

  return `WEBVTT\n\n${body}`;
};

const LiveVideo = forwardRef(
  function LiveVideo(
    {
      src,
      poster,
      className,
      sourceLabel = "",
      isLive = false,
      subtitles = [],
      subtitlesEnabled = false,
      preferredSubtitleLanguage = "en",
      preferredAudioLanguage = "en",
      onLoadedMetadata,
      onTimeUpdate,
      onError,
      onEnded,
      controls = true,
    },
    ref
  ) {
    const videoRef =
      useRef(null);

    const [
      preparedSubtitles,
      setPreparedSubtitles,
    ] = useState([]);

    const externalSubtitleCount =
      Array.isArray(
        subtitles
      )
        ? subtitles.length
        : 0;

    useImperativeHandle(
      ref,
      () =>
        videoRef.current
    );

    useEffect(() => {
      let cancelled =
        false;

      const objectUrls =
        [];

      const input =
        normaliseSubtitleList(
          subtitles
        );

      const prepare =
        async () => {
          const next =
            [];

          for (
            const track of
            input
          ) {
            if (
              cancelled
            ) {
              return;
            }

            if (
              !isSrtSubtitleUrl(
                track.src
              ) ||
              isVttSubtitleUrl(
                track.src
              )
            ) {
              next.push(
                track
              );

              continue;
            }

            try {
              const response =
                await fetch(
                  track.src,
                  {
                    cache:
                      "force-cache",
                  }
                );

              if (
                !response.ok
              ) {
                next.push(
                  track
                );

                continue;
              }

              const srt =
                await response.text();

              const blob =
                new Blob(
                  [
                    srtToVtt(
                      srt
                    ),
                  ],
                  {
                    type:
                      "text/vtt",
                  }
                );

              const url =
                URL.createObjectURL(
                  blob
                );

              objectUrls.push(
                url
              );

              next.push({
                ...track,
                src: url,
              });
            } catch {
              next.push(
                track
              );
            }
          }

          if (
            !cancelled
          ) {
            setPreparedSubtitles(
              next
            );
          }
        };

      prepare();

      return () => {
        cancelled =
          true;

        objectUrls.forEach(
          (url) => {
            try {
              URL.revokeObjectURL(
                url
              );
            } catch {
              // Ignore object URL cleanup errors.
            }
          }
        );
      };
    }, [subtitles]);

    useEffect(() => {
      const video =
        videoRef.current;

      if (
        !video ||
        !src
      ) {
        return undefined;
      }

      let cancelled =
        false;

      let hls =
        null;

      let mpegPlayer =
        null;

      let reported =
        false;

      let nativeFallbackUsed =
        false;

      let hlsMediaRecovery =
        0;

      let hlsNetworkRecovery =
        0;

      let nativeAudioTimer =
        null;

      const source =
        String(
          src
        ).trim();

      const hlsSource =
        isHlsUrl(
          source,
          sourceLabel
        );

      const tsSource =
        isMpegTsLike(
          source,
          sourceLabel
        );

      const flvSource =
        isFlvLike(
          source,
          sourceLabel
        );

      const applyHlsSubtitleSelection =
        (
          detail = {}
        ) => {
          if (!hls) {
            return;
          }

          const requestedIndex =
            Number(
              detail?.index
            );

          if (
            requestedIndex <
            0
          ) {
            try {
              hls.subtitleDisplay =
                false;

              hls.subtitleTrack =
                -1;
            } catch {
              // Subtitle selection is optional.
            }

            return;
          }

          const selectedTextTrack =
            video?.textTracks &&
            requestedIndex <
              video
                .textTracks
                .length
              ? video
                  .textTracks[
                  requestedIndex
                ]
              : null;

          const externalTrackSelected =
            Array.from(
              video.querySelectorAll(
                "track"
              )
            ).some(
              (
                element
              ) =>
                element.track ===
                selectedTextTrack
            );

          if (
            externalTrackSelected
          ) {
            try {
              hls.subtitleDisplay =
                false;

              hls.subtitleTrack =
                -1;
            } catch {
              // External WebVTT track remains selected by the controls.
            }

            return;
          }

          const tracks =
            hls.subtitleTracks ||
            [];

          const requestedLanguage =
            normaliseLanguage(
              detail?.language
            );

          let targetIndex =
            -1;

          if (
            requestedLanguage
          ) {
            targetIndex =
              tracks.findIndex(
                (track) => {
                  const language =
                    normaliseLanguage(
                      track?.lang ||
                        track?.language ||
                        track
                          ?.attrs
                          ?.LANGUAGE ||
                        ""
                    );

                  return (
                    language ===
                      requestedLanguage ||
                    language.startsWith(
                      `${requestedLanguage}-`
                    ) ||
                    requestedLanguage.startsWith(
                      `${language}-`
                    )
                  );
                }
              );
          }

          if (
            targetIndex <
              0 &&
            requestedIndex <
              tracks.length
          ) {
            targetIndex =
              requestedIndex;
          }

          if (
            targetIndex >=
            0
          ) {
            try {
              hls.subtitleDisplay =
                true;

              hls.subtitleTrack =
                targetIndex;
            } catch {
              // Native text tracks may still handle the selection.
            }
          }
        };

      const onSubtitleSelection =
        (event) => {
          applyHlsSubtitleSelection(
            event?.detail ||
              {}
          );
        };

      window.addEventListener(
        "mg:subtitle-track-selected",
        onSubtitleSelection
      );

      const preferEnglishNativeAudio =
        () => {
          selectPreferredNativeAudioTrack(
            video,
            preferredAudioLanguage
          );

          if (
            nativeAudioTimer
          ) {
            window.clearTimeout(
              nativeAudioTimer
            );
          }

          nativeAudioTimer =
            window.setTimeout(
              () => {
                selectPreferredNativeAudioTrack(
                  video,
                  preferredAudioLanguage
                );
              },
              700
            );
        };

      const reportError =
        (error) => {
          if (
            cancelled ||
            reported
          ) {
            return;
          }

          reported =
            true;

          if (
            typeof onError ===
            "function"
          ) {
            onError(
              error instanceof
                Error
                ? error
                : new Error(
                    String(
                      error ||
                        "The video source could not be played."
                    )
                  )
            );
          }
        };

      const playAutomatically =
        async () => {
          if (
            cancelled
          ) {
            return;
          }

          try {
            video.muted =
              false;

            delete video
              .dataset
              .mgAutoplayMuted;

            await video.play();
          } catch {
            /*
             * On Fire TV, do not "succeed" by silently starting muted.
             */
            const fireTvLayout =
              document.documentElement.classList.contains(
                "mg-tv-layout"
              ) ||
              document.body.classList.contains(
                "mg-tv-layout"
              );

            if (
              fireTvLayout
            ) {
              video.muted =
                false;

              delete video
                .dataset
                .mgAutoplayMuted;

              return;
            }

            try {
              video.muted =
                true;

              video.dataset.mgAutoplayMuted =
                "true";

              await video.play();
            } catch {
              video.muted =
                false;

              delete video
                .dataset
                .mgAutoplayMuted;
            }
          }
        };

      const resetVideo =
        () => {
          try {
            video.pause();

            video.removeAttribute(
              "src"
            );

            video.load();
          } catch {
            // Ignore teardown errors from a source that already failed.
          }
        };

      const startNative =
        () => {
          if (
            cancelled
          ) {
            return;
          }

          nativeFallbackUsed =
            true;

          resetVideo();

          video.src =
            source;

          video.load();

          preferEnglishNativeAudio();

          playAutomatically();
        };

      const onNativeError =
        () => {
          reportError(
            new Error(
              nativeFallbackUsed
                ? "This device could not decode the selected video/audio format."
                : "The video source could not be played."
            )
          );
        };

      video.addEventListener(
        "error",
        onNativeError
      );

      video.addEventListener(
        "loadedmetadata",
        preferEnglishNativeAudio
      );

      video.addEventListener(
        "canplay",
        preferEnglishNativeAudio
      );

      const startHls =
        () => {
          if (
            Hls.isSupported()
          ) {
            hls =
              new Hls({
                enableWorker:
                  true,

                lowLatencyMode:
                  Boolean(
                    isLive
                  ),

                backBufferLength:
                  30,

                maxBufferLength:
                  30,

                maxMaxBufferLength:
                  60,

                capLevelToPlayerSize:
                  false,

                startLevel:
                  -1,

                renderTextTracksNatively:
                  true,
              });

            hls.on(
              Hls.Events.ERROR,
              (
                _event,
                data
              ) => {
                if (
                  !data?.fatal ||
                  cancelled
                ) {
                  return;
                }

                try {
                  if (
                    data.type ===
                      Hls
                        .ErrorTypes
                        .MEDIA_ERROR &&
                    hlsMediaRecovery <
                      2
                  ) {
                    hlsMediaRecovery +=
                      1;

                    hls.recoverMediaError();

                    return;
                  }

                  if (
                    data.type ===
                      Hls
                        .ErrorTypes
                        .NETWORK_ERROR &&
                    hlsNetworkRecovery <
                      2
                  ) {
                    hlsNetworkRecovery +=
                      1;

                    hls.startLoad();

                    return;
                  }
                } catch {
                  // Fall through to normal source failover.
                }

                reportError(
                  new Error(
                    data?.details ||
                      "HLS playback failed."
                  )
                );
              }
            );

            const preferEnglishHlsAudio =
              () => {
                const tracks =
                  hls?.audioTracks ||
                  [];

                const englishIndex =
                  choosePreferredHlsAudioTrack(
                    tracks,
                    preferredAudioLanguage
                  );

                if (
                  englishIndex >=
                  0
                ) {
                  try {
                    hls.audioTrack =
                      englishIndex;

                    return;
                  } catch {
                    // Continue to codec-only fallback.
                  }
                }

                const aacIndex =
                  tracks.findIndex(
                    (
                      track
                    ) =>
                      /aac|mp4a/i.test(
                        hlsTrackText(
                          track
                        )
                      )
                  );

                if (
                  aacIndex >=
                  0
                ) {
                  try {
                    hls.audioTrack =
                      aacIndex;
                  } catch {
                    // Track selection is optional.
                  }
                }
              };

            hls.on(
              Hls.Events
                .MANIFEST_PARSED,
              () => {
                preferEnglishHlsAudio();

                preferEnglishNativeAudio();

                playAutomatically();
              }
            );

            if (
              Hls.Events
                .AUDIO_TRACKS_UPDATED
            ) {
              hls.on(
                Hls.Events
                  .AUDIO_TRACKS_UPDATED,
                () => {
                  preferEnglishHlsAudio();
                }
              );
            }

            const preferHlsSubtitles =
              () => {
                const tracks =
                  hls
                    ?.subtitleTracks ||
                  [];

                if (
                  !subtitlesEnabled ||
                  externalSubtitleCount >
                    0 ||
                  tracks.length ===
                    0
                ) {
                  try {
                    hls.subtitleDisplay =
                      false;

                    hls.subtitleTrack =
                      -1;
                  } catch {
                    // Subtitle selection is optional.
                  }

                  return;
                }

                const preferredIndex =
                  choosePreferredHlsSubtitleTrack(
                    tracks,
                    preferredSubtitleLanguage
                  );

                if (
                  preferredIndex >=
                  0
                ) {
                  try {
                    hls.subtitleDisplay =
                      true;

                    hls.subtitleTrack =
                      preferredIndex;
                  } catch {
                    // Native text tracks may still be available.
                  }
                } else {
                  try {
                    hls.subtitleDisplay =
                      false;

                    hls.subtitleTrack =
                      -1;
                  } catch {
                    // Leave subtitles off when no preferred language exists.
                  }
                }
              };

            if (
              Hls.Events
                .SUBTITLE_TRACKS_UPDATED
            ) {
              hls.on(
                Hls.Events
                  .SUBTITLE_TRACKS_UPDATED,
                () => {
                  preferHlsSubtitles();
                }
              );
            }

            hls.on(
              Hls.Events
                .MANIFEST_PARSED,
              () => {
                preferHlsSubtitles();
              }
            );

            hls.loadSource(
              source
            );

            hls.attachMedia(
              video
            );

            return;
          }

          if (
            video.canPlayType(
              "application/vnd.apple.mpegurl"
            )
          ) {
            startNative();

            return;
          }

          reportError(
            new Error(
              "HLS is not supported by this device."
            )
          );
        };

      const startMpegTs =
        async () => {
          const mpegts =
            await loadMpegTs();

          if (
            cancelled
          ) {
            return;
          }

          if (
            !mpegts?.isSupported?.() ||
            typeof mpegts?.createPlayer !==
              "function"
          ) {
            startNative();

            return;
          }

          try {
            const type =
              mpegTsType(
                source,
                sourceLabel
              );

            mpegPlayer =
              mpegts.createPlayer(
                {
                  type,

                  isLive:
                    Boolean(
                      isLive
                    ),

                  url:
                    source,

                  cors:
                    true,

                  withCredentials:
                    false,
                },
                {
                  enableWorker:
                    true,

                  enableStashBuffer:
                    !isLive,

                  stashInitialSize:
                    384 *
                    1024,

                  lazyLoad:
                    !isLive,

                  autoCleanupSourceBuffer:
                    true,

                  autoCleanupMaxBackwardDuration:
                    60,

                  autoCleanupMinBackwardDuration:
                    30,

                  fixAudioTimestampGap:
                    true,
                }
              );

            if (
              mpegts.Events
                ?.ERROR
            ) {
              mpegPlayer.on(
                mpegts.Events.ERROR,
                (
                  _errorType,
                  errorDetail,
                  errorInfo
                ) => {
                  if (
                    cancelled
                  ) {
                    return;
                  }

                  try {
                    mpegPlayer?.destroy?.();
                  } catch {
                    // Ignore.
                  }

                  mpegPlayer =
                    null;

                  if (
                    !nativeFallbackUsed
                  ) {
                    startNative();

                    return;
                  }

                  reportError(
                    new Error(
                      String(
                        errorDetail ||
                          errorInfo
                            ?.msg ||
                          "MPEG-TS/FLV playback failed."
                      )
                    )
                  );
                }
              );
            }

            mpegPlayer.attachMediaElement(
              video
            );

            mpegPlayer.load();

            playAutomatically();
          } catch {
            startNative();
          }
        };

      resetVideo();

      if (
        hlsSource
      ) {
        startHls();
      } else if (
        tsSource ||
        flvSource
      ) {
        startMpegTs();
      } else {
        startNative();
      }

      return () => {
        cancelled =
          true;

        video.removeEventListener(
          "error",
          onNativeError
        );

        video.removeEventListener(
          "loadedmetadata",
          preferEnglishNativeAudio
        );

        video.removeEventListener(
          "canplay",
          preferEnglishNativeAudio
        );

        window.removeEventListener(
          "mg:subtitle-track-selected",
          onSubtitleSelection
        );

        if (
          nativeAudioTimer
        ) {
          window.clearTimeout(
            nativeAudioTimer
          );

          nativeAudioTimer =
            null;
        }

        if (hls) {
          try {
            hls.destroy();
          } catch {
            // Ignore.
          }

          hls =
            null;
        }

        if (
          mpegPlayer
        ) {
          try {
            mpegPlayer.pause?.();
            mpegPlayer.unload?.();
            mpegPlayer.detachMediaElement?.();
            mpegPlayer.destroy?.();
          } catch {
            // Ignore.
          }

          mpegPlayer =
            null;
        }

        resetVideo();
      };
    }, [
      src,
      sourceLabel,
      isLive,
      subtitlesEnabled,
      preferredSubtitleLanguage,
      preferredAudioLanguage,
      externalSubtitleCount,
      onError,
    ]);

    const preferredExternalSubtitleIndex =
      subtitlesEnabled
        ? preparedSubtitles.findIndex(
            (
              track
            ) =>
              track.default ||
              isEnglishLanguage(
                track.lang
              )
          )
        : -1;

    return (
      <video
        ref={videoRef}
        poster={poster}
        controls={controls}
        playsInline
        preload="auto"
        className={className}
        onLoadedMetadata={
          onLoadedMetadata
        }
        onTimeUpdate={
          onTimeUpdate
        }
        onEnded={
          onEnded
        }
      >
        {preparedSubtitles.map(
          (
            track,
            index
          ) => (
            <track
              key={
                track.id
              }
              kind={
                track.kind
              }
              src={
                track.src
              }
              srcLang={
                track.lang ||
                undefined
              }
              label={
                track.label
              }
              default={
                index ===
                preferredExternalSubtitleIndex
              }
            />
          )
        )}
      </video>
    );
  }
);

LiveVideo.displayName =
  "LiveVideo";

export default LiveVideo;
