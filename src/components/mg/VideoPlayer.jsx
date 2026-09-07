import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  VolumeX,
  Tv,
  Loader2,
  RefreshCw,
  Maximize,
  Minimize,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";
import PlayerControls from "@/components/mg/PlayerControls";

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

            live: source?.type === "live",
          },
        ];

  const [activeIdx, setActiveIdx] =
    useState(0);

  const [
    isAppFullscreen,
    setIsAppFullscreen,
  ] = useState(false);

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

  const [
    failedSources,
    setFailedSources,
  ] = useState(() => new Set());

  const failedSourcesRef =
    useRef(new Set());

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

  const markSourceFailed = (index) => {
    failedSourcesRef.current.add(index);

    setFailedSources(
      new Set(
        failedSourcesRef.current
      )
    );
  };

  const clearSourceFailed = (index) => {
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
      setRdResolving(false);
      setRdPolling(false);
      setRdTorrentId(null);

      setRdError(
        `${message} No other playable source is available.`
      );

      return false;
    }

    setRdOverride(null);
    setRdFiles([]);
    setRdTorrentId(null);
    setRdError("");
    setRdResolving(false);
    setRdPolling(false);

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

    setRdOverride(null);
    setRdFiles([]);
    setRdTorrentId(null);
    setRdError("");
    setRdResolving(false);
    setRdPolling(false);

    setActiveIdx(
      nextIndex
    );
  };

  const isLive =
    source?.type === "live" ||
    active?.live ||
    active?.type === "live";

  const isYoutube =
    active?.type ===
    "youtube";

  const isProvider =
    active?.type ===
    "provider";

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
    const stage =
      stageRef.current;

    if (
      !stage
    ) {
      return;
    }

    /*
     * IMPORTANT:
     * Never call requestFullscreen() or
     * webkitEnterFullscreen() here.
     *
     * Android WebView can hand fullscreen over to
     * the native activity and close/restart the app.
     * Media God therefore uses safe in-app fullscreen
     * by expanding the existing stage with CSS.
     */
    const currentlyFullscreen =
      stage.dataset
        .mgFullscreen ===
      "true";

    if (
      currentlyFullscreen
    ) {
      const previousStyle =
        stage.dataset
          .mgPreviousStyle ||
        "";

      if (
        previousStyle
      ) {
        stage.setAttribute(
          "style",
          previousStyle
        );
      } else {
        stage.removeAttribute(
          "style"
        );
      }

      delete stage.dataset
        .mgFullscreen;

      delete stage.dataset
        .mgPreviousStyle;

      setIsAppFullscreen(
        false
      );

      return;
    }

    stage.dataset
      .mgPreviousStyle =
      stage.getAttribute(
        "style"
      ) || "";

    stage.dataset
      .mgFullscreen =
      "true";

    setIsAppFullscreen(
      true
    );

    Object.assign(
      stage.style,
      {
        position:
          "fixed",

        top:
          "0",

        right:
          "0",

        bottom:
          "0",

        left:
          "0",

        width:
          "100vw",

        height:
          "100vh",

        maxWidth:
          "none",

        maxHeight:
          "none",

        margin:
          "0",

        padding:
          "0",

        border:
          "0",

        borderRadius:
          "0",

        aspectRatio:
          "auto",

        background:
          "#000",

        overflow:
          "hidden",

        zIndex:
          "2147483647",
      }
    );
  };

  /*
   * Reset RD state whenever the user chooses
   * another source.
   */
  useEffect(
    () => {
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
    },
    [
      activeIdx,
    ]
  );

  /*
   * MAIN PLAYBACK RESOLUTION
   */
  useEffect(
    () => {
      if (
        !active
      ) {
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
    },
    [
      activeIdx,
      active,
      activeUrl,
      source,
      isYoutube,
      isProvider,
      isDirectFile,
      isLive,
      isRdSource,
    ]
  );

  /*
   * Poll Real-Debrid while a newly submitted
   * torrent is being prepared.
   */
  useEffect(
    () => {
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
    },
    [
      rdTorrentId,
      rdOverride,
      source,
    ]
  );

  useEffect(
    () => {
      failedSourcesRef.current =
        new Set();

      setFailedSources(
        new Set()
      );
    },
    [
      source?.title,
      source?.id,
      source?.rdSeason,
      source?.rdEpisode,
    ]
  );

  /*
   * Keyboard / TV remote controls.
   */
  useEffect(
    () => {
      const onKey =
        (
          event
        ) => {
          if (
            event.key ===
            "Escape"
          ) {
            const stage =
              stageRef.current;

            if (
              stage?.dataset
                ?.mgFullscreen ===
              "true"
            ) {
              event.preventDefault();

              goFullscreen();

              return;
            }

            if (
              !document
                .fullscreenElement
            ) {
              onClose();

              return;
            }
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

      document.body.style
        .overflow =
        "hidden";

      return () => {
        window.removeEventListener(
          "keydown",
          onKey
        );

        document.body.style
          .overflow =
          "";
      };
    },
    [
      onClose,
    ]
  );

  /*
   * Autoplay direct/RD video.
   */
  useEffect(
    () => {
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

      if (
        !rdOverride &&
        active?.type !==
          "file" &&
        active?.type !==
          "url" &&
        active?.type !==
          "live"
      ) {
        return;
      }

      video.muted =
        false;

      video
        .play()
        .catch(
          () => {
            video.muted =
              true;

            video.dataset
              .mgAutoplayMuted =
              "true";

            video
              .play()
              .catch(
                () => {}
              );
          }
        );
    },
    [
      active,
      rdOverride,
    ]
  );

  /*
   * Continue Watching.
   */
  const lastSaveRef =
    useRef(0);

  const cwIdRef =
    useRef({});

  const lastPosRef =
    useRef({
      t:
        0,

      d:
        0,
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

      if (
        !url
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

  useEffect(
    () => {
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
    },
    []
  );

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

  const handleNoSound =
    () => {
      const video =
        stageRef.current
          ?.querySelector(
            "video"
          );

      if (
        video
      ) {
        video.muted =
          false;

        video.volume =
          1;

        if (
          video.dataset
            ?.mgAutoplayMuted ===
          "true"
        ) {
          delete video.dataset
            .mgAutoplayMuted;
        }
      }

      if (
        sources.length >
        1
      ) {
        tryNextSource(
          "No sound on this source."
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
      data-mg-player-root="true"
      className="fixed inset-0 z-[2147483646] bg-black/95 flex items-center justify-center p-2 sm:p-3"
      onClick={
        onClose
      }
    >
      <div
        className="w-full max-w-[1500px]"
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={
                onClose
              }
              className="shrink-0 flex items-center gap-1.5 min-h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-white hover:bg-white/10 hover:border-mg-green/40 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
              aria-label="Back"
              title="Back"
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
                  className="min-h-9 min-w-9 flex items-center justify-center rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  aria-label="Fullscreen"
                  title="Fullscreen"
                >
                  <Maximize className="w-4 h-4" />
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

              <p className="text-white/70 text-sm">
                Loading…
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
                isAppFullscreen={
                  isAppFullscreen
                }
                onBack={
                  onClose
                }
                title={
                  source?.title ||
                  ""
                }
                sources={
                  sources
                }
                activeIdx={
                  activeIdx
                }
                failedSources={
                  failedSources
                }
                onSelectSource={
                  selectSource
                }
                onNoSound={
                  handleNoSound
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
                isAppFullscreen={
                  isAppFullscreen
                }
                onBack={
                  onClose
                }
                title={
                  source?.title ||
                  ""
                }
                sources={
                  sources
                }
                activeIdx={
                  activeIdx
                }
                failedSources={
                  failedSources
                }
                onSelectSource={
                  selectSource
                }
                onNoSound={
                  handleNoSound
                }
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />

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

          {isAppFullscreen &&
            !rdOverride &&
            !isDirectFile && (
              <div className="absolute left-0 right-0 top-0 z-40 flex items-center gap-2 bg-gradient-to-b from-black/90 via-black/55 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
                <button
                  type="button"
                  onClick={
                    onClose
                  }
                  className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
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
                    {
                      source?.title
                    }
                  </p>
                </div>

                {sources.length >
                  1 && (
                  <div className="relative min-w-[9rem] max-w-[46vw] sm:min-w-[14rem] sm:max-w-sm">
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
                      className="w-full appearance-none rounded-lg border border-white/15 bg-black/55 py-2.5 pl-3 pr-9 text-xs text-white outline-none backdrop-blur focus:border-mg-green sm:text-sm"
                      aria-label="Choose source or quality while loading"
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
                              key={`loading-${index}-${label}`}
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
                            </option>
                          );
                        }
                      )}
                    </select>

                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/60">
                      <Tv className="h-4 w-4" />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={
                    goFullscreen
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
                  aria-label="Exit fullscreen"
                  title="Exit fullscreen"
                >
                  <Minimize className="h-4 w-4" />
                </button>
              </div>
            )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {sources.length >
          1 ? (
            <div className="relative flex-1 min-w-0">
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
                className="w-full appearance-none bg-mg-card border border-white/10 rounded-lg text-white text-xs sm:text-sm pl-3 pr-9 py-2.5 outline-none focus:border-mg-green"
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
                      </option>
                    );
                  }
                )}
              </select>

              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/50">
                <Tv className="w-4 h-4" />
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <button
            type="button"
            onClick={
              handleNoSound
            }
            className="shrink-0 flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-mg-card px-3 text-xs font-semibold text-white hover:border-mg-green/40 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
            aria-label="No sound"
            title="No sound"
          >
            <VolumeX className="w-4 h-4" />

            <span>
              No sound?
            </span>
          </button>
        </div>

        {rdOverride &&
          rdFiles.length >
            1 && (
            <div className="mt-2">
              <select
                value={
                  rdFiles.find(
                    (
                      file
                    ) =>
                      file.path ===
                      rdOverride.file
                  )?.id ||
                  ""
                }
                onChange={(
                  event
                ) => {
                  const file =
                    rdFiles.find(
                      (
                        item
                      ) =>
                        String(
                          item.id
                        ) ===
                        String(
                          event.target
                            .value
                        )
                    );

                  if (
                    file
                  ) {
                    pickFile(
                      file
                    );
                  }
                }}
                disabled={
                  fileSwitching
                }
                className="w-full bg-mg-card border border-white/10 rounded-lg text-white text-xs sm:text-sm px-3 py-2.5 outline-none focus:border-mg-green disabled:opacity-60"
                aria-label="Choose file"
              >
                {rdFiles.map(
                  (
                    file
                  ) => (
                    <option
                      key={
                        file.id
                      }
                      value={
                        file.id
                      }
                    >
                      {
                        file.path
                      }
                    </option>
                  )
                )}
              </select>
            </div>
          )}

        {displayedError &&
          !busy && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-xs text-red-300">
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
                  className="shrink-0 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
                >
                  Retry
                </button>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
