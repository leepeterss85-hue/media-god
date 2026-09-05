import React, { useState, useEffect, useCallback } from "react";
import {
  Play,
  Info,
  Plus,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-red-950 via-rose-900 to-pink-950",
  "from-blue-950 via-indigo-900 to-violet-950",
  "from-emerald-950 via-teal-900 to-cyan-950",
  "from-amber-950 via-orange-900 to-red-950",
  "from-violet-950 via-purple-900 to-fuchsia-950",
  "from-slate-950 via-zinc-900 to-neutral-950",
];

export default function HeroSlider({
  items,
  onWatch,
  onDetails,
  onWatchlist,
}) {
  const [idx, setIdx] = useState(0);
  const count = items.length;

  const next = useCallback(
    () => setIdx((current) => (current + 1) % Math.max(count, 1)),
    [count]
  );

  const prev = () =>
    setIdx((current) => (current - 1 + count) % Math.max(count, 1));

  useEffect(() => {
    if (count <= 1) return undefined;

    const timer = setInterval(next, 8000);
    return () => clearInterval(timer);
  }, [next, count]);

  useEffect(() => {
    setIdx(0);
  }, [count]);

  if (count === 0) {
    return (
      <div className="w-full h-[48svh] min-h-[320px] sm:min-h-[360px] 3xl:min-h-[620px] bg-mg-card animate-pulse" />
    );
  }

  const item = items[idx];
  const title = item.title;
  const mediaType = item.media_type || "movie";
  const gradient = GRADIENTS[(Number(item.id) || 0) % GRADIENTS.length];
  const year = (item.release_date || item.year || "").slice(0, 4);

  return (
    <section className="relative w-full h-[52svh] min-h-[350px] max-h-[680px] sm:h-[56vh] md:min-h-[430px] 3xl:h-[62vh] 3xl:min-h-[620px] 3xl:max-h-[900px] 4xl:min-h-[760px] 4xl:max-h-[1100px] overflow-hidden">
      {item.backdrop_url ? (
        <Image
          src={item.backdrop_url}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          fittingType="fill"
        />
      ) : (
        <div className={cn("absolute inset-0 bg-gradient-to-br", gradient)} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-mg-background via-mg-background/65 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-mg-background/95 via-mg-background/45 to-transparent" />

      <div className="relative h-full w-full max-w-[1800px] 4xl:max-w-[2400px] mx-auto px-4 sm:px-6 md:px-8 3xl:px-12 4xl:px-16 flex items-end pb-9 sm:pb-12 md:pb-14 3xl:pb-20 4xl:pb-24">
        <div className="max-w-[90%] sm:max-w-2xl 3xl:max-w-4xl 4xl:max-w-5xl">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 3xl:gap-4 mb-2.5 sm:mb-3 3xl:mb-5">
            {item.vote_average > 0 && (
              <span className="flex items-center gap-1 px-2 py-1 3xl:px-3 3xl:py-1.5 rounded-md bg-mg-green/20 text-mg-green text-xs sm:text-sm 3xl:text-base font-medium">
                <Star className="w-3.5 h-3.5 3xl:w-4 3xl:h-4 fill-current" />
                {Number(item.vote_average).toFixed(1)}
              </span>
            )}

            <span className="px-2 py-1 3xl:px-3 3xl:py-1.5 rounded-md bg-white/10 text-white/80 text-[10px] sm:text-xs 3xl:text-sm font-medium uppercase">
              {mediaType}
            </span>

            {year && (
              <span className="text-white/60 text-xs sm:text-sm 3xl:text-base">
                {year}
              </span>
            )}
          </div>

          <h1 className="text-3xl min-[420px]:text-4xl md:text-5xl xl:text-6xl 3xl:text-7xl 4xl:text-8xl font-bold text-white mb-2.5 sm:mb-3 3xl:mb-5 text-balance leading-[1.05]">
            {title}
          </h1>

          {item.description && (
            <p className="text-white/75 text-sm sm:text-base xl:text-lg 3xl:text-xl 4xl:text-2xl mb-4 sm:mb-5 3xl:mb-7 line-clamp-2 sm:line-clamp-3 max-w-xl 3xl:max-w-3xl 4xl:max-w-4xl text-pretty">
              {item.description}
            </p>
          )}

          <div className="flex flex-wrap gap-2 sm:gap-3 3xl:gap-4">
            <button
              type="button"
              onClick={() => onWatch(item)}
              className="min-h-11 3xl:min-h-12 flex items-center gap-2 bg-mg-green text-black font-semibold text-sm sm:text-base 3xl:text-lg px-4 sm:px-5 3xl:px-7 py-2.5 3xl:py-3 rounded-lg hover:bg-mg-green-dim"
            >
              <Play className="w-5 h-5 3xl:w-6 3xl:h-6 fill-black" />
              Watch Now
            </button>

            <button
              type="button"
              onClick={() => onWatchlist(item)}
              className="min-h-11 3xl:min-h-12 flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold text-sm sm:text-base 3xl:text-lg px-4 sm:px-5 3xl:px-7 py-2.5 3xl:py-3 rounded-lg"
            >
              <Plus className="w-5 h-5 3xl:w-6 3xl:h-6" />
              <span className="hidden min-[390px]:inline">Watchlist</span>
            </button>

            <button
              type="button"
              onClick={() => onDetails(item)}
              className="min-h-11 3xl:min-h-12 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm sm:text-base 3xl:text-lg px-4 sm:px-5 3xl:px-7 py-2.5 3xl:py-3 rounded-lg border border-white/20"
            >
              <Info className="w-5 h-5 3xl:w-6 3xl:h-6" />
              <span className="hidden min-[390px]:inline">Details</span>
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={prev}
        className="hidden sm:flex absolute left-3 md:left-4 3xl:left-6 top-1/2 -translate-y-1/2 w-10 h-10 3xl:w-14 3xl:h-14 4xl:w-16 4xl:h-16 rounded-full bg-black/40 backdrop-blur items-center justify-center hover:bg-black/60 text-white"
        aria-label="Previous"
      >
        <ChevronLeft className="w-6 h-6 3xl:w-8 3xl:h-8" />
      </button>

      <button
        type="button"
        onClick={next}
        className="hidden sm:flex absolute right-3 md:right-4 3xl:right-6 top-1/2 -translate-y-1/2 w-10 h-10 3xl:w-14 3xl:h-14 4xl:w-16 4xl:h-16 rounded-full bg-black/40 backdrop-blur items-center justify-center hover:bg-black/60 text-white"
        aria-label="Next"
      >
        <ChevronRight className="w-6 h-6 3xl:w-8 3xl:h-8" />
      </button>

      <div className="absolute bottom-3 sm:bottom-4 3xl:bottom-6 left-1/2 -translate-x-1/2 flex gap-2 3xl:gap-3">
        {items.slice(0, 6).map((_, index) => (
          <button
            type="button"
            key={index}
            onClick={() => setIdx(index)}
            className={cn(
              "h-2 3xl:h-2.5 rounded-full transition-all",
              index === idx
                ? "bg-mg-green w-6 3xl:w-9"
                : "bg-white/30 w-2 3xl:w-2.5 hover:bg-white/50"
            )}
            aria-label={`Slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
