import { cn } from "@/lib/utils";
import { Languages as Translate } from "lucide-react";

export default function SubtitleMenu({
  selectedSubtitle,
  subtitleTracks,
  trackPreferences,
  translating,
  translateStatus,
  onChooseSubtitle,
  onChangeSubtitleOffset,
  onResetSubtitleOffset,
  onTranslateSubtitles,
}) {
  return (
    <div className="absolute bottom-12 right-0 z-[80] max-h-64 w-52 overflow-y-auto rounded-xl border border-white/15 bg-black/95 p-1.5 shadow-2xl backdrop-blur sm:w-60">
      <button
        type="button"
        onClick={() => onChooseSubtitle(-1)}
        className={cn(
          "w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/10",
          selectedSubtitle < 0 ? "text-mg-green" : "text-white"
        )}
      >
        Off
      </button>

      <div className="mx-1 my-1.5 rounded-lg border border-white/10 bg-white/5 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-white/55">
          <span>Subtitle sync</span>
          <span className="font-semibold text-white/80">
            {Number(trackPreferences.subtitleOffsetSeconds || 0) === 0
              ? "0.0s"
              : `${Number(trackPreferences.subtitleOffsetSeconds || 0) > 0 ? "+" : ""}${Number(trackPreferences.subtitleOffsetSeconds || 0).toFixed(1)}s`}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onChangeSubtitleOffset(-0.5)}
            className="rounded-md bg-white/8 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
            aria-label="Show subtitles half a second earlier"
            title="Earlier by 0.5 seconds"
          >
            -0.5s
          </button>
          <button
            type="button"
            onClick={onResetSubtitleOffset}
            className="rounded-md bg-white/8 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
            aria-label="Reset subtitle timing"
            title="Reset subtitle timing"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onChangeSubtitleOffset(0.5)}
            className="rounded-md bg-white/8 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
            aria-label="Show subtitles half a second later"
            title="Later by 0.5 seconds"
          >
            +0.5s
          </button>
        </div>
      </div>

      <div className="mx-1 my-1.5 rounded-lg border border-white/10 bg-white/5 p-2">
        <button
          type="button"
          onClick={onTranslateSubtitles}
          disabled={translating || selectedSubtitle < 0}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-mg-green/50",
            translating
              ? "bg-white/5 text-white/50"
              : "bg-mg-green/15 text-mg-green hover:bg-mg-green/25",
            (selectedSubtitle < 0 || translating) &&
              "cursor-not-allowed opacity-60 hover:bg-mg-green/15"
          )}
          aria-label="Translate subtitles to your language"
          title="Translate the active subtitle track into your preferred language"
        >
          <Translate className="h-3.5 w-3.5" />
          <span>
            {translating
              ? translateStatus || "Translating…"
              : translateStatus || "Translate subtitles"}
          </span>
        </button>
      </div>

      {subtitleTracks.length > 0 ? (
        subtitleTracks.map((track) => (
          <button
            type="button"
            key={`subtitle-${track.index}`}
            onClick={() => onChooseSubtitle(track.index)}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/10",
              selectedSubtitle === track.index ? "text-mg-green" : "text-white"
            )}
          >
            {track.label}
            {track.language ? ` · ${track.language}` : ""}
          </button>
        ))
      ) : (
        <p className="px-3 py-2 text-xs leading-relaxed text-white/45">
          No subtitle tracks are available from this source.
        </p>
      )}
    </div>
  );
}