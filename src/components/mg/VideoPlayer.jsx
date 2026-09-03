import React, { useEffect, useRef, useState } from "react";
import { X, Loader2, Zap, Maximize } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";

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
  const [rdResolving, setRdResolving] = useState(false);
  const [rdPolling, setRdPolling] = useState(false);
  const [rdError, setRdError] = useState("");
  const [rdOverride, setRdOverride] = useState(null);
  const [rdFiles, setRdFiles] = useState([]);
  const [rdTorrentId, setRdTorrentId] = useState(null);
  const [pastedMagnet, setPastedMagnet] = useState("");
  const videoRef = useRef(null);
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

  const active = sources[activeIdx] || sources[0];
  const isLive = source.type === "live" || active?.live;

  useEffect(() => {
    setRdOverride(null);
    setRdError("");
    setRdFiles([]);
    setRdTorrentId(null);
  }, [activeIdx]);

  useEffect(() => {
    if (active?.type !== "rd") return;
    if (active.skipAutoResolve) return;
    let cancelled = false;
    setRdResolving(true);
    setRdError("");
    const run = async () => {
      if (active.src) {
        try {
          const res = await base44.functions.invoke("realDebrid", { action: "resolve_best", magnet: active.src, title: source.rdTitle || source.title });
          if (cancelled) return;
          const data = res.data || {};
          if (data.status === "ready" && data.stream_url) {
            setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
            setRdFiles(data.files || []);
            return;
          }
          if (data.torrent_id) {
            setRdTorrentId(data.torrent_id);
            return;
          }
          if (data.error) setRdError(data.error);
        } catch (e) {
          if (!cancelled) setRdError("Resolve error: " + (e.message || JSON.stringify(e)));
        }
      }
      try {
        const fc = await base44.functions.invoke("realDebrid", {
          action: "find_cached",
          title: source.rdTitle || source.title,
          ...(source.rdYear != null ? { year: source.rdYear } : {}),
          ...(source.rdSeason != null ? { season: source.rdSeason } : {}),
          ...(source.rdEpisode != null ? { episode: source.rdEpisode } : {}),
        });
        if (cancelled) return;
        const d = fc.data || {};
        if (d.status === "ready" && d.stream_url) {
          setRdOverride({ src: d.stream_url, label: "Real-Debrid Stream", file: currentFilePath(d.files) });
          setRdFiles(d.files || []);
        } else if (d.torrent_id) {
          setRdTorrentId(d.torrent_id);
        } else {
          setRdError(d.error || "Cached stream not found in your Real-Debrid library.");
        }
      } catch (e) {
        setRdError("Invoke error: " + (e.message || JSON.stringify(e)));
      }
    };
    run().finally(() => {
      if (!cancelled) setRdResolving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeIdx, active?.type, active?.src, source.title]);

  useEffect(() => {
    if (!rdTorrentId || rdOverride) return;
    let cancelled = false;
    setRdPolling(true);
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await base44.functions.invoke("realDebrid", {
          action: "torrent_info",
          torrent_id: rdTorrentId,
          title: source.rdTitle || source.title,
        });
        const data = res.data || {};
        if (cancelled) return;
        if (data.status === "ready" && data.stream_url) {
          setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
          setRdFiles(data.files || []);
          setRdPolling(false);
          return;
        }
        if (data.error) {
          setRdError(data.error);
          setRdPolling(false);
          return;
        }
      } catch (e) {
        if (!cancelled) setRdError(e.message || "Real-Debrid poll failed");
        setRdPolling(false);
        return;
      }
      if (attempts < 10) {
        pollRef.current = setTimeout(tick, 3000);
      } else {
        setRdPolling(false);
        setRdError("Cached stream not found in your Real-Debrid library.");
      }
    };
    pollRef.current = setTimeout(tick, 3000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [rdTorrentId, rdOverride]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.fullscreenElement) {
        onClose();
        return;
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

  const busy = rdResolving || rdPolling;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
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
            {(active?.type === "file" || active?.type === "live" || rdOverride) && (
              <>
                <button onClick={goFullscreen} className="text-white/60 hover:text-white" aria-label="Fullscreen">
                  <Maximize className="w-5 h-5" />
                </button>
                <CastButton url={rdOverride?.src || active.src} title={source.title} poster={source.poster} />
              </>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={stageRef} className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
          {rdOverride ? (
            <video
              key={rdOverride.src}
              ref={videoRef}
              src={rdOverride.src}
              poster={source.poster}
              controls
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          ) : active?.type === "youtube" ? (
            <iframe
              src={active.src}
              title={source.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (active?.type === "file" || active?.type === "live") && !rdOverride ? (
            <LiveVideo key={active.src} src={active.src} poster={source.poster} className="w-full h-full object-contain bg-black" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-mg-surface">
              <div className="w-12 h-12 rounded-full bg-mg-green/15 flex items-center justify-center mb-3">
                {busy ? <Loader2 className="w-6 h-6 text-mg-green animate-spin" /> : <Zap className="w-6 h-6 text-mg-green" />}
              </div>
              <h4 className="text-white font-semibold text-base mb-1">
                {busy ? (rdPolling ? "Checking Cache..." : "Resolving Stream...") : "Real-Debrid Stream"}
              </h4>
              <p className="text-white/50 text-xs max-w-md mb-4">
                {busy ? "Looking up available cached streams automatically." : "Stream options loaded below."}
              </p>
              {rdError && <p className="text-red-400 text-xs mb-3 bg-red-500/10 px-3 py-1.5 rounded">{rdError}</p>}
            </div>
          )}
        </div>

        {sources.length > 1 && (
          <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1">
            {sources.map((s, i) => (
              <button
                key={s.label + i}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  "text-xs font-medium px-3 py-1.5 rounded-md transition-colors shrink-0",
                  activeIdx === i ? "bg-mg-green text-black font-semibold" : "bg-mg-card text-white/70 hover:bg-white/10 border border-white/10"
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
