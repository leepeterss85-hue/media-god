import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Play, Film } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { usePlayer, buildMediaSources } from "@/components/mg/PlayerProvider";

export default function RoadmapView() {
  const [films, setFilms] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("film");
  const player = usePlayer();

  useEffect(() => {
    Promise.all([
      base44.functions
        .invoke("getTmdbMovies", { category: "upcoming" })
        .then((res) => res.data?.movies || [])
        .catch(() => []),
      base44.entities.RoadmapItem.list("-created_date", 50).catch(() => []),
    ]).then(([f, b]) => {
      setFilms(f);
      setBroadcasts(b);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(
    () => (tab === "film" ? films : broadcasts.filter((i) => i.type === "broadcast")),
    [films, broadcasts, tab]
  );

  const fetchMedia = async (id) => {
    if (id && /^\d+$/.test(String(id))) {
      try {
        const res = await base44.functions.invoke("getTmdbMovies", { movie_id: id });
        return { trailerUrl: res.data?.trailer_url || "", providers: res.data?.watch_providers || [] };
      } catch {}
    }
    return { trailerUrl: "", providers: [] };
  };

  const playTrailer = async (r) => {
    const { trailerUrl, providers } = await fetchMedia(r.tmdb_id || r.id);
    if (trailerUrl) {
      player.play({ type: "youtube", src: trailerUrl, title: r.title, poster: r.poster_url });
      return;
    }
    player.play({
      title: r.title,
      poster: r.poster_url,
      sources: buildMediaSources({ title: r.title, id: r.tmdb_id || r.id, poster: r.poster_url, trailerUrl: "", providers }),
    });
  };

  const playStream = async (r) => {
    const { trailerUrl, providers } = await fetchMedia(r.tmdb_id || r.id);
    player.play({
      title: r.title,
      poster: r.poster_url,
      sources: buildMediaSources({ title: r.title, id: r.tmdb_id || r.id, poster: r.poster_url, trailerUrl, providers }),
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <button className="text-white/50 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-white tracking-wide">RELEASE ROADMAP</h1>
      </div>

      <div className="flex gap-6 border-b border-white/10 mb-6">
        {[
          { id: "film", label: "FILM SCHEDULE" },
          { id: "broadcast", label: "BROADCASTS" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "pb-2 text-sm font-semibold transition-colors border-b-2",
              tab === t.id
                ? "text-mg-green border-mg-green"
                : "text-white/50 border-transparent hover:text-white"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-white/40 text-sm">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="bg-mg-card border border-white/10 rounded-lg p-3 flex gap-4"
            >
              <div className="w-16 h-24 shrink-0 rounded-md overflow-hidden border border-white/10 bg-mg-surface">
                <Image
                  src={r.poster_url}
                  alt={r.title}
                  className="w-full h-full object-cover"
                  fittingType="fill"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-white text-sm">{r.title}</h3>
                  {r.release_date && (
                    <span className="text-[10px] font-bold bg-mg-green/15 text-mg-green border border-mg-green/40 px-2 py-1 rounded whitespace-nowrap">
                      {r.release_date}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50 mt-1 line-clamp-3">{r.plot || r.description}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => playStream(r)}
                    className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-mg-green-dim"
                  >
                    <Play className="w-3 h-3 fill-black" /> STREAM
                  </button>
                  <button
                    onClick={() => playTrailer(r)}
                    className="flex items-center gap-1.5 bg-white/10 text-white font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-white/20"
                  >
                    <Film className="w-3 h-3" /> TRAILER
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}