import React from "react";
import { Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";

// Netflix-style centre transport for phones. Shown only below 640px (see media-player-controls.css).
export default function MobileCenterControls({
  visible,
  isLive,
  playing,
  togglePlay,
  skip,
  hasPreviousEpisode,
  hasNextEpisode,
  playPreviousEpisode,
  playNextEpisode,
}) {
  const side =
    "relative flex items-center justify-center rounded-full bg-black/35 text-white active:scale-95 transition";
  const big = "h-12 w-12";
  const pointer = visible ? "pointer-events-auto" : "pointer-events-none";

  return (
    <div data-mg-mobile-center="true" className="absolute inset-0 items-center justify-center gap-5 pointer-events-none">
      {hasPreviousEpisode ? (
        <button type="button" onClick={playPreviousEpisode} className={`${side} ${pointer} h-10 w-10`} aria-label="Previous episode">
          <SkipBack className="h-5 w-5" />
        </button>
      ) : null}
      {!isLive ? (
        <button type="button" onClick={() => skip(-10)} className={`${side} ${big} ${pointer}`} aria-label="Back 10 seconds">
          <RotateCcw className="h-7 w-7" strokeWidth={2} />
          <span aria-hidden="true" className="mg-player-ten">10</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={togglePlay}
        className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white active:scale-95 transition ${pointer}`}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-9 w-9 fill-current" /> : <Play className="ml-1 h-9 w-9 fill-current" />}
      </button>
      {!isLive ? (
        <button type="button" onClick={() => skip(10)} className={`${side} ${big} ${pointer}`} aria-label="Forward 10 seconds">
          <RotateCw className="h-7 w-7" strokeWidth={2} />
          <span aria-hidden="true" className="mg-player-ten">10</span>
        </button>
      ) : null}
      {hasNextEpisode ? (
        <button type="button" onClick={playNextEpisode} className={`${side} ${pointer} h-10 w-10`} aria-label="Next episode">
          <SkipForward className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}