import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";
import {
  claimExclusivePlayback,
  releaseExclusivePlayback,
} from "@/components/mg/exclusivePlayback";
import {
  isFlvLike,
  isMpegTsLike,
} from "@/components/mg/mediaCompatibility";
import {
  preferredAudioTrackScore,
  readRememberedSubtitlePreference,
  readTrackPreferences,
  rememberedSubtitleTrackScore,
} from "@/components/mg/mediaTrackPreferences";

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

const DASHJS_CDN =
  "https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js";

let mpegTsLoader = null;
let dashJsLoader = null;

const stableConfigSignature = (value) => {
  const normalise = (input) => {
    if (Array.isArray(input)) {
      return input.map(normalise);
    }

    if (input && typeof input === "object") {
      return Object.keys(input)
        .sort()
        .reduce((result, key) => {
          result[key] = normalise(input[key]);
          return result;
        }, {});
    }

    return input ?? null;
  };

  try {
    return JSON.stringify(normalise(value));
  } catch {
    return String(value || "");
  }
};

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

const loadDashJs = () => {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  if (window.dashjs) {
    return Promise.resolve(window.dashjs);
  }

  if (dashJsLoader) {
    return dashJsLoader;
  }

  dashJsLoader = new Promise((resolve) => {
    const existing = document.querySelector(
      'script[data-mg-dashjs="true"]'
    );

    const finish = () => resolve(window.dashjs || null);

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => resolve(null), {
        once: true,
      });

      window.setTimeout(finish, 3000);
      return;
    }

    const script = document.createElement("script");
    script.src = DASHJS_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.mgDashjs = "true";
    script.onload = finish;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return dashJsLoader;
};

