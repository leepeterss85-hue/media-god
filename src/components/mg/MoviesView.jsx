import React, { useEffect, useRef, useState } from "react";
import { Search, Mic, Plus, Check, Play, Globe } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import {
  GENRES_MOVIE,
  LANGUAGES,
  YEARS,
} from "@/components/mg/filterOptions";
import DetailModal from "@/components/mg/DetailModal";
import StreamingProviderLogos from "@/components/mg/StreamingProviderLogos";
import ReeznCardAction from "@/components/mg/ReeznCardAction";
import {
  detectStreamingRegion,
  getStreamingRegionOverride,
  setStreamingRegionOverride,
} from "@/components/mg/streamingRegion";
import { COUNTRY_OPTIONS } from "@/components/mg/countryOptions";
import useDebouncedValue from "@/components/mg/useDebouncedValue";
import { filterItemsWithPlayableSources } from "@/components/mg/sourceAvailability";

const PosterImage = /** @type {any} */ (Image);

const CATEGORIES = [
  { id: "now_playing", label: "In Cinemas" },
  { id: "popular", label: "Popular" },
  { id: "top_rated", label: "Top Rated" },
  { id: "upcoming", label: "Upcoming" },
];

const gridClass =
  "grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 3xl:grid-cols-9 4xl:grid-cols-10 gap-3 xl:gap-4 3xl:gap-5 4xl:gap-6";

const selectClass =
  "w-full sm:w-auto min-h-11 3xl:min-h-12 appearance-none bg-mg-card border border-white/10 rounded-lg px-3 pr-8 py-2.5 3xl:py-3 text-sm 3xl:text-base 4xl:text-lg text-white focus:outline-none focus:border-mg-green cursor-pointer";

