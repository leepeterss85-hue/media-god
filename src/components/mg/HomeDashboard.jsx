import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import HeroSlider from "@/components/mg/HeroSlider";
import MediaRow from "@/components/mg/MediaRow";
import ContinueWatchingRow from "@/components/mg/ContinueWatchingRow";
import DetailModal from "@/components/mg/DetailModal";
import { useToast } from "@/components/ui/use-toast";

export default function HomeDashboard() {
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [watched, setWatched] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    const fetchRow = (params) =>
      base44.functions
        .invoke("getTmdbMovies", params)
        .then((r) => r.data?.movies || [])
        .catch(() => []);

    Promise.all([
      fetchRow({ category: "trending" }),
      fetchRow({ media_type: "movie", category: "now_playing" }),
      fetchRow({ media_type: "movie", category: "popular" }),
      fetchRow({ media_type: "tv", category: "tv_on_the_air" }),
      fetchRow({ media_type: "tv", category: "tv_popular" }),
      fetchRow({ media_type: "movie", category: "top_rated" }),
    ]).then(
      ([trending, nowPlaying, popularMovies, onAir, popularTV, topRated]) => {
        setRows({
          trending,
          nowPlaying,
          popularMovies,
          onAir,
          popularTV,
          topRated,
        });
        setLoading(false);
      }
    );
  }, []);

  const open = (item) => setSelected(item);

  const onWatchlist = async (movie) => {
    try {
      await base44.entities.WatchlistItem.create({
        title: movie.title,
        year: movie.year,
        poster_url: movie.poster_url,
        description: movie.description,
        tmdb_id: movie.id,
      });

      setWatched((current) => ({
        ...current,
        [movie.id]: true,
      }));

      toast({
        title: "Added to Watchlist",
        description: movie.title,
      });
    } catch {
      toast({
        title: "Could not add",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 md:p-6 3xl:p-8 4xl:p-10">
        <div className="w-full h-[38svh] sm:h-[42vh] 3xl:h-[50vh] bg-mg-card rounded-xl animate-pulse mb-5 3xl:mb-8" />

        <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 3xl:grid-cols-9 4xl:grid-cols-10 gap-3 3xl:gap-4 4xl:gap-5">
          {Array.from({ length: 20 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[2/3] bg-mg-card rounded-md animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const hero = (rows.trending || []).slice(0, 6);

  return (
    <div className="w-full min-w-0">
      <HeroSlider
        items={hero}
        onWatch={open}
        onDetails={open}
        onWatchlist={onWatchlist}
      />

      <div className="flex flex-col gap-6 3xl:gap-8 4xl:gap-10 py-5 sm:py-6 3xl:py-8">
        <ContinueWatchingRow />

        <MediaRow
          title="Trending Now"
          items={rows.trending}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="Now Playing"
          items={rows.nowPlaying}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="Popular Movies"
          items={rows.popularMovies}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="On The Air"
          items={rows.onAir}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="Popular TV Shows"
          items={rows.popularTV}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="Top Rated Movies"
          items={rows.topRated}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />
      </div>

      <footer className="border-t border-white/5 py-6 3xl:py-8 mt-4 px-4 sm:px-6 3xl:px-10 text-center text-white/40 text-xs 3xl:text-sm">
        Media God — Your ultimate streaming destination
      </footer>

      {selected && (
        <DetailModal
          item={selected}
          mediaType={selected.media_type || "movie"}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
