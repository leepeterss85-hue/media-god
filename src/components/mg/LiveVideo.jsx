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

const MPEGTS_CDN =
  "https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.min.js";

let mpegTsLoader =
  null;

const loadMpegTs = () => {
  if (
    typeof window ===
    "undefined"
  ) {
    return Promise.resolve(
      null
    );
  }

  if (
    window.mpegts
  ) {
    return Promise.resolve(
      window.mpegts
    );
  }

  if (
    mpegTsLoader
  ) {
    return mpegTsLoader;
  }

  mpegTsLoader =
    new Promise(
      (
        resolve
      ) => {
        const existing =
          document.querySelector(
            'script[data-mg-mpegts="true"]'
          );

        const finish =
          () =>
            resolve(
              window.mpegts ||
                null
            );

        if (
          existing
        ) {
          existing.addEventListener(
            "load",
            finish,
            {
              once:
                true,
            }
          );

          existing.addEventListener(
            "error",
            () =>
              resolve(
                null
              ),
            {
              once:
                true,
            }
          );

          window.setTimeout(
            finish,
            2500
          );

          return;
        }

        const script =
          document.createElement(
            "script"
          );

        script.src =
          MPEGTS_CDN;

        script.async =
          true;

        script.crossOrigin =
          "anonymous";

        script.dataset.mgMpegts =
          "true";

        script.onload =
          finish;

        script.onerror =
          () =>
            resolve(
              null
            );

        document.head.appendChild(
          script
        );
      }
    );

  return mpegTsLoader;
};

