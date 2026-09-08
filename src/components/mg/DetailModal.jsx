import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Check,
  Clock,
  ExternalLink,
  Heart,
  Play,
  Plus,
  Star,
  Tv,
  X,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import EpisodeSelector from "@/components/mg/EpisodeSelector";
import {
  usePlayer,
  buildMediaSources,
} from "@/components/mg/PlayerProvider";
import StreamSourcesBox from "@/components/mg/StreamSourcesBox";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";

const TMDB_IMAGE_BASE =
  "https://image.tmdb.org/t/p/w1280";

const asObject = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value)
    ? value
    : {};

const asArray = (value) =>
  Array.isArray(value)
    ? value
    : [];

const asText = (
  value,
  fallback = ""
) => {
  if (value == null) {
    return fallback;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value).trim();
  }

  return fallback;
};

const firstText = (...values) => {
  for (const value of values) {
    const text = asText(value);

    if (text) {
      return text;
    }
  }

  return "";
};

const imageUrl = (
  value,
  sizeBase = TMDB_IMAGE_BASE
) => {
  const text = asText(value);

  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  return `${sizeBase}${
    text.startsWith("/")
      ? text
      : `/${text}`
  }`;
};

const normaliseMediaType = (
  value,
  source = {}
) => {
  const type =
    asText(value).toLowerCase();

  if (
    type === "tv" ||
    type === "series" ||
    type === "show"
  ) {
    return "tv";
  }

  if (
    type === "movie" ||
    type === "film"
  ) {
    return "movie";
  }

  if (
    source?.first_air_date ||
    source?.firstAirDate
  ) {
    return "tv";
  }

  return "movie";
};

const normaliseGenres = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((genre) => {
      if (typeof genre === "string") {
        return genre.trim();
      }

      if (
        genre &&
        typeof genre === "object"
      ) {
        return firstText(
          genre.name,
          genre.title,
          genre.label
        );
      }

      return "";
    })
    .filter(Boolean);
};

