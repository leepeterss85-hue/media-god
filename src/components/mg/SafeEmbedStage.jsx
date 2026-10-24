import React, { useEffect, useState } from "react";
import { Expand, Shrink } from "lucide-react";

/**
 * Keep the same iframe mounted while expanding. WebView's native custom-view
 * fullscreen can recreate the player activity and drop the active stream.
 * CSS fullscreen is intentionally used on both phone and Fire TV.
 */
export default function SafeEmbedStage({ children }) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onToolbarToggle = () => setFullscreen((previous) => !previous);
    window.addEventListener("mg:embed-toggle-fullscreen", onToolbarToggle);
    return () => window.removeEventListener("mg:embed-toggle-fullscreen", onToolbarToggle);
  }, []);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    // The Fire TV native Back button raises this custom event, not Escape.
    // Consume it when the embed is expanded, rather than exiting playback.
    const onFireTvBack = (event) => {
      if (!document.body?.classList.contains("mg-native-fire-tv")) return;
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      setFullscreen(false);
    };
    window.addEventListener("mg:native-back", onFireTvBack, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mg:native-back", onFireTvBack, true);
    };
  }, [fullscreen]);
  return (
    <div
      data-mg-player-stage="true"
      data-mg-safe-embed-fullscreen={fullscreen ? "true" : "false"}
      className={fullscreen
        ? "fixed inset-0 z-[2147483647] h-[100dvh] w-screen overflow-hidden bg-black"
        : "relative aspect-video min-h-[34vh] w-full overflow-hidden rounded-xl border border-white/10 bg-black"
      }
    >
      {children}
      <button
        type="button"
        data-mg-safe-fullscreen-toggle="true"
        onClick={() => setFullscreen((previous) => !previous)}
        aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        className="absolute bottom-3 right-3 z-30 flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/30 bg-black/75 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-mg-green"
      >{fullscreen ? <Shrink className="h-5 w-5" /> : <Expand className="h-5 w-5" />}</button>
    </div>
  );
}
