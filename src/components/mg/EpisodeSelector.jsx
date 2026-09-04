import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import {
  buildMediaSources,
  usePlayer,
} from "@/components/mg/PlayerProvider";

const unwrap = (response) => response?.data ?? response ?? {};

const normaliseSeasons = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => Number(item?.season_number) > 0)
    .sort(
      (a, b) =>
        Number(a.season_number) - Number(b.season_number)
    );

export default function EpisodeSelector({
  item,
  seasons,
  trailerUrl,
  providers,
  imdbId = "",
}) {
  const player = usePlayer();

  const [availableSeasons, setAvailableSeasons] = useState(() =>
    normaliseSeasons(seasons)
  );
  const [season, setSeason] = useState("");
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [seasonsError, setSeasonsError] = useState("");
  const [episodeError, setEpisodeError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const sortedSeasons = useMemo(
    () => normaliseSeasons(availableSeasons),
    [availableSeasons]
  );

  useEffect(() => {
    setAvailableSeasons(normaliseSeasons(seasons));
    setSeason("");
    setEpisodes([]);
    setSeasonsError("");
    setEpisodeError("");
    setPickerOpen(false);
  }, [item?.id]);

  useEffect(() => {
    const incoming = normaliseSeasons(seasons);

    if (incoming.length > 0) {
      setAvailableSeasons(incoming);
      setSeasonsError("");
    }
  }, [seasons]);

  useEffect(() => {
    let cancelled = false;

    if (sortedSeasons.length > 0) {
      return () => {
        cancelled = true;
      };
    }

    if (!item?.id) {
      setSeasonsError("This show does not have a TMDB id.");
      return () => {
        cancelled = true;
      };
    }

    const loadSeasons = async () => {
      setSeasonsLoading(true);
      setSeasonsError("");

      try {
        const response = await base44.functions.invoke(
          "getTmdbMovies",
          {
            media_type: "tv",
            movie_id: item.id,
          }
        );

        if (cancelled) return;

        const data = unwrap(response);
        const found = normaliseSeasons(data?.details?.seasons);

        if (found.length > 0) {
          setAvailableSeasons(found);
        } else {
          setSeasonsError(
            data?.error ||
              "No seasons were returned for this TV show."
          );
        }
      } catch (error) {
        if (!cancelled) {
          setSeasonsError(
            error?.message ||
              "Could not load seasons for this TV show."
          );
        }
      } finally {
        if (!cancelled) setSeasonsLoading(false);
      }
    };

    loadSeasons();

    return () => {
      cancelled = true;
    };
  }, [item?.id, reloadNonce, sortedSeasons.length]);

  useEffect(() => {
    if (sortedSeasons.length === 0) return;

    const stillExists = sortedSeasons.some(
      (item) =>
        String(item.season_number) === String(season)
    );

    if (stillExists) return;

    const firstWithEpisodes =
      sortedSeasons.find(
        (item) => Number(item?.episode_count || 0) > 0
      ) || sortedSeasons[0];

    setSeason(String(firstWithEpisodes.season_number));
  }, [sortedSeasons, season]);

  useEffect(() => {
    let cancelled = false;

    if (season === "" || !item?.id) {
      return () => {
        cancelled = true;
      };
    }

    const loadEpisodes = async () => {
      setLoading(true);
      setEpisodes([]);
      setEpisodeError("");

      try {
        const response = await base44.functions.invoke(
          "getTmdbMovies",
          {
            media_type: "tv",
            movie_id: item.id,
            season_number: Number(season),
          }
        );

        if (cancelled) return;

        const data = unwrap(response);
        const foundEpisodes = Array.isArray(data?.episodes)
          ? data.episodes
          : [];

        setEpisodes(foundEpisodes);

        if (foundEpisodes.length === 0) {
          setEpisodeError(
            data?.error ||
              "No episodes were returned for this season."
          );
        }
      } catch (error) {
        if (!cancelled) {
          setEpisodes([]);
          setEpisodeError(
            error?.message ||
              "Could not load episodes for this season."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadEpisodes();

    return () => {
      cancelled = true;
    };
  }, [item?.id, season, reloadNonce]);

  const currentSeason = sortedSeasons.find(
    (item) =>
      String(item.season_number) === String(season)
  );

  const seasonLabel = currentSeason
    ? currentSeason.name ||
      `Season ${currentSeason.season_number}`
    : "Select season";

  const resolveEpisodeImdb = async () => {
    const supplied = String(
      imdbId || item?.imdb_id || item?.imdbId || ""
    ).trim();

    if (/^tt\d+$/i.test(supplied)) return supplied;

    try {
      const response = await base44.functions.invoke(
        "resolveImdb",
        {
          tmdb_id: item.id,
          title: item.title || "",
          year: item.year || "",
          media_type: "tv",
        }
      );

      const data = unwrap(response);
      const resolved = String(data?.imdb_id || "").trim();

      return /^tt\d+$/i.test(resolved) ? resolved : "";
    } catch {
      return "";
    }
  };

  const playEpisode = async (episodeItem) => {
    const episodeNumber = Number(
      episodeItem.episode_number
    );
    const seasonNumber = Number(season);

    const episodeTitle = `${item.title} — S${String(
      seasonNumber
    ).padStart(2, "0")}E${String(episodeNumber).padStart(
      2,
      "0"
    )}`;

    const poster =
      episodeItem.still_url || item.poster_url;

    const resolvedImdb = await resolveEpisodeImdb();

    await player.play({
      id: item.id,
      tmdbId: item.id,
      imdbId: resolvedImdb,
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
      preferRd: true,
      sources: buildMediaSources({
        title: episodeTitle,
        id: item.id,
        poster,
        trailerUrl,
        providers,
      }),
    });
  };

  return (
    <div
      id="mg-episode-selector"
      className="mt-5 scroll-mt-4"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider">
          Episodes
        </h3>

        {sortedSeasons.length > 0 && (
          <span className="text-[10px] text-white/40">
            {sortedSeasons.length} season
            {sortedSeasons.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {seasonsLoading ? (
        <div className="bg-mg-card border border-white/10 rounded-lg p-4 flex items-center gap-2 text-white/60 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-mg-green" />
          Loading seasons…
        </div>
      ) : sortedSeasons.length === 0 ? (
        <div className="bg-mg-card border border-white/10 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />

            <div className="flex-1">
              <p className="text-white text-sm font-medium">
                Seasons are not available yet
              </p>

              <p className="text-white/45 text-xs mt-1">
                {seasonsError ||
                  "Media God did not receive season information for this show."}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setReloadNonce((value) => value + 1)
              }
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white/10 text-white text-xs hover:bg-white/15"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <button
              type="button"
              onClick={() =>
                setPickerOpen((open) => !open)
              }
              className="flex items-center justify-between w-full bg-mg-card border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
            >
              <span className="font-semibold">
                {seasonLabel}
              </span>

              <ChevronDown
                className={
                  "w-4 h-4 text-white/60 transition-transform " +
                  (pickerOpen ? "rotate-180" : "")
                }
              />
            </button>

            {pickerOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-mg-surface border border-white/10 rounded-lg shadow-xl">
                {sortedSeasons.map((seasonItem) => (
                  <button
                    type="button"
                    key={seasonItem.season_number}
                    onClick={() => {
                      setSeason(
                        String(seasonItem.season_number)
                      );
                      setPickerOpen(false);
                    }}
                    className={
                      "flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-white/5 " +
                      (String(seasonItem.season_number) ===
                      String(season)
                        ? "text-mg-green"
                        : "text-white/80")
                    }
                  >
                    <span>
                      {seasonItem.name ||
                        `Season ${seasonItem.season_number}`}
                    </span>

                    <span className="text-white/40 text-xs">
                      {Number(
                        seasonItem.episode_count || 0
                      )}{" "}
                      ep
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="h-20 bg-mg-card rounded-lg animate-pulse"
                  />
                )
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {episodes.map((episodeItem) => (
                <div
                  key={episodeItem.episode_number}
                  className="flex gap-3 bg-mg-card border border-white/10 rounded-lg p-2 hover:border-mg-green/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() =>
                      playEpisode(episodeItem)
                    }
                    className="relative w-24 sm:w-32 aspect-video rounded-md overflow-hidden bg-black shrink-0 group"
                  >
                    {episodeItem.still_url ? (
                      <Image
                        src={episodeItem.still_url}
                        alt={episodeItem.name}
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
                      E{episodeItem.episode_number}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      playEpisode(episodeItem)
                    }
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-white text-sm font-medium truncate">
                      {episodeItem.name}
                    </p>

                    <p className="text-white/40 text-xs flex items-center gap-1 mt-0.5">
                      {episodeItem.air_date && (
                        <>
                          <Calendar className="w-3 h-3" />
                          {episodeItem.air_date}
                        </>
                      )}

                      {episodeItem.runtime && (
                        <>
                          <span>•</span>
                          <span>{episodeItem.runtime}m</span>
                        </>
                      )}
                    </p>

                    <p className="text-white/50 text-xs mt-1 line-clamp-2">
                      {episodeItem.overview ||
                        "No description."}
                    </p>
                  </button>
                </div>
              ))}

              {episodes.length === 0 && (
                <div className="bg-mg-card border border-white/10 rounded-lg p-3">
                  <p className="text-white/50 text-xs">
                    {episodeError ||
                      "No episodes found for this season."}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setReloadNonce((value) => value + 1)
                    }
                    className="mt-2 flex items-center gap-1.5 text-xs text-mg-green"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
