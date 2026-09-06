import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  X,
  Copy,
  Check,
  ExternalLink,
  Link,
  Download,
  Tv,
  Loader2,
  Zap,
  RefreshCw,
  Film,
  Maximize,
  Minimize,
  Volume2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";
import PlayerControls from "@/components/mg/PlayerControls";
import {
  describeSourceCompatibility,
  getPlaybackDeviceProfile,
  hasSevereAudioRisk,
  orderSourcesForPlayback,
} from "@/components/mg/mediaCompatibility";

const VIDEO_RE =
  /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

const isMagnet = (value) =>
  String(value || "")
    .toLowerCase()
    .startsWith("magnet:");

const currentFilePath = (files) =>
  (
    files?.find((file) => file.selected) ||
    files?.[0] ||
    {}
  ).path || "";

const getSourceUrl = (item) =>
  item?.src ||
  item?.url ||
  item?.magnet ||
  item?.magnetLink ||
  "";

const DEFAULT_PLAYBACK_PREFERENCES = {
  quality: "Auto",
  subs: true,
  audioLanguage: "en",
};

const ASPECT_OPTIONS = [
  { value: "auto", label: "Auto", ratio: "16 / 9" },
  { value: "16:9", label: "16:9", ratio: "16 / 9" },
  { value: "4:3", label: "4:3", ratio: "4 / 3" },
  { value: "21:9", label: "21:9", ratio: "21 / 9" },
  { value: "fill", label: "Fill", ratio: "16 / 9" },
];

const normaliseTrackLanguage = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

const languageMatches = (left, right) => {
  const a = normaliseTrackLanguage(left);
  const b = normaliseTrackLanguage(right);

  if (!a || !b) return false;
  if (a === b) return true;

  const aPrimary = a.split("-")[0];
  const bPrimary = b.split("-")[0];

  if (aPrimary === bPrimary) return true;

  return (
    (aPrimary === "en" && bPrimary === "eng") ||
    (aPrimary === "eng" && bPrimary === "en")
  );
};

const normaliseSubtitleItems = (...groups) => {
  const seen = new Set();

  return groups
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          src: item,
          label: `Subtitle ${index + 1}`,
          lang: "",
          kind: "subtitles",
        };
      }

      return {
        src: item?.src || item?.url || item?.file || "",
        label:
          item?.label ||
          item?.name ||
          item?.language ||
          item?.lang ||
          `Subtitle ${index + 1}`,
        lang: item?.lang || item?.language || "",
        kind: item?.kind || item?.type || "subtitles",
        default: Boolean(item?.default),
      };
    })
    .filter((item) => {
      const src = String(item?.src || "").trim();
      const kind = String(item?.kind || "").toLowerCase();

      if (!/^https?:\/\//i.test(src)) return false;
      if (kind && !/(sub|caption|text|vtt|srt)/i.test(kind)) {
        return false;
      }
      if (seen.has(src)) return false;

      seen.add(src);
      return true;
    });
};

