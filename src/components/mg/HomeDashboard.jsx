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

export default function HomeDashboard() {
  const [
    rows,
    setRows,
  ] = useState({});

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    selected,
    setSelected,
  ] = useState(null);

  const [
    watched,
    setWatched,
  ] = useState({});

  const { toast } =
    useToast();

  useEffect(() => {
    let cancelled =
      false;

    const fetchRow = (
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
            response.data
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

    Promise.all([
      fetchRow({
        category:
          "trending",
      }),

      fetchRow({
        media_type:
          "movie",
        category:
          "now_playing",
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
          "tv_on_the_air",
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
    ]).then(
      ([
        trending,
        nowPlaying,
        popularMovies,
        onAir,
        popularTV,
        topRated,
        watchlist,
        favorites,
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

        setRows({
          trending,
          nowPlaying,
          popularMovies,
          onAir,
          popularTV,
          topRated,

          watchlist:
            normalisedWatchlist,

          favorites:
            normalisedFavorites,
        });

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
              key != null
            ) {
              watchMap[
                key
              ] = true;
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
        (
          rows.trending ||
          []
        ).slice(
          0,
          6
        ),
      [
        rows.trending,
      ]
    );

  const open = (
    item
  ) => {
    setSelected({
      ...item,

      id:
        item?.id ||
        item?.tmdb_id ||
        item?.tmdbId,
    });
  };

  const onWatchlist =
    async (
      movie
    ) => {
      const mediaId =
        movie?.id ||
        movie?.tmdb_id ||
        movie?.tmdbId;

      if (
        !mediaId
      ) {
        return;
      }

      if (
        watched[
          mediaId
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
              mediaId,
          }
        );

        const normalised =
          normaliseLibraryItem({
            ...movie,

            tmdb_id:
              mediaId,
          });

        setWatched(
          (
            current
          ) => ({
            ...current,

            [mediaId]:
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
                      item?.id
                  ) !==
                  String(
                    mediaId
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
        <ContinueWatchingRow />

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
          title="Now Playing"
          items={
            rows.nowPlaying
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
          title="On The Air"
          items={
            rows.onAir
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
