import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  Play,
  RefreshCw,
  Search,
  Square,
  Trash2,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { buildMediaSources, usePlayer } from "@/components/mg/PlayerProvider";
import DetailModal from "@/components/mg/DetailModal";

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
  const [mediaFilter, setMediaFilter] = useState("all");
  const [clearing, setClearing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
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
    const filtered = items.filter((item) => {
      const itemType = item?.media_type === "tv" ? "tv" : "movie";
      if (mediaFilter !== "all" && itemType !== mediaFilter) return false;
      if (!wanted) return true;

      return `${item?.title || ""} ${item?.year || ""}`
        .toLowerCase()
        .includes(wanted);
    });

    return sortItems(filtered, sortMode);
  }, [items, mediaFilter, query, sortMode]);

  const remove = async (item) => {
    try {
      await base44.entities.WatchlistItem.delete(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      toast({ title: "Removed from Watchlist" });
    } catch {
      toast({ title: "Could not remove from Watchlist", variant: "destructive" });
    }
  };

  const toggleSelected = (id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  };

  const removeSelected = async () => {
    if (selectedIds.length === 0 || clearing) return;

    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        `Remove ${selectedIds.length} selected title${selectedIds.length === 1 ? "" : "s"} from your Watchlist?`
      );

    if (!confirmed) return;

    setClearing(true);
    const wanted = new Set(selectedIds);
    let failed = 0;

    for (const item of items.filter((row) => wanted.has(row.id))) {
      try {
        await base44.entities.WatchlistItem.delete(item.id);
      } catch {
        failed += 1;
      }
    }

    await load();
    setSelectedIds([]);
    setEditMode(false);
    setClearing(false);

    toast({
      title: failed ? "Watchlist partly updated" : "Selected titles removed",
      description: failed
        ? `${failed} item${failed === 1 ? "" : "s"} could not be removed.`
        : undefined,
      ...(failed ? { variant: "destructive" } : {}),
    });
  };

  const clearAll = async () => {
    if (clearing || items.length === 0) return;

    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        `Remove all ${items.length} title${items.length === 1 ? "" : "s"} from your Watchlist?`
      );

    if (!confirmed) return;

    setClearing(true);
    let failed = 0;

    for (const item of items) {
      try {
        await base44.entities.WatchlistItem.delete(item.id);
      } catch {
        failed += 1;
      }
    }

    if (failed === 0) {
      setItems([]);
      toast({ title: "Watchlist cleared" });
    } else {
      await load();
      toast({
        title: "Watchlist partly cleared",
        description: `${failed} item${failed === 1 ? " could" : "s could"} not be removed.`,
        variant: "destructive",
      });
    }

    setClearing(false);
  };

  const playItem = async (item) => {
    const mediaType = item?.media_type === "tv" ? "tv" : "movie";

    if (mediaType === "tv") {
      setSelected({
        ...item,
        id: item?.tmdb_id || item?.id,
        media_type: "tv",
        mediaType: "tv",
        type: "tv",
      });
      return;
    }

    let trailerUrl = "";
    let providers = [];

    if (item.tmdb_id) {
      try {
        const response = await base44.functions.invoke("getTmdbMovies", {
          media_type: "movie",
          movie_id: item.tmdb_id,
        });
        trailerUrl = response.data?.trailer_url || "";
        providers = response.data?.watch_providers || [];
      } catch {
        // Playback can continue using normal Media God source discovery.
      }
    }

    player.play({
      id: item.tmdb_id,
      tmdbId: item.tmdb_id,
      tmdb_id: item.tmdb_id,
      title: item.title,
      poster: item.poster_url,
      rdTitle: item.title,
      rdYear: item.year,
      mediaType: "movie",
      type: "movie",
      sources: buildMediaSources(
        /** @type {any} */ ({
          title: item.title,
          id: item.tmdb_id,
          poster: item.poster_url,
          trailerUrl,
          providers,
          mediaType: "movie",
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

        <div className="flex flex-wrap gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEditMode((value) => !value);
                setSelectedIds([]);
              }}
              className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                editMode
                  ? "border-mg-green/40 bg-mg-green/10 text-mg-green"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              {editMode ? "Done editing" : "Edit"}
            </button>
          )}

          {editMode && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={removeSelected}
              disabled={clearing}
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/15 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Remove selected ({selectedIds.length})
            </button>
          )}

          {items.length > 0 && !editMode && (
            <button
              type="button"
              onClick={clearAll}
              disabled={clearing || loading}
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/15 disabled:opacity-50"
            >
              <Trash2 className={`h-4 w-4 ${clearing ? "animate-pulse" : ""}`} />
              {clearing ? "Clearing…" : "Clear all"}
            </button>
          )}

          <button
            type="button"
            onClick={load}
            disabled={loading || clearing}
            className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Watchlist…"
            className="min-h-11 w-full rounded-lg border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green/50"
          />
        </label>

        <div className="flex gap-1 overflow-x-auto">
          {[
            ["all", "All"],
            ["movie", "Movies"],
            ["tv", "TV Shows"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMediaFilter(id)}
              aria-pressed={mediaFilter === id}
              className={`min-h-11 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${
                mediaFilter === id
                  ? "bg-mg-green text-black"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

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
                  loading="lazy"
                />

                {editMode ? (
                  <button
                    type="button"
                    onClick={() => toggleSelected(item.id)}
                    className={`absolute inset-0 flex items-start justify-end p-2 ${
                      selectedIds.includes(item.id)
                        ? "bg-mg-green/20 ring-2 ring-inset ring-mg-green"
                        : "bg-black/20"
                    }`}
                    aria-pressed={selectedIds.includes(item.id)}
                    aria-label={`Select ${item.title}`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/75 text-white">
                      {selectedIds.includes(item.id) ? (
                        <CheckSquare className="h-5 w-5 text-mg-green" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => playItem(item)}
                      className="mg-hover-action absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={item?.media_type === "tv" ? `Open ${item.title}` : `Play ${item.title}`}
                      title={item?.media_type === "tv" ? "Open show" : "Play"}
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
                  </>
                )}
              </div>

              <p className="mt-2 truncate text-sm text-white">{item.title}</p>
              <p className="text-xs text-white/40">{item.year}</p>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DetailModal
          item={selected}
          mediaType="tv"
          onClose={() => setSelected(null)}
          onSelectRelated={(nextItem) => setSelected(nextItem)}
        />
      )}
    </div>
  );
}