const isHlsUrl = (src, sourceLabel = "") =>
  /\.m3u8(?:[?#&\s]|$)|\bhls\b|mpegurl|mpeg-url/i.test(
    `${String(src || "")} ${String(sourceLabel || "")}`
  );

const isDashUrl = (src, sourceLabel = "") =>
  /\.mpd(?:[?#&\s]|$)|\bmpeg[- ]?dash\b|\bdash\b/i.test(
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

const audioTrackPreferenceScore = (
  track,
  preferredLanguage = "en"
) => preferredAudioTrackScore(track, preferredLanguage);

const choosePreferredHlsAudioTrack = (
  tracks,
  preferredLanguage = "en",
  excludeIndex = -1,
  skipIndices = []
) => {
  let bestIndex = -1;
  let bestScore = -Infinity;

  (tracks || []).forEach((track, index) => {
    if (index === excludeIndex || skipIndices.includes(index)) return;

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

  const preferences = readTrackPreferences();
  const context =
    typeof window !== "undefined"
      ? window.__MG_PLAYER_CONTEXT__ || {}
      : {};
  const remembered = readRememberedSubtitlePreference(context);

  if (remembered?.enabled === false) {
    return -1;
  }

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

      const forced = /\b(?:forced|force|foreign parts?)\b/i.test(text);
      const sdh = /\b(?:sdh|hoh|hearing[ ._-]?impaired|closed captions?|cc)\b/i.test(text);

      if (forced) {
        score += preferences.preferForcedSubtitles ? 4200 : -500;
      }

      if (sdh) {
        score += preferences.preferSdhSubtitles ? 1200 : -1400;
      } else if (!preferences.preferSdhSubtitles) {
        score += 500;
      }

      score += rememberedSubtitleTrackScore(track, remembered);

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

const choosePreferredExternalSubtitleIndex = (
  tracks,
  subtitlesEnabled,
  preferredSubtitleLanguage = "en"
) => {
  if (!subtitlesEnabled) return -1;

  const preferences = readTrackPreferences();
  const context =
    typeof window !== "undefined"
      ? window.__MG_PLAYER_CONTEXT__ || {}
      : {};
  const remembered = readRememberedSubtitlePreference(context);

  if (remembered?.enabled === false) return -1;

  const ranked = (Array.isArray(tracks) ? tracks : [])
    .map((track, index) => {
      const text = subtitleTrackText(track);
      const language = subtitleLanguage(track);
      let score = rememberedSubtitleTrackScore(track, remembered);

      if (languageMatches(language, preferredSubtitleLanguage)) {
        score += 12000;
      } else if (
        normaliseLanguage(preferredSubtitleLanguage) === "en" &&
        /\b(?:eng|english)\b/i.test(`${language} ${text}`)
      ) {
        score += 11000;
      }

      const forced = /\b(?:forced|force|foreign parts?)\b/i.test(text);
      const sdh = /\b(?:sdh|hoh|hearing[ ._-]?impaired|closed captions?|cc)\b/i.test(text);

      if (forced) score += preferences.preferForcedSubtitles ? 4200 : -500;
      if (sdh) score += preferences.preferSdhSubtitles ? 1200 : -1400;
      else if (!preferences.preferSdhSubtitles) score += 500;
      if (track?.default) score += 100;

      return { index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return ranked[0]?.index ?? -1;
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

/**
 * @typedef {{
 *   src?: string,
 *   poster?: string,
 *   className?: string,
 *   sourceLabel?: string,
 *   isLive?: boolean,
 *   headers?: Record<string, any>,
 *   drm?: any,
 *   subtitles?: any[],
 *   subtitlesEnabled?: boolean,
 *   preferredSubtitleLanguage?: string,
 *   preferredAudioLanguage?: string,
 *   onLoadedMetadata?: React.ReactEventHandler<HTMLVideoElement>,
 *   onTimeUpdate?: React.ReactEventHandler<HTMLVideoElement>,
 *   onError?: ((eventOrOptions?: any) => void),
 *   onAutoplayBlocked?: (() => void),
 *   allowMutedAutoplay?: boolean,
 *   onEnded?: React.ReactEventHandler<HTMLVideoElement>,
 *   controls?: boolean
 * }} LiveVideoProps
 */

const LiveVideo = forwardRef(
  /**
   * @param {LiveVideoProps} props
   * @param {React.ForwardedRef<HTMLVideoElement>} ref
   */
  function LiveVideo(
    {
      src,
      poster,
      className,
      sourceLabel = "",
      isLive = false,
      headers = {},
      drm = null,
      subtitles = [],
      subtitlesEnabled = false,
      preferredSubtitleLanguage = "en",
      preferredAudioLanguage = "en",
      onLoadedMetadata,
      onTimeUpdate,
      onError,
      onAutoplayBlocked,
      allowMutedAutoplay = true,
      onEnded,
      controls = true,
    },
    ref
  ) {
    const videoRef =
      useRef(null);

    /*
     * Playback ownership must be tied to the actual stream, not to incidental
     * React prop identity. VideoPlayer re-renders while progress, cache status,
     * controls and diagnostics change; inline callback/object props can therefore
     * be new references every render even though the media URL is unchanged.
     * Keep the latest values in refs so those UI renders never tear down and
     * recreate the decoder underneath a playing video.
     */
    const onErrorRef = useRef(onError);
    const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
    const allowMutedAutoplayRef = useRef(allowMutedAutoplay);
    const sourceLabelRef = useRef(sourceLabel);
    const headersRef = useRef(headers);
    const drmRef = useRef(drm);
    const subtitlesEnabledRef = useRef(subtitlesEnabled);
    const preferredSubtitleLanguageRef = useRef(preferredSubtitleLanguage);
    const preferredAudioLanguageRef = useRef(preferredAudioLanguage);
    const externalSubtitleCountRef = useRef(0);

    onErrorRef.current = onError;
    onAutoplayBlockedRef.current = onAutoplayBlocked;
    allowMutedAutoplayRef.current = allowMutedAutoplay;
    sourceLabelRef.current = sourceLabel;
    headersRef.current = headers;
    drmRef.current = drm;
    subtitlesEnabledRef.current = subtitlesEnabled;
    preferredSubtitleLanguageRef.current = preferredSubtitleLanguage;
    preferredAudioLanguageRef.current = preferredAudioLanguage;

    const headersSignature = stableConfigSignature(headers);
    const drmSignature = stableConfigSignature(drm);

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

    externalSubtitleCountRef.current = externalSubtitleCount;

    useImperativeHandle(
      ref,
      () =>
        videoRef.current
    );

    useEffect(() => {
      const video = videoRef.current;

      if (!video) {
        return undefined;
      }

      const forceInlinePlayback = () => {
        try {
          video.disablePictureInPicture = true;
        } catch {
          // Older WebViews may not expose the property.
        }

        try {
          video.disableRemotePlayback = true;
        } catch {
          // Remote playback is optional on older WebViews.
        }

        try {
          if (
            document.pictureInPictureElement === video &&
            typeof document.exitPictureInPicture === "function"
          ) {
            document.exitPictureInPicture().catch(() => {});
          }
        } catch {
          // Picture-in-picture may not exist on this device.
        }

        try {
          if (
            typeof video.webkitSetPresentationMode === "function" &&
            video.webkitPresentationMode === "picture-in-picture"
          ) {
            video.webkitSetPresentationMode("inline");
          }
        } catch {
          // WebKit presentation mode is best effort only.
        }
      };

      const onEnterPictureInPicture = () => {
        forceInlinePlayback();
      };

      forceInlinePlayback();
      video.addEventListener(
        "enterpictureinpicture",
        onEnterPictureInPicture
      );

      return () => {
        video.removeEventListener(
          "enterpictureinpicture",
          onEnterPictureInPicture
        );
      };
    }, []);

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

      let released =
        false;

      const playbackOwner =
        {};

      let hls =
        null;

      let dashPlayer =
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

      let hlsVariantRecovery =
        0;

      const hlsTriedAudioTracks =
        new Set();

      const hlsTriedLevels =
        new Set();

      let nativeAudioTimer =
        null;
      let manualVodAudioChoice = false;

      const onManualAudioChoice = () => {
        if (!isLive) manualVodAudioChoice = true;
      };
      window.addEventListener("mg:manual-audio-track-selected", onManualAudioChoice);

      const source =
        String(
          src
        ).trim();

      const hlsSource =
        isHlsUrl(
          source,
          sourceLabelRef.current
        );

      const dashSource =
        isDashUrl(
          source,
          sourceLabelRef.current
        );

      const tsSource =
        isMpegTsLike(
          source,
          sourceLabelRef.current
        );

      const flvSource =
        isFlvLike(
          source,
          sourceLabelRef.current
        );

      /*
       * Some providers expose a real media endpoint as a plain HTTPS URL with
       * no .m3u8/.mpd/.mp4 suffix. Give those links a safe playback chain:
       * native media element first, then HLS, then DASH. Known formats keep
       * their normal direct path and never pay this extra fallback cost.
       */
      const genericHttpsSource =
        /^https:\/\//i.test(source) &&
        !hlsSource &&
        !dashSource &&
        !tsSource &&
        !flvSource;

      let genericHttpsHlsFallbackTried = false;
      let genericHttpsDashFallbackTried = false;

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

      const onAudioRescueRequest = (event) => {
        const requestId =
          String(
            event?.detail?.requestId ||
              ""
          );

        const finish = (handled, detail = {}) => {
          window.dispatchEvent(
            new CustomEvent("mg:audio-rescue-result", {
              detail: {
                requestId,
                handled,
                ...detail,
              },
            })
          );
        };

        if (
          window.__MG_NATIVE_PLAYBACK_ACTIVE__ === true ||
          !hls ||
          !Array.isArray(hls.audioTracks) ||
          hls.audioTracks.length < 2
        ) {
          finish(false);
          return;
        }

        const currentIndex =
          Number.isFinite(Number(hls.audioTrack))
            ? Number(hls.audioTrack)
            : -1;

        const targetIndex =
          choosePreferredHlsAudioTrack(
            hls.audioTracks,
            preferredAudioLanguageRef.current,
            currentIndex,
            Array.isArray(event?.detail?.skipIndices)
              ? event.detail.skipIndices
              : []
          );

        if (targetIndex < 0) {
          finish(false);
          return;
        }

        try {
          hls.audioTrack = targetIndex;
          video.muted = false;
          video.volume = 1;
          video.play().catch(() => {});

          finish(true, {
            index: targetIndex,
            previousIndex: currentIndex,
            label:
              hlsTrackText(
                hls.audioTracks[targetIndex]
              ) ||
              `Audio ${targetIndex + 1}`,
          });
        } catch {
          finish(false);
        }
      };

      window.addEventListener(
        "mg:audio-rescue-request",
        onAudioRescueRequest
      );

      const publishHlsAudioTracks = () => {
        const tracks = Array.isArray(hls?.audioTracks)
          ? hls.audioTracks.map((track, index) => ({
              index,
              language:
                track?.lang ||
                track?.attrs?.LANGUAGE ||
                "",
              lang:
                track?.lang ||
                track?.attrs?.LANGUAGE ||
                "",
              label:
                track?.name ||
                track?.attrs?.NAME ||
                `Audio ${index + 1}`,
              name:
                track?.name ||
                track?.attrs?.NAME ||
                "",
              audioCodec:
                track?.audioCodec ||
                track?.attrs?.CODECS ||
                "",
              channels:
                track?.attrs?.CHANNELS ||
                "",
              attrs: track?.attrs || {},
            }))
          : [];

        window.dispatchEvent(
          new CustomEvent("mg:hls-audio-tracks", {
            detail: {
              tracks,
              activeIndex:
                Number.isFinite(Number(hls?.audioTrack))
                  ? Number(hls.audioTrack)
                  : -1,
            },
          })
        );
      };

      const onHlsAudioSelection = (event) => {
        if (
          window.__MG_NATIVE_PLAYBACK_ACTIVE__ === true ||
          !hls
        ) {
          return;
        }

        const index = Number(event?.detail?.index);
        const tracks = Array.isArray(hls.audioTracks) ? hls.audioTracks : [];

        if (!Number.isInteger(index) || index < 0 || index >= tracks.length) {
          return;
        }

        try {
          hls.audioTrack = index;
          if (!isLive) manualVodAudioChoice = true;
          video.muted = false;
          video.volume = Math.max(0.01, Number(video.volume || 1));
          video.play().catch(() => {});
          window.setTimeout(publishHlsAudioTracks, 30);
        } catch {
          // HLS track selection is best effort on older WebViews.
        }
      };

      window.addEventListener(
        "mg:hls-audio-track-selected",
        onHlsAudioSelection
      );

      const preferEnglishNativeAudio =
        () => {
          // Browser HTMLMediaElement.audioTracks is not a reliable automatic
          // selector. Keep VOD's active track until the user chooses Audio.
          if (!isLive || manualVodAudioChoice) return;
          selectPreferredNativeAudioTrack(
            video,
            preferredAudioLanguageRef.current
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
            typeof onErrorRef.current ===
            "function"
          ) {
            onErrorRef.current(
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
            cancelled ||
            window.__MG_NATIVE_PLAYBACK_ACTIVE__ === true
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
          } catch (error) {
            if (cancelled || error?.name === "AbortError") return;

            if (!allowMutedAutoplayRef.current) {
              video.muted = false;
              delete video.dataset.mgAutoplayMuted;
              if (error?.name === "NotAllowedError") {
                onAutoplayBlockedRef.current?.();
              } else {
                reportError(error);
              }
              return;
            }

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
          if (
            genericHttpsSource &&
            !genericHttpsHlsFallbackTried
          ) {
            genericHttpsHlsFallbackTried = true;

            window.dispatchEvent(
              new CustomEvent("mg:player-status", {
                detail: {
                  message:
                    "HTTPS stream type not advertised — trying HLS playback…",
                },
              })
            );

            resetVideo();
            startHls();
            return;
          }

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

            const tryAlternativeHlsVariant = () => {
              if (!hls || hlsVariantRecovery >= 4) return "";

              const audioTracks = Array.isArray(hls.audioTracks)
                ? hls.audioTracks
                : [];
              const currentAudio = Number.isFinite(Number(hls.audioTrack))
                ? Number(hls.audioTrack)
                : -1;

              if (currentAudio >= 0) {
                hlsTriedAudioTracks.add(currentAudio);
              }

              if (audioTracks.length > 1) {
                const targetAudio = choosePreferredHlsAudioTrack(
                  audioTracks,
                  preferredAudioLanguageRef.current,
                  currentAudio
                );

                if (
                  targetAudio >= 0 &&
                  targetAudio !== currentAudio &&
                  !hlsTriedAudioTracks.has(targetAudio)
                ) {
                  hlsTriedAudioTracks.add(targetAudio);
                  hlsVariantRecovery += 1;

                  try {
                    hls.audioTrack = targetAudio;
                    window.setTimeout(publishHlsAudioTracks, 20);
                    window.dispatchEvent(
                      new CustomEvent("mg:player-status", {
                        detail: {
                          message: "HLS recovery · trying another audio rendition…",
                        },
                      })
                    );
                    return "audio";
                  } catch {
                    // Continue to a video rendition fallback.
                  }
                }
              }

              const levels = Array.isArray(hls.levels) ? hls.levels : [];
              if (levels.length < 2) return "";

              const currentLevel =
                Number.isInteger(hls.currentLevel) && hls.currentLevel >= 0
                  ? hls.currentLevel
                  : Number.isInteger(hls.loadLevel) && hls.loadLevel >= 0
                    ? hls.loadLevel
                    : -1;
              if (currentLevel >= 0) {
                hlsTriedLevels.add(currentLevel);
              }

              const currentBitrate =
                currentLevel >= 0
                  ? Number(levels[currentLevel]?.bitrate || Infinity)
                  : Infinity;
              const candidates = levels
                .map((level, index) => ({
                  index,
                  bitrate: Number(level?.bitrate || level?.maxBitrate || 0),
                }))
                .filter(
                  (item) =>
                    item.index !== currentLevel &&
                    !hlsTriedLevels.has(item.index) &&
                    (currentBitrate === Infinity || item.bitrate < currentBitrate)
                )
                .sort((a, b) => b.bitrate - a.bitrate || b.index - a.index);
              const target =
                candidates[0] ||
                levels
                  .map((level, index) => ({
                    index,
                    bitrate: Number(level?.bitrate || level?.maxBitrate || 0),
                  }))
                  .filter(
                    (item) =>
                      item.index !== currentLevel &&
                      !hlsTriedLevels.has(item.index)
                  )
                  .sort((a, b) => a.bitrate - b.bitrate || a.index - b.index)[0];

              if (!target) return "";

              hlsTriedLevels.add(target.index);
              hlsVariantRecovery += 1;

              try {
                hls.autoLevelCapping = target.index;
                hls.nextLevel = target.index;
                hls.loadLevel = target.index;
                hls.startLoad(-1);
                window.dispatchEvent(
                  new CustomEvent("mg:player-status", {
                    detail: {
                      message: "HLS recovery · trying a more stable quality…",
                    },
                  })
                );
                return "level";
              } catch {
                return "";
              }
            };

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
                        .MEDIA_ERROR
                  ) {
                    const variant = tryAlternativeHlsVariant();
                    if (variant) {
                      hls.recoverMediaError();
                      return;
                    }

                    if (hlsMediaRecovery < 2) {
                      hlsMediaRecovery += 1;
                      hls.recoverMediaError();
                      return;
                    }
                  }

                  if (
                    data.type ===
                      Hls
                        .ErrorTypes
                        .NETWORK_ERROR
                  ) {
                    const variant = tryAlternativeHlsVariant();
                    if (variant) {
                      return;
                    }

                    if (hlsNetworkRecovery < 2) {
                      hlsNetworkRecovery += 1;
                      hls.startLoad();
                      return;
                    }
                  }
                } catch {
                  // Fall through to normal source failover.
                }

                if (
                  genericHttpsSource &&
                  !genericHttpsDashFallbackTried
                ) {
                  genericHttpsDashFallbackTried = true;

                  try {
                    hls?.destroy?.();
                  } catch {
                    // Continue with the DASH fallback.
                  }

                  hls = null;
                  resetVideo();

                  window.dispatchEvent(
                    new CustomEvent("mg:player-status", {
                      detail: {
                        message:
                          "HTTPS source was not HLS — trying MPEG-DASH…",
                      },
                    })
                  );

                  startDash();
                  return;
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
                if (!isLive && manualVodAudioChoice) return;
                const tracks =
                  hls?.audioTracks ||
                  [];

                const englishIndex =
                  choosePreferredHlsAudioTrack(
                    tracks,
                    preferredAudioLanguageRef.current
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
                window.setTimeout(publishHlsAudioTracks, 20);

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
                  window.setTimeout(publishHlsAudioTracks, 20);
                }
              );
            }

            if (Hls.Events.AUDIO_TRACK_SWITCHED) {
              hls.on(
                Hls.Events.AUDIO_TRACK_SWITCHED,
                publishHlsAudioTracks
              );
            }

            const preferHlsSubtitles =
              () => {
                const tracks =
                  hls
                    ?.subtitleTracks ||
                  [];

                if (
                  !subtitlesEnabledRef.current ||
                  externalSubtitleCountRef.current >
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
                    preferredSubtitleLanguageRef.current
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
            genericHttpsSource &&
            !genericHttpsDashFallbackTried
          ) {
            genericHttpsDashFallbackTried = true;

            window.dispatchEvent(
              new CustomEvent("mg:player-status", {
                detail: {
                  message:
                    "HLS engine unavailable — trying HTTPS source as MPEG-DASH…",
                },
              })
            );

            startDash();
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

      const startDash =
        async () => {
          const dashjs =
            await loadDashJs();

          if (cancelled) {
            return;
          }

          if (
            !dashjs?.MediaPlayer ||
            !(window.MediaSource || window.WebKitMediaSource)
          ) {
            reportError(
              new Error(
                "MPEG-DASH is not supported by this browser."
              )
            );
            return;
          }

          try {
            dashPlayer =
              dashjs.MediaPlayer().create();

            try {
              dashPlayer.updateSettings?.({
                streaming: {
                  lowLatencyEnabled: Boolean(isLive),
                  buffer: {
                    stableBufferTime: isLive ? 8 : 12,
                    bufferTimeAtTopQuality: isLive ? 12 : 20,
                  },
                },
              });
            } catch {
              // Settings are optional across dash.js versions.
            }

            const requestHeaders = Object.fromEntries(
              Object.entries(
                headersRef.current &&
                typeof headersRef.current === "object" &&
                !Array.isArray(headersRef.current)
                  ? headersRef.current
                  : {}
              ).filter(
                ([name, value]) =>
                  Boolean(name && value != null) &&
                  !/^(?:user-agent|host|origin|referer|content-length|connection)$/i.test(
                    String(name)
                  )
              )
            );

            if (Object.keys(requestHeaders).length > 0) {
              try {
                dashPlayer.extend(
                  "RequestModifier",
                  () => ({
                    modifyRequestURL: (url) => url,
                    modifyRequestHeader: (xhr) => {
                      Object.entries(requestHeaders).forEach(([name, value]) => {
                        try {
                          if (name && value != null) {
                            xhr.setRequestHeader(name, String(value));
                          }
                        } catch {
                          // Browsers may reject forbidden headers such as User-Agent.
                        }
                      });
                      return xhr;
                    },
                  }),
                  true
                );
              } catch {
                // Request modifiers are best effort across dash.js versions.
              }
            }

            const licenseUrl = String(
              drmRef.current?.licenseUrl || drmRef.current?.license_url || ""
            ).trim();

            if (licenseUrl) {
              try {
                const drmHeaders = Object.fromEntries(
                  Object.entries(
                    drmRef.current?.headers &&
                    typeof drmRef.current.headers === "object" &&
                    !Array.isArray(drmRef.current.headers)
                      ? drmRef.current.headers
                      : requestHeaders
                  ).filter(
                    ([name, value]) =>
                      Boolean(name && value != null) &&
                      !/^(?:user-agent|host|origin|referer|content-length|connection)$/i.test(
                        String(name)
                      )
                  )
                );

                dashPlayer.setProtectionData?.({
                  "com.widevine.alpha": {
                    serverURL: licenseUrl,
                    httpRequestHeaders: drmHeaders,
                  },
                });
              } catch {
                // If EME/Widevine is unavailable, dash.js will report playback failure normally.
              }
            }

            const events =
              dashjs.MediaPlayer.events || {};

            if (events.STREAM_INITIALIZED) {
              dashPlayer.on(
                events.STREAM_INITIALIZED,
                () => {
                  if (!cancelled) {
                    preferEnglishNativeAudio();
                    playAutomatically();
                  }
                }
              );
            }

            if (events.ERROR) {
              dashPlayer.on(
                events.ERROR,
                (event) => {
                  if (cancelled || reported) return;

                  const message =
                    event?.event?.message ||
                    event?.error?.message ||
                    event?.message ||
                    "MPEG-DASH playback failed.";

                  reportError(
                    new Error(String(message))
                  );
                }
              );
            }

            dashPlayer.initialize(
              video,
              source,
              false
            );
          } catch (error) {
            reportError(
              error instanceof Error
                ? error
                : new Error("MPEG-DASH playback failed.")
            );
          }
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
                sourceLabelRef.current
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

      const releasePlaybackResources =
        () => {
          if (released) {
            return;
          }

          released =
            true;

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

          window.removeEventListener(
            "mg:audio-rescue-request",
            onAudioRescueRequest
          );

          window.removeEventListener(
            "mg:hls-audio-track-selected",
            onHlsAudioSelection
          );
          window.removeEventListener("mg:manual-audio-track-selected", onManualAudioChoice);

          window.dispatchEvent(
            new CustomEvent("mg:hls-audio-tracks", {
              detail: {
                tracks: [],
                activeIndex: -1,
              },
            })
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

          if (dashPlayer) {
            try {
              dashPlayer.reset?.();
            } catch {
              // Ignore.
            }

            dashPlayer =
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

      /*
       * Only one decoder/network pipeline may own playback at a time. Claiming
       * this lease synchronously releases any older HLS, DASH, MPEG-TS or
       * native <video> pipeline before this source starts.
       */
      claimExclusivePlayback(
        playbackOwner,
        releasePlaybackResources,
        {
          element: video,
          poster,
        }
      );

      resetVideo();

      if (
        hlsSource
      ) {
        startHls();
      } else if (
        dashSource
      ) {
        startDash();
      } else if (
        tsSource ||
        flvSource
      ) {
        startMpegTs();
      } else {
        startNative();
      }

      return () => {
        releasePlaybackResources();
        releaseExclusivePlayback(
          playbackOwner
        );
      };
    }, [
      src,
      isLive,
      headersSignature,
      drmSignature,
    ]);

    const preferredExternalSubtitleIndex =
      choosePreferredExternalSubtitleIndex(
        preparedSubtitles,
        subtitlesEnabled,
        preferredSubtitleLanguage
      );

    return (
      <video
        ref={videoRef}
        data-mg-playback-surface="true"
        poster={poster}
        controls={controls}
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noremoteplayback"
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
