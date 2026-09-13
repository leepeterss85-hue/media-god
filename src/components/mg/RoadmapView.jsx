import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  Film,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer, buildMediaSources } from "@/components/mg/PlayerProvider";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

export default function RoadmapView({ onBack }) {
  const [films, setFilms] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("film");
  const [busyKey, setBusyKey] = useState("");
  const player = usePlayer();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [filmResult, broadcastResult] = await Promise.allSettled([
      base44.functions.invoke("getTmdbMovies", { category: "upcoming" }),
      base44.entities.RoadmapItem.list("-created_date", 50),
    ]);

    const nextFilms =
      filmResult.status === "fulfilled" && Array.isArray(filmResult.value?.data?.movies)
        ? filmResult.value.data.movies
        : [];
    const nextBroadcasts =
      broadcastResult.status === "fulfilled" && Array.isArray(broadcastResult.value)
        ? broadcastResult.value
        : [];

    setFilms(nextFilms);
    setBroadcasts(nextBroadcasts);

    if (filmResult.status === "rejected" && broadcastResult.status === "rejected") {
      setError("The release roadmap could not be loaded right now.");
    } else if (filmResult.status === "rejected") {
      setError("Upcoming films are temporarily unavailable, but saved broadcasts are still shown.");
    } else if (broadcastResult.status === "rejected") {
      setError("Saved broadcasts are temporarily unavailable, but upcoming films are still shown.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      tab === "film"
        ? films
        : broadcasts.filter((item) => item?.type === "broadcast"),
    [films, broadcasts, tab]
  );

  const fetchMedia = async (id) => {
    if (id && /^\d+$/.test(String(id))) {
      try {
        const response = await base44.functions.invoke("getTmdbMovies", {
          movie_id: id,
        });
        return {
          trailerUrl: response?.data?.trailer_url || "",
          providers: response?.data?.watch_providers || [],
        };
      } catch {
        // Playback source discovery below can still continue without metadata.
      }
    }

    return { trailerUrl: "", providers: [] };
  };

  const playTrailer = async (item) => {
    const key = `trailer:${item?.id || item?.tmdb_id || item?.title}`;
    setBusyKey(key);
    setError("");

    try {
      const { trailerUrl, providers } = await fetchMedia(item?.tmdb_id || item?.id);

      if (trailerUrl) {
        player.play({
          type: "youtube",
          src: trailerUrl,
          title: item?.title,
          poster: item?.poster_url,
        });
        return;
      }

      player.play({
        title: item?.title,
        poster: item?.poster_url,
        sources: buildMediaSources({
          title: item?.title,
          id: item?.tmdb_id || item?.id,
          poster: item?.poster_url,
          trailerUrl: "",
          providers,
        }),
      });
    } catch (playError) {
      setError(playError?.message || "Could not open that trailer.");
    } finally {
      setBusyKey("");
    }
  };

  const playStream = async (item) => {
    const key = `stream:${item?.id || item?.tmdb_id || item?.title}`;
    setBusyKey(key);
    setError("");

    try {
      const { trailerUrl, providers } = await fetchMedia(item?.tmdb_id || item?.id);
      player.play({
        title: item?.title,
        poster: item?.poster_url,
        sources: buildMediaSources({
          title: item?.title,
          id: item?.tmdb_id || item?.id,
          poster: item?.poster_url,
          trailerUrl,
          providers,
        }),
      });
    } catch (playError) {
      setError(playError?.message || "Could not start that title.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div data-mg-roadmap-view="true" className="p-4 md:p-6 max-w-4xl w-full mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onBack?.()}
            aria-label="Back to Media God home"
            title="Back"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/50 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white tracking-wide">Release Roadmap</h1>
            <p className="text-xs text-white/40 mt-0.5">
              Upcoming films and saved broadcast events in one place.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>

      <div className="flex gap-2 border-b border-white/10 mb-5 overflow-x-auto">
        {[
          { id: "film", label: `Film schedule (${films.length})` },
          {
            id: "broadcast",
            label: `Broadcasts (${broadcasts.filter((item) => item?.type === "broadcast").length})`,
          },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "min-h-11 whitespace-nowrap border-b-2 px-2 text-sm font-semibold transition-colors",
              tab === item.id
                ? "border-mg-green text-mg-green"
                : "border-transparent text-white/50 hover:text-white"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-28 rounded-xl bg-mg-card animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-mg-card/60 py-16 px-4 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-white/20" />
          <p className="mt-3 text-sm font-medium text-white/60">
            {tab === "film" ? "No upcoming films were returned." : "No broadcast events have been saved yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => {
            const itemKey = item?.id || item?.tmdb_id || item?.title;
            const streamKey = `stream:${itemKey}`;
            const trailerKey = `trailer:${itemKey}`;
            const description = item?.plot || item?.description || item?.overview || "";

            return (
              <article
                key={itemKey}
                className="bg-mg-card border border-white/10 rounded-xl p-3 flex gap-4"
              >
                <div className="w-16 h-24 sm:w-20 sm:h-28 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-mg-surface">
                  {item?.poster_url ? (
                    <Image
                      src={item.poster_url}
                      alt={item?.title || "Roadmap item"}
                      className="w-full h-full object-cover"
                      fittingType="fill"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-white/20">
                      <Film className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-bold text-white text-sm sm:text-base leading-tight">
                      {item?.title || "Untitled"}
                    </h2>
                    {item?.release_date && (
                      <span className="text-[10px] font-bold bg-mg-green/15 text-mg-green border border-mg-green/40 px-2 py-1 rounded whitespace-nowrap">
                        {item.release_date}
                      </span>
                    )}
                  </div>

                  {description && (
                    <p className="text-xs text-white/50 mt-1 line-clamp-3">{description}</p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => playStream(item)}
                      disabled={Boolean(busyKey)}
                      className="min-h-10 flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green-dim disabled:opacity-50"
                    >
                      {busyKey === streamKey ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-black" />
                      )}
                      Stream
                    </button>
                    <button
                      type="button"
                      onClick={() => playTrailer(item)}
                      disabled={Boolean(busyKey)}
                      className="min-h-10 flex items-center gap-1.5 bg-white/10 text-white font-semibold text-xs px-3 py-2 rounded-md hover:bg-white/20 disabled:opacity-50"
                    >
                      {busyKey === trailerKey ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Film className="w-3.5 h-3.5" />
                      )}
                      Trailer
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
