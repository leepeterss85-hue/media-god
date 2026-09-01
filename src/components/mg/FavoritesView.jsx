import React, { useEffect, useState } from "react";
import { Heart, Trash2, Play, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { usePlayer, buildMediaSources } from "@/components/mg/PlayerProvider";
import DetailModal from "@/components/mg/DetailModal";

export default function FavoritesView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const { toast } = useToast();
  const player = usePlayer();

  const load = () => {
    setLoading(true);
    base44.entities.Favorite.list("-created_date", 100)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (id, title) => {
    try {
      await base44.entities.Favorite.delete(id);
      setItems((rows) => rows.filter((r) => r.id !== id));
      toast({ title: "Removed from Favorites", description: title });
    } catch {
      toast({ title: "Could not remove", variant: "destructive" });
    }
  };

  const play = async (it) => {
    let trailerUrl = "";
    let providers = [];
    try {
      const res = await base44.functions.invoke("getTmdbMovies", { media_type: it.media_type || "movie", movie_id: it.tmdb_id });
      trailerUrl = res.data?.trailer_url || "";
      providers = res.data?.watch_providers || [];
    } catch {}
    player.play({
      title: it.title,
      poster: it.poster_url,
      rdTitle: it.title,
      rdYear: it.year,
      sources: buildMediaSources({ title: it.title, id: it.tmdb_id, poster: it.poster_url, trailerUrl, providers }),
    });
  };

  if (loading) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-4"><Heart className="w-6 h-6 text-mg-green" /><h2 className="text-xl font-bold text-white">Favorites</h2></div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[2/3] bg-mg-card rounded-md animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="w-6 h-6 text-mg-green" />
        <h2 className="text-xl font-bold text-white">Favorites</h2>
        <span className="text-white/40 text-sm">({items.length})</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="w-12 h-12 text-white/10 mx-auto mb-3" />
          <p className="text-white/50">No favorites yet. Tap the heart on any title to save it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {items.map((it) => (
            <div key={it.id} className="group">
              <div className="relative aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
                {it.poster_url && <Image src={it.poster_url} alt={it.title} className="w-full h-full object-cover" fittingType="fill" />}
                <button onClick={() => play(it)} className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" aria-label={`Play ${it.title}`}>
                  <span className="w-10 h-10 rounded-full bg-mg-green text-black flex items-center justify-center"><Play className="w-5 h-5 fill-black" /></span>
                </button>
                <button onClick={() => remove(it.id, it.title)} className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-white truncate">{it.title}</p>
              <p className="text-[10px] text-white/40">{it.year}</p>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DetailModal item={selected} mediaType={selected.media_type || "movie"} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}