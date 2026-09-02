import React, { useEffect, useRef, useState } from "react";
import { X, Copy, Check, ExternalLink, Link, Download, Tv, Loader2, Zap, RefreshCw, Film, Maximize } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";
import PlayerControls from "@/components/mg/PlayerControls";

const currentFilePath = (files) => (files?.find((f) => f.selected) || files?.[0] || {}).path || "";

export default function VideoPlayer({ source, onClose }) {
  const sources = source?.sources && source.sources.length > 0 ? source.sources : [
    {
      label: source?.label || (source?.type === "live" ? "LIVE" : "Stream"),
      type: source?.type || "rd",
      src: source?.src || source?.magnet || source?.magnetLink || source?.url,
      magnet: source?.magnet || source?.src || source?.magnetLink || source?.url,
      live: source?.type === "live",
    },
  ];
  const [activeIdx, setActiveIdx] = useState(0);
  const [rdResolving, setRdResolving] = useState(false);
  const [rdPolling, setRdPolling] = useState(false);
  const [rdError, setRdError] = useState("");
  const [rdOverride, setRdOverride] = useState(null);
  const [rdFiles, setRdFiles] = useState([]);
  const [fileSwitching, setFileSwitching] = useState(false);
  const videoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const pollRef = useRef(null);

  const goFullscreen = () => {
    const video = videoRef.current;
    const stage = stageRef.current;
    try {
      if (video && video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      } else if (stage?.requestFullscreen) {
        stage.requestFullscreen().catch(() => {});
      } else if (video?.requestFullscreen) {
        video.requestFullscreen().catch(() => {});
      }
    } catch {}
  };

  const active = sources[activeIdx] || sources[0] || {};
  const isLive = source?.type === "live" || active?.live;

  useEffect(() => {
    setRdOverride(null);
    setRdError("");
    setRdFiles([]);
    if (pollRef.current) clearTimeout(pollRef.current);
  }, [activeIdx]);

  useEffect(() => {
    if (!active || active?.type === "youtube" || active?.type === "provider" || active?.type === "file" || active?.live) return;
    
    let cancelled = false;
    setRdResolving(true);
    setRdError("");

    const run = async () => {
      try {
        const cacheRes = await base44.functions.invoke("realDebrid", {
          action: "find_cached",
          title: source?.rdTitle || source?.title,
          ...(source?.rdYear != null ? { year: source.rdYear } : {}),
          ...(source?.rdSeason != null ? { season: source.rdSeason } : {}),
          ...(source?.rdEpisode != null ? { episode: source.rdEpisode } : {}),
        });

        if (cancelled) return;
        const cacheData = cacheRes.data || {};

        if (cacheData.status === "ready" && cacheData.stream_url) {
          setRdOverride({ src: cacheData.stream_url, label: "Real-Debrid Stream", file: currentFilePath(cacheData.files) });
          setRdFiles(cacheData.files || []);
          setRdResolving(false);
          return;
        }

        let torrentId = cacheData.torrent_id;

        if (!torrentId) {
          let magnetToUse = 
            active?.src || 
            active?.magnet || 
            active?.magnetLink || 
            active?.url || 
            active?.infoHash ||
            sources[0]?.src || 
            sources[0]?.magnet || 
            sources[0]?.magnetLink || 
            sources[0]?.url || 
            source?.src || 
            source?.magnet || 
            source?.magnetLink || 
            source?.url || 
            cacheData.magnet;

          if (!magnetToUse) {
            setRdError("No stream source provided.");
            setRdResolving(false);
            return;
          }

          const res = await base44.functions.invoke("realDebrid", {
            action: "resolve_best",
            magnet: magnetToUse,
            title: source?.rdTitle || source?.title,
            ...(source?.rdYear != null ? { year: source.rdYear } : {}),
            ...(source?.rdSeason != null ? { season: source.rdSeason } : {}),
            ...(source?.rdEpisode != null ? { episode: source.rdEpisode } : {}),
          });

          if (cancelled) return;
          const data = res.data || {};

          if (data.status === "ready" && data.stream_url) {
            setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
            setRdFiles(data.files || []);
            setRdResolving(false);
            return;
          }
          torrentId = data.torrent_id;
        }

        if (!torrentId) {
          setRdError("Could not initialize torrent on Real-Debrid.");
          setRdResolving(false);
          return;
        }

        setRdResolving(false);
        setRdPolling(true);
        let attempts = 0;

        const pollTick = async () => {
          if (cancelled) return;
          attempts += 1;
          try {
            const pollRes = await base44.functions.invoke("realDebrid", {
              action: "torrent_info",
              torrent_id: torrentId,
              title: source?.rdTitle || source?.title,
              ...(source?.rdYear != null ? { year: source.rdYear } : {}),
              ...(source?.rdSeason != null ? { season: source.rdSeason } : {}),
              ...(source?.rdEpisode != null ? { episode: source.rdEpisode } : {}),
            });
            const pollData = pollRes.data || {};
            if (cancelled) return;

            if (pollData.status === "ready" && pollData.stream_url) {
              setRdOverride({ src: pollData.stream_url, label: "Real-Debrid Stream", file: currentFilePath(pollData.files) });
              setRdFiles(pollData.files || []);
              setRdPolling(false);
              return;
            }
            if (pollData.error) {
              setRdError(pollData.error);
              setRdPolling(false);
              return;
            }
          } catch (e) {
            if (!cancelled) {
              setRdError(e.message || "Real-Debrid poll failed");
            }
            setRdPolling(false);
            return;
          }

          if (attempts < 45) {
            pollRef.current = setTimeout(pollTick, 4000);
          } else {
            setRdPolling(false);
            setRdError("Real-Debrid is still preparing this file. Please try again shortly.");
          }
        };

        pollRef.current = setTimeout(pollTick, 4000);

      } catch (e) {
        if (!cancelled) {
          setRdError(e.message || "Resolution failed");
          setRdResolving(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [activeIdx, source]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.fullscreenElement) {
        onClose();
        return;
      }
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      const video = stageRef.current?.querySelector("video");
      if (!video) return;
      if (e.key >= "0" && e.key <= "9" && video.duration) {
        e.preventDefault();
        video.currentTime = video.duration * (parseInt(e.key, 10) / 10);
        return;
      }
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          if (video.paused) video.play().catch(() => {});
          else video.pause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (video.duration) video.currentTime = Math.min(video.duration, (video.currentTime || 0) + 10);
          break;
        case "ArrowUp":
          e.preventDefault();
          video.volume = Math.min(1, (video.volume ?? 1) + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          video.volume = Math.max(0, (video.volume ?? 1) - 0.1);
          break;
        case "f":
          e.preventDefault();
          goFullscreen();
          break;
        case "m":
          e.preventDefault();
          video.muted = !video.muted;
          break;
        case "j":
          e.preventDefault();
          video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
          break;
        case "l":
          e.preventDefault();
          if (video.duration) video.currentTime = Math.min(video.duration, (video.currentTime || 0) + 10);
          break;
        case "<":
          e.preventDefault();
          video.playbackRate = Math.max(0.5, (video.playbackRate || 1) - 0.25);
          break;
        case ">":
          e.preventDefault();
          video.playbackRate = Math.min(2, (video.playbackRate || 1) + 0.25);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    const video = videoRef.current;
    if (!((active?.type === "file" || rdOverride) && video)) return;
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }, [active, rdOverride]);

  const lastSaveRef = useRef(0);
  const cwIdRef = useRef({});
  const saveProgress = (t, d, force) => {
    if (isLive || !source?.title) return;
    const url = rdOverride?.src || active?.src || active?.magnet;
    if (!url) return;
    const now = Date.now();
    if (!force && now - lastSaveRef.current < 10000) return;
    lastSaveRef.current = now;
    const key = `${source.title}|${source.rdYear || source.year || ""}`;
    const patch = { progress: t, duration: d, video_url: url, poster_url: source.poster || "", source_type: rdOverride ? "rd" : "file" };
    const id = cwIdRef.current[key];
    if (id) {
      base44.entities.ContinueWatching.update(id, patch).catch(() => {});
    } else {
      base44.entities.ContinueWatching.filter({ content_key: key })
        .then((rows) => {
          if (rows.length > 0) {
            cwIdRef.current[key] = rows[0].id;
            base44.entities.ContinueWatching.update(rows[0].id, patch).catch(() => {});
          } else {
            base44.entities.ContinueWatching.create({
              content_key: key,
              title: source.title,
              year: source.rdYear || source.year || "",
              ...patch,
            })
              .then((r) => { cwIdRef.current[key] = r.id; })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  };
  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;
  const lastPosRef = useRef({ t: 0, d: 0 });

  useEffect(() => {
    return () => {
      const { t, d } = lastPosRef.current;
      if (t > 5) saveProgressRef.current?.(t, d, true);
    };
  }, []);

  const handleLoadedMetadata = (e) => {
    const v = e.target;
    if (source?.startTime && source.startTime > 5) {
      try { v.currentTime = source.startTime; } catch {}
    }
  };
  const handleTimeUpdate = (e) => {
    const v = e.target;
    lastPosRef.current = { t: v.currentTime || 0, d: v.duration || 0 };
    saveProgress(v.currentTime || 0, v.duration || 0);
  };

  const pickFile = async (file) => {
    if (rdOverride?.file === file.path) return;
    setFileSwitching(true);
    setRdError("");
    try {
      const res = await base44.functions.invoke("realDebrid", {
        action: "unrestrict_file",
        link: file.link,
      });
      const data = res.data || {};
      if (data.stream_url) {
        setRdOverride({ src: data.stream_url, label: file.path, file: file.path });
      } else {
        setRdError(data.error || "Could not unrestrict this file.");
      }
    } catch (e) {
      setRdError(e.message || "Real-Debrid request failed");
    } finally {
      setFileSwitching(false);
    }
  };

  const busy = rdResolving || rdPolling;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isLive && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </span>
            )}
            <h3 className="text-white font-semibold text-sm truncate">{source?.title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(active?.type === "file" || active?.type === "live" || rdOverride) && (
              <>
                <button
                  onClick={goFullscreen}
                  className="text-white/60 hover:text-white"
                  aria-label="Fullscreen"
                >
                  <Maximize className="w-5 h-5" />
                </button>
                <CastButton
                  url={rdOverride?.src || active?.src || active?.magnet}
                  title={source?.title}
                  poster={source?.poster}
                />
              </>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={stageRef} className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
          {busy ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />
              <p className="text-white font-semibold text-sm">
                {rdResolving ? "Initializing Real-Debrid Stream…" : "Preparing download on Real-Debrid… Please wait."}
              </p>
              {rdError && <p className="text-red-400 text-xs mt-1 max-w-md break-words">{rdError}</p>}
            </div>
          ) : rdOverride ? (
            <>
              <video
                key={rdOverride.src}
                ref={videoRef}
                src={rdOverride.src}
                poster={source?.poster}
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                className="w-full h-full object-contain bg-black"
              />
              <PlayerControls key={rdOverride.src} videoRef={videoRef} stageRef={stageRef} isLive={isLive} onFullscreen={goFullscreen} />
            </>
          ) : active?.type === "youtube" ? (
            <iframe
              src={active.src}
              title={source?.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (active?.type === "file" || active?.type === "live") && !rdOverride ? (
            <>
              <LiveVideo
                ref={liveVideoRef}
                key={active.src}
                src={active.src}
                poster={source?.poster}
                controls={false}
                className="w-full h-full object-contain bg-black"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
              />
              <PlayerControls key={active.src} videoRef={liveVideoRef} stageRef={stageRef} isLive={isLive} onFullscreen={goFullscreen} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />
              <p className="text-white font-semibold text-sm">Initializing Real-Debrid Stream…</p>
              {rdError && <p className="text-red-400 text-xs mt-1 max-w-md break-words">{rdError}</p>}
            </div>
          )}
        </div>

        {rdOverride && rdFiles.length > 1 && (
          <div className="mt-3 bg-mg-card border border-white/10 rounded-lg p-2 max-h-44 overflow-y-auto">
            <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide px-1 pb-1 flex items-center gap-1">
              <Film className="w-3 h-3" /> Files
            </p>
            <div className="flex flex-col gap-0.5">
              {rdFiles.map((f) => {
                const isCurrent = rdOverride.file === f.path;
                return (
                  <button
                    key={f.id}
                    onClick={() => pickFile(f)}
                    disabled={fileSwitching}
                    className={cn(
                      "flex items-center gap-2 text-left px-2 py-1.5 rounded text-xs transition-colors",
                      isCurrent ? "bg-mg-green/15 text-mg-green" : "text-white/70 hover:bg-white/5",
                      fileSwitching && "opacity-60"
                    )}
                  >
                    <Film className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate flex-1">{f.path}</span>
                    <span className="text-white/30 shrink-0">
                      {f.bytes > 1e9 ? `${(f.bytes / 1e9).toFixed(1)}GB` : `${(f.bytes / 1e6).toFixed(0)}MB`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sources.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {sources.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors",
                  i === activeIdx
                    ? "bg-mg-green text-black"
                    : "bg-mg-card text-white/70 hover:text-white"
                )}
              >
                {(s.type === "rd" || s.type === "rd_torrent") && <Zap className="w-3 h-3" />}
                {s.type === "magnet" && <Link className="w-3 h-3" />}
                {s.type === "torrent" && <Download className="w-3 h-3" />}
                {s.type === "provider" && <Tv className="w-3 h-3" />}
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
