import React, { useEffect, useState } from "react";
import { Search, Play, Globe } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import {
  GENRES_TV,
  LANGUAGES,
  YEARS,
  GENRE_LABELS_TV,
} from "@/components/mg/filterOptions";
import GenreTags from "@/components/mg/GenreTags";
import DetailModal from "@/components/mg/DetailModal";
import StreamingProviderLogos from "@/components/mg/StreamingProviderLogos";
import StreamingServiceRows from "@/components/mg/StreamingServiceRows";
import {
  detectStreamingRegion,
  detectStreamingTimezone,
  getStreamingRegionOverride,
  setStreamingRegionOverride,
  streamingRegionName,
} from "@/components/mg/streamingRegion";
import { COUNTRY_OPTIONS } from "@/components/mg/countryOptions";
import FeaturedSpotlight from "@/components/mg/FeaturedSpotlight";
import useDebouncedValue from "@/components/mg/useDebouncedValue";

const PosterImage = /** @type {any} */ (Image);

const FEATURED_SHOWS = [{ tmdb_id: "106159", title: "Debris" }];

const CATEGORIES = [
  { id: "tv_airing_today", label: "Airing Today" },
  { id: "tv_on_the_air", label: "On The Air" },
  { id: "tv_popular", label: "Popular" },
  { id: "tv_top_rated", label: "Top Rated" },
];

const gridClass =
  "grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 3xl:grid-cols-9 4xl:grid-cols-10 gap-3 xl:gap-4 3xl:gap-5 4xl:gap-6";

const selectClass =
  "w-full sm:w-auto min-h-11 3xl:min-h-12 appearance-none bg-mg-card border border-white/10 rounded-lg px-3 pr-8 py-2.5 3xl:py-3 text-sm 3xl:text-base 4xl:text-lg text-white focus:outline-none focus:border-mg-green cursor-pointer";

class TvDetailErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[Media God] TV show details display failed", error);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="TV show display recovery"
        className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-black/90 p-4 text-white"
      >
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-mg-card p-5 text-center shadow-2xl">
          <h2 className="text-base font-bold">Show display recovered</h2>
          <p className="mt-2 text-sm text-white/55">
            This show hit a display error. Media God kept the app open so you can return to TV Shows and try again.
          </p>
          <button
            type="button"
            data-mg-overlay-back="true"
            onClick={this.props.onClose}
            className="mt-4 min-h-11 rounded-lg bg-mg-green px-4 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            Back to TV Shows
          </button>
        </div>
      </div>
    );
  }
}