export default function VideoPlayer({
  source,
  onClose,
}) {
  const [
    playbackPreferences,
    setPlaybackPreferences,
  ] = useState(
    DEFAULT_PLAYBACK_PREFERENCES
  );

  const [
    sessionQuality,
    setSessionQuality,
  ] = useState("Auto");

  const deviceProfile =
    useMemo(
      () =>
        getPlaybackDeviceProfile(),
      []
    );

  useEffect(() => {
    let mounted = true;

    base44.auth
      .me()
      .then((user) => {
        if (!mounted) return;

        const preferences =
          user?.preferences ||
          {};

        const next = {
          quality:
            preferences.quality ||
            DEFAULT_PLAYBACK_PREFERENCES.quality,

          subs:
            preferences.subs ??
            DEFAULT_PLAYBACK_PREFERENCES.subs,

          audioLanguage:
            preferences.audioLanguage ||
            DEFAULT_PLAYBACK_PREFERENCES.audioLanguage,
        };

        setPlaybackPreferences(
          next
        );

        setSessionQuality(
          next.quality
        );
      })
      .catch(() => {
        if (!mounted) return;

        setPlaybackPreferences(
          DEFAULT_PLAYBACK_PREFERENCES
        );

        setSessionQuality(
          DEFAULT_PLAYBACK_PREFERENCES.quality
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  const sources =
    useMemo(() => {
      const rawSources =
        source?.sources &&
        source.sources.length >
          0
          ? source.sources
          : [
              {
                label:
                  source?.label ||
                  (
                    source?.type ===
                    "live"
                      ? "LIVE"
                      : "Stream"
                  ),

                type:
                  source?.type ||
                  "rd",

                src:
                  getSourceUrl(
                    source
                  ),

                magnet:
                  source?.magnet ||
                  source?.magnetLink ||
                  source?.src ||
                  source?.url,

                live:
                  source?.type ===
                  "live",
              },
            ];

      return orderSourcesForPlayback(
        rawSources,
        {
          qualityPreference:
            playbackPreferences.quality,

          deviceProfile,
        }
      );
    }, [
      source,
      playbackPreferences.quality,
      deviceProfile,
    ]);

  const [
    activeIdx,
    setActiveIdx,
  ] = useState(0);

  const [
    copied,
    setCopied,
  ] = useState(false);

  const [
    rdResolving,
    setRdResolving,
  ] = useState(false);

  const [
    rdPolling,
    setRdPolling,
  ] = useState(false);

  const [
    rdError,
    setRdError,
  ] = useState("");

  const [
    rdOverride,
    setRdOverride,
  ] = useState(null);

  const [
    rdFiles,
    setRdFiles,
  ] = useState([]);

  const [
    rdTorrentId,
    setRdTorrentId,
  ] = useState(null);

  const [
    fileSwitching,
    setFileSwitching,
  ] = useState(false);

  const [
    viewportFullscreen,
    setViewportFullscreen,
  ] = useState(false);

  const [
    aspectRatioChoice,
    setAspectRatioChoice,
  ] = useState("auto");

  const [
    failedSources,
    setFailedSources,
  ] = useState(
    () => new Set()
  );

  const [
    audioTracks,
    setAudioTracks,
  ] = useState([]);

  const [
    subtitleTracks,
    setSubtitleTracks,
  ] = useState([]);

  const [
    qualityLevels,
    setQualityLevels,
  ] = useState([]);

  const [
    audioTrackChoice,
    setAudioTrackChoice,
  ] = useState(
    "english"
  );

  const [
    subtitleTrackChoice,
    setSubtitleTrackChoice,
  ] = useState(
    "english"
  );

  const [
    activeAudioTrack,
    setActiveAudioTrack,
  ] = useState(null);

  const [
    activeSubtitleTrack,
    setActiveSubtitleTrack,
  ] = useState(null);

  const failedSourcesRef =
    useRef(
      new Set()
    );

  const videoRef =
    useRef(null);

  const liveVideoRef =
    useRef(null);

  const stageRef =
    useRef(null);

  const pollRef =
    useRef(null);

  useEffect(() => {
    setActiveIdx(0);
  }, [
    source?.title,
    source?.id,
    source?.rdSeason,
    source?.rdEpisode,
    source?.season,
    source?.episode,
  ]);

  useEffect(() => {
    setAudioTracks([]);
    setSubtitleTracks([]);
    setQualityLevels([]);

    setActiveAudioTrack(
      null
    );

    setActiveSubtitleTrack(
      null
    );

    setAudioTrackChoice(
      "english"
    );

    setSubtitleTrackChoice(
      playbackPreferences.subs
        ? "english"
        : "off"
    );
  }, [
    activeIdx,
    rdOverride?.src,
    playbackPreferences.subs,
  ]);

  useEffect(() => {
    const handleSubtitleSelection =
      (event) => {
        const index =
          Number(
            event?.detail
              ?.index
          );

        if (
          !Number.isInteger(
            index
          ) ||
          index < 0
        ) {
          setSubtitleTrackChoice(
            "off"
          );

          setActiveSubtitleTrack(
            null
          );

          return;
        }

        const language =
          event?.detail
            ?.language ||
          "";

        const matched =
          subtitleTracks.find(
            (track) =>
              Number(
                track?.index
              ) ===
                index &&
              (
                !language ||
                languageMatches(
                  track?.language,
                  language
                )
              )
          ) ||
          (
            language
              ? subtitleTracks.find(
                  (
                    track
                  ) =>
                    languageMatches(
                      track
                        ?.language,
                      language
                    )
                )
              : null
          ) ||
          subtitleTracks.find(
            (track) =>
              Number(
                track?.index
              ) ===
              index
          ) ||
          null;

        setSubtitleTrackChoice(
          matched?.id ||
            `native:${index}`
        );

        if (matched) {
          setActiveSubtitleTrack(
            matched
          );
        }
      };

    window.addEventListener(
      "mg:subtitle-track-selected",
      handleSubtitleSelection
    );

    return () => {
      window.removeEventListener(
        "mg:subtitle-track-selected",
        handleSubtitleSelection
      );
    };
  }, [
    subtitleTracks,
  ]);

  const active =
    sources[
      activeIdx
    ] ||
    sources[0] ||
    {};

  const activeUrl =
    getSourceUrl(
      active
    );

  const activeCompatibility =
    describeSourceCompatibility(
      active,
      rdOverride?.file ||
        rdOverride?.label ||
        ""
    );

  const activeAudioRisk =
    hasSevereAudioRisk(
      active,
      rdOverride?.file ||
        rdOverride?.label ||
        ""
    );

  const externalSubtitles =
    useMemo(
      () =>
        normaliseSubtitleItems(
          rdOverride?.subtitles,
          rdOverride?.captions,
          active?.subtitles,
          active?.captions,
          active?.tracks,
          source?.subtitles,
          source?.captions
        ),
      [
        rdOverride?.subtitles,
        rdOverride?.captions,
        active?.subtitles,
        active?.captions,
        active?.tracks,
        source?.subtitles,
        source?.captions,
      ]
    );

  const markSourceFailed =
    (index) => {
      failedSourcesRef.current.add(
        index
      );

      setFailedSources(
        new Set(
          failedSourcesRef.current
        )
      );
    };

  const clearSourceFailed =
    (index) => {
      if (
        !failedSourcesRef.current.has(
          index
        )
      ) {
        return;
      }

      failedSourcesRef.current.delete(
        index
      );

      setFailedSources(
        new Set(
          failedSourcesRef.current
        )
      );
    };

  const findNextPlayableSource =
    (
      fromIndex
    ) => {
      for (
        let offset = 1;
        offset <=
        sources.length;
        offset += 1
      ) {
        const index =
          (
            fromIndex +
            offset
          ) %
          sources.length;

        if (
          failedSourcesRef.current.has(
            index
          )
        ) {
          continue;
        }

        const candidate =
          sources[
            index
          ];

        const url =
          getSourceUrl(
            candidate
          );

        const torrent =
          candidate?.type ===
            "rd" ||
          candidate?.type ===
            "rd_torrent" ||
          candidate?.type ===
            "torrent" ||
          candidate?.type ===
            "magnet" ||
          isMagnet(
            url
          );

        if (
          url ||
          torrent
        ) {
          return index;
        }
      }

      return -1;
    };

  const tryNextSource =
    (
      message =
        "This source could not be played."
    ) => {
      markSourceFailed(
        activeIdx
      );

      const nextIndex =
        findNextPlayableSource(
          activeIdx
        );

      if (
        nextIndex ===
        -1
      ) {
        setRdResolving(
          false
        );

        setRdPolling(
          false
        );

        setRdTorrentId(
          null
        );

        setRdError(
          `${message} No other playable source is available.`
        );

        return false;
      }

      setRdOverride(
        null
      );

      setRdFiles(
        []
      );

      setRdTorrentId(
        null
      );

      setRdError(
        ""
      );

      setRdResolving(
        false
      );

      setRdPolling(
        false
      );

      setActiveIdx(
        nextIndex
      );

      return true;
    };

  const handleNoAudio =
    () => {
      if (
        sources.length >
        1
      ) {
        tryNextSource(
          "Media God detected video playback with no decoded audio and switched source."
        );

        return;
      }

      setRdError(
        "Video is playing, but this device did not decode audio from this source."
      );
    };

  const selectSource =
    (index) => {
      const nextIndex =
        Number(
          index
        );

      if (
        Number.isNaN(
          nextIndex
        ) ||
        nextIndex < 0 ||
        nextIndex >=
          sources.length
      ) {
        return;
      }

      clearSourceFailed(
        nextIndex
      );

      setRdOverride(
        null
      );

      setRdFiles(
        []
      );

      setRdTorrentId(
        null
      );

      setRdError(
        ""
      );

      setRdResolving(
        false
      );

      setRdPolling(
        false
      );

      setActiveIdx(
        nextIndex
      );
    };

  const sourceTypeLabel =
    (item) => {
      const type =
        String(
          item?.type ||
            ""
        ).toLowerCase();

      if (
        type ===
          "rd" ||
        type ===
          "rd_torrent"
      ) {
        return "Real-Debrid";
      }

      if (
        type ===
          "magnet" ||
        type ===
          "torrent"
      ) {
        return "Torrent / Magnet";
      }

      if (
        type ===
        "live"
      ) {
        return "Live";
      }

      if (
        type ===
        "youtube"
      ) {
        return "Trailer";
      }

      if (
        type ===
        "provider"
      ) {
        return "Provider";
      }

      if (
        type ===
        "file"
      ) {
        return "File";
      }

      if (
        type ===
        "url"
      ) {
        return "Direct";
      }

      return "Source";
    };

  const isLive =
    source?.type ===
      "live" ||
    active?.live ||
    active?.type ===
      "live";

  const isYoutube =
    active?.type ===
    "youtube";

  const isProvider =
    active?.type ===
    "provider";

  const isDirectFile =
    active?.type ===
      "file" ||
    active?.type ===
      "url" ||
    active?.type ===
      "live";

  const isRdSource =
    active?.type ===
      "rd" ||
    active?.type ===
      "rd_torrent" ||
    active?.type ===
      "magnet" ||
    isMagnet(
      activeUrl
    );

  const goFullscreen =
    () => {
      setViewportFullscreen(
        (
          current
        ) =>
          !current
      );
    };

  useEffect(() => {
    setRdOverride(
      null
    );

    setRdError(
      ""
    );

    setRdFiles(
      []
    );

    setRdTorrentId(
      null
    );

    if (
      pollRef.current
    ) {
      clearTimeout(
        pollRef.current
      );

      pollRef.current =
        null;
    }
  }, [
    activeIdx,
  ]);

  useEffect(() => {
    if (!active) {
      return;
    }

    if (
      isYoutube ||
      isProvider ||
      isDirectFile ||
      isLive
    ) {
      return;
    }

    if (
      !isRdSource
    ) {
      return;
    }

    let cancelled =
      false;

    setRdResolving(
      true
    );

    setRdPolling(
      false
    );

    setRdError(
      ""
    );

    setRdOverride(
      null
    );

    setRdTorrentId(
      null
    );

    const run =
      async () => {
        try {
          const magnet =
            active?.magnet ||
            active?.magnetLink ||
            active?.src ||
            active?.url ||
            "";

          if (
            !magnet
          ) {
            throw new Error(
              "This source did not provide a playable link."
            );
          }

          if (
            String(
              magnet
            )
              .toLowerCase()
              .startsWith(
                "http://"
              ) ||
            String(
              magnet
            )
              .toLowerCase()
              .startsWith(
                "https://"
              )
          ) {
            if (
              !cancelled
            ) {
              setRdOverride({
                src:
                  magnet,

                label:
                  active?.label ||
                  "Stream",

                file:
                  "",
              });

              setRdResolving(
                false
              );
            }

            return;
          }

          const res =
            await base44.functions.invoke(
              "realDebrid",
              {
                action:
                  "resolve_best",

                magnet,

                title:
                  source?.rdTitle ||
                  source?.title ||
                  "",

                ...(source
                  ?.rdYear !=
                null
                  ? {
                      year:
                        source.rdYear,
                    }
                  : {}),

                ...(source
                  ?.rdSeason !=
                null
                  ? {
                      season:
                        source.rdSeason,
                    }
                  : {}),

                ...(source
                  ?.rdEpisode !=
                null
                  ? {
                      episode:
                        source.rdEpisode,
                    }
                  : {}),
              }
            );

          if (
            cancelled
          ) {
            return;
          }

          const data =
            res?.data ||
            {};

          if (
            data.status ===
              "ready" &&
            data.stream_url
          ) {
            setRdOverride({
              src:
                data.stream_url,

              label:
                data.filename ||
                active?.label ||
                "Real-Debrid Stream",

              file:
                currentFilePath(
                  data.files
                ),

              subtitles:
                data.subtitles ||
                [],

              captions:
                data.captions ||
                [],
            });

            setRdFiles(
              data.files ||
                []
            );

            setRdResolving(
              false
            );

            return;
          }

          if (
            data.torrent_id
          ) {
            setRdTorrentId(
              String(
                data.torrent_id
              )
            );

            setRdResolving(
              false
            );

            return;
          }

          throw new Error(
            data.error ||
              "Real-Debrid could not resolve this source."
          );
        } catch (
          error
        ) {
          if (
            !cancelled
          ) {
            tryNextSource(
              error?.message ||
                "Unable to resolve this stream."
            );
          }
        }
      };

    run();

    return () => {
      cancelled =
        true;

      if (
        pollRef.current
      ) {
        clearTimeout(
          pollRef.current
        );

        pollRef.current =
          null;
      }
    };
  }, [
    activeIdx,
    active,
    activeUrl,
    source,
    isYoutube,
    isProvider,
    isDirectFile,
    isLive,
    isRdSource,
  ]);

  useEffect(() => {
    if (
      !rdTorrentId ||
      rdOverride
    ) {
      return;
    }

    let cancelled =
      false;

    let attempts =
      0;

    setRdPolling(
      true
    );

    const tick =
      async () => {
        if (
          cancelled
        ) {
          return;
        }

        attempts +=
          1;

        try {
          const res =
            await base44.functions.invoke(
              "realDebrid",
              {
                action:
                  "torrent_info",

                torrent_id:
                  rdTorrentId,

                title:
                  source?.rdTitle ||
                  source?.title ||
                  "",

                ...(source
                  ?.rdYear !=
                null
                  ? {
                      year:
                        source.rdYear,
                    }
                  : {}),

                ...(source
                  ?.rdSeason !=
                null
                  ? {
                      season:
                        source.rdSeason,
                    }
                  : {}),

                ...(source
                  ?.rdEpisode !=
                null
                  ? {
                      episode:
                        source.rdEpisode,
                    }
                  : {}),
              }
            );

          if (
            cancelled
          ) {
            return;
          }

          const data =
            res?.data ||
            {};

          if (
            data.status ===
              "ready" &&
            data.stream_url
          ) {
            setRdOverride({
              src:
                data.stream_url,

              label:
                data.filename ||
                "Real-Debrid Stream",

              file:
                currentFilePath(
                  data.files
                ),

              subtitles:
                data.subtitles ||
                [],

              captions:
                data.captions ||
                [],
            });

            setRdFiles(
              data.files ||
                []
            );

            setRdPolling(
              false
            );

            setRdTorrentId(
              null
            );

            return;
          }

          if (
            data.error
          ) {
            setRdError(
              data.error
            );

            setRdPolling(
              false
            );

            setRdTorrentId(
              null
            );

            return;
          }
        } catch (
          error
        ) {
          if (
            !cancelled
          ) {
            setRdError(
              error?.message ||
                "Real-Debrid polling failed."
            );

            setRdPolling(
              false
            );

            setRdTorrentId(
              null
            );
          }

          return;
        }

        if (
          attempts <
          36
        ) {
          pollRef.current =
            setTimeout(
              tick,
              5000
            );
        } else {
          setRdPolling(
            false
          );

          setRdTorrentId(
            null
          );

          setRdError(
            "Real-Debrid is still preparing this file."
          );
        }
      };

    pollRef.current =
      setTimeout(
        tick,
        2500
      );

    return () => {
      cancelled =
        true;

      if (
        pollRef.current
      ) {
        clearTimeout(
          pollRef.current
        );

        pollRef.current =
          null;
      }
    };
  }, [
    rdTorrentId,
    rdOverride,
    source,
  ]);

  useEffect(() => {
    failedSourcesRef.current =
      new Set();

    setFailedSources(
      new Set()
    );
  }, [
    source?.title,
    source?.id,
    source?.rdSeason,
    source?.rdEpisode,
  ]);

  useEffect(() => {
    const onKey =
      (event) => {
        if (
          event.key ===
          "Escape"
        ) {
          if (
            viewportFullscreen
          ) {
            setViewportFullscreen(
              false
            );
          } else {
            onClose();
          }

          return;
        }

        const tag =
          (
            event.target
              ?.tagName ||
            ""
          ).toLowerCase();

        if (
          tag ===
            "input" ||
          tag ===
            "textarea" ||
          event.target
            ?.isContentEditable
        ) {
          return;
        }

        const video =
          stageRef.current
            ?.querySelector(
              "video"
            );

        if (
          !video
        ) {
          return;
        }

        if (
          event.key >=
            "0" &&
          event.key <=
            "9" &&
          video.duration
        ) {
          event.preventDefault();

          video.currentTime =
            video.duration *
            (
              parseInt(
                event.key,
                10
              ) /
              10
            );

          return;
        }

        switch (
          event.key
        ) {
          case " ":
          case "k":
            event.preventDefault();

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

            break;

          case "ArrowLeft":
          case "j":
            event.preventDefault();

            video.currentTime =
              Math.max(
                0,
                (
                  video.currentTime ||
                  0
                ) -
                  10
              );

            break;

          case "ArrowRight":
          case "l":
            event.preventDefault();

            if (
              video.duration
            ) {
              video.currentTime =
                Math.min(
                  video.duration,
                  (
                    video.currentTime ||
                    0
                  ) +
                    10
                );
            }

            break;

          case "ArrowUp":
            event.preventDefault();

            video.volume =
              Math.min(
                1,
                (
                  video.volume ??
                  1
                ) +
                  0.1
              );

            break;

          case "ArrowDown":
            event.preventDefault();

            video.volume =
              Math.max(
                0,
                (
                  video.volume ??
                  1
                ) -
                  0.1
              );

            break;

          case "f":
            event.preventDefault();

            goFullscreen();

            break;

          case "m":
            event.preventDefault();

            video.muted =
              !video.muted;

            break;

          case "<":
            event.preventDefault();

            video.playbackRate =
              Math.max(
                0.5,
                (
                  video.playbackRate ||
                  1
                ) -
                  0.25
              );

            break;

          case ">":
            event.preventDefault();

            video.playbackRate =
              Math.min(
                2,
                (
                  video.playbackRate ||
                  1
                ) +
                  0.25
              );

            break;

          default:
            break;
        }
      };

    window.addEventListener(
      "keydown",
      onKey
    );

    document.body.style.overflow =
      "hidden";

    return () => {
      window.removeEventListener(
        "keydown",
        onKey
      );

      document.body.style.overflow =
        "";
    };
  }, [
    onClose,
    viewportFullscreen,
  ]);

  const lastSaveRef =
    useRef(0);

  const cwIdRef =
    useRef({});

  const lastPosRef =
    useRef({
      t: 0,
      d: 0,
    });

  const saveProgress =
    (
      time,
      duration,
      force =
        false
    ) => {
      if (
        isLive ||
        !source?.title
      ) {
        return;
      }

      const url =
        rdOverride?.src ||
        active?.src ||
        active?.url;

      if (!url) {
        return;
      }

      const now =
        Date.now();

      if (
        !force &&
        now -
          lastSaveRef.current <
          10000
      ) {
        return;
      }

      lastSaveRef.current =
        now;

      const key =
        `${source.title}|${
          source.rdYear ||
          source.year ||
          ""
        }|${
          source.rdSeason ||
          source.season ||
          ""
        }|${
          source.rdEpisode ||
          source.episode ||
          ""
        }`;

      const patch = {
        progress:
          time,

        duration,

        video_url:
          url,

        poster_url:
          source.poster ||
          "",

        source_type:
          rdOverride
            ? "rd"
            : "file",
      };

      const id =
        cwIdRef.current[
          key
        ];

      if (id) {
        base44.entities.ContinueWatching
          .update(
            id,
            patch
          )
          .catch(
            () => {}
          );

        return;
      }

      base44.entities.ContinueWatching
        .filter({
          content_key:
            key,
        })
        .then(
          (
            rows
          ) => {
            if (
              rows?.length >
              0
            ) {
              cwIdRef.current[
                key
              ] =
                rows[0].id;

              base44.entities.ContinueWatching
                .update(
                  rows[0].id,
                  patch
                )
                .catch(
                  () => {}
                );

              return;
            }

            return base44.entities.ContinueWatching
              .create({
                content_key:
                  key,

                title:
                  source.title,

                year:
                  source.rdYear ||
                  source.year ||
                  "",

                ...patch,
              })
              .then(
                (
                  created
                ) => {
                  cwIdRef.current[
                    key
                  ] =
                    created.id;
                }
              );
          }
        )
        .catch(
          () => {}
        );
    };

  const saveProgressRef =
    useRef(
      saveProgress
    );

  saveProgressRef.current =
    saveProgress;

  useEffect(() => {
    return () => {
      const {
        t,
        d,
      } =
        lastPosRef.current;

      if (
        t >
        5
      ) {
        saveProgressRef.current?.(
          t,
          d,
          true
        );
      }
    };
  }, []);

  const handleLoadedMetadata =
    (
      event
    ) => {
      const video =
        event.target;

      if (
        source?.startTime &&
        source.startTime >
          5
      ) {
        try {
          video.currentTime =
            source.startTime;
        } catch {
          // Ignore.
        }
      }
    };

  const handleTimeUpdate =
    (
      event
    ) => {
      const video =
        event.target;

      lastPosRef.current =
        {
          t:
            video.currentTime ||
            0,

          d:
            video.duration ||
            0,
        };

      saveProgress(
        video.currentTime ||
          0,

        video.duration ||
          0
      );
    };

  const pickFile =
    async (
      file
    ) => {
      if (
        !file?.link
      ) {
        setRdError(
          "This file does not have a Real-Debrid link yet."
        );

        return;
      }

      if (
        rdOverride?.file ===
        file.path
      ) {
        return;
      }

      setFileSwitching(
        true
      );

      setRdError(
        ""
      );

      try {
        const res =
          await base44.functions.invoke(
            "realDebrid",
            {
              action:
                "unrestrict_file",

              link:
                file.link,
            }
          );

        const data =
          res?.data ||
          {};

        if (
          data.stream_url
        ) {
          setRdOverride({
            src:
              data.stream_url,

            label:
              file.path ||
              "Real-Debrid File",

            file:
              file.path ||
              "",

            subtitles:
              data.subtitles ||
              [],

            captions:
              data.captions ||
              [],
          });
        } else {
          setRdError(
            data.error ||
              "Could not open this file."
          );
        }
      } catch (
        error
      ) {
        setRdError(
          error?.message ||
            "Real-Debrid request failed."
        );
      } finally {
        setFileSwitching(
          false
        );
      }
    };

  const retryResolution =
    () => {
      setRdOverride(
        null
      );

      setRdFiles(
        []
      );

      setRdTorrentId(
        null
      );

      setRdError(
        ""
      );

      setRdResolving(
        true
      );

      const current =
        activeIdx;

      setActiveIdx(
        -1
      );

      setTimeout(
        () => {
          setActiveIdx(
            current
          );
        },
        0
      );
    };

  const busy =
    rdResolving ||
    rdPolling ||
    !!rdTorrentId;

  const displayedError =
    rdError ||
    "";

  const selectedAspect =
    ASPECT_OPTIONS.find(
      (item) =>
        item.value ===
        aspectRatioChoice
    ) ||
    ASPECT_OPTIONS[0];

  const playerObjectClass =
    aspectRatioChoice ===
    "fill"
      ? "object-cover"
      : "object-contain";

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center",
        viewportFullscreen
          ? "p-0"
          : "p-2 sm:p-3"
      )}
      onClick={
        onClose
      }
    >
      <div
        className={cn(
          "w-full",

          viewportFullscreen
            ? "h-[100dvh] max-w-none"
            : "max-w-6xl"
        )}
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2",

            viewportFullscreen
              ? "absolute left-2 right-2 top-2 z-[120] rounded-xl bg-black/55 px-2 py-2 backdrop-blur-md"
              : "mb-2"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={(
                event
              ) => {
                event.stopPropagation();

                if (
                  viewportFullscreen
                ) {
                  setViewportFullscreen(
                    false
                  );
                } else {
                  onClose();
                }
              }}
              className="shrink-0 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 px-2.5 text-xs font-semibold text-white hover:border-mg-green/50 hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
              aria-label={
                viewportFullscreen
                  ? "Exit fullscreen"
                  : "Back"
              }
              title={
                viewportFullscreen
                  ? "Exit fullscreen"
                  : "Back"
              }
            >
              <ArrowLeft className="w-4 h-4" />

              <span>
                Back
              </span>
            </button>

            {isLive && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />

                LIVE
              </span>
            )}

            <h3 className="text-white font-semibold text-sm truncate">
              {
                source?.title
              }
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(isDirectFile ||
              isLive ||
              rdOverride) && (
              <>
                <button
                  type="button"
                  onClick={
                    goFullscreen
                  }
                  className="text-white/60 hover:text-white"
                  aria-label={
                    viewportFullscreen
                      ? "Exit fullscreen"
                      : "Fullscreen"
                  }
                  title={
                    viewportFullscreen
                      ? "Exit fullscreen"
                      : "Fullscreen"
                  }
                >
                  {viewportFullscreen ? (
                    <Minimize className="w-5 h-5" />
                  ) : (
                    <Maximize className="w-5 h-5" />
                  )}
                </button>

                <CastButton
                  url={
                    rdOverride?.src ||
                    active?.src ||
                    active?.url
                  }
                  title={
                    source?.title
                  }
                  poster={
                    source?.poster
                  }
                />
              </>
            )}

            <button
              type="button"
              onClick={
                onClose
              }
              className="text-white/60 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={
            stageRef
          }
          className={cn(
            "relative w-full bg-black overflow-hidden flex items-center justify-center",

            viewportFullscreen
              ? "h-[100dvh] rounded-none border-0"
              : "rounded-lg border border-white/10"
          )}
          style={
            viewportFullscreen
              ? undefined
              : {
                  aspectRatio:
                    selectedAspect.ratio,
                }
          }
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />

              <p className="text-white font-semibold text-sm">
                {rdResolving
                  ? "Finding stream…"
                  : rdPolling ||
                    rdTorrentId
                    ? "Preparing stream…"
                    : "Loading…"}
              </p>

              {displayedError && (
                <p className="text-red-400 text-xs mt-1 max-w-md break-words">
                  {
                    displayedError
                  }
                </p>
              )}
            </div>
          ) : rdOverride ? (
            <>
              <LiveVideo
                key={
                  rdOverride.src
                }
                ref={
                  videoRef
                }
                src={
                  rdOverride.src
                }
                sourceLabel={`${rdOverride?.file || ""} ${rdOverride?.label || ""} ${active?.label || ""}`}
                isLive={
                  isLive
                }
                poster={
                  source?.poster
                }
                controls={
                  false
                }
                qualityPreference={
                  sessionQuality
                }
                audioTrackPreference={
                  audioTrackChoice
                }
                subtitleTrackPreference={
                  subtitleTrackChoice
                }
                externalSubtitles={
                  externalSubtitles
                }
                onAudioTracksChanged={
                  setAudioTracks
                }
                onSubtitleTracksChanged={
                  setSubtitleTracks
                }
                onQualityLevelsChanged={
                  setQualityLevels
                }
                onActiveAudioTrackChanged={
                  setActiveAudioTrack
                }
                onActiveSubtitleTrackChanged={
                  setActiveSubtitleTrack
                }
                onNoAudio={
                  handleNoAudio
                }
                onLoadedMetadata={
                  handleLoadedMetadata
                }
                onTimeUpdate={
                  handleTimeUpdate
                }
                onError={() =>
                  tryNextSource(
                    "This stream failed during playback or used an unsupported codec."
                  )
                }
                className={cn(
                  "w-full h-full bg-black",
                  playerObjectClass
                )}
              />

              <PlayerControls
                key={
                  rdOverride.src
                }
                videoRef={
                  videoRef
                }
                stageRef={
                  stageRef
                }
                isLive={
                  isLive
                }
                onFullscreen={
                  goFullscreen
                }
              />
            </>
          ) : isYoutube ? (
            <iframe
              src={
                active.src
              }
              title={
                source?.title ||
                "Video"
              }
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : isProvider ? (
            <iframe
              src={
                active.src
              }
              title={
                source?.title ||
                "Provider"
              }
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : isDirectFile ? (
            <>
              <LiveVideo
                ref={
                  liveVideoRef
                }
                key={
                  active.src
                }
                src={
                  active.src
                }
                sourceLabel={`${active?.label || ""} ${active?.name || ""} ${active?.filename || ""}`}
                isLive={
                  isLive
                }
                poster={
                  source?.poster
                }
                controls={
                  false
                }
                qualityPreference={
                  sessionQuality
                }
                audioTrackPreference={
                  audioTrackChoice
                }
                subtitleTrackPreference={
                  subtitleTrackChoice
                }
                externalSubtitles={
                  externalSubtitles
                }
                onAudioTracksChanged={
                  setAudioTracks
                }
                onSubtitleTracksChanged={
                  setSubtitleTracks
                }
                onQualityLevelsChanged={
                  setQualityLevels
                }
                onActiveAudioTrackChanged={
                  setActiveAudioTrack
                }
                onActiveSubtitleTrackChanged={
                  setActiveSubtitleTrack
                }
                onNoAudio={
                  handleNoAudio
                }
                className={cn(
                  "w-full h-full bg-black",
                  playerObjectClass
                )}
                onLoadedMetadata={
                  handleLoadedMetadata
                }
                onTimeUpdate={
                  handleTimeUpdate
                }
                onError={() =>
                  tryNextSource(
                    "This stream failed during playback."
                  )
                }
              />

              <PlayerControls
                key={
                  active.src
                }
                videoRef={
                  liveVideoRef
                }
                stageRef={
                  stageRef
                }
                isLive={
                  isLive
                }
                onFullscreen={
                  goFullscreen
                }
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />

              <p className="text-white font-semibold text-sm">
                No playable stream yet
              </p>

              {displayedError && (
                <p className="text-red-400 text-xs max-w-md break-words">
                  {
                    displayedError
                  }
                </p>
              )}

              {isRdSource && (
                <button
                  type="button"
                  onClick={
                    retryResolution
                  }
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-mg-green text-black text-xs font-semibold hover:bg-mg-green-dim"
                >
                  <RefreshCw className="w-3.5 h-3.5" />

                  Try Again
                </button>
              )}
            </div>
          )}
        </div>

        {(rdOverride ||
          isDirectFile) &&
          !busy &&
          !viewportFullscreen && (
            <div className="mt-2 bg-mg-card border border-white/10 rounded-lg p-2.5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <label className="flex flex-col gap-1 text-[10px] text-white/45">
                  <span>
                    Ratio
                  </span>

                  <select
                    value={
                      aspectRatioChoice
                    }
                    onChange={(
                      event
                    ) =>
                      setAspectRatioChoice(
                        event.target.value
                      )
                    }
                    className="min-h-10 bg-black/40 border border-white/10 rounded-md text-white text-xs px-2 outline-none focus:border-mg-green"
                    aria-label="Choose video aspect ratio"
                  >
                    {ASPECT_OPTIONS.map(
                      (
                        option
                      ) => (
                        <option
                          key={
                            option.value
                          }
                          value={
                            option.value
                          }
                        >
                          {
                            option.label
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[10px] text-white/45">
                  <span>
                    Audio
                  </span>

                  <select
                    value={
                      audioTrackChoice
                    }
                    onChange={(
                      event
                    ) =>
                      setAudioTrackChoice(
                        event.target.value
                      )
                    }
                    className="min-h-10 bg-black/40 border border-white/10 rounded-md text-white text-xs px-2 outline-none focus:border-mg-green"
                    aria-label="Choose audio track"
                  >
                    <option value="english">
                      English Auto
                    </option>

                    {audioTracks.map(
                      (
                        track
                      ) => (
                        <option
                          key={
                            track.id
                          }
                          value={
                            track.id
                          }
                        >
                          {
                            track.label
                          }
                          {track.language
                            ? ` · ${track.language}`
                            : ""}
                          {track.codec
                            ? ` · ${track.codec}`
                            : ""}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[10px] text-white/45">
                  <span>
                    Subtitles
                  </span>

                  <select
                    value={
                      subtitleTrackChoice
                    }
                    onChange={(
                      event
                    ) =>
                      setSubtitleTrackChoice(
                        event.target.value
                      )
                    }
                    className="min-h-10 bg-black/40 border border-white/10 rounded-md text-white text-xs px-2 outline-none focus:border-mg-green"
                    aria-label="Choose subtitle track"
                  >
                    <option value="off">
                      Off
                    </option>

                    <option value="english">
                      English Auto
                    </option>

                    {subtitleTracks.map(
                      (
                        track
                      ) => (
                        <option
                          key={
                            track.id
                          }
                          value={
                            track.id
                          }
                        >
                          {
                            track.label
                          }
                          {track.language
                            ? ` · ${track.language}`
                            : ""}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[10px] text-white/45">
                  <span>
                    Quality
                  </span>

                  <select
                    value={
                      sessionQuality
                    }
                    onChange={(
                      event
                    ) =>
                      setSessionQuality(
                        event.target.value
                      )
                    }
                    className="min-h-10 bg-black/40 border border-white/10 rounded-md text-white text-xs px-2 outline-none focus:border-mg-green"
                    aria-label="Choose playback quality"
                  >
                    <option value="Auto">
                      Auto
                    </option>

                    <option value="4K">
                      4K
                    </option>

                    <option value="1080p">
                      1080p
                    </option>

                    <option value="720p">
                      720p
                    </option>

                    <option value="480p">
                      480p
                    </option>
                  </select>
                </label>
              </div>
            </div>
          )}

        {displayedError &&
          !busy &&
          !rdOverride && (
            <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-red-300 text-xs break-words">
                  {
                    displayedError
                  }
                </p>

                {isRdSource && (
                  <button
                    type="button"
                    onClick={
                      retryResolution
                    }
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white/10 text-white text-[11px] font-semibold hover:bg-white/15"
                  >
                    <RefreshCw className="w-3 h-3" />

                    Retry
                  </button>
                )}
              </div>
            </div>
          )}

        {rdOverride &&
          rdFiles.length >
            1 && (
            <div className="mt-2 bg-mg-card border border-white/10 rounded-lg p-2 max-h-36 overflow-y-auto">
              <div className="flex flex-col gap-0.5">
                {rdFiles.map(
                  (
                    file
                  ) => {
                    const isCurrent =
                      rdOverride.file ===
                      file.path;

                    return (
                      <button
                        type="button"
                        key={
                          file.id
                        }
                        onClick={() =>
                          pickFile(
                            file
                          )
                        }
                        disabled={
                          fileSwitching
                        }
                        className={cn(
                          "flex items-center gap-2 text-left px-2 py-1.5 rounded text-xs transition-colors",

                          isCurrent
                            ? "bg-mg-green/15 text-mg-green"
                            : "text-white/70 hover:bg-white/5",

                          fileSwitching &&
                            "opacity-60"
                        )}
                      >
                        <Film className="w-3.5 h-3.5 shrink-0" />

                        <span className="truncate flex-1">
                          {
                            file.path
                          }
                        </span>

                        <span className="text-white/30 shrink-0">
                          {file.bytes >
                          1e9
                            ? `${(
                                file.bytes /
                                1e9
                              ).toFixed(
                                1
                              )}GB`
                            : `${(
                                file.bytes /
                                1e6
                              ).toFixed(
                                0
                              )}MB`}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          )}

        {sources.length >
          1 && (
          <div className="mt-2 bg-mg-card border border-white/10 rounded-lg p-2.5">
            <div className="relative">
              <select
                value={
                  activeIdx
                }
                onChange={(
                  event
                ) =>
                  selectSource(
                    event.target.value
                  )
                }
                className="w-full appearance-none bg-black/40 border border-white/10 rounded-lg text-white text-sm pl-3 pr-10 py-2.5 outline-none focus:border-mg-green"
                aria-label="Choose playback source"
              >
                {sources.map(
                  (
                    item,
                    index
                  ) => {
                    const failed =
                      failedSources.has(
                        index
                      );

                    const label =
                      item?.label ||
                      `Source ${
                        index +
                        1
                      }`;

                    return (
                      <option
                        key={`${index}-${label}`}
                        value={
                          index
                        }
                      >
                        {failed
                          ? "Failed — "
                          : ""}
                        {
                          label
                        }
                        {` · ${sourceTypeLabel(
                          item
                        )}`}
                      </option>
                    );
                  }
                )}
              </select>

              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/50">
                <Tv className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  tryNextSource(
                    "Trying another source because this one has missing or unsupported audio."
                  )
                }
                className="min-h-10 inline-flex items-center justify-center gap-2 rounded-md border border-mg-green/25 bg-mg-green/10 px-3 py-2 text-[11px] font-semibold text-mg-green hover:bg-mg-green/15"
                aria-label="No sound - try next compatible source"
              >
                <Volume2 className="w-3.5 h-3.5" />

                No Sound
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
