import React from "react";
import { ArrowLeft, Check, Film, Loader2 } from "lucide-react";

/**
 * In-player source drawer. A visible list of buttons rather than an Android
 * WebView <select> popup: the latter can disappear when source discovery
 * updates the available options during a resume/decoder failure.
 *
 * The chooser does NOT create a new playback request. It uses the active
 * VideoPlayer's selectSource, retaining the current position and manual lock.
 */
export default function InPlayerSourceDrawer({
  title,
  entries = [],
  activeIdx = 0,
  failedSources,
  sourceLabel,
  onSelect,
  onClose,
  discovering = false,
}) {
  const choices = Array.isArray(entries) ? entries : [];
  return (
    <div
      data-mg-in-player-source-drawer="true"
      role="dialog"
      aria-modal="true"
      aria-label="Choose video source inside player"
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/95 p-3 text-white sm:p-6"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex max-h-[min(88dvh,800px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-zinc-950 shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 p-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Return to video player"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-bold hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green"
          >
            <ArrowLeft className="h-4 w-4" />
            Player
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title || "Video"}</p>
            <p className="text-xs text-white/55">
              {choices.length} {choices.length === 1 ? "source" : "sources"} · choose another playable version
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4" data-mg-source-drawer-list="true">
          {choices.map(({ index, item }) => {
            const active = Number(index) === Number(activeIdx);
            const failed = failedSources?.has?.(index);
            const label = typeof sourceLabel === "function"
              ? sourceLabel(item, index)
              : String(item?.label || item?.name || `Source ${Number(index) + 1}`);
            return (
              <button
                key={`drawer-source-${index}`}
                type="button"
                data-mg-source-choice={index}
                onClick={() => {
                  if (!active) onSelect?.(index, item);
                  onClose?.();
                }}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-mg-green ${
                  active ? "border-mg-green/70 bg-mg-green/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
                aria-label={`${active ? "Current source" : "Select source"}: ${label}`}
              >
                {active ? <Check className="h-5 w-5 shrink-0 text-mg-green" /> : <Film className="h-5 w-5 shrink-0 text-white/55" />}
                <span className="min-w-0 flex-1 break-words">{label}</span>
                {failed && <span className="shrink-0 text-xs text-amber-300">Previously failed</span>}
                {active && <span className="shrink-0 text-xs text-mg-green">Current</span>}
              </button>
            );
          })}
          {choices.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-9 text-center">
              {discovering ? <Loader2 className="h-6 w-6 animate-spin text-mg-green" /> : <Film className="h-6 w-6 text-white/50" />}
              <p className="text-sm font-semibold">
                {discovering ? "Looking for alternative sources…" : "No alternative sources found"}
              </p>
              <p className="text-xs leading-relaxed text-white/60">
                {discovering
                  ? "The player is checking addons and Real-Debrid. New options appear here without returning to Home."
                  : "You can go back to the player or exit to choose this title again. Your Continue Watching history is kept."}
              </p>
            </div>
          )}
          {discovering && choices.length > 0 && (
            <p className="flex items-center gap-2 px-1 pt-2 text-xs text-white/60">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              More sources are still being checked…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
