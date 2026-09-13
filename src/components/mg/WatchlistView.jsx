import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Play, RefreshCw, Search, Trash2 } from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { buildMediaSources, usePlayer } from "@/components/mg/PlayerProvider";

const PosterImage = /** @type {any} */ (Image);

const sortItems = (items, mode) =>
  items.slice().sort((a, b) => {
    if (mode === "title") {
      return String(a?.title || "").localeCompare(String(b?.title || ""));
    }

    if (mode === "year") {
      return Number(b?.year || 0) - Number(a?.year || 0);
    }

    return (
      new Date(b?.created_date || 0).getTime() -
      new Date(a?.created_date || 0).getTime()
    );
  });

export default function WatchlistView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("newest");
  const { toast } = useToast();
  const player = usePlayer();

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const rows = await base44.entities.WatchlistItem.list("-created_date", 200);
      setItems(Array.isArray(rows) ? rows : []);
    } catch (loadError) {
      setItems([]);
      setError(loadError?.message || "Could not load your Watchlist.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    const filtered = wanted
      ? items.filter((item) =>
          `${item?.title || ""} ${item?.year || ""}`
            .toLowerCase()
            .includes(wanted)
        )
      : items;

    return sortItems(filtered, sortMode);
  }, [items, query, sortMode]);

  const remove = async (item) => {
    try {
      await base44.entities.WatchlistItem.delete(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      toast({ title: "Removed from Watchlist" });
    } catch {
      toast({ title: "Could not remove from Watchlist", variant: "destructive" });
    }
  };

  const playItem = async (item) => {
    let trailerUrl = "";
    let providers = [];

    if (item.tmdb_id) {
      try {
        const response = await base44.functions.invoke("getTmdbMovies", {
          movie_id: item.tmdb_id,
        });
        trailerUrl = response.data?.trailer_url || "";
        providers = response.data?.watch_providers || [];
      } catch {
        // Playback can continue using normal Media God source discovery.
      }
    }

    player.play({
      title: item.title,
      poster: item.poster_url,
      rdTitle: item.title,
      rdYear: item.year,
      sources: buildMediaSources(
        /** @type {any} */ ({
          title: item.title,
          id: item.tmdb_id,
          poster: item.poster_url,
          trailerUrl,
          providers,
        })
      ),
    });
  };

  return (
    <div
      data-mg-library-view="true"
      data-mg-watchlist-view="true"
      className="p-4 md:p-6 max-w-6xl mx-auto w-full"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Watchlist</h1>
          <p className="mt-1 text-sm text-white/50">
            {items.length} saved {items.length === 1 ? "title" : "titles"}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Watchlist…"
            className="min-h-11 w-full rounded-lg border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green/50"
          />
        </label>

        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value)}
          aria-label="Sort Watchlist"
          className="min-h-11 rounded-lg border border-white/10 bg-[#151515] px-3 text-sm text-white/75 outline-none focus:border-mg-green/50"
        >
          <option value="newest">Newest saved</option>
          <option value="title">Title A–Z</option>
          <option value="year">Newest year</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div
          data-mg-library-grid="true"
          className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        >
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[2/3] rounded-md bg-mg-card animate-pulse"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-mg-card/60 py-20 text-center">
          <p className="text-white/45 text-sm">
            {items.length > 0 && query.trim()
              ? "No Watchlist titles match your search."
              : "Your watchlist is empty."}
          </p>
          {items.length === 0 && (
            <p className="mt-1 text-xs text-white/30">
              Add movies and shows from their details screens.
            </p>
          )}
        </div>
      ) : (
        <div
          data-mg-library-grid="true"
          className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        >
          {visible.map((item) => (
            <div
              key={item.id}
              data-mg-watchlist-card="true"
              className="mg-fire-tv-library-card group"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-md border border-white/10 bg-mg-card">
                <PosterImage
                  src={item.poster_url}
                  alt={item.title}
                  className="h-full w-full object-cover"
                  fittingType="fill"
                />

                <button
                  type="button"
                  onClick={() => playItem(item)}
                  className="mg-hover-action absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Play ${item.title}`}
                  title="Play"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mg-green text-black">
                    <Play className="h-5 w-5 fill-black" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="mg-hover-action absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white/80 opacity-0 transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100"
                  aria-label={`Remove ${item.title} from Watchlist`}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="mt-2 truncate text-sm text-white">{item.title}</p>
              <p className="text-xs text-white/40">{item.year}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