export default function TvShowsView({ initialProvider = null, providerRequestKey = 0, onProviderChange }) {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(() => getStreamingRegionOverride());
  const [category, setCategory] = useState("tv_airing_today");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [language, setLanguage] = useState("");
  const [selected, setSelected] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null);
  const debouncedQuery = useDebouncedValue(query, 400);
  const streamingRegion = country || detectStreamingRegion();
  const streamingTimezone = detectStreamingTimezone();
  const streamingRegionLabel = streamingRegionName(streamingRegion);
  const activeProviderIds = Array.isArray(activeProvider?.providerIds)
    ? activeProvider.providerIds
    : [];
  const activeProviderIdsKey = activeProviderIds.join("|");

  const chooseProvider = (service) => {
    if (!service?.providerIds?.length) return;
    setActiveProvider(service);
    setQuery("");
    setCategory("tv_popular");
    setGenre("");
    setYear("");
    setLanguage("");
    onProviderChange?.(service);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const clearProvider = () => {
    setActiveProvider(null);
    onProviderChange?.(null);
  };

  useEffect(() => {
    if (!providerRequestKey) return;
    if (initialProvider?.providerIds?.length) {
      setActiveProvider(initialProvider);
      setQuery("");
      setCategory("tv_popular");
      setGenre("");
      setYear("");
      setLanguage("");
    } else {
      setActiveProvider(null);
    }
  }, [providerRequestKey, initialProvider]);

  useEffect(() => {
    let cancelled = false;

    const loadShows = async () => {
      setLoading(true);

      try {
        const response = await base44.functions.invoke("getTmdbMovies", {
          media_type: "tv",
          category,
          country: activeProviderIds.length ? "" : country,
          genre,
          year,
          language,
          query: String(debouncedQuery || "").trim(),
          region: streamingRegion,
          timezone: streamingTimezone,
          ...(activeProviderIds.length
            ? {
                provider_ids: activeProviderIds,
                provider_pages: 10,
              }
            : {}),
        });

        if (cancelled) {
          return;
        }

        const first = response?.data ?? response ?? {};
        const payload =
          first &&
          typeof first === "object" &&
          !Array.isArray(first) &&
          first.data &&
          typeof first.data === "object" &&
          !Array.isArray(first.data)
            ? first.data
            : first;

        setShows(Array.isArray(payload?.movies) ? payload.movies : []);
      } catch (loadError) {
        if (!cancelled) {
          console.error("[Media God] TV show library failed to load", loadError);
          setShows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadShows();

    return () => {
      cancelled = true;
    };
  }, [country, category, genre, year, language, debouncedQuery, activeProviderIdsKey, streamingRegion, streamingTimezone]);

  const featured = FEATURED_SHOWS.find((item) => item.title === "Debris");

  const showFeatured =
    !query &&
    !country &&
    !genre &&
    !year &&
    !language &&
    category === "tv_airing_today" &&
    !activeProvider &&
    featured;

  return (
    <div
      data-mg-library-view="true"
      data-mg-tv-shows-view="true"
      className="w-full p-3 min-[420px]:p-4 md:p-6 3xl:p-8 4xl:p-10"
    >
      {showFeatured && (
        <div data-mg-tv-shows-featured="true">
        <FeaturedSpotlight
          tmdbId={featured.tmdb_id}
          title={featured.title}
          onOpen={() =>
            setSelected({
              id: featured.tmdb_id,
              title: featured.title,
              media_type: "tv",
              poster_url: "",
            })
          }
        />
        </div>
      )}

      <div
        data-mg-tv-shows-controls="true"
        className="flex flex-col gap-3 3xl:gap-4 mb-5 3xl:mb-8"
      >
        <div className="flex items-center gap-2 3xl:gap-3">
          <Globe className="w-5 h-5 3xl:w-6 3xl:h-6 text-mg-green" />
          <h1 className="text-xl md:text-2xl 3xl:text-3xl 4xl:text-4xl font-bold text-white tracking-wide">
            {activeProvider ? `TV SHOWS — ${activeProvider.label}` : "TV SHOWS"}
          </h1>
        </div>

        {activeProvider && (
          <div
            data-mg-active-streaming-provider="true"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-mg-green/30 bg-mg-green/10 p-3 3xl:p-4"
          >
            {activeProvider.logoUrl && (
              <img
                src={activeProvider.logoUrl}
                alt=""
                aria-hidden="true"
                className="h-9 w-9 rounded-lg object-cover 3xl:h-11 3xl:w-11"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white 3xl:text-base">
                Browsing all TV on {activeProvider.label}
              </p>
              <p className="text-xs text-white/45 3xl:text-sm">
                Subscription, free and ad-supported availability in {streamingRegionLabel}. Your normal genre, year and language filters still work.
              </p>
            </div>
            <button
              type="button"
              onClick={clearProvider}
              className="min-h-10 rounded-full border border-white/15 bg-black/25 px-4 text-xs font-semibold text-white hover:bg-black/40 focus:outline-none focus:ring-2 focus:ring-mg-green/60 3xl:min-h-12 3xl:text-sm"
            >
              All TV Shows
            </button>
          </div>
        )}

        <div
          data-mg-tv-category-row="true"
          className="flex gap-2 3xl:gap-3 overflow-x-auto scrollbar-hide pb-1"
        >
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { clearProvider(); setCategory(item.id); }}
              aria-label={`TV category ${item.label}`}
              aria-pressed={category === item.id}
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

        <div
          data-mg-tv-filter-row="true"
          className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-2.5 3xl:gap-4"
        >
          <div
            data-mg-tv-search="true"
            className="relative sm:col-span-2 lg:flex-1 lg:min-w-[260px] lg:max-w-2xl 3xl:max-w-3xl"
          >
            <Search className="w-4 h-4 3xl:w-5 3xl:h-5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(event) => { const value = event.target.value; if (value && activeProvider) clearProvider(); setQuery(value); }}
              placeholder="Search shows..."
              aria-label="Search TV shows"
              className="w-full min-h-11 3xl:min-h-12 bg-mg-card border border-white/10 rounded-lg pl-10 3xl:pl-11 pr-3 py-2.5 3xl:py-3 text-sm 3xl:text-base 4xl:text-lg text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
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
                if (activeProvider) clearProvider();
              }}
              aria-label="Choose country for TV and streaming services"
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
            aria-label="Filter TV shows by genre"
            className={selectClass}
          >
            {GENRES_TV.map((item) => (
              <option key={item.id} value={item.id} className="bg-mg-card">
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(event) => setYear(event.target.value)}
            aria-label="Filter TV shows by year"
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
            aria-label="Filter TV shows by language"
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

      {!activeProvider && !query && !genre && !year && !language && (
        <div className="mb-7 3xl:mb-10">
          <StreamingServiceRows
            mediaType="tv"
            region={streamingRegion}
            heading="TV by Streaming Service"
            maxServices={20}
            rowLimit={18}
            onOpen={(item) => setSelected({ ...item, media_type: "tv", mediaType: "tv" })}
            onBrowseAll={chooseProvider}
          />
        </div>
      )}

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
        <div
          data-mg-library-grid="true"
          data-mg-tv-shows-grid="true"
          className={gridClass}
        >
          {shows.map((show) => (
            <article
              key={show.id}
              data-mg-tv-show-card="true"
              className="mg-fire-tv-library-card group min-w-0"
            >
              <div className="relative aspect-[2/3] rounded-md 3xl:rounded-lg overflow-hidden border border-white/10 bg-mg-card">
                <PosterImage
                  src={show.poster_url}
                  alt={show.title}
                  className="w-full h-full object-cover"
                  fittingType="fill"
                  loading="lazy"
                />

                <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-lg bg-black/45 p-1 backdrop-blur-sm">
                  <StreamingProviderLogos
                    tmdbId={show.id || show.tmdb_id}
                    mediaType="tv"
                    region={streamingRegion}
                    limit={3}
                    initialProviders={show.watch_providers}
                  />
                </div>

                <button
                  type="button"
                  data-mg-focus-key={`tv:${show.id || show.tmdb_id || show.title}`}
                  onClick={() => setSelected(show)}
                  className="mg-hover-action absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Details"
                  aria-label={`Open ${show.title}`}
                >
                  <span className="w-11 h-11 sm:w-12 sm:h-12 3xl:w-14 3xl:h-14 4xl:w-16 4xl:h-16 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-5 h-5 sm:w-6 sm:h-6 3xl:w-7 3xl:h-7 4xl:w-8 4xl:h-8 fill-black" />
                  </span>
                </button>
              </div>

              <p className="mt-2 3xl:mt-3 text-xs sm:text-sm 3xl:text-base 4xl:text-lg text-white truncate">
                {show.title}
              </p>
              <p className="text-[10px] sm:text-xs 3xl:text-sm text-white/40">
                {show.year}
              </p>

              <div data-mg-tv-show-genres="true">
                <GenreTags
                  genreIds={show.genre_ids}
                  labelMap={GENRE_LABELS_TV}
                  onSelect={setGenre}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && shows.length === 0 && (
        <p className="text-white/40 text-sm 3xl:text-base">
          {activeProvider
            ? `No TV shows found on ${activeProvider.label} for these filters.`
            : "No shows found for these filters."}
        </p>
      )}

      {selected && (
        <TvDetailErrorBoundary
          key={selected?.id || selected?.tmdb_id || selected?.title || "tv-detail"}
          onClose={() => setSelected(null)}
        >
          <DetailModal
            item={selected}
            mediaType="tv"
            onClose={() => setSelected(null)}
          />
        </TvDetailErrorBoundary>
      )}
    </div>
  );
}
