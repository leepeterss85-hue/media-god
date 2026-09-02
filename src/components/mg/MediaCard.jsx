import React from "react";
import { Play, Plus, Check } from "lucide-react";
import { Image } from "@/components/ui/image";
import { usePlayer } from "@/components/mg/PlayerProvider";

export default function MediaCard({ item, onOpen, onWatchlist, watched }) {
  const player = usePlayer();

  const handlePlay = (e) => {
    e.stopPropagation();
    player.play({
      id: item.id || item.tmdb_id,
      imdbId: item.imdb_id || item.imdbId,
      title: item.title,
      year: item.year,
      poster: item.poster_url,
      type: item.media_type || item.type || "movie",
    });
  };

  return (
    <div className="group shrink-0 w-28 sm:w-36 md:w-40">
      <div className="relative aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
        <Image src={item.poster_url} alt={item.title} className="w-full h-full object-cover" fittingType="fill" />
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={`Play ${item.title}`}
        >
          <span className="w-10 h-10 rounded-full bg-mg-green text-black flex items-center justify-center">
            <Play className="w-5 h-5 fill-black" />
          </span>
        </button>
        <button
          onClick={() => onOpen(item)}
          className="absolute top-1.5 left-1.5 px-2 py-1 rounded bg-black/60 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Details
        </button>
        {onWatchlist && (
          <button
            onClick={() => onWatchlist(item)}
            className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-mg-green text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Add to Watchlist"
          >
            {watched ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs sm:text-sm text-white truncate">{item.title}</p>
      <p className="text-[10px] sm:text-xs text-white/40">{item.year}</p>
    </div>
  );
}
