import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer, buildMediaSources } from "@/components/mg/PlayerProvider";
import { detectStreamingRegion, streamingRegionName } from "@/components/mg/streamingRegion";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

const PosterImage = /** @type {any} */ (Image);

export default function RoadmapView({ onBack }) {
  const [films, setFilms] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("film");
  const [busyKey, setBusyKey] = useState("");
  const [query, setQuery] = useState("");
  const [dateWindow, setDateWindow] = useState("all");
  const player = usePlayer();
  const releaseRegion = detectStreamingRegion();
  const releaseRegionLabel = streamingRegionName(releaseRegion);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [filmResult, broadcastResult] = await Promise.allSettled([
      base44.functions.invoke("getTmdbMovies", {
        category: "upcoming",
        region: releaseRegion,
        include_global_releases: true,
      }),
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
      setError("Release dates could not be loaded right now.");
    } else if (filmResult.status === "rejected") {
      setError("Upcoming film release dates are temporarily unavailable, but saved TV and broadcast dates are still shown.");
    } else if (broadcastResult.status === "rejected") {
      setError("Saved TV and broadcast dates are temporarily unavailable, but upcoming film release dates are still shown.");
    }

    setLoading(false);
  }, [releaseRegion]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const base =
      tab === "film"
        ? films
        : broadcasts.filter((item) => item?.type === "broadcast");

    const wanted = query.trim().toLowerCase();
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const windowDays =
      dateWindow === "7"
        ? 7
        : dateWindow === "30"
          ? 30
          : null;

    return base
      .filter((item) => {
        if (
          wanted &&
          !`${item?.title || ""} ${item?.description || item?.overview || item?.plot || ""}`
            .toLowerCase()
            .includes(wanted)
        ) {
          return false;
        }

        if (!windowDays) return true;

        const rawDate =
          item?.release_date ||
          item?.air_date ||
          item?.date ||
          item?.created_date ||
          "";
        const time = Date.parse(rawDate);

        if (!Number.isFinite(time)) return false;

        const diffDays = (time - today) / 86400000;
        return diffDays >= 0 && diffDays <= windowDays;
      })
      .sort((a, b) => {
        const aDate = String(
          a?.release_date || a?.air_date || a?.date || ""
        );
        const bDate = String(
          b?.release_date || b?.air_date || b?.date || ""
        );
        return aDate.localeCompare(bDate);
      });
  }, [films, broadcasts, tab, query, dateWindow]);

  const fetchMedia = async (id) => {
    if (id && /^\d+$/.test(String(id))) {
      try {
        const response = await base44.functions.invoke("getTmdbMovies", {
          movie_id: id,
          region: releaseRegion,
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
        sources: buildMediaSources(
          /** @type {any} */ ({
            title: item?.title,
            id: item?.tmdb_id || item?.id,
            poster: item?.poster_url,
            trailerUrl: "",
            providers,
          })
        ),
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
        sources: buildMediaSources(
          /** @type {any} */ ({
            title: item?.title,
            id: item?.tmdb_id || item?.id,
            poster: item?.poster_url,
            trailerUrl,
            providers,
          })
        ),
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
            <h1 className="text-xl font-bold text-white tracking-wide">Release Dates</h1>
            <p className="text-xs text-white/40 mt-0.5">
              Cinema dates for {releaseRegionLabel}, plus films already released elsewhere and available to try through Media God.
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
          { id: "film", label: `Films (${films.length})` },
          {
            id: "broadcast",
            label: `TV & broadcasts (${broadcasts.filter((item) => item?.type === "broadcast").length})`,
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

      <div className="mb-5 flex flex-col gap-2 rounded-xl border border-white/10 bg-mg-card/60 p-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search release dates…"
            aria-label="Search release dates"
            className="min-h-11 w-full rounded-lg border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green/50"
          />
        </label>

        <select
          value={dateWindow}
          onChange={(event) => setDateWindow(event.target.value)}
          aria-label="Release date window"
          className="min-h-11 rounded-lg border border-white/10 bg-[#151515] px-3 text-sm text-white/75 outline-none focus:border-mg-green/50"
        >
          <option value="all">All upcoming</option>
          <option value="7">Next 7 days</option>
          <option value="30">Next 30 days</option>
        </select>

        <span className="text-xs font-semibold text-white/40 sm:px-2">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </span>
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
            {tab === "film" ? "No upcoming film release dates were returned." : "No TV or broadcast release dates have been saved yet."}
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
                    <PosterImage
                      src={item.poster_url}
                      alt={item?.title || "Release date item"}
                      className="w-full h-full object-cover"
                      fittingType="fill"
                      loading="lazy"
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
                    <div className="flex flex-col items-end gap-1">
                      {item?.release_date && (
                        <span className="text-[10px] font-bold bg-mg-green/15 text-mg-green border border-mg-green/40 px-2 py-1 rounded whitespace-nowrap">
                          {item.release_date}
                        </span>
                      )}
                      {item?.global_release_available && item?.global_release_date && item?.global_release_date !== item?.release_date && (
                        <span className="text-[10px] font-semibold bg-sky-400/10 text-sky-200 border border-sky-400/30 px-2 py-1 rounded whitespace-nowrap">
                          Released elsewhere {item.global_release_date}
                        </span>
                      )}
                    </div>
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
