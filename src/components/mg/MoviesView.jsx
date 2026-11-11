import CatalogueRetryNotice from "@/components/mg/CatalogueRetryNotice";
import useBrowseReturn from "@/components/mg/useBrowseReturn";
import { catalogueLoadMessage } from "@/components/mg/catalogueFeedback";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Check, Play, Globe, Info } from "lucide-react";
import VoiceSearchButton from "@/components/mg/VoiceSearchButton";
import { getCatalogueMovies } from "@/components/mg/catalogueRequests";
import { catalogueSourceChecker, showBrowseTitleWithSourceEvidence } from "@/components/mg/catalogueSourceCheckerClient";
import { createRollingSourceChecks } from "@/components/mg/rollingSourceChecks";
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
  streamingRegionName,
} from "@/components/mg/streamingRegion";
import { COUNTRY_OPTIONS } from "@/components/mg/countryOptions";
import useDebouncedValue from "@/components/mg/useDebouncedValue";
import { addToWatchlistItem } from "@/components/mg/watchlistActions";
import { releaseStatusLabel } from "@/components/mg/releaseDiscovery";

const PosterImage = /** @type {any} */ (Image);

const CATEGORIES = [
  { id: "cinema_latest", label: "New in Cinemas" },
  { id: "cinema_top10", label: "Top 10 Cinema" },
  { id: "streaming_recent_movies", label: "New Digital Releases" },
  { id: "now_playing", label: "Wider Releases" },
  { id: "cinema_extras", label: "Short Films & Specials" },
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
  const [sourceAvailabilityEpoch, setSourceAvailabilityEpoch] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(() => getStreamingRegionOverride());
  const [category, setCategory] = useState("cinema_latest");
  const [chartInfo, setChartInfo] = useState({});
  const [cinemaRefresh, setCinemaRefresh] = useState(0);
  const lastCinemaRefreshRef = useRef({ at: Date.now(), day: new Date().toISOString().slice(0, 10) });
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [language, setLanguage] = useState("en");
  const [watched, setWatched] = useState({});
  const [selected, setSelected] = useBrowseReturn();
  const { toast } = useToast();
  const requestRef = useRef(0);
  const debouncedQuery = useDebouncedValue(query, 180);
  const streamingRegion = country || detectStreamingRegion();

  // Recheck current cinema listings when the calendar day changes or a
  // backgrounded Fire Stick/mobile browser returns after several hours.
  // No high-frequency TMDB polling or new requests during playback.
  useEffect(() => {
    if (!["cinema_latest", "cinema_top10", "cinema_extras", "streaming_recent_movies"].includes(category)) return undefined;
    const checkFreshness = () => {
      if (document.visibilityState === "hidden") return;
      const day = new Date().toISOString().slice(0, 10);
      const current = Date.now();
      if (day !== lastCinemaRefreshRef.current.day ||
          current - lastCinemaRefreshRef.current.at >= 6 * 60 * 60 * 1000) {
        lastCinemaRefreshRef.current = { at: current, day };
        setCinemaRefresh((value) => value + 1);
      }
    };
    const timer = window.setInterval(checkFreshness, 30 * 60 * 1000);
    window.addEventListener("focus", checkFreshness);
    document.addEventListener("visibilitychange", checkFreshness);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkFreshness);
      document.removeEventListener("visibilitychange", checkFreshness);
    };
  }, [category]);

  useEffect(() => {
    const unsub = catalogueSourceChecker.subscribe(() =>
      setSourceAvailabilityEpoch((value) => value + 1)
    );
    return unsub;
  }, []);

  useEffect(() => {
    // Cinema listings are release metadata, not a promise of an available
    // stream. Do not spend bandwidth checking every newly released title.
    if (loading || !movies.length || ["cinema_latest", "cinema_top10", "cinema_extras", "streaming_recent_movies"].includes(category)) return undefined;
    return createRollingSourceChecks(
      () => movies,
      (movie) => catalogueSourceChecker.check({ ...movie, media_type: 'movie' })
    );
  }, [movies, loading, category]);

  const displayedMovies = useMemo(() => movies.filter((movie) =>
    // New cinema releases must remain visible even when no digital stream
    // exists yet. A cinema listing is not a playback-availability claim.
    (["cinema_latest", "cinema_top10", "cinema_extras", "streaming_recent_movies"].includes(category) && !debouncedQuery.trim()) ||
    showBrowseTitleWithSourceEvidence({ ...movie, media_type: 'movie' })
  ), [movies, sourceAvailabilityEpoch, category, debouncedQuery]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setMovies([]);

    getCatalogueMovies( {
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
      .then((res) => {
        if (requestId !== requestRef.current) return;
        setMovies(res.data?.movies || []);
        setChartInfo(res.data || {});
        setError("");
      })
      .catch(() => {
        if (requestId !== requestRef.current) return;
        setError(catalogueLoadMessage());
      })
      .finally(() => {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      });
  }, [country, category, genre, year, language, debouncedQuery, streamingRegion, retry, cinemaRefresh]);

  const addToWatchlist = async (movie) => {
    try {
      const result = await addToWatchlistItem(movie);

      if (!result.ok) {
        toast({
          title: "Could not add",
          description: "This title is missing its TMDB id.",
          variant: "destructive",
        });
        return;
      }

      setWatched((current) => ({
        ...current,
        [movie.id]: true,
      }));

      toast({
        title: result.created ? "Added to Watchlist" : "Already in Watchlist",
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
              onClick={() => {
                setCategory(item.id);
                if (item.id === "cinema_latest") setLanguage("en");
                else if (item.id === "cinema_top10") { setGenre(""); setYear(""); setLanguage(""); }
                else if (category === "cinema_latest") setLanguage("");
              }}
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

        {category === "cinema_latest" && !debouncedQuery.trim() && (
          <p className="text-xs sm:text-sm text-white/50" data-mg-cinema-region="true">
            Confirmed feature-length UK and US cinema openings (75 minutes or longer) from the past four weeks, newest first.
            English-language films are shown by default — use the Language filter to see other languages.
            Shorts, filmed event screenings, TV movies, festival previews and digital-first releases are moved out of this section.
            A cinema release does not guarantee a playable stream.
          </p>
        )}
        {category === "cinema_top10" && !debouncedQuery.trim() && (
          <p className="text-xs sm:text-sm text-white/60" data-mg-cinema-top10-source="true">
            Actual UK &amp; Ireland weekend cinema ticket-sales Top 10, not TMDB popularity.
            {chartInfo.chart_period ? ` Chart weekend: ${chartInfo.chart_period}.` : " Latest available published chart."}
            {chartInfo.chart_stale ? " Showing the last verified chart until newer figures can be retrieved." : ""}
            {" "}<a href={chartInfo.chart_source_url || "https://www.cinemauk.org.uk/the-industry/facts-and-figures/latest-uk-cinema-statistics/weekend-top-10-box-office/"} target="_blank" rel="noopener noreferrer" className="text-mg-green underline">See official chart</a>.
            A box-office ranking is not a promise that a playable stream exists.
          </p>
        )}
        {category === "cinema_extras" && !debouncedQuery.trim() && (
          <p className="text-xs sm:text-sm text-white/50" data-mg-cinema-extras="true">
            Short films, filmed events, TV specials and titles without a verified feature-length runtime.
            These are separate from new cinema feature films; their theatrical dates are verified, but a stream may not yet be available.
            Digital-only titles belong in New Digital Releases.
          </p>
        )}
        {category === "streaming_recent_movies" && !debouncedQuery.trim() && (
          <p className="text-xs sm:text-sm text-white/50" data-mg-digital-release-region="true">
            Confirmed first digital releases worldwide from the last 30 days, newest first — including US-first releases.
            Cinema-only films and later regional re-releases are excluded. Rentals, purchases and streaming releases are included. A digital release abroad does not guarantee streaming availability in {streamingRegionName(streamingRegion)}.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-2.5 3xl:gap-4">
          <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[260px] lg:max-w-2xl 3xl:max-w-3xl">
            <Search className="w-4 h-4 3xl:w-5 3xl:h-5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or speak movie titles..."
              className="w-full min-h-11 3xl:min-h-12 bg-mg-card border border-white/10 rounded-lg pl-10 3xl:pl-11 pr-12 py-2.5 3xl:py-3 text-sm 3xl:text-base 4xl:text-lg text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
            />
            <VoiceSearchButton
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onResult={(spoken) => setQuery(spoken)}
            />
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
              aria-label="Choose country for local streaming-provider availability"
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

      {loading && movies.length === 0 ? (
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
          {displayedMovies.map((movie) => (
            <article key={movie.id} className="mg-fire-tv-library-card group min-w-0">
              <div className="relative aspect-[2/3] rounded-md 3xl:rounded-lg overflow-hidden border border-white/10 bg-mg-card">
                {movie.poster_url ? <PosterImage
                  src={movie.poster_url}
                  alt={movie.title}
                  className="w-full h-full object-cover"
                  fittingType="fill"
                  loading="lazy"
                /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs font-semibold text-white/50">
                  {category === "cinema_top10" ? `UK Box Office #${movie.chart_rank}` : movie.title}
                </div>}
                {category === "cinema_top10" && !debouncedQuery.trim() && <span className="pointer-events-none absolute top-1 left-1 z-20 rounded bg-mg-green px-2 py-1 text-xs font-black text-black">#{movie.chart_rank}</span>}

                {(category !== "cinema_top10" || movie.tmdb_id) && <ReeznCardAction
                  focusKey={`movie:${movie.id || movie.tmdb_id || movie.title}`}
                />}
                {["cinema_latest", "cinema_top10", "cinema_extras", "streaming_recent_movies"].includes(category) && !debouncedQuery.trim() && (
                  <span title={releaseStatusLabel(movie, category)}
                    data-mg-release-status="true"
                    className="pointer-events-none absolute right-1 top-1 z-10 max-w-[70%] truncate rounded bg-black/85 px-1.5 py-1 text-[9px] font-semibold text-white">
                    {category === "cinema_top10" ? "UK box office · stream unconfirmed" :
                      category === "cinema_extras" ? (movie.cinema_group === "short" ? "Short film" :
                        movie.cinema_group === "runtime_unconfirmed" ? "Runtime unconfirmed" : "Special screening") :
                      category === "cinema_latest" ? "Cinema · stream unconfirmed" :
                      movie.local_streaming_listed ? "Digital · local listing" : "Digital worldwide"}
                  </span>
                )}

                {(category !== "cinema_top10" || movie.tmdb_id) && <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-lg bg-black/45 p-1 backdrop-blur-sm">
                  <StreamingProviderLogos
                    tmdbId={movie.id || movie.tmdb_id}
                    mediaType="movie"
                    region={streamingRegion}
                    limit={3}
                    initialProviders={movie.watch_providers}
                  />
                </div>}

                <button
                  type="button"
                  data-mg-focus-key={`movie:${movie.id || movie.tmdb_id || movie.title}`}
                  onClick={() => setSelected(movie)}
                  disabled={category === "cinema_top10" && !movie.tmdb_id}
                  className="mg-hover-action absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Details"
                  aria-label={`Open ${movie.title}`}
                >
                  <span className="w-11 h-11 sm:w-12 sm:h-12 3xl:w-14 3xl:h-14 4xl:w-16 4xl:h-16 rounded-full bg-mg-green text-black flex items-center justify-center">
                    {["cinema_latest", "cinema_top10", "cinema_extras", "streaming_recent_movies"].includes(category) && !debouncedQuery.trim()
                      ? <Info className="w-5 h-5 sm:w-6 sm:h-6 3xl:w-7 3xl:h-7 4xl:w-8 4xl:h-8" />
                      : <Play className="w-5 h-5 sm:w-6 sm:h-6 3xl:w-7 3xl:h-7 4xl:w-8 4xl:h-8 fill-black" />}

                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => addToWatchlist(movie)}
                  disabled={category === "cinema_top10" && !movie.tmdb_id}
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
                {category === "cinema_top10" && !debouncedQuery.trim()
                  ? `Weekend: £${Number(movie.chart_weekend_gross_gbp || 0).toLocaleString("en-GB")}`
                  : ["cinema_latest", "cinema_extras", "streaming_recent_movies"].includes(category) &&
                   !debouncedQuery.trim() && /^\d{4}-\d{2}-\d{2}$/.test(String(movie.release_date || ""))
                    ? `${category === "streaming_recent_movies" ? "Worldwide digital" : "Worldwide cinema"}: ${movie.release_date.slice(8, 10)}/${movie.release_date.slice(5, 7)}/${movie.release_date.slice(0, 4)}${movie.runtime ? " · " + movie.runtime + " min" : ""}`
                    : movie.year}
              </p>

            </article>
          ))}
        </div>
      )}

      {error && <CatalogueRetryNotice busy={loading} onRetry={() => setRetry(value => value + 1)} hasItems={movies.length > 0} catalogue />}
      {!loading && !error && movies.length === 0 && (
        <p className="text-white/40 text-sm 3xl:text-base">
          {category === "cinema_top10" && chartInfo.chart_unavailable
            ? "The official UK box-office Top 10 is temporarily unavailable. We won't replace it with an unrelated popularity list."
            : "No movies found for these filters."}
        </p>
      )}

      {selected && (
        <DetailModal
          item={selected}
          mediaType="movie"
          onClose={() => setSelected(null)}
          onSelectRelated={(nextItem) => setSelected(nextItem)}
        />
      )}
    </div>
  );
}