export default function MoviesView() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(() => getStreamingRegionOverride());
  const [category, setCategory] = useState("now_playing");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [language, setLanguage] = useState("");
  const [watched, setWatched] = useState({});
  const [selected, setSelected] = useState(null);
  const { toast } = useToast();
  const requestRef = useRef(0);
  const debouncedQuery = useDebouncedValue(query, 180);
  const streamingRegion = country || detectStreamingRegion();

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);

    base44.functions
      .invoke("getTmdbMovies", {
        media_type: "movie",
        category,
        country: "",
        region: streamingRegion,
        include_global_releases: true,
        genre,
        year,
        language,
        query: debouncedQuery.trim(),
      })
      .then(async (res) => {
        if (requestId !== requestRef.current) return;

        const candidates = Array.isArray(res.data?.movies)
          ? res.data.movies
          : [];

        const sourcedMovies = await filterItemsWithPlayableSources(
          candidates,
          {
            concurrency: 4,
          }
        );

        if (requestId !== requestRef.current) return;
        setMovies(sourcedMovies);
      })
      .catch(() => {
        if (requestId !== requestRef.current) return;
        setMovies([]);
      })
      .finally(() => {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      });
  }, [country, category, genre, year, language, debouncedQuery, streamingRegion]);

  const addToWatchlist = async (movie) => {
    try {
      const existing = await base44.entities.WatchlistItem.filter({
        tmdb_id: String(movie.id),
        media_type: "movie",
      });

      if (Array.isArray(existing) && existing.length > 0) {
        setWatched((current) => ({
          ...current,
          [movie.id]: true,
        }));
        toast({
          title: "Already in Watchlist",
          description: movie.title,
        });
        return;
      }

      await base44.entities.WatchlistItem.create({
        title: movie.title,
        year: movie.year,
        poster_url: movie.poster_url,
        description: movie.description,
        tmdb_id: movie.id,
        media_type: "movie",
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

  return (
    <div data-mg-library-view="true" className="w-full p-3 min-[420px]:p-4 md:p-6 3xl:p-8 4xl:p-10">
      <div className="flex flex-col gap-3 3xl:gap-4 mb-5 3xl:mb-8">
        <div className="flex gap-2 3xl:gap-3 overflow-x-auto scrollbar-hide pb-1">
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              className={
                "min-h-10 3xl:min-h-12 px-3 3xl:px-5 py-1.5 3xl:py-2 rounded-md text-xs sm:text-sm 3xl:text-base 4xl:text-lg font-semibold whitespace-nowrap transition-colors " +
                (category === item.id
                  ? "bg-mg-green text-black"
                  : "bg-mg-card text-white/70 hover:text-white")
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-2.5 3xl:gap-4">
          <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[260px] lg:max-w-2xl 3xl:max-w-3xl">
            <Search className="w-4 h-4 3xl:w-5 3xl:h-5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or speak movie titles..."
              className="w-full min-h-11 3xl:min-h-12 bg-mg-card border border-white/10 rounded-lg pl-10 3xl:pl-11 pr-10 py-2.5 3xl:py-3 text-sm 3xl:text-base 4xl:text-lg text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
            />
            <Mic className="w-4 h-4 3xl:w-5 3xl:h-5 absolute right-3 top-1/2 -translate-y-1/2 text-mg-green" />
          </div>

          <div className="relative w-full sm:w-auto">
            <Globe className="w-4 h-4 3xl:w-5 3xl:h-5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            <select
              value={country}
              onChange={(event) => {
                const nextCountry = event.target.value;
                setCountry(nextCountry);
                setStreamingRegionOverride(nextCountry);
              }}
              aria-label="Choose viewing country for cinema dates and streaming services"
              className={`${selectClass} pl-10 3xl:pl-11`}
            >
              {COUNTRY_OPTIONS.map((item) => (
                <option key={item.code} value={item.code} className="bg-mg-card">
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <select
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
            className={selectClass}
          >
            {GENRES_MOVIE.map((item) => (
              <option key={item.id} value={item.id} className="bg-mg-card">
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className={selectClass}
          >
            {YEARS.map((item) => (
              <option key={item.value} value={item.value} className="bg-mg-card">
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className={selectClass}
          >
            {LANGUAGES.map((item) => (
              <option key={item.code} value={item.code} className="bg-mg-card">
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div data-mg-library-grid="true" className={gridClass}>
          {Array.from({ length: 20 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[2/3] bg-mg-card rounded-md 3xl:rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div data-mg-library-grid="true" className={gridClass}>
          {movies.map((movie) => (
            <article key={movie.id} className="mg-fire-tv-library-card group min-w-0">
              <div className="relative aspect-[2/3] rounded-md 3xl:rounded-lg overflow-hidden border border-white/10 bg-mg-card">
                <PosterImage
                  src={movie.poster_url}
                  alt={movie.title}
                  className="w-full h-full object-cover"
                  fittingType="fill"
                  loading="lazy"
                />

                <ReeznCardAction
                  focusKey={`movie:${movie.id || movie.tmdb_id || movie.title}`}
                />

                <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-lg bg-black/45 p-1 backdrop-blur-sm">
                  <StreamingProviderLogos
                    tmdbId={movie.id || movie.tmdb_id}
                    mediaType="movie"
                    region={streamingRegion}
                    limit={3}
                    initialProviders={movie.watch_providers}
                  />
                </div>

                <button
                  type="button"
                  data-mg-focus-key={`movie:${movie.id || movie.tmdb_id || movie.title}`}
                  onClick={() => setSelected(movie)}
                  className="mg-hover-action absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Details"
                  aria-label={`Open ${movie.title}`}
                >
                  <span className="w-11 h-11 sm:w-12 sm:h-12 3xl:w-14 3xl:h-14 4xl:w-16 4xl:h-16 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-5 h-5 sm:w-6 sm:h-6 3xl:w-7 3xl:h-7 4xl:w-8 4xl:h-8 fill-black" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => addToWatchlist(movie)}
                  className="mg-hover-action absolute bottom-2 right-2 3xl:bottom-3 3xl:right-3 w-8 h-8 3xl:w-10 3xl:h-10 rounded-full bg-mg-green text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Add to Watchlist"
                  aria-label="Add to Watchlist"
                >
                  {watched[movie.id] ? (
                    <Check className="w-4 h-4 3xl:w-5 3xl:h-5" />
                  ) : (
                    <Plus className="w-4 h-4 3xl:w-5 3xl:h-5" />
                  )}
                </button>
              </div>

              <p className="mt-2 3xl:mt-3 text-xs sm:text-sm 3xl:text-base 4xl:text-lg text-white truncate">
                {movie.title}
              </p>
              <p className="text-[10px] sm:text-xs 3xl:text-sm text-white/40">
                {movie.year}
              </p>

            </article>
          ))}
        </div>
      )}

      {!loading && movies.length === 0 && (
        <p className="text-white/40 text-sm 3xl:text-base">
          No movies with available sources were found for these filters.
        </p>
      )}

      {selected && (
        <DetailModal
          item={selected}
          mediaType="movie"
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
