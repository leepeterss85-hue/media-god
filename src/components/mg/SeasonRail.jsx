import React, { useEffect, useRef } from "react";

/**
 * Horizon-strip season switcher used by the TV show episode list.
 * Replaces the old dropdown so a season change is one tap and the strip
 * always shows which season is on screen, the way Netflix does it.
 */
export default function SeasonRail({
  seasons = [],
  value = "",
  onChange,
  focusPrefix = "season",
}) {
  const railRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    const rail = railRef.current;
    const active = activeRef.current;
    if (!rail || !active) return;

    const left =
      active.offsetLeft - (rail.clientWidth - active.clientWidth) / 2;

    if (typeof rail.scrollTo === "function") {
      rail.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    } else {
      rail.scrollLeft = Math.max(0, left);
    }
  }, [value]);

  if (!seasons.length) return null;

  return (
    <div
      ref={railRef}
      data-mg-season-rail="true"
      aria-label="Seasons"
      className="scrollbar-hide -mx-1 mb-3 flex overflow-x-auto overscroll-x-contain px-1"
    >
      <div className="flex min-w-max items-stretch gap-1 border-b border-white/10">
        {seasons.map((seasonItem) => {
          const number = Number(seasonItem?.season_number);
          const selected = String(number) === String(value);

          return (
            <button
              key={number}
              ref={selected ? activeRef : null}
              type="button"
              aria-pressed={selected}
              aria-label={
                seasonItem?.name || `Season ${number}`
              }
              data-mg-focus-key={`${focusPrefix}:${number}`}
              onClick={() => onChange?.(String(number))}
              className={`shrink-0 border-b-2 px-3 pb-2 pt-1 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-mg-green ${
                selected
                  ? "border-mg-green text-white"
                  : "border-transparent text-white/45 hover:text-white/80"
              }`}
            >
              {seasonItem?.name || `Season ${number}`}
              {Number(seasonItem?.episode_count) > 0 && (
                <span className="ml-1.5 text-[11px] font-medium text-white/35">
                  {seasonItem.episode_count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}