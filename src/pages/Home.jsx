import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { base44 } from "@/api/base44Client";
import HeroSlider from "@/components/mg/HeroSlider";
import MediaRow from "@/components/mg/MediaRow";
import ContinueWatchingRow from "@/components/mg/ContinueWatchingRow";
import DetailModal from "@/components/mg/DetailModal";
import { useToast } from "@/components/ui/use-toast";

const normaliseLibraryItem = (
  item,
  fallbackType = "movie"
) => ({
  ...item,

  id:
    item?.tmdb_id ||
    item?.tmdbId ||
    item?.id,

  tmdb_id:
    item?.tmdb_id ||
    item?.tmdbId ||
    item?.id,

  title:
    item?.title ||
    item?.name ||
    "Untitled",

  poster_url:
    item?.poster_url ||
    item?.poster ||
    "",

  description:
    item?.description ||
    item?.overview ||
    "",

  media_type:
    item?.media_type ||
    item?.mediaType ||
    fallbackType,
});

const mediaId = (item) =>
  String(
    item?.id ||
      item?.tmdb_id ||
      item?.tmdbId ||
      ""
  );

const mediaTypeOf = (item) => {
  const type = String(
    item?.media_type ||
      item?.mediaType ||
      item?.type ||
      ""
  ).toLowerCase();

  return type === "tv" ||
    type === "series" ||
    type === "show"
    ? "tv"
    : "movie";
};

const dedupeMedia = (items) => {
  const seen = new Set();

  return (items || []).filter((item) => {
    const key =
      `${mediaTypeOf(item)}:${mediaId(item)}`;

    if (
      !mediaId(item) ||
      seen.has(key)
    ) {
      return false;
    }

    seen.add(key);

    return true;
  });
};

const parseContinueWatchingSeed = (
  item
) => {
  const key =
    String(
      item?.content_key ||
        ""
    );

  if (
    key.startsWith(
      "mg2|"
    )
  ) {
    const [
      ,
      tmdbId,
      mediaType,
      year,
      ,
      ,
      encodedTitle,
    ] =
      key.split(
        "|"
      );

    let title =
      item?.title ||
      "";

    try {
      title =
        decodeURIComponent(
          encodedTitle ||
            ""
        ) ||
        title;
    } catch {
      // Keep stored title.
    }

    return {
      tmdbId:
        tmdbId ||
        "",

      mediaType:
        mediaType ===
        "tv"
          ? "tv"
          : "movie",

      year:
        year ||
        item?.year ||
        "",

      title:
        title ||
        item?.title ||
        "",
    };
  }

  const parts =
    key.split(
      "|"
    );

  const season =
    Number(
      parts[2] ||
        0
    );

  const episode =
    Number(
      parts[3] ||
        0
    );

  const storedTitle =
    String(
      parts[0] ||
        item?.title ||
        ""
    );

  const cleanTitle =
    storedTitle
      .replace(
        /\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i,
        ""
      )
      .trim() ||
    storedTitle;

  return {
    tmdbId:
      "",

    mediaType:
      season > 0 &&
      episode > 0
        ? "tv"
        : "movie",

    year:
      parts[1] ||
      item?.year ||
      "",

    title:
      cleanTitle,
  };
};

const genreIdsOf = (
  item
) => {
  const raw =
    item?.genre_ids ||
    item?.genreIds ||
    [];

  if (
    !Array.isArray(
      raw
    )
  ) {
    return [];
  }

  return raw
    .map(
      (value) =>
        Number(
          value
        )
    )
    .filter(
      (value) =>
        Number.isFinite(
          value
        )
    );
};

const recommendationScore = (
  candidate,
  seed
) => {
  if (
    !candidate ||
    !seed
  ) {
    return -Infinity;
  }

  let score =
    0;

  if (
    mediaTypeOf(
      candidate
    ) ===
    seed.mediaType
  ) {
    score +=
      30;
  }

  const seedGenres =
    new Set(
      genreIdsOf(
        seed
      )
    );

  const overlap =
    genreIdsOf(
      candidate
    ).filter(
      (genreId) =>
        seedGenres.has(
          genreId
        )
    ).length;

  score +=
    overlap *
    80;

  const rating =
    Number(
      candidate
        ?.vote_average ||
        0
    );

  const popularity =
    Number(
      candidate
        ?.popularity ||
        0
    );

  score +=
    Math.min(
      20,
      rating *
        1.5
    );

  score +=
    Math.min(
      20,
      popularity /
        50
    );

  return score;
};

