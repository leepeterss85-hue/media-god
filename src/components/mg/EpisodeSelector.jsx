import React, { useEffect, useState } from "react";
import { ChevronDown, Play, Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { usePlayer, buildMediaSources } from "@/components/mg/PlayerProvider";

export default function EpisodeSelector({ item, seasons, trailerUrl, providers }) {
  const [season, setSeason] = useState("");
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const player = usePlayer();

  useEffect(() => {
    if (!seasons?.length) return;
    const first = seasons[0];
    setSeason(String(first.season_number));
  }, [seasons]);

  useEffect(() => {
    if (season === "") return;
    setLoading(true);
    setEpisodes([]);

    base44.functions
      .invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: item.id,
        season_number: season,
      })
      .then((res) => setEpisodes(res.data?.episodes || []))
      .catch(() => setEpisodes([]))
      .finally(() => setLoading(false));
  }, [item.id, season]);

  const currentSeason = seasons?.find(
    (s) => String(s.season_number) === season
  );

  const seasonLabel = currentSeason
    ? currentSeason.name
    : "Select season";

  const playEpisode = (ep) => {
    const episodeNumber = Number(ep.episode_number);
    const seasonNumber = Number(season);
    const episodeTitle = `${item.title} — S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
    const poster = ep.still_url || item.poster_url;

    player.play({
      id: item.id,
      title: episodeTitle,
      poster,
      year: item.year,
      mediaType: "tv",
      season: seasonNumber,
      episode: episodeNumber,
      rdTitle: item.title,
      rdYear: item.year,
      rdSeason: seasonNumber,
      rdEpisode: episodeNumber,
      sources: buildMediaSources({
        title: episodeTitle,
        id: item.id,
        poster,
        trailerUrl,
        providers,
      }),
    });
  };

  if (!seasons?.length) return null;

  return (
    <div className="mt-5">
      <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2">
        Episodes
      </h3>

      <div className="relative mb-3">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="flex items-center justify-between w-full bg-mg-card border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
        >
          <span className="font-semibold">{seasonLabel}</span>
          <ChevronDown
            className={
              "w-4 h-4 text-white/60 transition-transform " +
              (pickerOpen ? "rotate-180" : "")
            }
          />
        </button>

        {pickerOpen && (
          <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-mg-surface border border-white/10 rounded-lg shadow-xl">
            {seasons.map((s) => (
              <button
                key={s.season_number}
                onClick={() => {
                  setSeason(String(s.season_number));
                  setPickerOpen(false);
                }}
                className={
                  "flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-white/5 " +
                  (String(s.season_number) === season
                    ? "text-mg-green"
                    : "text-white/80")
                }
              >
                <span>{s.name}</span>
                <span className="text-white/40 text-xs">
                  {s.episode_count} ep
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-mg-card rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {episodes.map((ep) => (
            <div
              key={ep.episode_number}
              className="flex gap-3 bg-mg-card border border-white/10 rounded-lg p-2 hover:border-mg-green/50 transition-colors"
            >
              <button
                onClick={() => playEpisode(ep)}
                className="relative w-24 sm:w-32 aspect-video rounded-md overflow-hidden bg-black shrink-0 group"
              >
                {ep.still_url ? (
                  <Image
                    src={ep.still_url}
                    alt={ep.name}
                    className="w-full h-full object-cover"
                    fittingType="fill"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px]">
                    No still
                  </div>
                )}

                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="w-8 h-8 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-4 h-4 fill-black" />
                  </span>
                </span>

                <span className="absolute bottom-0.5 left-0.5 text-[10px] font-bold bg-black/70 text-white px-1 rounded">
                  E{ep.episode_number}
                </span>
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {ep.name}
                </p>
                <p className="text-white/40 text-xs flex items-center gap-1 mt-0.5">
                  {ep.air_date && (
                    <>
                      <Calendar className="w-3 h-3" /> {ep.air_date}
                    </>
                  )}
                </p>
                <p className="text-white/50 text-xs mt-1 line-clamp-2">
                  {ep.overview || "No description."}
                </p>
              </div>
            </div>
          ))}

          {episodes.length === 0 && (
            <p className="text-white/40 text-xs">
              No episodes found for this season.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
