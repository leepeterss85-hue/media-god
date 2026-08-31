import React, { useEffect, useMemo, useState } from "react";
import { Search, Mic, Plus, Check, Play, Globe } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { usePlayer, buildMediaSources } from "@/components/mg/PlayerProvider";
import { GENRES_MOVIE, LANGUAGES, YEARS } from "@/components/mg/filterOptions";

const COUNTRIES = [
  { code: "", label: "All Countries" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "IN", label: "India" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
  { code: "MX", label: "Mexico" },
  { code: "BR", label: "Brazil" },
  { code: "CN", label: "China" },
  { code: "TR", label: "Turkey" },
  { code: "NL", label: "Netherlands" },
  { code: "SE", label: "Sweden" },
];

const CATEGORIES = [
  { id: "now_playing", label: "In Cinemas" },
  { id: "popular", label: "Popular" },
  { id: "top_rated", label: "Top Rated" },
  { id: "upcoming", label: "Upcoming" },
];

export default function MoviesView() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("now_playing");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [language, setLanguage] = useState("");
  const [watched, setWatched] = useState({});
  const { toast } = useToast();
  const player = usePlayer();

  useEffect(() => {
    setLoading(true);
    base44.functions
      .invoke("getTmdbMovies", { media_type: "movie", category, country, genre, year, language })
      .then((res) => setMovies(res.data?.movies || []))
      .catch(() => setMovies([]))
      .finally(() => setLoading(false));
  }, [country, category, genre, year, language]);

  const filtered = useMemo(
    () => movies.filter((m) => m.title.toLowerCase().includes(query.toLowerCase())),
    [movies, query]
  );

  const addToWatchlist = async (m) => {
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
    } catch (e) {
      toast({ title: "Could not add", variant: "destructive" });
    }
  };

  const playMovie = async (m) => {
    let trailerUrl = "";
    try {
      const res = await base44.functions.invoke("getTmdbMovies", { media_type: "movie", movie_id: m.id });
      trailerUrl = res.data?.trailer_url || "";
    } catch {}
    player.play({
      title: m.title,
      poster: m.poster_url,
      sources: buildMediaSources({ title: m.title, id: m.id, poster: m.poster_url, trailerUrl }),
    });
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={
                "px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap " +
                (category === c.id ? "bg-mg-green text-black" : "bg-mg-card text-white/70 hover:text-white")
              }
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xl">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or speak movie titles..."
              className="w-full bg-mg-card border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
            />
            <Mic className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-mg-green" />
          </div>
          <div className="relative">
            <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="appearance-none bg-mg-card border border-white/10 rounded-lg pl-10 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-mg-green cursor-pointer"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-mg-card">
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="appearance-none bg-mg-card border border-white/10 rounded-lg px-3 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-mg-green cursor-pointer"
          >
            {GENRES_MOVIE.map((g) => (
              <option key={g.id} value={g.id} className="bg-mg-card">
                {g.label}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="appearance-none bg-mg-card border border-white/10 rounded-lg px-3 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-mg-green cursor-pointer"
          >
            {YEARS.map((y) => (
              <option key={y.value} value={y.value} className="bg-mg-card">
                {y.label}
              </option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="appearance-none bg-mg-card border border-white/10 rounded-lg px-3 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-mg-green cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-mg-card">
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
                <Image src={m.poster_url} alt={m.title} className="w-full h-full object-cover" fittingType="fill" />
                <button
                  onClick={() => playMovie(m)}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Play"
                >
                  <span className="w-12 h-12 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-6 h-6 fill-black" />
                  </span>
                </button>
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
        <p className="text-white/40 text-sm">No movies found for this country.</p>
      )}
    </div>
  );
}