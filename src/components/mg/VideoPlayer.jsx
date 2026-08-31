import React, { useEffect, useState } from "react";
import { X, Copy, Check, ExternalLink, Link, Download } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const active = sources[activeIdx] || sources[0];
  const isLive = source.type === "live" || active?.live;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  const openLink = (href) => window.open(href, "_blank", "noopener,noreferrer");

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
          <button onClick={onClose} className="text-white/60 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
          {active?.type === "youtube" && (
            <iframe
              src={active.src}
              title={source.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
          {active?.type === "file" && (
            <video
              src={active.src}
              poster={source.poster}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
            />
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
              </div>
              <p className="text-white/30 text-[10px] mt-1">
                Opens in your default torrent client
              </p>
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
                {s.type === "magnet" && <Link className="w-3 h-3" />}
                {s.type === "torrent" && <Download className="w-3 h-3" />}
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}