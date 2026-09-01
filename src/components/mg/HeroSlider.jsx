import React, { useState, useEffect, useCallback } from "react";
import { Play, Info, Plus, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

// Gradient backdrops used when a title has no TMDB backdrop image.
const GRADIENTS = [
  "from-red-950 via-rose-900 to-pink-950",
  "from-blue-950 via-indigo-900 to-violet-950",
  "from-emerald-950 via-teal-900 to-cyan-950",
  "from-amber-950 via-orange-900 to-red-950",
  "from-violet-950 via-purple-900 to-fuchsia-950",
  "from-slate-950 via-zinc-900 to-neutral-950",
];

export default function HeroSlider({ items, onWatch, onDetails, onWatchlist }) {
  const [idx, setIdx] = useState(0);
  const count = items.length;
  const next = useCallback(() => setIdx((p) => (p + 1) % Math.max(count, 1)), [count]);
  const prev = () => setIdx((p) => (p - 1 + count) % Math.max(count, 1));

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(next, 8000);
    return () => clearInterval(t);
  }, [next, count]);

  // Reset to the first slide if the item list changes.
  useEffect(() => { setIdx(0); }, [count]);

  if (count === 0) {
    return <div className="w-full h-[50vh] min-h-[320px] bg-mg-card animate-pulse rounded-xl" />;
  }

  const it = items[idx];
  const title = it.title;
  const mediaType = it.media_type || "movie";
  const gradient = GRADIENTS[(Number(it.id) || 0) % GRADIENTS.length];
  const year = (it.release_date || it.year || "").slice(0, 4);

  return (
    <div className="relative w-full h-[55vh] min-h-[360px] max-h-[640px]">
      {it.backdrop_url ? (
        <Image src={it.backdrop_url} alt={title} className="absolute inset-0 w-full h-full object-cover" fittingType="fill" />
      ) : (
        <div className={cn("absolute inset-0 bg-gradient-to-br", gradient)} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-mg-background via-mg-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-mg-background/90 via-mg-background/40 to-transparent" />

      <div className="relative h-full max-w-[1400px] mx-auto px-4 sm:px-6 flex items-end pb-10 sm:pb-14">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-3">
            {it.vote_average > 0 && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-mg-green/20 text-mg-green text-sm font-medium">
                <Star className="w-3.5 h-3.5 fill-current" />
                {Number(it.vote_average).toFixed(1)}
              </span>
            )}
            <span className="px-2 py-1 rounded-md bg-white/10 text-white/80 text-xs font-medium uppercase">{mediaType}</span>
            {year && <span className="text-white/50 text-sm">{year}</span>}
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 text-balance">{title}</h1>
          {it.description && (
            <p className="text-white/70 text-sm sm:text-base mb-5 line-clamp-3 max-w-xl text-pretty">{it.description}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => onWatch(it)} className="flex items-center gap-2 bg-mg-green text-black font-semibold px-5 py-2.5 rounded-lg hover:bg-mg-green-dim">
              <Play className="w-5 h-5 fill-black" /> Watch Now
            </button>
            <button onClick={() => onWatchlist(it)} className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-5 py-2.5 rounded-lg">
              <Plus className="w-5 h-5" /> Watchlist
            </button>
            <button onClick={() => onDetails(it)} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-2.5 rounded-lg border border-white/20">
              <Info className="w-5 h-5" /> Details
            </button>
          </div>
        </div>
      </div>

      <button onClick={prev} className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur items-center justify-center hover:bg-black/60 text-white" aria-label="Previous">
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button onClick={next} className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur items-center justify-center hover:bg-black/60 text-white" aria-label="Next">
        <ChevronRight className="w-6 h-6" />
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {items.slice(0, 6).map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={cn("h-2 rounded-full transition-all", i === idx ? "bg-mg-green w-6" : "bg-white/30 w-2 hover:bg-white/50")}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}