const isHlsUrl = (
  src,
  sourceLabel = ""
) =>
  /\.m3u8(?:[?#\s]|$)|\bhls\b/i.test(
    `${String(
      src || ""
    )} ${String(
      sourceLabel ||
        ""
    )}`
  );

const mpegTsType = (
  src,
  sourceLabel = ""
) => {
  const text =
    `${String(
      src || ""
    )} ${String(
      sourceLabel ||
        ""
    )}`.toLowerCase();

  if (
    /\.flv(?:[?#\s]|$)|\bflv\b/i.test(
      text
    )
  ) {
    return "flv";
  }

  if (
    /\.m2ts(?:[?#\s]|$)|\bm2ts\b/i.test(
      text
    )
  ) {
    return "m2ts";
  }

  return "mpegts";
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

const isEnglishLanguage = (
  value
) => {
  const language =
    normaliseLanguage(
      value
    );

  return (
    language ===
      "en" ||
    language ===
      "eng" ||
    language.startsWith(
      "en-"
    ) ||
    language ===
      "english" ||
    /\benglish\b/i.test(
      String(
        value || ""
      )
    )
  );
};

const hlsTrackText = (
  track
) =>
  [
    track?.lang,
    track?.name,
    track?.audioCodec,
    track?.attrs
      ?.LANGUAGE,
    track?.attrs?.NAME,
    track?.attrs
      ?.GROUP_ID,
  ]
    .filter(
      Boolean
    )
    .join(
      " "
    );

const audioDescriptor = (
  track,
  index,
  prefix
) => ({
  id:
    `${prefix}:${index}`,

  index,

  label:
    track?.name ||
    track?.label ||
    track?.attrs?.NAME ||
    track?.lang ||
    track?.language ||
    `Audio ${index + 1}`,

  language:
    track?.lang ||
    track?.language ||
    track?.attrs
      ?.LANGUAGE ||
    "",

  codec:
    track?.audioCodec ||
    "",
});

const subtitleDescriptor = (
  track,
  index,
  prefix
) => ({
  id:
    `${prefix}:${index}`,

  index,

  label:
    track?.name ||
    track?.label ||
    track?.attrs?.NAME ||
    track?.lang ||
    track?.language ||
    `Subtitle ${index + 1}`,

  language:
    track?.lang ||
    track?.language ||
    track?.attrs
      ?.LANGUAGE ||
    "",
});

const findEnglishTrackIndex = (
  tracks,
  type = "audio"
) => {
  let bestIndex =
    -1;

  let bestScore =
    -Infinity;

  (
    tracks || []
  ).forEach(
    (
      track,
      index
    ) => {
      const language =
        track?.lang ||
        track?.language ||
        track?.attrs
          ?.LANGUAGE ||
        track?.name ||
        track?.label ||
        "";

      const text =
        type ===
        "audio"
          ? hlsTrackText(
              track
            )
          : [
              track?.lang,
              track?.language,
              track?.name,
              track?.label,
              track?.attrs
                ?.LANGUAGE,
              track?.attrs
                ?.NAME,
            ]
              .filter(
                Boolean
              )
              .join(
                " "
              );

      if (
        !isEnglishLanguage(
          language
        ) &&
        !/\b(?:eng|english)\b/i.test(
          text
        )
      ) {
        return;
      }

      let score =
        10000;

      if (
        type ===
          "audio" &&
        /aac|mp4a/i.test(
          text
        )
      ) {
        score +=
          1200;
      }

      if (
        type ===
          "audio" &&
        /ac-?3|e-?ac-?3|eac3|ddp/i.test(
          text
        )
      ) {
        score +=
          500;
      }

      if (
        track?.default ||
        track?.attrs
          ?.DEFAULT ===
          "YES"
      ) {
        score +=
          100;
      }

      if (
        score >
        bestScore
      ) {
        bestScore =
          score;

        bestIndex =
          index;
      }
    }
  );

  return bestIndex;
};

const parseChoiceIndex = (
  choice,
  prefix
) => {
  const text =
    String(
      choice || ""
    );

  if (
    !text.startsWith(
      `${prefix}:`
    )
  ) {
    return -1;
  }

  const index =
    Number(
      text.slice(
        prefix.length +
          1
      )
    );

  return Number.isInteger(
    index
  )
    ? index
    : -1;
};

const chooseHlsLevel = (
  levels,
  preference
) => {
  const pref =
    String(
      preference ||
        "Auto"
    ).toLowerCase();

  if (
    pref === "auto"
  ) {
    return -1;
  }

  const target =
    pref === "4k" ||
    pref === "2160p"
      ? 2160
      : Number.parseInt(
          pref,
          10
        );

  if (
    !target ||
    !Array.isArray(
      levels
    ) ||
    levels.length ===
      0
  ) {
    return -1;
  }

  const candidates =
    levels
      .map(
        (
          level,
          index
        ) => ({
          index,

          height:
            Number(
              level?.height ||
                0
            ),

          bitrate:
            Number(
              level?.bitrate ||
                0
            ),
        })
      )
      .filter(
        (
          item
        ) =>
          item.height >
          0
      )
      .sort(
        (
          a,
          b
        ) =>
          a.height -
            b.height ||
          a.bitrate -
            b.bitrate
      );

  if (
    !candidates.length
  ) {
    return -1;
  }

  const atOrBelow =
    candidates.filter(
      (
        item
      ) =>
        item.height <=
        target
    );

  if (
    atOrBelow.length
  ) {
    return atOrBelow[
      atOrBelow.length -
        1
    ].index;
  }

  return candidates[0]
    .index;
};

const normaliseExternalSubtitles = (
  items
) =>
  (
    Array.isArray(
      items
    )
      ? items
      : []
  )
    .map(
      (
        item,
        index
      ) => ({
        src:
          String(
            item?.src ||
              item?.url ||
              item?.file ||
              ""
          ).trim(),

        label:
          item?.label ||
          item?.name ||
          item?.language ||
          item?.lang ||
          `Subtitle ${index + 1}`,

        lang:
          item?.lang ||
          item?.language ||
          "",

        kind:
          item?.kind ||
          "subtitles",

        default:
          Boolean(
            item?.default
          ),
      })
    )
    .filter(
      (
        item
      ) =>
        /^https?:\/\//i.test(
          item.src
        )
    );

const LiveVideo =
  forwardRef(
    function LiveVideo(
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
        onNoAudio,
        controls = true,
        qualityPreference = "Auto",
        audioTrackPreference = "english",
        subtitleTrackPreference = "english",
        externalSubtitles = [],
        onAudioTracksChanged,
        onSubtitleTracksChanged,
        onActiveAudioTrackChanged,
        onActiveSubtitleTrackChanged,
        onQualityLevelsChanged,
      },
      ref
    ) {
      const videoRef =
        useRef(
          null
        );

      const hlsRef =
        useRef(
          null
        );

      const mpegPlayerRef =
        useRef(
          null
        );

      const callbacksRef =
        useRef(
          {}
        );

      const preferenceRef =
        useRef({
          qualityPreference,
          audioTrackPreference,
          subtitleTrackPreference,
        });

      const safeExternalSubtitles =
        normaliseExternalSubtitles(
          externalSubtitles
        );

      callbacksRef.current =
        {
          onError,
          onNoAudio,
          onAudioTracksChanged,
          onSubtitleTracksChanged,
          onActiveAudioTrackChanged,
          onActiveSubtitleTrackChanged,
          onQualityLevelsChanged,
        };

      preferenceRef.current =
        {
          qualityPreference,
          audioTrackPreference,
          subtitleTrackPreference,
        };

      useImperativeHandle(
        ref,
        () =>
          videoRef.current
      );

      const publishNativeTracks =
        () => {
          const video =
            videoRef.current;

          if (
            !video
          ) {
            return;
          }

          const audioTracks =
            [];

          const nativeAudio =
            video.audioTracks;

          if (
            nativeAudio &&
            typeof nativeAudio.length ===
              "number"
          ) {
            for (
              let index =
                0;
              index <
              nativeAudio.length;
              index +=
                1
            ) {
              audioTracks.push(
                audioDescriptor(
                  nativeAudio[
                    index
                  ],
                  index,
                  "native"
                )
              );
            }
          }

          if (
            audioTracks.length >
              0 ||
            !hlsRef.current
          ) {
            callbacksRef.current.onAudioTracksChanged?.(
              audioTracks
            );
          }

          const subtitleTracks =
            [];

          const nativeText =
            video.textTracks;

          if (
            nativeText &&
            typeof nativeText.length ===
              "number"
          ) {
            for (
              let index =
                0;
              index <
              nativeText.length;
              index +=
                1
            ) {
              subtitleTracks.push(
                subtitleDescriptor(
                  nativeText[
                    index
                  ],
                  index,
                  "native"
                )
              );
            }
          }

          if (
            subtitleTracks.length >
              0 ||
            !hlsRef.current
          ) {
            callbacksRef.current.onSubtitleTracksChanged?.(
              subtitleTracks
            );
          }
        };

      const applyAudioPreference =
        () => {
          const video =
            videoRef.current;

          if (
            !video
          ) {
            return;
          }

          const choice =
            preferenceRef
              .current
              .audioTrackPreference ||
            "english";

          const hls =
            hlsRef.current;

          if (
            hls &&
            Array.isArray(
              hls.audioTracks
            ) &&
            hls.audioTracks
              .length
          ) {
            let index =
              parseChoiceIndex(
                choice,
                "hls"
              );

            if (
              index <
                0 &&
              choice ===
                "english"
            ) {
              index =
                findEnglishTrackIndex(
                  hls.audioTracks,
                  "audio"
                );
            }

            if (
              index < 0
            ) {
              index =
                hls.audioTracks.findIndex(
                  (
                    track
                  ) =>
                    /aac|mp4a/i.test(
                      hlsTrackText(
                        track
                      )
                    )
                );
            }

            if (
              index < 0
            ) {
              index =
                0;
            }

            if (
              index >=
                0 &&
              index <
                hls
                  .audioTracks
                  .length
            ) {
              try {
                hls.audioTrack =
                  index;

                callbacksRef.current.onActiveAudioTrackChanged?.(
                  audioDescriptor(
                    hls.audioTracks[
                      index
                    ],
                    index,
                    "hls"
                  )
                );
              } catch {
                // Optional WebView/HLS track switching.
              }
            }

            return;
          }

          const tracks =
            video.audioTracks;

          if (
            !tracks ||
            typeof tracks.length !==
              "number" ||
            tracks.length ===
              0
          ) {
            return;
          }

          let index =
            parseChoiceIndex(
              choice,
              "native"
            );

          if (
            index < 0 &&
            choice ===
              "english"
          ) {
            index =
              findEnglishTrackIndex(
                Array.from(
                  tracks
                ),
                "audio"
              );
          }

          if (
            index < 0
          ) {
            index = 0;
          }

          for (
            let current =
              0;
            current <
            tracks.length;
            current +=
              1
          ) {
            try {
              tracks[
                current
              ].enabled =
                current ===
                index;
            } catch {
              // Some Chromium builds expose audioTracks as read-only.
            }
          }

          if (
            tracks[
              index
            ]
          ) {
            callbacksRef.current.onActiveAudioTrackChanged?.(
              audioDescriptor(
                tracks[
                  index
                ],
                index,
                "native"
              )
            );
          }
        };

      const applySubtitlePreference =
        () => {
          const video =
            videoRef.current;

          if (
            !video
          ) {
            return;
          }

          const choice =
            preferenceRef
              .current
              .subtitleTrackPreference ||
            "off";

          const hls =
            hlsRef.current;

          let hlsHandled =
            false;

          if (
            hls &&
            Array.isArray(
              hls.subtitleTracks
            )
          ) {
            let index =
              -1;

            if (
              choice.startsWith(
                "hls:"
              )
            ) {
              index =
                parseChoiceIndex(
                  choice,
                  "hls"
                );
            } else if (
              choice ===
              "english"
            ) {
              index =
                findEnglishTrackIndex(
                  hls.subtitleTracks,
                  "subtitle"
                );
            }

            try {
              hls.subtitleTrack =
                index;
            } catch {
              // Optional.
            }

            if (
              index >=
                0 &&
              index <
                hls
                  .subtitleTracks
                  .length
            ) {
              hlsHandled =
                true;

              callbacksRef.current.onActiveSubtitleTrackChanged?.(
                subtitleDescriptor(
                  hls.subtitleTracks[
                    index
                  ],
                  index,
                  "hls"
                )
              );
            } else if (
              choice ===
              "off"
            ) {
              hlsHandled =
                true;

              callbacksRef.current.onActiveSubtitleTrackChanged?.(
                null
              );
            }
          }

          /*
           * When HLS has already selected an
           * HLS subtitle track, do not disable
           * the browser textTracks afterwards.
           *
           * Hls.js renders those tracks through
           * the same HTMLMediaElement text-track
           * interface.
           */
          if (
            hlsHandled &&
            !choice.startsWith(
              "native:"
            )
          ) {
            return;
          }

          const tracks =
            video.textTracks;

          if (
            !tracks ||
            typeof tracks.length !==
              "number"
          ) {
            return;
          }

          let nativeIndex =
            -1;

          if (
            choice !==
            "off"
          ) {
            nativeIndex =
              parseChoiceIndex(
                choice,
                "native"
              );

            if (
              nativeIndex <
                0 &&
              choice ===
                "english"
            ) {
              nativeIndex =
                findEnglishTrackIndex(
                  Array.from(
                    tracks
                  ),
                  "subtitle"
                );
            }
          }

          for (
            let current =
              0;
            current <
            tracks.length;
            current +=
              1
          ) {
            try {
              tracks[
                current
              ].mode =
                current ===
                nativeIndex
                  ? "showing"
                  : "disabled";
            } catch {
              // Optional.
            }
          }

          callbacksRef.current.onActiveSubtitleTrackChanged?.(
            nativeIndex >=
                0 &&
              tracks[
                nativeIndex
              ]
              ? subtitleDescriptor(
                  tracks[
                    nativeIndex
                  ],
                  nativeIndex,
                  "native"
                )
              : null
          );
        };

      const applyQualityPreference =
        () => {
          const hls =
            hlsRef.current;

          if (
            !hls
          ) {
            return;
          }

          const level =
            chooseHlsLevel(
              hls.levels ||
                [],
              preferenceRef
                .current
                .qualityPreference
            );

          try {
            if (
              level < 0
            ) {
              hls.autoLevelCapping =
                -1;

              hls.currentLevel =
                -1;

              hls.nextLevel =
                -1;
            } else {
              hls.autoLevelCapping =
                level;

              hls.currentLevel =
                level;

              hls.nextLevel =
                level;
            }
          } catch {
            // HLS quality switching is optional.
          }
        };

      useEffect(
        () => {
          applyAudioPreference();
        },
        [
          audioTrackPreference,
        ]
      );

      useEffect(
        () => {
          applySubtitlePreference();
        },
        [
          subtitleTrackPreference,
        ]
      );

      useEffect(
        () => {
          applyQualityPreference();
        },
        [
          qualityPreference,
        ]
      );

      useEffect(
        () => {
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

          let reported =
            false;

          let nativeFallbackUsed =
            false;

          let hlsMediaRecovery =
            0;

          let hlsNetworkRecovery =
            0;

          let nativeTrackTimer =
            null;

          let audioHealthTimer =
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

          const reportError =
            (
              error
            ) => {
              if (
                cancelled ||
                reported
              ) {
                return;
              }

              reported =
                true;

              callbacksRef.current.onError?.(
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
            };

          const publishAndApplyTracks =
            () => {
              publishNativeTracks();
              applyAudioPreference();
              applySubtitlePreference();

              if (
                nativeTrackTimer
              ) {
                window.clearTimeout(
                  nativeTrackTimer
                );
              }

              nativeTrackTimer =
                window.setTimeout(
                  () => {
                    publishNativeTracks();
                    applyAudioPreference();
                    applySubtitlePreference();
                  },
                  800
                );
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

              publishAndApplyTracks();

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

          const onNativeTracks =
            () =>
              publishAndApplyTracks();

          video.addEventListener(
            "error",
            onNativeError
          );

          video.addEventListener(
            "loadedmetadata",
            onNativeTracks
          );

          video.addEventListener(
            "canplay",
            onNativeTracks
          );

          /*
           * Strong no-audio signal only.
           *
           * Chromium/Fire TV exposes
           * webkitAudioDecodedByteCount on many
           * builds.
           *
           * If video has progressed for 12
           * seconds, sound is not muted, and
           * zero audio bytes have been decoded,
           * ask Media God to fail over to the
           * next ranked source.
           */
          audioHealthTimer =
            window.setInterval(
              () => {
                if (
                  cancelled ||
                  video.paused ||
                  video.muted ||
                  video.volume ===
                    0
                ) {
                  return;
                }

                if (
                  (
                    video.currentTime ||
                    0
                  ) <
                    12 ||
                  video.readyState <
                    3
                ) {
                  return;
                }

                if (
                  !(
                    "webkitAudioDecodedByteCount" in
                    video
                  )
                ) {
                  return;
                }

                const decoded =
                  Number(
                    video.webkitAudioDecodedByteCount ||
                      0
                  );

                if (
                  decoded >
                  0
                ) {
                  window.clearInterval(
                    audioHealthTimer
                  );

                  audioHealthTimer =
                    null;

                  return;
                }

                window.clearInterval(
                  audioHealthTimer
                );

                audioHealthTimer =
                  null;

                callbacksRef.current.onNoAudio?.(
                  new Error(
                    "Video is playing but this device decoded no audio."
                  )
                );
              },
              3000
            );

          const startHls =
            () => {
              if (
                Hls.isSupported()
              ) {
                const hls =
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
                      90,

                    /*
                     * DO NOT cap to CSS player
                     * size.
                     *
                     * Fire Stick 4K / 4K Max
                     * devices can expose a
                     * 1920x1080 WebView while
                     * decoding/outputting 2160p.
                     */
                    capLevelToPlayerSize:
                      false,

                    startLevel:
                      -1,
                  });

                hlsRef.current =
                  hls;

                const publishHlsTracks =
                  () => {
                    const audio =
                      (
                        hls.audioTracks ||
                        []
                      ).map(
                        (
                          track,
                          index
                        ) =>
                          audioDescriptor(
                            track,
                            index,
                            "hls"
                          )
                      );

                    const subtitles =
                      (
                        hls.subtitleTracks ||
                        []
                      ).map(
                        (
                          track,
                          index
                        ) =>
                          subtitleDescriptor(
                            track,
                            index,
                            "hls"
                          )
                      );

                    const levels =
                      (
                        hls.levels ||
                        []
                      ).map(
                        (
                          level,
                          index
                        ) => ({
                          id:
                            `hls-level:${index}`,

                          index,

                          width:
                            Number(
                              level?.width ||
                                0
                            ),

                          height:
                            Number(
                              level?.height ||
                                0
                            ),

                          bitrate:
                            Number(
                              level?.bitrate ||
                                0
                            ),

                          label:
                            Number(
                              level?.height ||
                                0
                            ) >=
                            2160
                              ? "4K"
                              : level?.height
                                ? `${level.height}p`
                                : `Level ${index + 1}`,
                        })
                      );

                    callbacksRef.current.onAudioTracksChanged?.(
                      audio
                    );

                    callbacksRef.current.onSubtitleTracksChanged?.(
                      subtitles
                    );

                    callbacksRef.current.onQualityLevelsChanged?.(
                      levels
                    );

                    applyAudioPreference();
                    applySubtitlePreference();
                    applyQualityPreference();
                  };

                hls.on(
                  Hls.Events
                    .ERROR,
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
                      // Fall through to source failover.
                    }

                    reportError(
                      new Error(
                        data?.details ||
                          "HLS playback failed."
                      )
                    );
                  }
                );

                hls.on(
                  Hls.Events
                    .MANIFEST_PARSED,
                  () => {
                    publishHlsTracks();
                    publishAndApplyTracks();
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
                    publishHlsTracks
                  );
                }

                if (
                  Hls.Events
                    .SUBTITLE_TRACKS_UPDATED
                ) {
                  hls.on(
                    Hls.Events
                      .SUBTITLE_TRACKS_UPDATED,
                    publishHlsTracks
                  );
                }

                if (
                  Hls.Events
                    .LEVELS_UPDATED
                ) {
                  hls.on(
                    Hls.Events
                      .LEVELS_UPDATED,
                    publishHlsTracks
                  );
                }

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

                const player =
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

                mpegPlayerRef.current =
                  player;

                if (
                  mpegts.Events
                    ?.ERROR
                ) {
                  player.on(
                    mpegts
                      .Events
                      .ERROR,
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
                        player?.destroy?.();
                      } catch {
                        // Ignore.
                      }

                      mpegPlayerRef.current =
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

                player.attachMediaElement(
                  video
                );

                player.load();

                publishAndApplyTracks();

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
              onNativeTracks
            );

            video.removeEventListener(
              "canplay",
              onNativeTracks
            );

            if (
              nativeTrackTimer
            ) {
              window.clearTimeout(
                nativeTrackTimer
              );
            }

            if (
              audioHealthTimer
            ) {
              window.clearInterval(
                audioHealthTimer
              );
            }

            if (
              hlsRef.current
            ) {
              try {
                hlsRef.current.destroy();
              } catch {
                // Ignore.
              }

              hlsRef.current =
                null;
            }

            if (
              mpegPlayerRef.current
            ) {
              try {
                mpegPlayerRef.current.pause?.();

                mpegPlayerRef.current.unload?.();

                mpegPlayerRef.current.detachMediaElement?.();

                mpegPlayerRef.current.destroy?.();
              } catch {
                // Ignore.
              }

              mpegPlayerRef.current =
                null;
            }

            callbacksRef.current.onAudioTracksChanged?.(
              []
            );

            callbacksRef.current.onSubtitleTracksChanged?.(
              []
            );

            callbacksRef.current.onQualityLevelsChanged?.(
              []
            );

            resetVideo();
          };
        },
        [
          src,
          sourceLabel,
          isLive,
        ]
      );

      return (
        <video
          ref={
            videoRef
          }
          poster={
            poster
          }
          controls={
            controls
          }
          playsInline
          preload="auto"
          className={
            className
          }
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
          {safeExternalSubtitles.map(
            (
              track,
              index
            ) => (
              <track
                key={`${track.src}-${index}`}
                kind={
                  track.kind
                }
                src={
                  track.src
                }
                srcLang={
                  track.lang ||
                  "en"
                }
                label={
                  track.label
                }
                default={
                  track.default
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
