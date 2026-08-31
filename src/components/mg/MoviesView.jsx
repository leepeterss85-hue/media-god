import React, { useEffect, useMemo, useState } from "react";
import { Search, Mic, Plus, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";

export default function MoviesView() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [watched, setWatched] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    base44.entities.Movie.list("-created_date", 60)
      .then(setMovies)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      movies.filter((m) =>
        m.title.toLowerCase().includes(query.toLowerCase())
      ),
    [movies, query]
  );

  const addToWatchlist = async (m) => {
    try {
      await base44.entities.WatchlistItem.create({
        title: m.title,
        year: m.year,
        poster_url: m.poster_url,
        description: m.description,
      });
      setWatched((w) => ({ ...w, [m.id]: true }));
      toast({ title: "Added to Watchlist", description: m.title });
    } catch (e) {
      toast({ title: "Could not add", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="relative mb-6 max-w-xl">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or speak movie titles..."
          className="w-full bg-mg-card border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
        />
        <Mic className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-mg-green" />
      </div>

      <h2 className="text-xs font-bold tracking-widest text-white/80 mb-4">
        CINEMA RELEASES
      </h2>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-mg-card rounded-md animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {filtered.map((m) => (
            <div key={m.id} className="group">
              <div className="relative aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
                <Image
                  src={m.poster_url}
                  alt={m.title}
                  className="w-full h-full object-cover"
                  fittingType="fill"
                />
                <button
                  onClick={() => addToWatchlist(m)}
                  className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-mg-green text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Add to Watchlist"
                >
                  {watched[m.id] ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-2 text-sm text-white truncate">{m.title}</p>
              <p className="text-xs text-white/40">{m.year}</p>
            </div>
          ))}
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <p className="text-white/40 text-sm">No movies found.</p>
      )}
    </div>
  );
}