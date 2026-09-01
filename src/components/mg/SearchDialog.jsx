import React, { useState, useEffect, useCallback } from "react";
import { Search, Film, Tv, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

// Global multi-search overlay (movies + TV). Debounced; selecting a result
// opens the detail modal via onSelect.
export default function SearchDialog({ open, onOpenChange, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getTmdbMovies", { multi_search: q });
      setResults(res.data?.movies || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  // Reset when closed.
  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); }
  }, [open]);

  // Escape closes, arrow keys navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const choose = (r) => {
    onSelect(r);
    onOpenChange(false);
    setQuery("");
    setResults([]);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-[8vh] px-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl bg-mg-surface border border-white/10 rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search className="w-5 h-5 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, TV shows..."
            className="flex-1 bg-transparent border-0 outline-none text-white text-lg placeholder:text-white/30"
            autoFocus
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]); }} className="text-white/40 hover:text-white" aria-label="Clear">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="p-8 text-center text-white/40 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching...
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <div className="p-8 text-center text-white/40">No results found for "{query}"</div>
          )}
          {!loading && results.length > 0 && (
            <div className="divide-y divide-white/5">
              {results.map((r) => (
                <button
                  key={`${r.media_type}-${r.id}`}
                  onClick={() => choose(r)}
                  className="w-full flex items-center gap-4 p-3 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-10 h-14 rounded-md overflow-hidden bg-mg-card shrink-0">
                    {r.poster_url ? (
                      <Image src={r.poster_url} alt={r.title} className="w-full h-full object-cover" fittingType="fill" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/30">
                        {r.media_type === "movie" ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{r.title}</p>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <span className="capitalize">{r.media_type}</span>
                      {r.year && <><span>•</span><span>{r.year}</span></>}
                      {r.vote_average > 0 && <><span>•</span><span>★ {Number(r.vote_average).toFixed(1)}</span></>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && !query && (
            <div className="p-8 text-center text-white/40">Start typing to search movies and TV shows</div>
          )}
        </div>
      </div>
    </div>
  );
}