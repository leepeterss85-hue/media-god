import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Check,
  Copy,
  ExternalLink,
  Film,
  Link,
  Loader2,
  Maximize,
  Play,
  RefreshCw,
  Tv,
  X,
  Zap,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";
import PlayerControls from "@/components/mg/PlayerControls";
import { cn } from "@/lib/utils";

const getSourceUrl = (
  item
) =>
  String(
    item?.src ||
      item?.url ||
      item?.magnet ||
      item?.magnetLink ||
      ""
  ).trim();

const isMagnet = (
  value
) =>
  String(
    value ||
    ""
  )
    .toLowerCase()
    .startsWith(
      "magnet:"
    );

const isRdType = (
  item
) =>
  item?.type ===
    "rd" ||
  item?.type ===
    "rd_torrent" ||
  item?.type ===
    "magnet" ||
  item?.type ===
    "torrent" ||
  isMagnet(
    getSourceUrl(
      item
    )
  );

const isDirectType = (
  item
) => {
  const url =
    getSourceUrl(
      item
    );

  return (
    /^https?:\/\//i.test(
      url
    ) &&
    item?.type !==
      "provider" &&
    item?.type !==
      "youtube" &&
    !isMagnet(
      url
    )
  );
};

const currentFilePath = (
  files
) =>
  (
    files?.find(
      (
        file
      ) =>
        file.selected
    ) ||
    files?.[0] ||
    {}
  ).path ||
  "";

const youtubeEmbedUrl = (
  value
) => {
  const url =
    String(
      value ||
      ""
    ).trim();

  if (!url) {
    return "";
  }

  if (
    /youtube\.com\/embed\//i.test(
      url
    )
  ) {
    return url;
  }

  const watch =
    url.match(
      /youtube\.com\/watch\?v=([^&]+)/i
    );

  if (
    watch?.[1]
  ) {
    return `https://www.youtube.com/embed/${watch[1]}?autoplay=1`;
  }

  const short =
    url.match(
      /youtu\.be\/([^?&/]+)/i
    );

  if (
    short?.[1]
  ) {
    return `https://www.youtube.com/embed/${short[1]}?autoplay=1`;
  }

  return url;
};

