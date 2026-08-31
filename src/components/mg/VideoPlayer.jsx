import React, { useEffect, useRef, useState } from "react";
import { X, Copy, Check, ExternalLink, Link, Download, Tv, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";

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
  const videoRef = useRef(null);

  const active = sources[activeIdx] || sources[0];
  const isLive = source.type === "live" || active?.live;

  useEffect(() => {
    setRdOverride(null);
    setRdError("");
  }, [activeIdx]);

  // Auto-resolve the default Real-Debrid source on open; fall back to the next
  // source if no cached torrent is available.
  useEffect(() => {
    if (active?.type !== "rd") return;
    let cancelled = false;
    setRdResolving(true);
    setRdError("");
    base44.functions
      .invoke("realDebrid", { action: "resolve_best", magnet: active.src })
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        if (data.status === "ready" && data.stream_url) {
          setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream" });
        } else if (data.status === "not_cached") {
          setActiveIdx((i) => Math.min(i + 1, sources.length - 1));
        } else if (data.error) {
          setRdError(data.error);
          setActiveIdx((i) => Math.min(i + 1, sources.length - 1));
        } else {
          setActiveIdx((i) => Math.min(i + 1, sources.length - 1));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setRdError(e.message || "Real-Debrid request failed");
        setActiveIdx((i) => Math.min(i + 1, sources.length - 1));
      })
      .finally(() => {
        if (!cancelled) setRdResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeIdx, active?.type]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Explicitly start playback when a stream becomes active — autoPlay alone is
  // unreliable, but play() after the user's click gesture always works.
  useEffect(() => {
    if ((active?.type === "file" || rdOverride) && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [active, rdOverride]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  const openLink = (href) => window.open(href, "_blank", "noopener,noreferrer");

  const resolveRd = async () => {
    setRdResolving(true);
    setRdError("");
    try {
      const res = await base44.functions.invoke("realDebrid", {
        action: "add_magnet",
        magnet: active.src,
      });
      const data = res.data || {};
      if (data.error) {
        setRdError(data.error);
      } else if (data.status === "ready" && data.stream_url) {
        setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream" });
      } else if (data.status === "preparing") {
        setRdError("Torrent is being prepared on Real-Debrid — try again shortly.");
      } else {
        setRdError("Real-Debrid could not resolve this magnet.");
      }
    } catch (e) {
      setRdError(e.message || "Real-Debrid request failed");
    } finally {
      setRdResolving(false);
    }
  };

  const isP2P = active?.type === "magnet" || active?.type === "torrent";

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
            {(active?.type === "file" || rdOverride) && (
              <CastButton
                url={rdOverride?.src || active.src}
                title={source.title}
                poster={source.poster}
              />
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
          {rdOverride ? (
            <video
              ref={videoRef}
              src={rdOverride.src}
              poster={source.poster}
              controls
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          ) : active?.type === "youtube" && (
            <iframe
              src={active.src}
              title={source.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
          {active?.type === "file" && (
            <video
              ref={videoRef}
              src={active.src}
              poster={source.poster}
              controls
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          )}
          {active?.type === "rd" && !rdOverride && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-mg-green/15 border border-mg-green/40 flex items-center justify-center">
                {rdResolving ? (
                  <Loader2 className="w-6 h-6 text-mg-green animate-spin" />
                ) : (
                  <Zap className="w-6 h-6 text-mg-green" />
                )}
              </div>
              <p className="text-white font-semibold text-sm">
                {rdResolving ? "Resolving via Real-Debrid…" : "Real-Debrid"}
              </p>
              <p className="text-white/40 text-xs max-w-sm">
                {rdResolving
                  ? "Checking Real-Debrid cache for an instant stream…"
                  : "No cached stream found — falling back to another source."}
              </p>
              {rdError && (
                <p className="text-red-400 text-xs mt-1 max-w-md break-words">{rdError}</p>
              )}
            </div>
          )}
          {isP2P && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-mg-green/15 border border-mg-green/40 flex items-center justify-center">
                {active.type === "magnet" ? (
                  <Link className="w-6 h-6 text-mg-green" />
                ) : (
                  <Download className="w-6 h-6 text-mg-green" />
                )}
              </div>
              <p className="text-white font-semibold text-sm">
                {active.type === "magnet" ? "Magnet Link" : "Torrent File"}
              </p>
              <p className="text-white/40 text-xs break-all max-w-md font-mono">{active.src}</p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => copy(active.src)}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-md"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-mg-green" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => openLink(active.src)}
                  className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green-dim"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </button>
                {active.type === "magnet" && (
                  <button
                    onClick={resolveRd}
                    disabled={rdResolving}
                    className="flex items-center gap-1.5 bg-mg-green/20 border border-mg-green/50 text-mg-green font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green/30 disabled:opacity-60"
                  >
                    {rdResolving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    {rdResolving ? "Resolving…" : "Stream via Real-Debrid"}
                  </button>
                )}
              </div>
              {rdResolving && (
                <p className="text-mg-green text-xs mt-1">Contacting Real-Debrid…</p>
              )}
              {rdError && (
                <p className="text-red-400 text-xs mt-1 max-w-md break-words">{rdError}</p>
              )}
              <p className="text-white/30 text-[10px] mt-1">
                Opens in your torrent client — or stream instantly with Real-Debrid
              </p>
            </div>
          )}
          {active?.type === "provider" && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              {active.logo ? (
                <img src={active.logo} alt={active.label} className="w-14 h-14 rounded-md object-contain bg-white/5 p-1" />
              ) : (
                <div className="w-14 h-14 rounded-md bg-mg-green/15 border border-mg-green/40 flex items-center justify-center">
                  <Tv className="w-7 h-7 text-mg-green" />
                </div>
              )}
              <p className="text-white font-semibold text-sm">Watch on {active.label}</p>
              <p className="text-white/40 text-xs">Legal streaming provider</p>
              <button
                onClick={() => openLink(active.src)}
                className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green-dim"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </button>
            </div>
          )}
        </div>

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
                {s.type === "rd" && <Zap className="w-3 h-3" />}
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