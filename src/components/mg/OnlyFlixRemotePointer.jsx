import React, { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import { isNativeFireTvEmbedRemoteAvailable } from "@/components/mg/nativeFireTvBridge";

export default function OnlyFlixRemotePointer({ visible = true, compact = false }) {
  const [available] = useState(isNativeFireTvEmbedRemoteAvailable);
  const [point, setPoint] = useState({ x: 10, y: 67 });
  useEffect(() => {
    if (!available) return undefined;
    const move = (event) => {
      const direction = event.detail;
      const frame = document.querySelector('[data-mg-embedded-remote-player="true"] iframe');
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      setPoint((current) => ({
        x: Math.max(2, Math.min(98, current.x + (direction === "left" ? -1 : direction === "right" ? 1 : 0) * 1600 / rect.width)),
        y: Math.max(2, Math.min(98, current.y + (direction === "up" ? -1 : direction === "down" ? 1 : 0) * 1600 / rect.height)),
      }));
    };
    window.addEventListener("mg:onlyflix-pointer-move", move);
    return () => window.removeEventListener("mg:onlyflix-pointer-move", move);
  }, [available]);
  if (!available) return null;
  // Keep the iframe video free of a full-size fading compositing layer.
  // Visibility preserves pointer coordinates used by the native remote tap.
  // Live TV retains its existing presentation (compact defaults to false).
  if (compact) return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute h-8 w-8 text-mg-green"
      style={{ left: `calc(${point.x}% - 16px)`, top: `calc(${point.y}% - 16px)`, visibility: visible ? "visible" : "hidden" }}
    >
      <Crosshair data-mg-embed-pointer="true" className="h-8 w-8" />
    </div>
  );
  return (
    <div className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`} aria-hidden="true">
      <Crosshair data-mg-embed-pointer="true" className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-mg-green drop-shadow-md" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
    </div>
  );
}