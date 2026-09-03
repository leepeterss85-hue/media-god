import React from "react";
import { Play, Plus, Check } from "lucide-react";
import { Image } from "@/components/ui/image";
import { usePlayer } from "@/components/mg/PlayerProvider";

export default function MediaCard({ item, onOpen, onWatchlist, watched }) {
  const { play } = usePlayer();

  return (
    <div className="group shrink-0 w-28 sm:w-36 md:w-40">
      <div className="relative aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
        <Image src={item.poster_url} alt={item.title} className="w-full h-full object-cover" fittingType="fill" />
        <button
          onClick={() => play({ 
            title: item.title, 
            poster: item.poster_url, 
            rdYear: item.year, 
            imdb_id: item.imdb_id || item.id 
          })}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={`Play ${item.title}`}
        >
          <span className="w-10 h-10 rounded-full bg-mg-green text-black flex items-center justify-center">
            <Play className="w-5 h-5 fill-black" />
          </span>
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
