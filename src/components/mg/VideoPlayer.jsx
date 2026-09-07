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
    failedSources,
    setFailedSources,
  ] = useState(
    () => new Set()
  );

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

  const active =
    sources[activeIdx] ||
    sources[0] ||
    {};

  const activeUrl =
    getSourceUrl(
      active
    );

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
        candidate?.type ===
          "rd" ||
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

  /*
   * SAFE IN-APP FULLSCREEN
   *
   * Never use:
   *
   * requestFullscreen()
   * webkitEnterFullscreen()
   *
   * Android WebView can hand those
   * calls over to the native activity
   * and close/restart Media God.
   */
  const goFullscreen =
    () => {
      const stage =
        stageRef.current;

      if (
        !stage
      ) {
        return;
      }

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
   * Reset RD state whenever
   * another source is chosen.
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
   * Real-Debrid resolution.
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
   * Poll Real-Debrid while a
   * newly submitted torrent is
   * being prepared.
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
   * Keyboard / TV remote shortcuts.
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
            tag ===
              "select" ||
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

              
