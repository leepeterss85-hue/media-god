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

            magnet: source?.magnet ||
              source?.magnetLink ||
              source?.src ||
              source?.url,

            live: source?.type === "live",
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

  const videoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const pollRef = useRef(null);

  const active =
    sources[activeIdx] ||
    sources[0] ||
    {};

  const activeUrl = getSourceUrl(active);

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
    active?.type === "rd_torrent" ||
    active?.type === "magnet" ||
    isMagnet(activeUrl);

  const goFullscreen = () => {
    const video = videoRef.current;
    const stage = stageRef.current;

    try {
      if (
        video &&
        video.webkitEnterFullscreen
      ) {
        video.webkitEnterFullscreen();
        return;
      }

      if (stage?.requestFullscreen) {
        stage
          .requestFullscreen()
          .catch(() => {});
        return;
      }

      if (video?.requestFullscreen) {
        video
          .requestFullscreen()
          .catch(() => {});
      }
    } catch {
      // Ignore fullscreen errors.
    }
  };

  /*
   * Reset RD state whenever the user chooses
   * another source.
   */
  useEffect(() => {
    setRdOverride(null);
    setRdError("");
    setRdFiles([]);
    setRdTorrentId(null);

    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, [activeIdx]);

  /*
   * MAIN PLAYBACK RESOLUTION
   *
   * Direct URLs are played directly.
   *
   * Magnets/RD sources:
   *
   * 1. Try the magnet through Real-Debrid.
   * 2. Real-Debrid can return a cached/instant result.
   * 3. If it has to prepare the torrent, poll it.
   *
   * We deliberately do NOT require the title to already
   * exist in the user's RD library.
   */
  useEffect(() => {
    if (!active) return;

    if (
      isYoutube ||
      isProvider ||
      isDirectFile ||
      isLive
    ) {
      return;
    }

    if (!isRdSource) {
      return;
    }

    let cancelled = false;

    setRdResolving(true);
    setRdPolling(false);
    setRdError("");
    setRdOverride(null);
    setRdTorrentId(null);

    const run = async () => {
      try {
        const magnet =
          active?.magnet ||
          active?.magnetLink ||
          active?.src ||
          active?.url ||
          "";

        if (!magnet) {
          throw new Error(
            "This source did not provide a playable link."
          );
        }

        /*
         * Direct HTTP sources do not need RD.
         */
        if (
          String(magnet)
            .toLowerCase()
            .startsWith("http://") ||
          String(magnet)
            .toLowerCase()
            .startsWith("https://")
        ) {
          if (!cancelled) {
            setRdOverride({
              src: magnet,
              label:
                active?.label ||
                "Stream",
              file: "",
            });
            setRdResolving(false);
          }

          return;
        }

        /*
         * A magnet is NOT required to already be in
         * the RD library. resolve_best adds it to RD.
         */
        const res =
          await base44.functions.invoke(
            "realDebrid",
            {
              action: "resolve_best",

              magnet,

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

        if (cancelled) return;

        const data = res?.data || {};

        if (
          data.status === "ready" &&
          data.stream_url
        ) {
          setRdOverride({
            src: data.stream_url,
            label:
              data.filename ||
              active?.label ||
              "Real-Debrid Stream",
            file: currentFilePath(
              data.files
            ),
          });

          setRdFiles(
            data.files || []
          );

          setRdResolving(false);
          return;
        }

        if (data.torrent_id) {
          setRdTorrentId(
            String(data.torrent_id)
          );

          setRdResolving(false);
          return;
        }

        throw new Error(
          data.error ||
            "Real-Debrid could not resolve this source."
        );
      } catch (error) {
        if (!cancelled) {
          setRdResolving(false);

          setRdError(
            error?.message ||
              "Unable to resolve this stream."
          );
        }
      }
    };

    run();

    return () => {
      cancelled = true;

      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
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

  /*
   * Poll Real-Debrid while a newly submitted torrent
   * is being prepared.
   */
  useEffect(() => {
    if (
      !rdTorrentId ||
      rdOverride
    ) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    setRdPolling(true);

    const tick = async () => {
      if (cancelled) return;

      attempts += 1;

      try {
        const res =
          await base44.functions.invoke(
            "realDebrid",
            {
              action: "torrent_info",

              torrent_id:
                rdTorrentId,

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

        if (cancelled) return;

        const data =
          res?.data || {};

        if (
          data.status === "ready" &&
          data.stream_url
        ) {
          setRdOverride({
            src: data.stream_url,
            label:
              data.filename ||
              "Real-Debrid Stream",
            file: currentFilePath(
              data.files
            ),
          });

          setRdFiles(
            data.files || []
          );

          setRdPolling(false);
          setRdTorrentId(null);

          return;
        }

        if (data.error) {
          setRdError(data.error);
          setRdPolling(false);
          setRdTorrentId(null);
          return;
        }
      } catch (error) {
        if (!cancelled) {
          setRdError(
            error?.message ||
              "Real-Debrid polling failed."
          );

          setRdPolling(false);
          setRdTorrentId(null);
        }

        return;
      }

      /*
       * 36 attempts x 5 seconds = 3 minutes.
       */
      if (attempts < 36) {
        pollRef.current =
          setTimeout(
            tick,
            5000
          );
      } else {
        setRdPolling(false);
        setRdTorrentId(null);

        setRdError(
          "Real-Debrid is still preparing this file. Please try Check Again shortly."
        );
      }
    };

    /*
     * Give RD a moment to register the torrent.
     */
    pollRef.current =
      setTimeout(
        tick,
        2500
      );

    return () => {
      cancelled = true;

      if (pollRef.current) {
        clearTimeout(
          pollRef.current
        );

        pollRef.current = null;
      }
    };
  }, [
    rdTorrentId,
    rdOverride,
    source,
  ]);

  /*
   * Keyboard controls.
   */
  useEffect(() => {
    const onKey = (event) => {
      if (
        event.key === "Escape" &&
        !document.fullscreenElement
      ) {
        onClose();
        return;
      }

      const tag = (
        event.target?.tagName ||
        ""
      ).toLowerCase();

      if (
        tag === "input" ||
        tag === "textarea" ||
        event.target?.isContentEditable
      ) {
        return;
      }

      const video =
        stageRef.current?.querySelector(
          "video"
        );

      if (!video) return;

      if (
        event.key >= "0" &&
        event.key <= "9" &&
        video.duration
      ) {
        event.preventDefault();

        video.currentTime =
          video.duration *
          (parseInt(
            event.key,
            10
          ) / 10);

        return;
      }

      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();

          if (video.paused) {
            video
              .play()
              .catch(() => {});
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
              (video.currentTime ||
                0) - 10
            );

          break;

        case "ArrowRight":
        case "l":
          event.preventDefault();

          if (video.duration) {
            video.currentTime =
              Math.min(
                video.duration,
                (video.currentTime ||
                  0) + 10
              );
          }

          break;

        case "ArrowUp":
          event.preventDefault();

          video.volume =
            Math.min(
              1,
              (video.volume ?? 1) +
                0.1
            );

          break;

        case "ArrowDown":
          event.preventDefault();

          video.volume =
            Math.max(
              0,
              (video.volume ?? 1) -
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
              (video.playbackRate ||
                1) - 0.25
            );

          break;

        case ">":
          event.preventDefault();

          video.playbackRate =
            Math.min(
              2,
              (video.playbackRate ||
                1) + 0.25
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
  }, [onClose]);

  /*
   * Autoplay direct/RD video.
   */
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

    if (
      !rdOverride &&
      active?.type !== "file" &&
      active?.type !== "url" &&
      active?.type !== "live"
    ) {
      return;
    }

    video.muted = false;

    video.play().catch(() => {
      video.muted = true;

      video
        .play()
        .catch(() => {});
    });
  }, [
    active,
    rdOverride,
  ]);

  /*
   * Continue Watching.
   */
  const lastSaveRef =
    useRef(0);

  const cwIdRef =
    useRef({});

  const lastPosRef =
    useRef({
      t: 0,
      d: 0,
    });

  const saveProgress = (
    time,
    duration,
    force = false
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

    if (!url) return;

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
      progress: time,
      duration,
      video_url: url,
      poster_url:
        source.poster || "",
      source_type:
        rdOverride
          ? "rd"
          : "file",
    };

    const id =
      cwIdRef.current[key];

    if (id) {
      base44.entities.ContinueWatching
        .update(id, patch)
        .catch(() => {});

      return;
    }

    base44.entities.ContinueWatching
      .filter({
        content_key: key,
      })
      .then((rows) => {
        if (rows?.length > 0) {
          cwIdRef.current[key] =
            rows[0].id;

          base44.entities.ContinueWatching
            .update(
              rows[0].id,
              patch
            )
            .catch(() => {});

          return;
        }

        return base44.entities.ContinueWatching
          .create({
            content_key: key,
            title: source.title,
            year:
              source.rdYear ||
              source.year ||
              "",
            ...patch,
          })
          .then((created) => {
            cwIdRef.current[key] =
              created.id;
          });
      })
      .catch(() => {});
  };

  const saveProgressRef =
    useRef(saveProgress);

  saveProgressRef.current =
    saveProgress;

  useEffect(() => {
    return () => {
      const {
        t,
        d,
      } = lastPosRef.current;

      if (t > 5) {
        saveProgressRef.current?.(
          t,
          d,
          true
        );
      }
    };
  }, []);

  const handleLoadedMetadata = (
    event
  ) => {
    const video =
      event.target;

    if (
      source?.startTime &&
      source.startTime > 5
    ) {
      try {
        video.currentTime =
          source.startTime;
      } catch {
        // Ignore.
      }
    }
  };

  const handleTimeUpdate = (
    event
  ) => {
    const video =
      event.target;

    lastPosRef.current = {
      t:
        video.currentTime ||
        0,
      d:
        video.duration || 0,
    };

    saveProgress(
      video.currentTime ||
        0,
      video.duration ||
        0
    );
  };

  /*
   * Allow selecting another video file from a
   * multi-file RD torrent.
   */
  const pickFile = async (
    file
  ) => {
    if (!file?.link) {
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

    setFileSwitching(true);
    setRdError("");

    try {
      const res =
        await base44.functions.invoke(
          "realDebrid",
          {
            action:
              "unrestrict_file",
            link: file.link,
          }
        );

      const data =
        res?.data || {};

      if (data.stream_url) {
        setRdOverride({
          src:
            data.stream_url,
          label:
            file.path ||
            "Real-Debrid File",
          file:
            file.path || "",
        });
      } else {
        setRdError(
          data.error ||
            "Could not open this file."
        );
      }
    } catch (error) {
      setRdError(
        error?.message ||
          "Real-Debrid request failed."
      );
    } finally {
      setFileSwitching(false);
    }
  };

  /*
   * Retry the currently selected RD source.
   */
  const retryResolution = () => {
    setRdOverride(null);
    setRdFiles([]);
    setRdTorrentId(null);
    setRdError("");
    setRdResolving(true);

    /*
     * Changing activeIdx to itself does not trigger React's
     * effect, so force a harmless source reset by temporarily
     * changing state through the same index.
     */
    const current =
      activeIdx;

    setActiveIdx(-1);

    setTimeout(() => {
      setActiveIdx(current);
    }, 0);
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
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl"
        onClick={(event) =>
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
              {source?.title}
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
              onClick={onClose}
              className="text-white/60 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
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
                  {displayedError}
                </p>
              )}
            </div>
          ) : rdOverride ? (
            <>
              <video
                key={rdOverride.src}
                ref={videoRef}
                src={rdOverride.src}
                poster={source?.poster}
                playsInline
                controls={false}
                onLoadedMetadata={
                  handleLoadedMetadata
                }
                onTimeUpdate={
                  handleTimeUpdate
                }
                className="w-full h-full object-contain bg-black"
              />

              <PlayerControls
                key={rdOverride.src}
                videoRef={videoRef}
                stageRef={stageRef}
                isLive={isLive}
                onFullscreen={
                  goFullscreen
                }
              />
            </>
          ) : isYoutube ? (
            <iframe
              src={active.src}
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
              src={active.src}
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
                ref={liveVideoRef}
                key={active.src}
                src={active.src}
                poster={
                  source?.poster
                }
                controls={false}
                className="w-full h-full object-contain bg-black"
                onLoadedMetadata={
                  handleLoadedMetadata
                }
                onTimeUpdate={
                  handleTimeUpdate
                }
              />

              <PlayerControls
                key={active.src}
                videoRef={
                  liveVideoRef
                }
                stageRef={
                  stageRef
                }
                isLive={isLive}
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
                  {displayedError}
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
                    {displayedError}
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
          rdFiles.length > 1 && (
            <div className="mt-3 bg-mg-card border border-white/10 rounded-lg p-2 max-h-44 overflow-y-auto">
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide px-1 pb-1 flex items-center gap-1">
                <Film className="w-3 h-3" />
                Files
              </p>

              <div className="flex flex-col gap-0.5">
                {rdFiles.map(
                  (file) => {
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
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {sources.map(
              (item, index) => (
                <button
                  key={`${index}-${item.label || "source"}`}
                  onClick={() =>
                    setActiveIdx(
                      index
                    )
                  }
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors",

                    index ===
                      activeIdx
                      ? "bg-mg-green text-black"
                      : "bg-mg-card text-white/70 hover:text-white"
                  )}
                >
                  {(item.type ===
                    "rd" ||
                    item.type ===
                      "rd_torrent") && (
                    <Zap className="w-3 h-3" />
                  )}

                  {item.type ===
                    "magnet" && (
                    <Link className="w-3 h-3" />
                  )}

                  {item.type ===
                    "torrent" && (
                    <Download className="w-3 h-3" />
                  )}

                  {item.type ===
                    "provider" && (
                    <Tv className="w-3 h-3" />
                  )}

                  {item.type ===
                    "youtube" && (
                    <ExternalLink className="w-3 h-3" />
                  )}

                  <span>
                    {item.label ||
                      `Source ${
                        index + 1
                      }`}
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