const normaliseProviders = (value) => {
  const collected = [];

  const pushProvider = (
    provider,
    tierHint = ""
  ) => {
    if (
      !provider ||
      typeof provider !== "object"
    ) {
      return;
    }

    const name = firstText(
      provider.name,
      provider.provider_name,
      provider.title
    );

    const link = firstText(
      provider.link,
      provider.url,
      provider.href,
      provider.deep_link
    );

    const logo = imageUrl(
      firstText(
        provider.logo,
        provider.logo_url,
        provider.logo_path,
        provider.icon
      ),
      "https://image.tmdb.org/t/p/w92"
    );

    const tier = firstText(
      provider.tier,
      provider.type,
      provider.category,
      tierHint,
      "Subscription"
    );

    if (
      !name &&
      !link &&
      !logo
    ) {
      return;
    }

    collected.push({
      ...provider,
      name:
        name ||
        "Provider",
      link,
      logo,
      tier,
    });
  };

  if (Array.isArray(value)) {
    value.forEach((provider) =>
      pushProvider(provider)
    );
  } else if (
    value &&
    typeof value === "object"
  ) {
    Object.entries(value).forEach(
      ([
        tier,
        providers,
      ]) => {
        if (
          Array.isArray(providers)
        ) {
          providers.forEach((provider) =>
            pushProvider(
              provider,
              tier
            )
          );
        }
      }
    );
  }

  const seen = new Set();

  return collected.filter(
    (provider) => {
      const key =
        `${provider.tier}|${provider.name}|${provider.link}|${provider.logo}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
};

const normaliseCast = (value) =>
  asArray(value)
    .map((person) => {
      const source =
        asObject(person);

      const name = firstText(
        source.name,
        source.original_name
      );

      if (!name) {
        return null;
      }

      return {
        ...source,
        name,
        character:
          firstText(
            source.character,
            source.role
          ),
        profile_url:
          imageUrl(
            firstText(
              source.profile_url,
              source.profileUrl,
              source.profile_path
            ),
            "https://image.tmdb.org/t/p/w185"
          ),
      };
    })
    .filter(Boolean);

const normaliseSeasons = (value) =>
  asArray(value)
    .map((season) => {
      const source =
        asObject(season);

      const seasonNumber =
        Number(
          source.season_number ??
            source.seasonNumber ??
            source.number
        );

      if (
        !Number.isFinite(
          seasonNumber
        )
      ) {
        return null;
      }

      return {
        ...source,
        season_number:
          seasonNumber,
        name:
          firstText(
            source.name,
            `Season ${seasonNumber}`
          ),
        episode_count:
          Number(
            source.episode_count ??
              source.episodeCount ??
              0
          ),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.season_number -
        b.season_number
    );

const unwrapFunctionData = (
  response
) => {
  const first =
    response?.data ??
    response ??
    {};

  if (
    first &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    first.data &&
    typeof first.data === "object" &&
    !Array.isArray(first.data)
  ) {
    return first.data;
  }

  return first;
};

const normaliseDetailPayload = (
  response,
  fallbackItem
) => {
  const payload =
    asObject(
      unwrapFunctionData(response)
    );

  const rawDetails =
    asObject(payload.details);

  const fallback =
    asObject(fallbackItem);

  const details = {
    ...rawDetails,

    title:
      firstText(
        rawDetails.title,
        rawDetails.name,
        payload.title,
        payload.name,
        fallback.title,
        fallback.name
      ),

    overview:
      firstText(
        rawDetails.overview,
        rawDetails.description,
        payload.overview,
        payload.description,
        fallback.description,
        fallback.overview
      ),

    backdrop_url:
      imageUrl(
        firstText(
          rawDetails.backdrop_url,
          rawDetails.backdropUrl,
          rawDetails.backdrop_path,
          payload.backdrop_url,
          payload.backdrop_path
        )
      ),

    poster_url:
      imageUrl(
        firstText(
          rawDetails.poster_url,
          rawDetails.posterUrl,
          rawDetails.poster_path,
          payload.poster_url,
          payload.poster_path,
          fallback.poster_url,
          fallback.poster_path
        ),
        "https://image.tmdb.org/t/p/w500"
      ),

    genres:
      normaliseGenres(
        rawDetails.genres ??
          payload.genres
      ),

    seasons:
      normaliseSeasons(
        rawDetails.seasons ??
          payload.seasons
      ),

    rating:
      Number(
        rawDetails.rating ??
          rawDetails.vote_average ??
          payload.rating ??
          payload.vote_average ??
          fallback.vote_average ??
          fallback.rating ??
          0
      ),

    runtime:
      Number(
        rawDetails.runtime ??
          payload.runtime ??
          0
      ),

    imdb_id:
      firstText(
        rawDetails.imdb_id,
        rawDetails.imdbId,
        payload.imdb_id,
        payload.imdbId,
        fallback.imdb_id,
        fallback.imdbId
      ),
  };

  return {
    trailer_url:
      firstText(
        payload.trailer_url,
        payload.trailerUrl,
        rawDetails.trailer_url,
        rawDetails.trailerUrl
      ),

    watch_providers:
      normaliseProviders(
        payload.watch_providers ??
          payload.watchProviders ??
          rawDetails.watch_providers ??
          rawDetails.watchProviders
      ),

    cast:
      normaliseCast(
        payload.cast ??
          rawDetails.cast
      ),

    details,
  };
};

const providerTierLabel = (value) => {
  const text =
    asText(value).toLowerCase();

  if (
    /free.*ads|ads.*free|ad.?supported|ads/.test(
      text
    )
  ) {
    return "Free with Ads";
  }

  if (/free/.test(text)) {
    return "Free";
  }

  if (/rent/.test(text)) {
    return "Rent";
  }

  if (
    /buy|purchase/.test(text)
  ) {
    return "Buy";
  }

  return "Subscription";
};

export default function DetailModal({
  item,
  mediaType,
  onClose,
}) {
  const safeItem = useMemo(() => {
    const source =
      asObject(item);

    const type =
      normaliseMediaType(
        mediaType ||
          source.media_type ||
          source.mediaType ||
          source.type,
        source
      );

    const date =
      firstText(
        source.release_date,
        source.first_air_date
      );

    const year =
      firstText(
        source.year,
        /^\d{4}/.test(date)
          ? date.slice(0, 4)
          : ""
      );

    return {
      ...source,

      id:
        source.id ??
        source.tmdb_id ??
        source.tmdbId ??
        null,

      title:
        firstText(
          source.title,
          source.name,
          source.original_title,
          source.original_name,
          "Untitled"
        ),

      poster_url:
        imageUrl(
          firstText(
            source.poster_url,
            source.posterUrl,
            source.poster_path,
            source.posterPath
          ),
          "https://image.tmdb.org/t/p/w500"
        ),

      description:
        firstText(
          source.description,
          source.overview
        ),

      year,

      media_type:
        type,

      mediaType:
        type,

      imdb_id:
        firstText(
          source.imdb_id,
          source.imdbId
        ),
    };
  }, [
    item,
    mediaType,
  ]);

  const resolvedMediaType =
    safeItem.media_type;

  const itemId =
    safeItem.id;

  const [
    data,
    setData,
  ] = useState(() =>
    normaliseDetailPayload(
      {},
      safeItem
    )
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState("");

  const [
    added,
    setAdded,
  ] = useState(false);

  const [
    favorited,
    setFavorited,
  ] = useState(false);

  const [
    favoriteRowId,
    setFavoriteRowId,
  ] = useState(null);

  const { toast } =
    useToast();

  const player =
    usePlayer();

  useEffect(() => {
    const onKey = (event) => {
      if (
        event.key === "Escape"
      ) {
        onClose?.();
      }
    };

    const previousOverflow =
      document.body.style.overflow;

    window.addEventListener(
      "keydown",
      onKey
    );

    document.body.style.overflow =
      "hidden";

    return () => {
      window.removeEventListener(
        "keydown",
        onKey
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [onClose]);

  /*
   * IMPORTANT:
   * No .then(), .catch() or .finally() here.
   * Base44 results are handled with await only.
   */
  useEffect(() => {
    let cancelled = false;

    const loadDetails = async () => {
      setLoading(true);
      setLoadError("");

      setData(
        normaliseDetailPayload(
          {},
          safeItem
        )
      );

      if (
        itemId == null ||
        itemId === ""
      ) {
        setLoading(false);

        setLoadError(
          "This result is missing its TMDB id."
        );

        return;
      }

      try {
        const response =
          await base44.functions.invoke(
            "getTmdbMovies",
            {
              media_type:
                resolvedMediaType,
              movie_id:
                itemId,
            }
          );

        if (cancelled) {
          return;
        }

        setData(
          normaliseDetailPayload(
            response,
            safeItem
          )
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setData(
          normaliseDetailPayload(
            {},
            safeItem
          )
        );

        setLoadError(
          error?.message ||
            "Extra title information could not be loaded."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDetails();

    return () => {
      cancelled = true;
    };
  }, [
    itemId,
    resolvedMediaType,
    safeItem,
  ]);

  const trailerUrl =
    firstText(
      data?.trailer_url
    );

  const providers =
    asArray(
      data?.watch_providers
    );

  const cast =
    asArray(
      data?.cast
    );

  const details =
    asObject(
      data?.details
    );

  const genres =
    asArray(
      details.genres
    );

  const seasons =
    asArray(
      details.seasons
    );

  const displayTitle =
    firstText(
      details.title,
      safeItem.title,
      "Untitled"
    );

  const displayPoster =
    firstText(
      details.poster_url,
      safeItem.poster_url
    );

  const overview =
    firstText(
      details.overview,
      safeItem.description,
      "No overview available."
    );

  /*
   * Favorites lookup also uses await only.
   */
  useEffect(() => {
    let cancelled = false;

    setFavorited(false);
    setFavoriteRowId(null);

    if (
      itemId == null ||
      itemId === ""
    ) {
      return () => {
        cancelled = true;
      };
    }

    const loadFavorite =
      async () => {
        try {
          const rows =
            await base44.entities.Favorite.filter(
              {
                tmdb_id:
                  String(
                    itemId
                  ),
              }
            );

          if (cancelled) {
            return;
          }

          const safeRows =
            asArray(rows);

          const first =
            safeRows[0];

          setFavorited(
            safeRows.length > 0
          );

          setFavoriteRowId(
            first?.id ||
              null
          );
        } catch {
          if (!cancelled) {
            setFavorited(false);
            setFavoriteRowId(null);
          }
        }
      };

    loadFavorite();

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const play = () => {
    if (
      itemId == null ||
      itemId === ""
    ) {
      toast({
        title:
          "Cannot play this result",
        description:
          "This title is missing its TMDB id.",
        variant:
          "destructive",
      });

      return;
    }

    player.play({
      id:
        itemId,

      tmdbId:
        itemId,

      tmdb_id:
        itemId,

      imdbId:
        firstText(
          safeItem.imdb_id,
          details.imdb_id
        ),

      title:
        displayTitle,

      poster:
        displayPoster,

      year:
        safeItem.year,

      type:
        resolvedMediaType === "tv"
          ? "series"
          : "movie",

      mediaType:
        resolvedMediaType,

      rdTitle:
        displayTitle,

      rdYear:
        safeItem.year,

      sources:
        buildMediaSources({
          title:
            displayTitle,
          id:
            itemId,
          poster:
            displayPoster,
          trailerUrl,
          providers,
        }),
    });

    onClose?.();
  };

  const addToWatchlist =
    async () => {
      if (
        itemId == null ||
        itemId === ""
      ) {
        toast({
          title:
            "Could not add",
          description:
            "This title is missing its TMDB id.",
          variant:
            "destructive",
        });

        return;
      }

      try {
        await base44.entities.WatchlistItem.create(
          {
            title:
              displayTitle,
            year:
              safeItem.year,
            poster_url:
              displayPoster,
            description:
              overview,
            tmdb_id:
              itemId,
            media_type:
              resolvedMediaType,
          }
        );

        setAdded(true);

        toast({
          title:
            "Added to Watchlist",
          description:
            displayTitle,
        });
      } catch (error) {
        toast({
          title:
            "Could not add",
          description:
            error?.message ||
            "Please try again.",
          variant:
            "destructive",
        });
      }
    };

  const toggleFavorite =
    async () => {
      if (
        itemId == null ||
        itemId === ""
      ) {
        toast({
          title:
            "Could not update",
          description:
            "This title is missing its TMDB id.",
          variant:
            "destructive",
        });

        return;
      }

      if (favorited) {
        try {
          let rowId =
            favoriteRowId;

          if (!rowId) {
            const rows =
              asArray(
                await base44.entities.Favorite.filter(
                  {
                    tmdb_id:
                      String(
                        itemId
                      ),
                  }
                )
              );

            rowId =
              rows[0]?.id ||
              null;
          }

          if (rowId) {
            await base44.entities.Favorite.delete(
              rowId
            );
          }

          setFavorited(false);
          setFavoriteRowId(null);

          toast({
            title:
              "Removed from Favorites",
            description:
              displayTitle,
          });
        } catch (error) {
          toast({
            title:
              "Could not update",
            description:
              error?.message ||
              "Please try again.",
            variant:
              "destructive",
          });
        }

        return;
      }

      try {
        const created =
          await base44.entities.Favorite.create(
            {
              title:
                displayTitle,
              year:
                safeItem.year,
              poster_url:
                displayPoster,
              description:
                overview,
              tmdb_id:
                String(
                  itemId
                ),
              media_type:
                resolvedMediaType,
            }
          );

        setFavorited(true);

        setFavoriteRowId(
          created?.id ||
            null
        );

        toast({
          title:
            "Added to Favorites",
          description:
            displayTitle,
        });
      } catch (error) {
        toast({
          title:
            "Could not add",
          description:
            error?.message ||
              "Please try again.",
          variant:
            "destructive",
        });
      }
    };

  const rating =
    Number(
      details.rating ||
        0
    );

  const runtime =
    Number(
      details.runtime ||
        0
    );

  const providerGroups = [
    "Subscription",
    "Free",
    "Free with Ads",
    "Rent",
    "Buy",
  ]
    .map((tier) => ({
      tier,
      items:
        providers.filter(
          (provider) =>
            providerTierLabel(
              provider?.tier
            ) === tier
        ),
    }))
    .filter(
      (group) =>
        group.items.length > 0
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${displayTitle} details`}
      data-mg-detail-dialog="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 3xl:p-8"
      onClick={() =>
        onClose?.()
      }
    >
      <div
        className="bg-mg-surface w-full max-w-3xl 3xl:max-w-5xl 4xl:max-w-6xl max-h-[92svh] md:max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl 3xl:rounded-3xl border border-white/10 relative shadow-2xl"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <button
          type="button"
          onClick={() =>
            onClose?.()
          }
          className="absolute top-3 right-3 3xl:top-5 3xl:right-5 z-20 w-10 h-10 3xl:w-12 3xl:h-12 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-mg-green focus:ring-offset-2 focus:ring-offset-black"
          aria-label="Close details"
        >
          <X className="w-5 h-5 3xl:w-6 3xl:h-6" />
        </button>

        <div className="relative h-44 md:h-56 3xl:h-80 4xl:h-96 bg-mg-card overflow-hidden">
          {(details.backdrop_url ||
            displayPoster) && (
            <Image
              src={
                details.backdrop_url ||
                displayPoster
              }
              alt={
                displayTitle
              }
              className="w-full h-full object-cover"
              fittingType="fill"
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-mg-surface via-mg-surface/45 to-black/10" />
        </div>

        <div className="px-4 md:px-6 3xl:px-9 4xl:px-12 -mt-20 md:-mt-24 3xl:-mt-32 relative">
          <div className="flex gap-4 3xl:gap-6 items-end">
            <div className="w-24 md:w-32 3xl:w-44 4xl:w-52 shrink-0 -mb-1">
              <div className="aspect-[2/3] rounded-md 3xl:rounded-lg overflow-hidden border border-white/10 bg-mg-card shadow-lg">
                {displayPoster ? (
                  <Image
                    src={
                      displayPoster
                    }
                    alt={
                      displayTitle
                    }
                    className="w-full h-full object-cover"
                    fittingType="fill"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/25">
                    <Tv className="w-8 h-8 3xl:w-12 3xl:h-12" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 pb-2 3xl:pb-4 pr-10 3xl:pr-14">
              <h2 className="text-white font-bold text-lg md:text-2xl 3xl:text-4xl 4xl:text-5xl leading-tight">
                {displayTitle}
              </h2>

              <div className="flex flex-wrap items-center gap-2 3xl:gap-4 mt-1.5 3xl:mt-3 text-xs 3xl:text-base 4xl:text-lg text-white/60">
                {safeItem.year && (
                  <span>
                    {safeItem.year}
                  </span>
                )}

                <span className="uppercase">
                  {resolvedMediaType ===
                  "tv"
                    ? "TV"
                    : "Movie"}
                </span>

                {rating > 0 && (
                  <span className="flex items-center gap-1 text-mg-green">
                    <Star className="w-3 h-3 3xl:w-5 3xl:h-5 fill-mg-green" />
                    {rating.toFixed(1)}
                  </span>
                )}

                {runtime > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 3xl:w-5 3xl:h-5" />
                    {runtime}m
                  </span>
                )}
              </div>

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 3xl:gap-2 mt-2 3xl:mt-3">
                  {genres.map(
                    (
                      genre,
                      index
                    ) => (
                      <span
                        key={`${genre}-${index}`}
                        className="text-[10px] 3xl:text-sm px-2 3xl:px-3 py-0.5 3xl:py-1 rounded-full bg-white/10 text-white/70"
                      >
                        {genre}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          {loadError && (
            <div className="mt-4 3xl:mt-6 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 3xl:px-4 py-2.5 3xl:py-3 text-xs 3xl:text-sm text-amber-200/80">
              {loadError} You can still use Play and source discovery.
            </div>
          )}

          <div className="flex flex-wrap gap-2 3xl:gap-3 mt-4 3xl:mt-6">
            <button
              type="button"
              onClick={play}
              data-mg-detail-primary="true"
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-mg-green text-black font-semibold text-sm 3xl:text-lg py-2.5 3xl:py-3.5 rounded-lg 3xl:rounded-xl hover:bg-mg-green-dim focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
              aria-label={`Play ${displayTitle}`}
            >
              <Play className="w-4 h-4 3xl:w-5 3xl:h-5 fill-black" />
              Play
            </button>

            <button
              type="button"
              onClick={
                addToWatchlist
              }
              disabled={
                added
              }
              className="flex items-center justify-center gap-1.5 bg-mg-card border border-white/10 text-white text-sm 3xl:text-lg font-semibold px-4 3xl:px-6 py-2.5 3xl:py-3.5 rounded-lg 3xl:rounded-xl hover:bg-white/10 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-mg-green focus:ring-offset-2 focus:ring-offset-black"
              aria-label={added ? `${displayTitle} is in Watchlist` : `Add ${displayTitle} to Watchlist`}
            >
              {added ? (
                <Check className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />
              ) : (
                <Plus className="w-4 h-4 3xl:w-5 3xl:h-5" />
              )}

              {added
                ? "Added"
                : "Watchlist"}
            </button>

            <button
              type="button"
              onClick={
                toggleFavorite
              }
              className="flex items-center justify-center gap-1.5 bg-mg-card border border-white/10 text-white text-sm 3xl:text-lg font-semibold px-4 3xl:px-6 py-2.5 3xl:py-3.5 rounded-lg 3xl:rounded-xl hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green focus:ring-offset-2 focus:ring-offset-black"
              aria-label={favorited ? `Remove ${displayTitle} from Favorites` : `Add ${displayTitle} to Favorites`}
            >
              <Heart
                className={
                  favorited
                    ? "w-4 h-4 3xl:w-5 3xl:h-5 fill-red-500 text-red-500"
                    : "w-4 h-4 3xl:w-5 3xl:h-5"
                }
              />

              {favorited
                ? "Favorited"
                : "Favorite"}
            </button>
          </div>

          <StreamSourcesBox
            title={
              displayTitle
            }
            poster={
              displayPoster
            }
            trailerUrl={
              trailerUrl
            }
            providers={
              providers
            }
            loading={
              loading
            }
            rdYear={
              safeItem.year
            }
            tmdbId={
              itemId
            }
            imdbId={
              firstText(
                safeItem.imdb_id,
                details.imdb_id
              )
            }
            mediaType={
              resolvedMediaType
            }
          />

          <div className="mt-5 3xl:mt-8">
            <h3 className="text-white/80 text-xs 3xl:text-base font-bold uppercase tracking-wider mb-1.5 3xl:mb-2">
              Plot
            </h3>

            <p className="text-white/70 text-sm 3xl:text-lg 4xl:text-xl leading-relaxed">
              {overview}
            </p>
          </div>

          {resolvedMediaType ===
            "tv" &&
            !loading &&
            seasons.length > 0 && (
              <EpisodeSelector
                item={{
                  ...safeItem,
                  title:
                    displayTitle,
                  poster_url:
                    displayPoster,
                  imdb_id:
                    firstText(
                      safeItem.imdb_id,
                      details.imdb_id
                    ),
                }}
                seasons={
                  seasons
                }
                trailerUrl={
                  trailerUrl
                }
                providers={
                  providers
                }
              />
            )}

          {resolvedMediaType ===
            "tv" &&
            !loading &&
            seasons.length ===
              0 && (
              <div className="mt-5 3xl:mt-8 rounded-lg border border-white/10 bg-mg-card p-4 3xl:p-5 text-sm 3xl:text-base text-white/45">
                Season information is not available for this title yet.
              </div>
            )}

          <div className="mt-5 3xl:mt-8">
            <h3 className="text-white/80 text-xs 3xl:text-base font-bold uppercase tracking-wider mb-2 3xl:mb-3 flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 3xl:w-5 3xl:h-5 text-mg-green" />
              Where to Watch
            </h3>

            {loading ? (
              <div className="flex gap-2">
                {Array.from({
                  length: 4,
                }).map(
                  (
                    _,
                    index
                  ) => (
                    <div
                      key={index}
                      className="w-12 h-12 3xl:w-16 3xl:h-16 rounded-md bg-mg-card animate-pulse"
                    />
                  )
                )}
              </div>
            ) : providerGroups.length >
              0 ? (
              <div className="space-y-3 3xl:space-y-5">
                {providerGroups.map(
                  (group) => (
                    <div
                      key={group.tier}
                    >
                      <p className="text-white/40 text-[10px] 3xl:text-sm font-bold uppercase tracking-wider mb-1.5 3xl:mb-2">
                        {group.tier}
                      </p>

                      <div className="flex flex-wrap gap-2 3xl:gap-3">
                        {group.items.map(
                          (
                            provider,
                            index
                          ) => {
                            const content = (
                              <>
                                {provider.logo ? (
                                  <img
                                    src={
                                      provider.logo
                                    }
                                    alt=""
                                    loading="lazy"
                                    className="w-8 h-8 3xl:w-11 3xl:h-11 rounded object-contain"
                                    onError={(
                                      event
                                    ) => {
                                      event.currentTarget.style.display =
                                        "none";
                                    }}
                                  />
                                ) : (
                                  <span className="w-8 h-8 3xl:w-11 3xl:h-11 rounded bg-mg-green/15 flex items-center justify-center">
                                    <Tv className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />
                                  </span>
                                )}

                                <span className="text-white text-xs 3xl:text-base font-medium">
                                  {provider.name ||
                                    "Provider"}
                                </span>

                                {provider.link && (
                                  <ExternalLink className="w-3 h-3 3xl:w-4 3xl:h-4 text-white/40 group-hover:text-mg-green" />
                                )}
                              </>
                            );

                            const className =
                              "group flex items-center gap-2 3xl:gap-3 bg-mg-card border border-white/10 rounded-lg 3xl:rounded-xl pl-1.5 3xl:pl-2 pr-3 3xl:pr-4 py-1.5 3xl:py-2 hover:border-mg-green transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green";

                            if (
                              provider.link
                            ) {
                              return (
                                <a
                                  key={`${group.tier}-${provider.name}-${index}`}
                                  href={
                                    provider.link
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={
                                    className
                                  }
                                >
                                  {content}
                                </a>
                              );
                            }

                            return (
                              <div
                                key={`${group.tier}-${provider.name}-${index}`}
                                className={
                                  className
                                }
                              >
                                {content}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-white/40 text-xs 3xl:text-base">
                No provider information is available for this title in your region.
              </p>
            )}
          </div>

          <div className="mt-5 3xl:mt-8 pb-6 3xl:pb-10">
            <h3 className="text-white/80 text-xs 3xl:text-base font-bold uppercase tracking-wider mb-2 3xl:mb-3">
              Cast
            </h3>

            {loading ? (
              <div className="flex gap-3 3xl:gap-5 overflow-x-auto pb-1">
                {Array.from({
                  length: 6,
                }).map(
                  (
                    _,
                    index
                  ) => (
                    <div
                      key={index}
                      className="shrink-0 w-16 3xl:w-24"
                    >
                      <div className="w-16 h-16 3xl:w-24 3xl:h-24 rounded-full bg-mg-card animate-pulse" />

                      <div className="h-2 3xl:h-3 mt-1.5 bg-mg-card rounded animate-pulse" />
                    </div>
                  )
                )}
              </div>
            ) : cast.length > 0 ? (
              <div className="flex gap-3 3xl:gap-5 overflow-x-auto pb-1 3xl:pb-2">
                {cast.slice(0, 20).map(
                  (
                    person,
                    index
                  ) => (
                    <div
                      key={`${person.name}-${person.character}-${index}`}
                      className="shrink-0 w-16 3xl:w-24 text-center"
                    >
                      <div className="w-16 h-16 3xl:w-24 3xl:h-24 rounded-full overflow-hidden border border-white/10 bg-mg-card">
                        {person.profile_url ? (
                          <Image
                            src={
                              person.profile_url
                            }
                            alt={
                              person.name
                            }
                            className="w-full h-full object-cover"
                            fittingType="fill"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/30 text-lg 3xl:text-2xl">
                            {person.name?.[0] ||
                              "?"}
                          </div>
                        )}
                      </div>

                      <p className="text-white text-[11px] 3xl:text-sm font-medium mt-1.5 3xl:mt-2 truncate">
                        {person.name}
                      </p>

                      <p className="text-white/40 text-[10px] 3xl:text-xs truncate">
                        {person.character}
                      </p>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-white/40 text-xs 3xl:text-base">
                No cast information available.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
