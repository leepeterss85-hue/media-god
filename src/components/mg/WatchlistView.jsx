import React, { useEffect, useState } from "react";
import { Trash2, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { usePlayer, buildMediaSources } from "@/components/mg/PlayerProvider";

export default function WatchlistView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const player = usePlayer();

  const load = () =>
    base44.entities.WatchlistItem.list("-created_date", 100).then((i) => {
      setItems(i);
      setLoading(false);
    });

  useEffect(() => {
    load();
  }, []);

  const remove = async (item) => {
    await base44.entities.WatchlistItem.delete(item.id);
    toast({ title: "Removed from Watchlist" });
    load();
  };

  const playItem = async (m) => {
    let trailerUrl = "";
    let providers = [];
    if (m.tmdb_id) {
      try {
        const res = await base44.functions.invoke("getTmdbMovies", { movie_id: m.tmdb_id });
        trailerUrl = res.data?.trailer_url || "";
        providers = res.data?.watch_providers || [];
      } catch {}
    }
    player.play({
      title: m.title,
      poster: m.poster_url,
      rdTitle: m.title,
      rdYear: m.year,
      sources: buildMediaSources({ title: m.title, id: m.tmdb_id, poster: m.poster_url, trailerUrl, providers }),
    });
  };

  return (
    <div data-mg-library-view="true" data-mg-watchlist-view="true" className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-white mb-1">Watchlist</h1>
      <p className="text-sm text-white/50 mb-6">
        {items.length} saved {items.length === 1 ? "title" : "titles"}
      </p>

      {loading ? (
        <div data-mg-library-grid="true" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-mg-card rounded-md animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/40 text-sm">Your watchlist is empty.</p>
          <p className="text-white/30 text-xs mt-1">
            Add movies from the Movies tab.
          </p>
        </div>
      ) : (
        <div data-mg-library-grid="true" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {items.map((m) => (
            <div key={m.id} data-mg-watchlist-card="true" className="mg-fire-tv-library-card group">
              <div className="relative aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
                <Image
                  src={m.poster_url}
                  alt={m.title}
                  className="w-full h-full object-cover"
                  fittingType="fill"
                />
                <button
                  type="button"
                  onClick={() => playItem(m)}
                  className="mg-hover-action absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Play ${m.title}`}
                  title="Play"
                >
                  <span className="w-10 h-10 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-5 h-5 fill-black" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(m)}
                  className="mg-hover-action absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${m.title} from Watchlist`}
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="mt-2 text-sm text-white truncate">{m.title}</p>
              <p className="text-xs text-white/40">{m.year}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}