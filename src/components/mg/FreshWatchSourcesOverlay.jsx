import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import StreamSourcesBox from "@/components/mg/StreamSourcesBox";

/*
 * Render under PlayerAutomationBridge, not under CorePlayerProvider's
 * PlayerPortalRenderer. StreamSourcesBox uses the enhanced player context
 * to launch a selected source; a portal rendered by the core provider alone
 * would throw "usePlayer must be used within a PlayerProvider".
 */
export default function FreshWatchSourcesOverlay() {
  const [lookup, setLookup] = useState(null);

  useEffect(() => {
    const open = (event) => {
      if (!event?.detail?.title) return;
      setLookup({ ...event.detail });
    };
    const close = () => setLookup(null);
    window.addEventListener("mg:fresh-watch-sources-open", open);
    window.addEventListener("mg:fresh-watch-sources-close", close);
    return () => {
      window.removeEventListener("mg:fresh-watch-sources-open", open);
      window.removeEventListener("mg:fresh-watch-sources-close", close);
    };
  }, []);

  if (!lookup || typeof document === "undefined") return null;

  const close = () => {
    setLookup(null);
    window.dispatchEvent(new Event("mg:fresh-watch-sources-closed"));
  };

  return createPortal(
    <div
      data-mg-player-root="true"
      data-mg-manual-sources="true"
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/95 p-3 text-white"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Sources for ${lookup.title}`}
        className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/20 bg-zinc-950 p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">Sources · {lookup.title}</h2>
            <p className="text-xs text-white/60">
              Choose the same Real-Debrid, addon or web-player sources as the film and episode pages.
            </p>
          </div>
          <button
            type="button"
            data-mg-player-exit="true"
            aria-label="Back to web player"
            onClick={close}
            className="min-h-11 shrink-0 rounded-lg border border-white/20 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-mg-green"
          >
            Back to player
          </button>
        </div>
        <StreamSourcesBox
          title={lookup.title}
          poster={lookup.poster}
          rdYear={lookup.rdYear}
          alternateYears={lookup.alternateYears}
          alternateTitles={lookup.alternateTitles}
          tmdbId={lookup.tmdbId}
          imdbId={lookup.imdbId}
          mediaType={lookup.mediaType}
          season={lookup.season}
          episode={lookup.episode}
          resumeAt={lookup.resumeAt}
        />
      </section>
    </div>,
    document.body
  );
}
