import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  ExternalLink,
  Heart,
  ListVideo,
  Play,
  Plus,
  Star,
  Tv,
  X,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import {
  buildMediaSources,
  usePlayer,
} from "@/components/mg/PlayerProvider";
import EpisodeSelector from "@/components/mg/EpisodeSelector";
import StreamSourcesBox from "@/components/mg/StreamSourcesBox";

export default function DetailModal({
  item,
  mediaType,
  onClose,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const { toast } = useToast();
  const player = usePlayer();

  const resolvedMediaType =
    mediaType === "tv" || item?.media_type === "tv"
      ? "tv"
      : "movie";

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setData(null);

    base44.functions
      .invoke("getTmdbMovies", {
        media_type: resolvedMediaType,
        movie_id: item.id,
      })
      .then((response) => {
        if (!cancelled) {
          setData(response?.data || {});
        }
      })
      .catch(() => {
        if (!cancelled) setData({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item.id, resolvedMediaType]);

  const trailerUrl = data?.trailer_url || "";
  const providers = data?.watch_providers || [];
  const cast = data?.cast || [];
  const details = data?.details || {};

  const imdbId = useMemo(
    () =>
      item?.imdb_id ||
      item?.imdbId ||
      details?.imdb_id ||
      details?.imdbId ||
      "",
    [
      item?.imdb_id,
      item?.imdbId,
      details?.imdb_id,
      details?.imdbId,
    ]
  );

  const seasons = Array.isArray(details?.seasons)
    ? details.seasons
    : [];

  const playMovie = () => {
    player.play({
      id: item.id,
      tmdbId: item.id,
      imdbId,
      title: item.title,
      poster: item.poster_url,
      year: item.year,
      mediaType: "movie",
      rdTitle: item.title,
      rdYear: item.year,
      sources: buildMediaSources({
        title: item.title,
        id: item.id,
        poster: item.poster_url,
        trailerUrl,
        providers,
      }),
    });

    onClose();
  };

  const goToEpisodes = () => {
    const target = document.getElementById(
      "mg-episode-selector"
    );

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const primaryAction = () => {
    if (resolvedMediaType === "tv") {
      goToEpisodes();
      return;
    }

    playMovie();
  };

  const addToWatchlist = async () => {
    try {
      await base44.entities.WatchlistItem.create({
        title: item.title,
        year: item.year,
        poster_url: item.poster_url,
        description: item.description,
        tmdb_id: item.id,
        media_type: resolvedMediaType,
      });

      setAdded(true);

      toast({
        title: "Added to Watchlist",
        description: item.title,
      });
    } catch {
      toast({
        title: "Could not add",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    base44.entities.Favorite
      .filter({
        tmdb_id: String(item.id),
      })
      .then((rows) => setFavorited(rows.length > 0))
      .catch(() => {});
  }, [item.id]);

  const toggleFavorite = async () => {
    if (favorited) {
      try {
        const rows =
          await base44.entities.Favorite.filter({
            tmdb_id: String(item.id),
          });

        if (rows.length > 0) {
          await base44.entities.Favorite.delete(
            rows[0].id
          );
        }

        setFavorited(false);

        toast({
          title: "Removed from Favorites",
          description: item.title,
        });
      } catch {
        toast({
          title: "Could not update",
          variant: "destructive",
        });
      }

      return;
    }

    try {
      await base44.entities.Favorite.create({
        title: item.title,
        year: item.year,
        poster_url: item.poster_url,
        description: item.description,
        tmdb_id: String(item.id),
        media_type: resolvedMediaType,
      });

      setFavorited(true);

      toast({
        title: "Added to Favorites",
        description: item.title,
      });
    } catch {
      toast({
        title: "Could not add",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-mg-surface w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl border border-white/10 relative"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative h-44 md:h-56 bg-mg-card">
          {details.backdrop_url ? (
            <Image
              src={details.backdrop_url}
              alt={item.title}
              className="w-full h-full object-cover"
              fittingType="fill"
            />
          ) : item.poster_url ? (
            <Image
              src={item.poster_url}
              alt={item.title}
              className="w-full h-full object-cover"
              fittingType="fill"
            />
          ) : null}

          <div className="absolute inset-0 bg-gradient-to-t from-mg-surface via-mg-surface/40 to-transparent" />
        </div>

        <div className="px-4 md:px-6 -mt-20 md:-mt-24 relative">
          <div className="flex gap-4 items-end">
            <div className="w-24 md:w-32 shrink-0 -mb-1">
              <div className="aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
                {item.poster_url && (
                  <Image
                    src={item.poster_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    fittingType="fill"
                  />
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 pb-2">
              <h2 className="text-white font-bold text-lg md:text-2xl leading-tight">
                {item.title}
              </h2>

              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-white/60">
                {item.year && <span>{item.year}</span>}

                {details.rating && (
                  <span className="flex items-center gap-1 text-mg-green">
                    <Star className="w-3 h-3 fill-mg-green" />
                    {details.rating}
                  </span>
                )}

                {details.runtime ? (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {details.runtime}m
                  </span>
                ) : null}

                {resolvedMediaType === "tv" &&
                  seasons.length > 0 && (
                    <span>
                      {seasons.length} season
                      {seasons.length === 1 ? "" : "s"}
                    </span>
                  )}
              </div>

              {details.genres?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {details.genres.map((genre) => (
                    <span
                      key={genre}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={primaryAction}
              className="flex-1 flex items-center justify-center gap-2 bg-mg-green text-black font-semibold text-sm py-2.5 rounded-lg hover:bg-mg-green-dim"
            >
              {resolvedMediaType === "tv" ? (
                <ListVideo className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-black" />
              )}

              {resolvedMediaType === "tv"
                ? "Choose Episode"
                : "Play"}
            </button>

            <button
              type="button"
              onClick={addToWatchlist}
              className="flex items-center justify-center gap-1.5 bg-mg-card border border-white/10 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-white/10"
            >
              {added ? (
                <Check className="w-4 h-4 text-mg-green" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {added ? "Added" : "Watchlist"}
            </button>

            <button
              type="button"
              onClick={toggleFavorite}
              className="flex items-center justify-center gap-1.5 bg-mg-card border border-white/10 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-white/10"
            >
              <Heart
                className={
                  favorited
                    ? "w-4 h-4 fill-red-500 text-red-500"
                    : "w-4 h-4"
                }
              />
              {favorited ? "Favorited" : "Favorite"}
            </button>
          </div>

          {resolvedMediaType === "movie" && (
            <StreamSourcesBox
              title={item.title}
              poster={item.poster_url}
              trailerUrl={trailerUrl}
              providers={providers}
              loading={loading}
              rdYear={item.year}
              tmdbId={item.id}
              imdbId={imdbId}
              mediaType="movie"
            />
          )}

          <div className="mt-5">
            <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1.5">
              Plot
            </h3>

            <p className="text-white/70 text-sm leading-relaxed">
              {details.overview ||
                item.description ||
                "No overview available."}
            </p>
          </div>

          {resolvedMediaType === "tv" && !loading && (
            <EpisodeSelector
              item={{
                ...item,
                media_type: "tv",
              }}
              seasons={seasons}
              trailerUrl={trailerUrl}
              providers={providers}
              imdbId={imdbId}
            />
          )}

          <div className="mt-5">
            <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-mg-green" />
              Where to Watch
            </h3>

            {loading ? (
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="w-12 h-12 rounded-md bg-mg-card animate-pulse"
                    />
                  )
                )}
              </div>
            ) : providers.length > 0 ? (
              <div className="space-y-3">
                {[
                  "Subscription",
                  "Free",
                  "Free with Ads",
                  "Rent",
                  "Buy",
                ]
                  .map((tier) => ({
                    tier,
                    items: providers.filter(
                      (provider) =>
                        provider.tier === tier
                    ),
                  }))
                  .filter(
                    (group) => group.items.length > 0
                  )
                  .map((group) => (
                    <div key={group.tier}>
                      <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        {group.tier}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {group.items.map((provider) => (
                          <a
                            key={
                              group.tier + provider.name
                            }
                            href={provider.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-2 bg-mg-card border border-white/10 rounded-lg pl-1.5 pr-3 py-1.5 hover:border-mg-green transition-colors"
                          >
                            {provider.logo ? (
                              <img
                                src={provider.logo}
                                alt={provider.name}
                                className="w-8 h-8 rounded object-contain"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded bg-mg-green/15 flex items-center justify-center">
                                <Tv className="w-4 h-4 text-mg-green" />
                              </span>
                            )}

                            <span className="text-white text-xs font-medium">
                              {provider.name}
                            </span>

                            <ExternalLink className="w-3 h-3 text-white/40 group-hover:text-mg-green" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-white/40 text-xs">
                Not legally streamable in your region right now.
              </p>
            )}
          </div>

          <div className="mt-5 pb-6">
            <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2">
              Cast
            </h3>

            {loading ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {Array.from({ length: 6 }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="shrink-0 w-16"
                    >
                      <div className="w-16 h-16 rounded-full bg-mg-card animate-pulse" />
                      <div className="h-2 mt-1.5 bg-mg-card rounded animate-pulse" />
                    </div>
                  )
                )}
              </div>
            ) : cast.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {cast.map((castMember) => (
                  <div
                    key={
                      castMember.name +
                      castMember.character
                    }
                    className="shrink-0 w-16 text-center"
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden border border-white/10 bg-mg-card">
                      {castMember.profile_url ? (
                        <Image
                          src={castMember.profile_url}
                          alt={castMember.name}
                          className="w-full h-full object-cover"
                          fittingType="fill"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">
                          {castMember.name?.[0] || "?"}
                        </div>
                      )}
                    </div>

                    <p className="text-white text-[11px] font-medium mt-1.5 truncate">
                      {castMember.name}
                    </p>

                    <p className="text-white/40 text-[10px] truncate">
                      {castMember.character}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-xs">
                No cast information available.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
