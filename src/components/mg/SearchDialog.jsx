import React, { useState, useEffect, useCallback } from "react";
import { Search, Film, Tv, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";

export default function SearchDialog({ open, onOpenChange, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (value) => {
    if (!value.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);

    try {
      const res = await base44.functions.invoke("getTmdbMovies", {
        multi_search: value,
      });
      setResults(res.data?.movies || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const choose = (result) => {
    onSelect(result);
    onOpenChange(false);
    setQuery("");
    setResults([]);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-start justify-center sm:pt-[7vh] 3xl:pt-[9vh] p-0 sm:px-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full sm:max-w-2xl 3xl:max-w-4xl 4xl:max-w-5xl max-h-[92svh] sm:max-h-[84vh] bg-mg-surface border border-white/10 rounded-t-2xl sm:rounded-xl 3xl:rounded-2xl overflow-hidden shadow-2xl mg-safe-bottom"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 3xl:gap-4 px-4 sm:px-5 3xl:px-7 py-3.5 3xl:py-5 border-b border-white/10">
          <Search className="w-5 h-5 3xl:w-6 3xl:h-6 4xl:w-7 4xl:h-7 text-white/40 shrink-0" />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search movies, TV shows..."
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-white text-base sm:text-lg 3xl:text-xl 4xl:text-2xl placeholder:text-white/30"
            autoFocus
          />

          <button
            type="button"
            onClick={() => {
              if (query) {
                setQuery("");
                setResults([]);
              } else {
                onOpenChange(false);
              }
            }}
            className="w-10 h-10 3xl:w-12 3xl:h-12 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 shrink-0"
            aria-label={query ? "Clear search" : "Close search"}
          >
            <X className="w-5 h-5 3xl:w-6 3xl:h-6" />
          </button>
        </div>

        <div className="max-h-[75svh] sm:max-h-[68vh] overflow-y-auto overscroll-contain">
          {loading && (
            <div className="p-8 3xl:p-12 text-center text-white/40 flex items-center justify-center gap-2 3xl:text-lg">
              <Loader2 className="w-4 h-4 3xl:w-6 3xl:h-6 animate-spin" />
              Searching...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="p-8 3xl:p-12 text-center text-white/40 text-sm 3xl:text-lg">
              No results found for &quot;{query}&quot;
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="divide-y divide-white/5">
              {results.map((result) => (
                <button
                  type="button"
                  key={`${result.media_type}-${result.id}`}
                  onClick={() => choose(result)}
                  className="w-full flex items-center gap-3 sm:gap-4 3xl:gap-5 p-3 sm:p-4 3xl:p-5 hover:bg-white/5 transition-colors text-left min-h-[78px] 3xl:min-h-[104px]"
                >
                  <div className="w-11 h-16 sm:w-12 3xl:w-16 3xl:h-24 4xl:w-20 4xl:h-28 rounded-md 3xl:rounded-lg overflow-hidden bg-mg-card shrink-0">
                    {result.poster_url ? (
                      <Image
                        src={result.poster_url}
                        alt={result.title}
                        className="w-full h-full object-cover"
                        fittingType="fill"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/30">
                        {result.media_type === "movie" ? (
                          <Film className="w-5 h-5 3xl:w-7 3xl:h-7" />
                        ) : (
                          <Tv className="w-5 h-5 3xl:w-7 3xl:h-7" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm sm:text-base 3xl:text-xl 4xl:text-2xl truncate">
                      {result.title}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 3xl:gap-3 text-xs 3xl:text-base text-white/40 mt-1">
                      <span className="capitalize">{result.media_type}</span>

                      {result.year && (
                        <>
                          <span>•</span>
                          <span>{result.year}</span>
                        </>
                      )}

                      {result.vote_average > 0 && (
                        <>
                          <span>•</span>
                          <span>★ {Number(result.vote_average).toFixed(1)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && !query && (
            <div className="p-8 3xl:p-12 text-center text-white/40 text-sm 3xl:text-lg">
              Start typing to search movies and TV shows
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
