import React, { useEffect, useRef, useState } from "react";
import { X, Copy, Check, ExternalLink, Link, Download, Tv, Loader2, Zap, RefreshCw, Film, Maximize } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";
import PlayerControls from "@/components/mg/PlayerControls";

const currentFilePath = (files) => (files?.find((f) => f.selected) || files?.[0] || {}).path || "";

export default function VideoPlayer({ source, onClose }) {
  const sources = source.sources || [
    {
      label: source.label || (source.type === "live" ? "LIVE" : "Stream"),
      type: source.type,
      src: source.src,
      live: source.type === "live",
    },
  ];
  const [activeIdx, setActiveIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [rdResolving, setRdResolving] = useState(false);
  const [rdError, setRdError] = useState("");
  const [rdOverride, setRdOverride] = useState(null);
  const [rdFiles, setRdFiles] = useState([]);
  const [fileSwitching, setFileSwitching] = useState(false);
  const videoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const stageRef = useRef(null);

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

  const active = sources[activeIdx] || sources[0];
  const isLive = source.type === "live" || active?.live;

  useEffect(() => {
    setRdOverride(null);
    setRdError("");
    setRdFiles([]);
  }, [activeIdx]);

  useEffect(() => {
    if (!active?.src || active?.type === "youtube" || active?.type === "provider" || active?.type === "file" || active?.live) return;
    
    let cancelled = false;
    setRdResolving(true);
    setRdError("");

    const run = async () => {
      try {
        const isMagnet = active.src.startsWith("magnet:");
        const actionType = isMagnet ? "add_magnet" : "resolve_best";
        const payload = isMagnet ? { action: actionType, magnet: active.src, title: source.title, year: source.year } : { action: actionType, magnet: active.src };

        const res = await base44.functions.invoke("realDebrid", payload);
        if (cancelled) return;
        const data = res.data || {};
        
        if (data.status === "ready" && data.stream_url) {
          setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
          setRdFiles(data.files || []);
        } else if (data.stream_url) {
          setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
          setRdFiles(data.files || []);
        } else if (data.error) {
          setRdError(data.error);
        } else {
          setRdOverride({ src: active.src, label: active.label });
        }
      } catch (e) {
        if (!cancelled) {
          setRdOverride({ src: active.src, label: active.label });
        }
      } finally {
        if (!cancelled) setRdResolving(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeIdx, active, source.title, source.year]);

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
        case "f":
          e.preventDefault();
          goFullscreen();
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
    const currentSrc = rdOverride?.src || active?.src;
    if (!currentSrc || active?.type === "youtube" || active?.type === "provider" || !video) return;
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }, [active, rdOverride]);

  const handleLoadedMetadata = (e) => {
    const v = e.target;
    if (source.startTime && source.startTime > 5) {
      try { v.currentTime = source.startTime; } catch {}
    }
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
      }
    } catch (e) {} finally {
      setFileSwitching(false);
    }
  };

  const currentPlayUrl = rdOverride?.src || (active?.src?.startsWith("http") ? active.src : null);

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
            <h3 className="text-white font-semibold text-sm truncate">{source.title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {currentPlayUrl && active?.type !== "youtube" && active?.type !== "provider" && (
              <>
                <button onClick={goFullscreen} className="text-white/60 hover:text-white" aria-label="Fullscreen">
                  <Maximize className="w-5 h-5" />
                </button>
                <CastButton url={currentPlayUrl} title={source.title} poster={source.poster} />
              </>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={stageRef} className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
          {rdResolving ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />
              <p className="text-white/70 text-xs">Resolving stream through Real-Debrid…</p>
            </div>
          ) : rdOverride || currentPlayUrl ? (
            <video
              key={rdOverride?.src || currentPlayUrl}
              ref={videoRef}
              src={rdOverride?.src || currentPlayUrl}
              poster={source.poster}
              playsInline
              controls
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full h-full object-contain bg-black"
            />
          ) : active?.type === "youtube" ? (
            <iframe
              src={active.src}
              title={source.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="text-white/60 text-xs p-6 text-center">No stream source available.</div>
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
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