const resolveRecommendationSeed =
  async (
    continueRows,
    favorites,
    watchlist
  ) => {
    const recent =
      (
        continueRows ||
        []
      ).find(
        (item) =>
          Number(
            item
              ?.progress ||
              0
          ) >= 5
      );

    let seedMeta =
      recent
        ? parseContinueWatchingSeed(
            recent
          )
        : null;

    if (
      !seedMeta?.title &&
      favorites?.length
    ) {
      const favorite =
        favorites[0];

      seedMeta = {
        tmdbId:
          String(
            favorite
              ?.tmdb_id ||
              favorite
                ?.id ||
              ""
          ),

        mediaType:
          mediaTypeOf(
            favorite
          ),

        year:
          favorite
            ?.year ||
          "",

        title:
          favorite
            ?.title ||
          "",
      };
    }

    if (
      !seedMeta?.title &&
      watchlist?.length
    ) {
      const saved =
        watchlist[0];

      seedMeta = {
        tmdbId:
          String(
            saved
              ?.tmdb_id ||
              saved?.id ||
              ""
          ),

        mediaType:
          mediaTypeOf(
            saved
          ),

        year:
          saved?.year ||
          "",

        title:
          saved?.title ||
          "",
      };
    }

    if (
      !seedMeta?.title
    ) {
      return null;
    }

    try {
      const response =
        await base44.functions.invoke(
          "getTmdbMovies",
          {
            multi_search:
              seedMeta.title,
          }
        );

      const candidates =
        Array.isArray(
          response
            ?.data
            ?.movies
        )
          ? response
              .data
              .movies
          : [];

      const sameType =
        candidates.filter(
          (candidate) =>
            mediaTypeOf(
              candidate
            ) ===
            seedMeta.mediaType
        );

      const exactId =
        seedMeta.tmdbId
          ? sameType.find(
              (
                candidate
              ) =>
                mediaId(
                  candidate
                ) ===
                String(
                  seedMeta.tmdbId
                )
            )
          : null;

      const sameYear =
        seedMeta.year
          ? sameType.find(
              (
                candidate
              ) =>
                String(
                  candidate
                    ?.year ||
                    ""
                ) ===
                String(
                  seedMeta.year
                )
            )
          : null;

      const resolved =
        exactId ||
        sameYear ||
        sameType[0] ||
        candidates[0];

      if (
        !resolved
      ) {
        return {
          ...seedMeta,

          id:
            seedMeta.tmdbId,

          genre_ids:
            [],
        };
      }

      return {
        ...resolved,

        title:
          seedMeta.title ||
          resolved
            ?.title ||
          resolved
            ?.name ||
          "",

        media_type:
          seedMeta.mediaType ||
          resolved
            ?.media_type ||
          "movie",
      };
    } catch {
      return {
        ...seedMeta,

        id:
          seedMeta.tmdbId,

        genre_ids:
          [],
      };
    }
  };

