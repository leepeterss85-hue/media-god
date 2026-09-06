import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";
import PlayerControls from "@/components/mg/PlayerControls";

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

export default function VideoPlayer({
  source,
  onClose,
}) {
  const sources =
    source?.sources &&
    source.sources.length > 0
      ? source.sources
      : [
          {
            label:
              source?.label ||
              (source?.type === "live"
                ? "LIVE"
                : "Stream"),
            type: source?.type || "rd",
            src: getSourceUrl(source),
            magnet:
              source?.magnet ||
              source?.magnetLink ||
              source?.src ||
              source?.url,
            live:
              source?.type === "live",
          },
        ];

  const [activeIdx, setActiveIdx] =
    useState(0);

  const [copied, setCopied] =
    useState(false);

  const [rdResolving, setRdResolving] =
    useState(false);

  const [rdPolling, setRdPolling] =
    useState(false);

  const [rdError, setRdError] =
    useState("");

  const [rdOverride, setRdOverride] =
    useState(null);

  const [rdFiles, setRdFiles] =
    useState([]);

  const [rdTorrentId, setRdTorrentId] =
    useState(null);

  const [fileSwitching, setFileSwitching] =
    useState(false);

  const [failedSources, setFailedSources] =
    useState(() => new Set());

  const failedSourcesRef = useRef(
    new Set()
  );

  const videoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const pollRef = useRef(null);

  const active =
    sources[activeIdx] ||
    sources[0] ||
    {};

  const activeUrl =
    getSourceUrl(active);

  const markSourceFailed = (
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

  const clearSourceFailed = (
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

  const findNextPlayableSource = (
    fromIndex
  ) => {
    for (
      let offset = 1;
      offset <= sources.length;
      offset += 1
    ) {
      const index =
        (fromIndex + offset) %
        sources.length;

      if (
        failedSourcesRef.current.has(
          index
        )
      ) {
        continue;
      }

      const candidate =
        sources[index];

      const url =
        getSourceUrl(
          candidate
        );

      const torrent =
        candidate?.type === "rd" ||
        candidate?.type ===
          "rd_torrent" ||
        candidate?.type ===
          "torrent" ||
        candidate?.type ===
          "magnet" ||
        isMagnet(url);

      if (
        url ||
        torrent
      ) {
        return index;
      }
    }

    return -1;
  };

  const tryNextSource = (
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
      nextIndex === -1
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

  const selectSource = (
    index
  ) => {
    const nextIndex =
      Number(index);

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

  const sourceTypeLabel = (
    item
  ) => {
    const type =
      String(
        item?.type || ""
      ).toLowerCase();

    if (
      type === "rd" ||
      type === "rd_torrent"
    ) {
      return "Real-Debrid";
    }

    if (
      type === "magnet" ||
      type === "torrent"
    ) {
      return "Torrent / Magnet";
    }

    if (
      type === "live"
    ) {
      return "Live";
    }

    if (
      type === "youtube"
    ) {
      return "Trailer";
    }

    if (
      type === "provider"
    ) {
      return "Provider";
    }

    if (
      type === "file"
    ) {
      return "File";
    }

    if (
      type === "url"
    ) {
      return "Direct";
    }

    return "Source";
  };

  const isLive =
    source?.type === "live" ||
    active?.live ||
    active?.type === "live";

  const isYoutube =
    active?.type === "youtube";

  const isProvider =
    active?.type === "provider";

  const isDirectFile =
    active?.type === "file" ||
    active?.type === "url" ||
    active?.type === "live";

  const isRdSource =
    active?.type === "rd" ||
    active?.type ===
      "rd_torrent" ||
    active?.type ===
      "magnet" ||
    isMagnet(
      activeUrl
    );

  const goFullscreen = () => {
    const video =
      videoRef.current;

    const stage =
      stageRef.current;

    try {
      if (
        video &&
        video.webkitEnterFullscreen
      ) {
        video.webkitEnterFullscreen();

        return;
      }

      if (
        stage?.requestFullscreen
      ) {
        stage
          .requestFullscreen()
          .catch(() => {});

        return;
      }

      if (
        video?.requestFullscreen
      ) {
        video
          .requestFullscreen()
          .catch(() => {});
      }
    } catch {
      // Ignore fullscreen errors.
    }
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

                ...(source?.rdYear !=
                null
                  ? {
                      year:
                        source.rdYear,
                    }
                  : {}),

                ...(source?.rdSeason !=
                null
                  ? {
                      season:
                        source.rdSeason,
                    }
                  : {}),

                ...(source?.rdEpisode !=
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
            data.status ===
              "preparing" ||
            data.torrent_id
          ) {
            setRdTorrentId(
              data.torrent_id ||
                null
            );

            setRdPolling(
              true
            );

            setRdResolving(
              false
            );

            return;
          }

          if (
            data.error
          ) {
            const moved =
              tryNextSource(
                data.error
              );

            if (
              !moved
            ) {
              setRdError(
                data.error
              );

              setRdResolving(
                false
              );
            }

            return;
          }

          const moved =
            tryNextSource(
              "Real-Debrid did not return a playable stream."
            );

          if (
            !moved
          ) {
            setRdResolving(
              false
            );
          }
        } catch (
          error
        ) {
          if (
            cancelled
          ) {
            return;
          }

          const message =
            error?.message ||
            "Real-Debrid could not resolve this source.";

          const moved =
            tryNextSource(
              message
            );

          if (
            !moved
          ) {
            setRdError(
              message
            );

            setRdResolving(
              false
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
    active,
    isYoutube,
    isProvider,
    isDirectFile,
    isLive,
    isRdSource,
    source,
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

                ...(source?.rdYear !=
                null
                  ? {
                      year:
                        source.rdYear,
                    }
                  : {}),

                ...(source?.rdSeason !=
                null
                  ? {
                      season:
                        source.rdSeason,
                    }
                  : {}),

                ...(source?.rdEpisode !=
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
            "Real-Debrid is still preparing this file. Please try Check Again shortly."
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
            "Escape" &&
          !document.fullscreenElement
        ) {
          onClose();

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
          stageRef.current?.querySelector(
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
  ]);

  useEffect(() => {
    const video =
      videoRef.current;

    const url =
      rdOverride?.src ||
      active?.src;

    if (
      !video ||
      !url
    ) {
      return;
    }

    const timer =
      setTimeout(
        () => {
          video
            .play()
            .catch(
              () => {}
            );
        },
        100
      );

    return () => {
      clearTimeout(
        timer
      );
    };
  }, [
    rdOverride?.src,
    active?.src,
  ]);

  const copyUrl =
    async () => {
      const url =
        rdOverride?.src ||
        active?.src ||
        active?.url ||
        "";

      if (
        !url
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          url
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
        // Ignore clipboard errors.
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

  const pickFile =
    async (
      file
    ) => {
      if (
        !file?.link
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

              title:
                source?.rdTitle ||
                source?.title ||
                "",

              ...(source?.rdYear !=
              null
                ? {
                    year:
                      source.rdYear,
                  }
                : {}),

              ...(source?.rdSeason !=
              null
                ? {
                    season:
                      source.rdSeason,
                  }
                : {}),

              ...(source?.rdEpisode !=
              null
                ? {
                    episode:
                      source.rdEpisode,
                  }
                : {}),
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
              data.filename ||
              file.path ||
              "Real-Debrid Stream",

            file:
              file.path ||
              "",
          });

          return;
        }

        if (
          data.error
        ) {
          setRdError(
            data.error
          );
        }
      } catch (
        error
      ) {
        setRdError(
          error?.message ||
            "Could not switch file."
        );
      } finally {
        setFileSwitching(
          false
        );
      }
    };

  const busy =
    rdResolving ||
    rdPolling ||
    !!rdTorrentId;

  const displayedError =
    rdError ||
    "";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={
        onClose
      }
    >
      <div
        className="w-full max-w-4xl"
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-center justify-between mb-3 gap-3">
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

          <div className="flex items-center gap-2 shrink-0">
            {(isDirectFile ||
              isLive ||
              rdOverride) && (
              <>
                <button
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
          className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center"
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />

              <p className="text-white font-semibold text-sm">
                {rdResolving
                  ? "Finding your stream…"
                  : rdPolling ||
                    rdTorrentId
                    ? "Real-Debrid is preparing your stream…"
                    : "Loading…"}
              </p>

              <p className="text-white/50 text-xs max-w-md">
                This title does not need to already be in your Real-Debrid library. If the selected source is a torrent, Media God is sending it to Real-Debrid now.
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
                onError={() =>
                  tryNextSource(
                    "This stream failed during playback."
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
                poster={
                  source?.poster
                }
                controls={
                  false
                }
                className="w-full h-full object-contain bg-black"
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

        {displayedError &&
          !busy &&
          !rdOverride && (
            <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-red-300 text-xs font-semibold">
                    Playback problem
                  </p>

                  <p className="text-red-300/70 text-xs mt-1 break-words">
                    {
                      displayedError
                    }
                  </p>
                </div>

                {isRdSource && (
                  <button
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

                        {isCurrent && (
                          <Check className="w-3.5 h-3.5 shrink-0" />
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          )}

        {sources.length >
          1 && (
          <div className="mt-3 bg-mg-card border border-white/10 rounded-lg p-2">
            <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1">
                <Zap className="w-3 h-3" />

                Sources
              </p>

              <span className="text-[10px] text-white/30">
                {activeIdx +
                  1}
                /
                {
                  sources.length
                }
              </span>
            </div>

            <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
              {sources.map(
                (
                  item,
                  index
                ) => {
                  const selected =
                    index ===
                    activeIdx;

                  const failed =
                    failedSources.has(
                      index
                    );

                  return (
                    <button
                      key={`${item?.id || item?.label || "source"}-${index}`}
                      onClick={() =>
                        selectSource(
                          index
                        )
                      }
                      className={cn(
                        "flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",

                        selected
                          ? "bg-mg-green/15 text-mg-green"
                          : failed
                            ? "text-red-300/60 hover:bg-white/5"
                            : "text-white/70 hover:bg-white/5"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {item?.label ||
                            sourceTypeLabel(
                              item
                            )}
                        </span>

                        <span className="block truncate text-[10px] opacity-50">
                          {
                            sourceTypeLabel(
                              item
                            )
                          }
                        </span>
                      </span>

                      {selected && (
                        <Check className="w-3.5 h-3.5 shrink-0" />
                      )}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(rdOverride?.src ||
            active?.src ||
            active?.url) && (
            <>
              <button
                onClick={
                  copyUrl
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10"
              >
                {copied ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}

                {copied
                  ? "Copied"
                  : "Copy Link"}
              </button>

              <a
                href={
                  rdOverride?.src ||
                  active?.src ||
                  active?.url
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10"
              >
                <ExternalLink className="w-3 h-3" />

                Open
              </a>

              <a
                href={
                  rdOverride?.src ||
                  active?.src ||
                  active?.url
                }
                download
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10"
              >
                <Download className="w-3 h-3" />

                Download
              </a>
            </>
          )}

          {isProvider && (
            <a
              href={
                active.src
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10"
            >
              <ExternalLink className="w-3 h-3" />

              Open Provider
            </a>
          )}

          {isYoutube && (
            <a
              href={
                active.src
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10"
            >
              <ExternalLink className="w-3 h-3" />

              Open Trailer
            </a>
          )}

          <div className="flex-1" />

          <span className="text-[10px] text-white/25 flex items-center gap-1">
            <Link className="w-3 h-3" />

            {
              sourceTypeLabel(
                active
              )
            }
          </span>
        </div>
      </div>
    </div>
  );
}