export default function VideoPlayer({
  source,
  onClose,
}) {
  const sources =
    useMemo(
      () => {
        const supplied =
          Array.isArray(
            source?.sources
          )
            ? source.sources.filter(
                Boolean
              )
            : [];

        if (
          supplied.length >
          0
        ) {
          return supplied;
        }

        return [
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
              "url",

            src:
              getSourceUrl(
                source
              ),

            url:
              getSourceUrl(
                source
              ),

            magnet:
              source?.magnet ||
              source?.magnetLink ||
              undefined,

            live:
              source?.type ===
              "live",
          },
        ];
      },
      [
        source,
      ]
    );

  const [
    activeIdx,
    setActiveIdx,
  ] =
    useState(
      0
    );

  const [
    copied,
    setCopied,
  ] =
    useState(
      false
    );

  const [
    rdResolving,
    setRdResolving,
  ] =
    useState(
      false
    );

  const [
    rdPolling,
    setRdPolling,
  ] =
    useState(
      false
    );

  const [
    rdError,
    setRdError,
  ] =
    useState(
      ""
    );

  const [
    rdOverride,
    setRdOverride,
  ] =
    useState(
      null
    );

  const [
    rdFiles,
    setRdFiles,
  ] =
    useState(
      []
    );

  const [
    rdTorrentId,
    setRdTorrentId,
  ] =
    useState(
      null
    );

  const [
    fileSwitching,
    setFileSwitching,
  ] =
    useState(
      false
    );

  const [
    retryNonce,
    setRetryNonce,
  ] =
    useState(
      0
    );

  const [
    failedSources,
    setFailedSources,
  ] =
    useState(
      () =>
        new Set()
    );

  const failedSourcesRef =
    useRef(
      new Set()
    );

  const videoRef =
    useRef(
      null
    );

  const liveVideoRef =
    useRef(
      null
    );

  const stageRef =
    useRef(
      null
    );

  const pollRef =
    useRef(
      null
    );

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

  const isRdSource =
    isRdType(
      active
    );

  const isDirectSource =
    isDirectType(
      active
    ) ||
    isLive;

  const markSourceFailed =
    (
      index
    ) => {
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
    (
      index
    ) => {
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

  const isAutomaticPlaybackCandidate =
    (
      item
    ) =>
      isRdType(
        item
      ) ||
      isDirectType(
        item
      ) ||
      item?.type ===
        "live" ||
      item?.live;

  const findNextPlayableSource =
    (
      fromIndex
    ) => {
      if (
        sources.length <=
        1
      ) {
        return -1;
      }

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

        if (
          isAutomaticPlaybackCandidate(
            sources[
              index
            ]
          )
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

  const selectSource =
    (
      index
    ) => {
      const nextIndex =
        Number(
          index
        );

      if (
        Number.isNaN(
          nextIndex
        ) ||
        nextIndex <
          0 ||
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
    (
      item
    ) => {
      if (
        item?.viaRealDebrid
      ) {
        return "Real-Debrid";
      }

      if (
        isRdType(
          item
        )
      ) {
        return "Real-Debrid / Magnet";
      }

      if (
        item?.type ===
        "live"
      ) {
        return "Live";
      }

      if (
        item?.type ===
        "youtube"
      ) {
        return "Trailer";
      }

      if (
        item?.type ===
        "provider"
      ) {
        return "Provider";
      }

      if (
        isDirectType(
          item
        )
      ) {
        return "Direct";
      }

      return "Source";
    };

  const goFullscreen =
    () => {
      const video =
        videoRef.current ||
        liveVideoRef.current;

      const stage =
        stageRef.current;

      try {
        if (
          video?.webkitEnterFullscreen
        ) {
          video.webkitEnterFullscreen();

          return;
        }

        if (
          stage?.requestFullscreen
        ) {
          stage
            .requestFullscreen()
            .catch(
              () => {}
            );

          return;
        }

        video
          ?.requestFullscreen
          ?.()
          .catch(
            () => {}
          );
      } catch {
        // Ignore fullscreen errors.
      }
    };

  useEffect(() => {
    setActiveIdx(
      0
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

    failedSourcesRef.current =
      new Set();

    setFailedSources(
      new Set()
    );
  }, [
    source,
  ]);

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

  /*
   * REAL-DEBRID RESOLUTION
   *
   * A magnet does NOT have to
   * already exist in the user's
   * Real-Debrid library.
   *
   * resolve_best will add it.
   */
  useEffect(() => {
    if (
      !active ||
      !isRdSource
    ) {
      return;
    }

    if (
      isYoutube ||
      isProvider ||
      isLive
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
          const value =
            active?.magnet ||
            active?.magnetLink ||
            active?.src ||
            active?.url ||
            "";

          if (
            !value
          ) {
            throw new Error(
              "This source did not provide a playable link."
            );
          }

          /*
           * If RD already handed back
           * a direct HTTP URL,
           * just play it.
           */
          if (
            /^https?:\/\//i.test(
              value
            )
          ) {
            if (
              !cancelled
            ) {
              setRdOverride({
                src:
                  value,

                label:
                  active?.label ||
                  "Real-Debrid stream",

                file:
                  "",
              });

              setRdResolving(
                false
              );
            }

            return;
          }

          const response =
            await base44.functions.invoke(
              "realDebrid",
              {
                action:
                  "resolve_best",

                magnet:
                  value,

                title:
                  source?.rdTitle ||
                  source?.title ||
                  "",

                ...(source?.rdYear != null
                  ? {
                      year:
                        source.rdYear,
                    }
                  : {}),

                ...(source?.rdSeason != null
                  ? {
                      season:
                        source.rdSeason,
                    }
                  : {}),

                ...(source?.rdEpisode != null
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
            response?.data ||
            {};

          if (
            data?.status ===
              "ready" &&
            data?.stream_url
          ) {
            setRdOverride({
              src:
                data.stream_url,

              label:
                data?.filename ||
                active?.label ||
                "Real-Debrid stream",

              file:
                currentFilePath(
                  data.files
                ),
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

          /*
           * Not cached yet.
           *
           * The backend has added it
           * to Real-Debrid and returned
           * a torrent id. Start polling.
           */
          if (
            data?.torrent_id
          ) {
            setRdTorrentId(
              String(
                data.torrent_id
              )
            );

            setRdFiles(
              data.files ||
              []
            );

            setRdResolving(
              false
            );

            return;
          }

          throw new Error(
            data?.error ||
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
    };
  }, [
    activeIdx,
    retryNonce,
    active,
    isRdSource,
    isYoutube,
    isProvider,
    isLive,
    source,
  ]);

  /*
   * Poll a newly-added RD torrent.
   */
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
          const response =
            await base44.functions.invoke(
              "realDebrid",
              {
                action:
                  "torrent_info",

                torrent_id:
                  rdTorrentId,

                ...(source?.rdSeason != null
                  ? {
                      season:
                        source.rdSeason,
                    }
                  : {}),

                ...(source?.rdEpisode != null
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
            response?.data ||
            {};

          if (
            data?.status ===
              "ready" &&
            data?.stream_url
          ) {
            setRdOverride({
              src:
                data.stream_url,

              label:
                data?.filename ||
                "Real-Debrid stream",

              file:
                currentFilePath(
                  data.files
                ),
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
            data?.error
          ) {
            throw new Error(
              data.error
            );
          }
        } catch (
          error
        ) {
          if (
            !cancelled
          ) {
            setRdPolling(
              false
            );

            setRdTorrentId(
              null
            );

            tryNextSource(
              error?.message ||
              "Real-Debrid preparation failed."
            );
          }

          return;
        }

        /*
         * 36 × 5 seconds =
         * about 3 minutes.
         */
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
            "Real-Debrid is still preparing this source. You can retry it or choose another source from the dropdown."
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

  /*
   * Autoplay direct / resolved streams.
   */
  useEffect(() => {
    const video =
      videoRef.current ||
      liveVideoRef.current;

    if (
      !video
    ) {
      return;
    }

    const url =
      rdOverride?.src ||
      activeUrl;

    if (
      !url
    ) {
      return;
    }

    if (
      !rdOverride &&
      !isDirectSource
    ) {
      return;
    }

    video
      .play?.()
      .catch(() => {
        try {
          video.muted =
            true;
        } catch {
          // Ignore.
        }

        video
          .play?.()
          .catch(
            () => {}
          );
      });
  }, [
    activeIdx,
    activeUrl,
    rdOverride,
    isDirectSource,
  ]);

  /*
   * Keyboard controls.
   */
  useEffect(() => {
    const onKey =
      (
        event
      ) => {
        if (
          event.key ===
            "Escape" &&
          !document.fullscreenElement
        ) {
          onClose();

          return;
        }

        const tag =
          String(
            event.target
              ?.tagName ||
              ""
          ).toLowerCase();

        if (
          tag ===
            "input" ||
          tag ===
            "textarea" ||
          tag ===
            "select" ||
          event.target
            ?.isContentEditable
        ) {
          return;
        }

        const video =
          videoRef.current ||
          liveVideoRef.current;

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

          case "f":
            event.preventDefault();

            goFullscreen();

            break;

          case "m":
            event.preventDefault();

            video.muted =
              !video.muted;

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
  ]);

  /*
   * Continue Watching.
   */
  const lastSaveRef =
    useRef(
      0
    );

  const cwIdRef =
    useRef(
      {}
    );

  const lastPosRef =
    useRef({
      t: 0,
      d: 0,
    });

  const saveProgress =
    (
      time,
      duration,
      force = false
    ) => {
      if (
        isLive ||
        isYoutube ||
        isProvider ||
        !source?.title
      ) {
        return;
      }

      const url =
        rdOverride?.src ||
        activeUrl;

      if (
        !/^https?:\/\//i.test(
          url
        )
      ) {
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
        `${source.title}|${source.rdYear || source.year || ""}|${source.rdSeason || source.season || ""}|${source.rdEpisode || source.episode || ""}`;

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

      if (
        id
      ) {
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

              return base44.entities.ContinueWatching.update(
                rows[0].id,
                patch
              );
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

  /*
   * Select a different video from
   * a multi-file Real-Debrid torrent.
   */
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
        const response =
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
          response?.data ||
          {};

        if (
          data?.stream_url
        ) {
          setRdOverride({
            src:
              data.stream_url,

            label:
              file.path ||
              "Real-Debrid file",

            file:
              file.path ||
              "",
          });
        } else {
          setRdError(
            data?.error ||
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
      clearSourceFailed(
        activeIdx
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

      setRetryNonce(
        (
          value
        ) =>
          value +
          1
      );
    };

  const copyCurrentUrl =
    async () => {
      const value =
        rdOverride?.src ||
        activeUrl;

      if (
        !value
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          value
        );

        setCopied(
          true
        );

        setTimeout(
          () =>
            setCopied(
              false
            ),
          1500
        );
      } catch {
        // Clipboard permission unavailable.
      }
    };

  const openCurrentSource =
    () => {
      const value =
        rdOverride?.src ||
        activeUrl;

      if (
        !/^https?:\/\//i.test(
          value
        )
      ) {
        return;
      }

      window.open(
        value,
        "_blank",
        "noopener,noreferrer"
      );
    };

  const busy =
    rdResolving ||
    rdPolling ||
    !!rdTorrentId;

  const currentSourceLabel =
    rdOverride?.label ||
    active?.label ||
    `Source ${
      activeIdx +
      1
    }`;

  const currentUrl =
    rdOverride?.src ||
    activeUrl;

  const embedUrl =
    isYoutube
      ? youtubeEmbedUrl(
          activeUrl
        )
      : "";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 md:p-4"
      onClick={
        onClose
      }
    >
      <div
        className="w-full max-w-4xl max-h-[95vh] overflow-y-auto"
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
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
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {currentUrl && (
              <button
                type="button"
                onClick={
                  copyCurrentUrl
                }
                className="text-white/60 hover:text-white"
                aria-label="Copy source"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-mg-green" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}

            {(isDirectSource ||
              rdOverride) && (
              <>
                <button
                  type="button"
                  onClick={
                    goFullscreen
                  }
                  className="text-white/60 hover:text-white"
                  aria-label="Fullscreen"
                >
                  <Maximize className="w-5 h-5" />
                </button>

                <CastButton
                  url={
                    currentUrl
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

        {/* Playback Source card - ALWAYS visible */}
        <div className="mb-3 bg-mg-card border border-white/10 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold">
                Playback Source
              </p>

              <p className="text-white/40 text-[10px] mt-0.5">
                Sources found from your installed addons, Real-Debrid and available direct links.
              </p>
            </div>

            <span className="shrink-0 text-[10px] font-semibold text-mg-green bg-mg-green/10 border border-mg-green/20 rounded-full px-2 py-1">
              {
                sources.length
              }{" "}
              source
              {sources.length ===
              1
                ? ""
                : "s"}
            </span>
          </div>

          {sources.length >
          1 ? (
            <div className="relative">
              <select
                value={
                  activeIdx
                }
                onChange={(
                  event
                ) =>
                  selectSource(
                    event.target
                      .value
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
                          ? "FAILED — "
                          : ""}
                        {
                          label
                        }{" "}
                        ·{" "}
                        {
                          sourceTypeLabel(
                            item
                          )
                        }
                      </option>
                    );
                  }
                )}
              </select>

              <Tv className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            </div>
          ) : (
            <div className="w-full bg-black/40 border border-white/10 rounded-lg text-white text-sm px-3 py-2.5">
              {
                currentSourceLabel
              }{" "}
              ·{" "}
              {
                sourceTypeLabel(
                  active
                )
              }
            </div>
          )}

          <div className="flex items-center gap-2 mt-2 text-[10px] text-white/45 min-w-0">
            {isRdSource ? (
              <Zap className="w-3 h-3 text-mg-green shrink-0" />
            ) : isProvider ? (
              <Tv className="w-3 h-3 shrink-0" />
            ) : isYoutube ? (
              <Play className="w-3 h-3 shrink-0" />
            ) : (
              <Link className="w-3 h-3 shrink-0" />
            )}

            <span className="truncate">
              Current:{" "}
              {
                currentSourceLabel
              }

              {active?.addon
                ? ` · ${active.addon}`
                : ""}
            </span>
          </div>
        </div>

        <div
          ref={
            stageRef
          }
          className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center"
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />

              <p className="text-white font-semibold text-sm">
                {rdResolving
                  ? "Sending source to Real-Debrid…"
                  : "Real-Debrid is preparing your stream…"}
              </p>

              <p className="text-white/50 text-xs max-w-md">
                The title does not need to already be in your Real-Debrid library.
              </p>
            </div>
          ) : rdOverride ? (
            <>
              <video
                key={
                  rdOverride.src
                }
                ref={
                  videoRef
                }
                src={
                  rdOverride.src
                }
                poster={
                  source?.poster
                }
                playsInline
                controls={
                  false
                }
                onLoadedMetadata={
                  handleLoadedMetadata
                }
                onTimeUpdate={
                  handleTimeUpdate
                }
                onError={() =>
                  tryNextSource(
                    "This Real-Debrid stream failed during playback."
                  )
                }
                className="w-full h-full object-contain bg-black"
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
                  false
                }
                onFullscreen={
                  goFullscreen
                }
              />
            </>
          ) : isYoutube ? (
            embedUrl ? (
              <iframe
                src={
                  embedUrl
                }
                title={
                  source?.title ||
                  "Trailer"
                }
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <button
                type="button"
                onClick={
                  openCurrentSource
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-mg-green text-black text-sm font-semibold"
              >
                <ExternalLink className="w-4 h-4" />

                Open Trailer
              </button>
            )
          ) : isProvider ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Tv className="w-10 h-10 text-mg-green" />

              <p className="text-white font-semibold">
                {
                  active?.label ||
                  "Streaming provider"
                }
              </p>

              <p className="text-white/50 text-xs max-w-md">
                This provider opens on its own website or app.
              </p>

              <button
                type="button"
                onClick={
                  openCurrentSource
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-mg-green text-black text-sm font-semibold"
              >
                <ExternalLink className="w-4 h-4" />

                Open Provider
              </button>
            </div>
          ) : isDirectSource ? (
            <>
              <LiveVideo
                ref={
                  liveVideoRef
                }
                key={
                  activeUrl
                }
                src={
                  activeUrl
                }
                poster={
                  source?.poster
                }
                controls={
                  false
                }
                className="w-full h-full object-contain bg-black"
                onLoadedMetadata={
                  handleLoadedMetadata
                }
                onTimeUpdate={
                  handleTimeUpdate
                }
                onError={() =>
                  tryNextSource(
                    "This direct stream failed during playback."
                  )
                }
              />

              <PlayerControls
                key={
                  activeUrl
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
              <Film className="w-9 h-9 text-white/30" />

              <p className="text-white font-semibold text-sm">
                No playable stream yet
              </p>

              {rdError && (
                <p className="text-red-400 text-xs max-w-md break-words">
                  {
                    rdError
                  }
                </p>
              )}

              {isRdSource && (
                <button
                  type="button"
                  onClick={
                    retryResolution
                  }
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-mg-green text-black text-xs font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />

                  Try Again
                </button>
              )}
            </div>
          )}
        </div>

        {rdError &&
          !busy && (
            <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-red-300 text-xs font-semibold">
                    Playback problem
                  </p>

                  <p className="text-red-300/70 text-xs mt-1 break-words">
                    {
                      rdError
                    }
                  </p>
                </div>

                {isRdSource && (
                  <button
                    type="button"
                    onClick={
                      retryResolution
                    }
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white/10 text-white text-[11px] font-semibold"
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
            <div className="mt-3 bg-mg-card border border-white/10 rounded-lg p-2 max-h-44 overflow-y-auto">
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide px-1 pb-1 flex items-center gap-1">
                <Film className="w-3 h-3" />

                Files
              </p>

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
      </div>
    </div>
  );
}
