import React, { useEffect } from "react";
import { X } from "lucide-react";

export default function VideoPlayer({ source, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {source.type === "live" && (
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
          {source.type === "youtube" ? (
            <iframe
              src={source.src}
              title={source.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              src={source.src}
              poster={source.poster}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          )}
        </div>
      </div>
    </div>
  );
}