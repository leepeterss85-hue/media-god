import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import HeroSlider from "@/components/mg/HeroSlider";
import MediaRow from "@/components/mg/MediaRow";
import ContinueWatchingRow from "@/components/mg/ContinueWatchingRow";
import DetailModal from "@/components/mg/DetailModal";
import { useToast } from "@/components/ui/use-toast";

// Netflix-style home: hero slider + horizontal media rows fed from TMDB.
export default function HomeDashboard() {
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [watched, setWatched] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    const fetchRow = (params) =>
      base44.functions.invoke("getTmdbMovies", params).then((r) => r.data?.movies || []).catch(() => []);
    Promise.all([
      fetchRow({ category: "trending" }),
      fetchRow({ media_type: "movie", category: "now_playing" }),
      fetchRow({ media_type: "movie", category: "popular" }),
      fetchRow({ media_type: "tv", category: "tv_on_the_air" }),
      fetchRow({ media_type: "tv", category: "tv_popular" }),
      fetchRow({ media_type: "movie", category: "top_rated" }),
    ]).then(([trending, nowPlaying, popularMovies, onAir, popularTV, topRated]) => {
      setRows({ trending, nowPlaying, popularMovies, onAir, popularTV, topRated });
      setLoading(false);
    });
  }, []);

  const open = (it) => setSelected(it);
  const onWatchlist = async (m) => {
    try {
      await base44.entities.WatchlistItem.create({
        title: m.title,
        year: m.year,
        poster_url: m.poster_url,
        description: m.description,
        tmdb_id: m.id,
      });
      setWatched((w) => ({ ...w, [m.id]: true }));
      toast({ title: "Added to Watchlist", description: m.title });
    } catch {
      toast({ title: "Could not add", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="w-full h-[40vh] bg-mg-card rounded-xl animate-pulse mb-6" />
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-mg-card rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const hero = (rows.trending || []).slice(0, 6);

  return (
    <div>
      <HeroSlider items={hero} onWatch={open} onDetails={open} onWatchlist={onWatchlist} />
      <div className="flex flex-col gap-6 py-6">
        <ContinueWatchingRow />
        <MediaRow title="Trending Now" items={rows.trending} onOpen={open} onWatchlist={onWatchlist} watched={watched} />
        <MediaRow title="Now Playing" items={rows.nowPlaying} onOpen={open} onWatchlist={onWatchlist} watched={watched} />
        <MediaRow title="Popular Movies" items={rows.popularMovies} onOpen={open} onWatchlist={onWatchlist} watched={watched} />
        <MediaRow title="On The Air" items={rows.onAir} onOpen={open} onWatchlist={onWatchlist} watched={watched} />
        <MediaRow title="Popular TV Shows" items={rows.popularTV} onOpen={open} onWatchlist={onWatchlist} watched={watched} />
        <MediaRow title="Top Rated Movies" items={rows.topRated} onOpen={open} onWatchlist={onWatchlist} watched={watched} />
      </div>
      <footer className="border-t border-white/5 py-6 mt-4 px-4 sm:px-6 text-center text-white/40 text-xs">
        Media God — Your ultimate streaming destination
      </footer>
      {selected && (
        <DetailModal item={selected} mediaType={selected.media_type || "movie"} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}