export default function HomeDashboard() {
  const [
    rows,
    setRows,
  ] =
    useState(
      {}
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    selected,
    setSelected,
  ] =
    useState(
      null
    );

  const [
    watched,
    setWatched,
  ] =
    useState(
      {}
    );

  const [
    recommendationSeed,
    setRecommendationSeed,
  ] =
    useState(
      null
    );

  const {
    toast,
  } =
    useToast();

  useEffect(() => {
    let cancelled =
      false;

    const fetchRow =
      (
        params
      ) =>
        base44.functions
          .invoke(
            "getTmdbMovies",
            params
          )
          .then(
            (
              response
            ) =>
              response
                ?.data
                ?.movies ||
              []
          )
          .catch(
            () => []
          );

    const fetchWatchlist =
      () =>
        base44.entities.WatchlistItem
          .list(
            "-created_date",
            40
          )
          .catch(
            () => []
          );

    const fetchFavorites =
      () =>
        base44.entities.Favorite
          .list(
            "-created_date",
            40
          )
          .catch(
            () => []
          );

    const fetchContinueWatching =
      () =>
        base44.entities.ContinueWatching
          .list(
            "-updated_date",
            20
          )
          .catch(
            () => []
          );

    Promise.all([
      fetchRow({
        media_type:
          "movie",

        category:
          "now_playing",
      }),

      fetchRow({
        media_type:
          "tv",

        category:
          "tv_on_the_air",
      }),

      fetchRow({
        category:
          "trending",
      }),

      fetchRow({
        media_type:
          "movie",

        category:
          "popular",
      }),

      fetchRow({
        media_type:
          "tv",

        category:
          "tv_popular",
      }),

      fetchRow({
        media_type:
          "movie",

        category:
          "top_rated",
      }),

      fetchWatchlist(),

      fetchFavorites(),

      fetchContinueWatching(),
    ]).then(
      async ([
        newMovies,
        newTV,
        trending,
        popularMovies,
        popularTV,
        topRated,
        watchlist,
        favorites,
        continueRows,
      ]) => {
        if (
          cancelled
        ) {
          return;
        }

        const normalisedWatchlist =
          (
            watchlist ||
            []
          ).map(
            (
              item
            ) =>
              normaliseLibraryItem(
                item
              )
          );

        const normalisedFavorites =
          (
            favorites ||
            []
          ).map(
            (
              item
            ) =>
              normaliseLibraryItem(
                item,
                item
                  ?.media_type ||
                  "movie"
              )
          );

        const seed =
          await resolveRecommendationSeed(
            continueRows,
            normalisedFavorites,
            normalisedWatchlist
          );

        if (
          cancelled
        ) {
          return;
        }

        setRows({
          newMovies,
          newTV,
          trending,
          popularMovies,
          popularTV,
          topRated,

          watchlist:
            normalisedWatchlist,

          favorites:
            normalisedFavorites,
        });

        setRecommendationSeed(
          seed
        );

        const watchMap =
          {};

        normalisedWatchlist.forEach(
          (
            item
          ) => {
            const key =
              item
                ?.tmdb_id ||
              item?.id;

            if (
              key !=
              null
            ) {
              watchMap[
                key
              ] =
                true;
            }
          }
        );

        setWatched(
          watchMap
        );

        setLoading(
          false
        );
      }
    );

    return () => {
      cancelled =
        true;
    };
  }, []);

  const hero =
    useMemo(
      () =>
        dedupeMedia([
          ...(
            rows.newMovies ||
            []
          ).slice(
            0,
            3
          ),

          ...(
            rows.newTV ||
            []
          ).slice(
            0,
            3
          ),

          ...(
            rows.trending ||
            []
          ).slice(
            0,
            4
          ),
        ]).slice(
          0,
          6
        ),
      [
        rows.newMovies,
        rows.newTV,
        rows.trending,
      ]
    );

  const becauseYouWatched =
    useMemo(
      () => {
        if (
          !recommendationSeed
        ) {
          return [];
        }

        const seedId =
          String(
            mediaId(
              recommendationSeed
            )
          );

        const pool =
          dedupeMedia([
            ...(
              rows.newMovies ||
              []
            ),

            ...(
              rows.newTV ||
              []
            ),

            ...(
              rows.trending ||
              []
            ),

            ...(
              rows.popularMovies ||
              []
            ),

            ...(
              rows.popularTV ||
              []
            ),

            ...(
              rows.topRated ||
              []
            ),
          ]).filter(
            (
              item
            ) => {
              if (
                !seedId
              ) {
                return true;
              }

              return !(
                mediaId(
                  item
                ) ===
                  seedId &&
                mediaTypeOf(
                  item
                ) ===
                  recommendationSeed
                    .mediaType
              );
            }
          );

        return pool
          .map(
            (
              item
            ) => ({
              item,

              score:
                recommendationScore(
                  item,
                  recommendationSeed
                ),
            })
          )
          .sort(
            (
              a,
              b
            ) =>
              b.score -
              a.score
          )
          .slice(
            0,
            20
          )
          .map(
            ({
              item,
            }) =>
              item
          );
      },
      [
        recommendationSeed,
        rows.newMovies,
        rows.newTV,
        rows.trending,
        rows.popularMovies,
        rows.popularTV,
        rows.topRated,
      ]
    );

  const open =
    (
      item
    ) => {
      setSelected({
        ...item,

        id:
          item?.id ||
          item
            ?.tmdb_id ||
          item
            ?.tmdbId,
      });
    };

  const onWatchlist =
    async (
      movie
    ) => {
      const id =
        movie?.id ||
        movie
          ?.tmdb_id ||
        movie
          ?.tmdbId;

      if (!id) {
        return;
      }

      if (
        watched[
          id
        ]
      ) {
        toast({
          title:
            "Already in Watchlist",

          description:
            movie.title,
        });

        return;
      }

      try {
        await base44.entities.WatchlistItem.create(
          {
            title:
              movie.title,

            year:
              movie.year,

            poster_url:
              movie.poster_url,

            description:
              movie.description,

            tmdb_id:
              id,
          }
        );

        const normalised =
          normaliseLibraryItem({
            ...movie,

            tmdb_id:
              id,
          });

        setWatched(
          (
            current
          ) => ({
            ...current,

            [id]:
              true,
          })
        );

        setRows(
          (
            current
          ) => ({
            ...current,

            watchlist: [
              normalised,

              ...(
                current.watchlist ||
                []
              ).filter(
                (
                  item
                ) =>
                  String(
                    item
                      ?.tmdb_id ||
                      item
                        ?.id
                  ) !==
                  String(
                    id
                  )
              ),
            ],
          })
        );

        toast({
          title:
            "Added to Watchlist",

          description:
            movie.title,
        });
      } catch {
        toast({
          title:
            "Could not add",

          variant:
            "destructive",
        });
      }
    };

  if (
    loading
  ) {
    return (
      <div className="p-3 sm:p-5 md:p-6 3xl:p-8 4xl:p-10">
        <div className="w-full h-[38svh] sm:h-[42vh] 3xl:h-[50vh] bg-mg-card rounded-xl animate-pulse mb-5 3xl:mb-8" />

        <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 3xl:grid-cols-9 4xl:grid-cols-10 gap-3 3xl:gap-4 4xl:gap-5">
          {Array.from({
            length:
              20,
          }).map(
            (
              _,
              index
            ) => (
              <div
                key={
                  index
                }
                className="aspect-[2/3] bg-mg-card rounded-md animate-pulse"
              />
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <HeroSlider
        items={
          hero
        }
        onWatch={
          open
        }
        onDetails={
          open
        }
        onWatchlist={
          onWatchlist
        }
      />

      <div className="flex flex-col gap-6 3xl:gap-8 4xl:gap-10 py-5 sm:py-6 3xl:py-8">
        <MediaRow
          title="New Movies"
          items={
            rows.newMovies
          }
          onOpen={
            open
          }
          onWatchlist={
            onWatchlist
          }
          watched={
            watched
          }
        />

        <MediaRow
          title="New & On TV"
          items={
            rows.newTV
          }
          onOpen={
            open
          }
          onWatchlist={
            onWatchlist
          }
          watched={
            watched
          }
        />

        <ContinueWatchingRow />

        {becauseYouWatched.length >
          0 &&
          recommendationSeed?.title && (
            <MediaRow
              title={`Because You Watched ${recommendationSeed.title}`}
              items={
                becauseYouWatched
              }
              onOpen={
                open
              }
              onWatchlist={
                onWatchlist
              }
              watched={
                watched
              }
            />
          )}

        {(
          rows.watchlist ||
          []
        ).length >
          0 && (
          <MediaRow
            title="My Watchlist"
            items={
              rows.watchlist
            }
            onOpen={
              open
            }
            onWatchlist={
              onWatchlist
            }
            watched={
              watched
            }
          />
        )}

        {(
          rows.favorites ||
          []
        ).length >
          0 && (
          <MediaRow
            title="My Favorites"
            items={
              rows.favorites
            }
            onOpen={
              open
            }
            onWatchlist={
              onWatchlist
            }
            watched={
              watched
            }
          />
        )}

        <MediaRow
          title="Trending Now"
          items={
            rows.trending
          }
          onOpen={
            open
          }
          onWatchlist={
            onWatchlist
          }
          watched={
            watched
          }
        />

        <MediaRow
          title="Popular Movies"
          items={
            rows.popularMovies
          }
          onOpen={
            open
          }
          onWatchlist={
            onWatchlist
          }
          watched={
            watched
          }
        />

        <MediaRow
          title="Popular TV Shows"
          items={
            rows.popularTV
          }
          onOpen={
            open
          }
          onWatchlist={
            onWatchlist
          }
          watched={
            watched
          }
        />

        <MediaRow
          title="Top Rated Movies"
          items={
            rows.topRated
          }
          onOpen={
            open
          }
          onWatchlist={
            onWatchlist
          }
          watched={
            watched
          }
        />
      </div>

      <footer className="border-t border-white/5 py-6 3xl:py-8 mt-4 px-4 sm:px-6 3xl:px-10 text-center text-white/40 text-xs 3xl:text-sm">
        Media God — Your ultimate streaming destination
      </footer>

      {selected && (
        <DetailModal
          item={
            selected
          }
          mediaType={
            selected
              .media_type ||
            "movie"
          }
          onClose={() =>
            setSelected(
              null
            )
          }
        />
      )}
    </div>
  );
}
