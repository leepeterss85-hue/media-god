import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { base44 } from "@/api/base44Client";
import HeroSlider from "@/components/mg/HeroSlider";
import MediaRow from "@/components/mg/MediaRow";
import ContinueWatchingRow from "@/components/mg/ContinueWatchingRow";
import RecentlyWatchedRow from "@/components/mg/RecentlyWatchedRow";
import DetailModal from "@/components/mg/DetailModal";
import { useToast } from "@/components/ui/use-toast";

const WATCHED_THRESHOLD = 0.92;

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const releaseDateOf = (item) =>
  String(
    item?.release_date ||
      item?.releaseDate ||
      item?.first_air_date ||
      item?.firstAirDate ||
      item?.air_date ||
      ""
  ).slice(0, 10);

const normaliseTitle = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+[—-]\s+s\d{1,2}e\d{1,3}.*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normaliseLibraryItem = (item, fallbackType = "movie") => ({
  ...item,
  id: item?.tmdb_id || item?.tmdbId || item?.id,
  tmdb_id: item?.tmdb_id || item?.tmdbId || item?.id,
  title: item?.title || item?.name || "Untitled",
  poster_url: item?.poster_url || item?.poster || "",
  description: item?.description || item?.overview || "",
  media_type:
    item?.media_type ||
    item?.mediaType ||
    fallbackType,
});

const mediaId = (item) =>
  String(item?.id || item?.tmdb_id || item?.tmdbId || "");

const mediaTypeOf = (item) => {
  const type = String(
    item?.media_type ||
      item?.mediaType ||
      item?.type ||
      ""
  ).toLowerCase();

  return type === "tv" || type === "series" || type === "show"
    ? "tv"
    : "movie";
};

const dedupeMedia = (items) => {
  const seen = new Set();

  return (items || []).filter((item) => {
    const id = mediaId(item);
    const key = `${mediaTypeOf(item)}:${id}`;

    if (!id || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const sortNewestFirst = (items) =>
  [...(items || [])].sort((a, b) => {
    const aDate = releaseDateOf(a);
    const bDate = releaseDateOf(b);

    if (aDate && bDate && aDate !== bDate) {
      return bDate.localeCompare(aDate);
    }

    return Number(b?.popularity || 0) - Number(a?.popularity || 0);
  });

const progressRatio = (item) => {
  const progress = Number(item?.progress || 0);
  const duration = Number(item?.duration || 0);

  if (!duration || duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, progress / duration));
};

const positiveInt = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const parseHistoryMeta = (item) => {
  const key = String(item?.content_key || "");

  if (key.startsWith("mg2|")) {
    const [
      ,
      tmdbId,
      mediaType,
      year,
      season,
      episode,
      encodedTitle,
    ] = key.split("|");

    let title = item?.title || "";

    try {
      title = decodeURIComponent(encodedTitle || "") || title;
    } catch {
      // Keep stored title.
    }

    return {
      tmdbId: tmdbId || "",
      mediaType: mediaType === "tv" ? "tv" : "movie",
      year: year || item?.year || "",
      season: positiveInt(season),
      episode: positiveInt(episode),
      title:
        String(title || item?.title || "")
          .replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, "")
          .trim() || "Video",
    };
  }

  const parts = key.split("|");
  const season = positiveInt(parts[2]);
  const episode = positiveInt(parts[3]);
  const storedTitle = String(parts[0] || item?.title || "Video");

  return {
    tmdbId: "",
    mediaType: season && episode ? "tv" : "movie",
    year: parts[1] || item?.year || "",
    season,
    episode,
    title:
      storedTitle
        .replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, "")
        .trim() || storedTitle,
  };
};

const genreIdsOf = (item) => {
  const raw = item?.genre_ids || item?.genreIds || [];

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
};

const recommendationScore = (candidate, seed) => {
  if (!candidate || !seed) {
    return -Infinity;
  }

  let score = 0;

  if (mediaTypeOf(candidate) === seed.mediaType) {
    score += 35;
  }

  const seedGenres = new Set(genreIdsOf(seed));
  const overlap = genreIdsOf(candidate).filter((genreId) =>
    seedGenres.has(genreId)
  ).length;

  score += overlap * 90;
  score += Math.min(25, Number(candidate?.vote_average || 0) * 1.8);
  score += Math.min(25, Number(candidate?.popularity || 0) / 40);

  return score;
};

const resolveRecommendationSeed = async ({
  historyRows,
  favorites,
  watchlist,
}) => {
  const history = (historyRows || [])
    .map((record) => ({
      record,
      meta: parseHistoryMeta(record),
      ratio: progressRatio(record),
      updatedAt: new Date(
        record?.updated_date ||
          record?.created_date ||
          0
      ).getTime(),
    }))
    .filter(({ record }) => Number(record?.progress || 0) >= 5)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const completed = history.find(
    ({ ratio }) => ratio >= WATCHED_THRESHOLD
  );

  const inProgress = history.find(
    ({ ratio }) => ratio > 0 && ratio < WATCHED_THRESHOLD
  );

  const preferred = completed || inProgress || null;
  let seedMeta = preferred?.meta || null;

  if (!seedMeta?.title && favorites?.length) {
    const favorite = favorites[0];

    seedMeta = {
      tmdbId: String(favorite?.tmdb_id || favorite?.id || ""),
      mediaType: mediaTypeOf(favorite),
      year: favorite?.year || "",
      title: favorite?.title || "",
    };
  }

  if (!seedMeta?.title && watchlist?.length) {
    const saved = watchlist[0];

    seedMeta = {
      tmdbId: String(saved?.tmdb_id || saved?.id || ""),
      mediaType: mediaTypeOf(saved),
      year: saved?.year || "",
      title: saved?.title || "",
    };
  }

  if (!seedMeta?.title) {
    return null;
  }

  try {
    const response = await base44.functions.invoke(
      "getTmdbMovies",
      {
        multi_search: seedMeta.title,
      }
    );

    const candidates = Array.isArray(response?.data?.movies)
      ? response.data.movies
      : [];

    const sameType = candidates.filter(
      (candidate) => mediaTypeOf(candidate) === seedMeta.mediaType
    );

    const exactId = seedMeta.tmdbId
      ? sameType.find(
          (candidate) => mediaId(candidate) === String(seedMeta.tmdbId)
        )
      : null;

    const sameYear = seedMeta.year
      ? sameType.find(
          (candidate) =>
            String(candidate?.year || "") === String(seedMeta.year)
        )
      : null;

    const resolved = exactId || sameYear || sameType[0] || candidates[0];

    if (!resolved) {
      return {
        ...seedMeta,
        id: seedMeta.tmdbId,
        genre_ids: [],
      };
    }

    return {
      ...resolved,
      title:
        seedMeta.title ||
        resolved?.title ||
        resolved?.name ||
        "",
      mediaType: seedMeta.mediaType,
      media_type: seedMeta.mediaType,
    };
  } catch {
    return {
      ...seedMeta,
      id: seedMeta.tmdbId,
      genre_ids: [],
    };
  }
};

class HomeDetailErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[Media God] Home details display failed", error);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Home details recovery"
        className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-black/90 p-4 text-white"
      >
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-mg-card p-5 text-center shadow-2xl">
          <h2 className="text-base font-bold">Display recovered</h2>
          <p className="mt-2 text-sm text-white/55">
            This title hit a display error. Media God kept the Home screen running so you can return and try another title.
          </p>
          <button
            type="button"
            onClick={this.props.onClose}
            className="mt-4 min-h-11 rounded-lg bg-mg-green px-4 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }
}

export default function HomeDashboard() {
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [watched, setWatched] = useState({});
  const [historyRows, setHistoryRows] = useState([]);
  const [recommendationSeed, setRecommendationSeed] = useState(null);
  const [todayKey, setTodayKey] = useState(() => localDateKey());

  const { toast } = useToast();

  const todayLabel = useMemo(() => {
    const date = new Date(`${todayKey}T12:00:00`);

    return date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, [todayKey]);

  useEffect(() => {
    let timer = null;

    const scheduleNextDay = () => {
      const now = new Date();

      const next = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        5,
        0
      );

      timer = setTimeout(() => {
        setTodayKey(localDateKey());
        scheduleNextDay();
      }, Math.max(1000, next.getTime() - now.getTime()));
    };

    scheduleNextDay();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const unwrapMovies = (response) => {
      const first = response?.data ?? response ?? {};
      const payload =
        first &&
        typeof first === "object" &&
        !Array.isArray(first) &&
        first.data &&
        typeof first.data === "object" &&
        !Array.isArray(first.data)
          ? first.data
          : first;

      return Array.isArray(payload?.movies) ? payload.movies : [];
    };

    const fetchRow = async (params, fallbackType = "") => {
      try {
        const response = await base44.functions.invoke("getTmdbMovies", params);

        return unwrapMovies(response)
          .map((item) => {
            const id =
              item?.tmdb_id ??
              item?.tmdbId ??
              item?.id ??
              null;

            const resolvedType =
              fallbackType ||
              mediaTypeOf(item);

            const releaseDate =
              item?.release_date ||
              item?.releaseDate ||
              item?.first_air_date ||
              item?.firstAirDate ||
              "";

            return {
              ...item,
              id,
              tmdb_id: id,
              tmdbId: id,
              title:
                item?.title ||
                item?.name ||
                item?.original_title ||
                item?.original_name ||
                "Untitled",
              poster_url:
                item?.poster_url ||
                item?.posterUrl ||
                item?.poster ||
                "",
              description:
                item?.description ||
                item?.overview ||
                "",
              year:
                item?.year ||
                (/^\d{4}/.test(String(releaseDate))
                  ? String(releaseDate).slice(0, 4)
                  : ""),
              release_date: releaseDate,
              media_type: resolvedType,
              mediaType: resolvedType,
              type:
                resolvedType === "tv"
                  ? "tv"
                  : "movie",
            };
          })
          .filter((item) => item.id != null && item.id !== "");
      } catch {
        return [];
      }
    };

    const fetchWatchlist = async () => {
      try {
        const rows = await base44.entities.WatchlistItem.list("-created_date", 40);
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    };

    const fetchFavorites = async () => {
      try {
        const rows = await base44.entities.Favorite.list("-created_date", 40);
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    };

    const fetchHistory = async () => {
      try {
        const rows = await base44.entities.ContinueWatching.list("-updated_date", 100);
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    };

    Promise.all([
      fetchRow({
        media_type: "movie",
        category: "movie_released_today",
        date: todayKey,
        region: "GB",
      }, "movie"),

      fetchRow({
        media_type: "tv",
        category: "tv_airing_today",
        timezone: "Europe/London",
      }, "tv"),

      fetchRow({
        media_type: "movie",
        category: "now_playing",
        region: "GB",
      }, "movie"),

      fetchRow({
        media_type: "tv",
        category: "tv_on_the_air",
      }, "tv"),

      fetchRow({
        category: "trending",
      }),

      fetchRow({
        media_type: "movie",
        category: "popular",
        region: "GB",
      }, "movie"),

      fetchRow({
        media_type: "tv",
        category: "tv_popular",
      }, "tv"),

      fetchRow({
        media_type: "movie",
        category: "top_rated",
        region: "GB",
      }, "movie"),

      fetchWatchlist(),
      fetchFavorites(),
      fetchHistory(),
    ]).then(
      async ([
        todayMoviesRaw,
        todayTVRaw,
        newMoviesRaw,
        newTVRaw,
        trending,
        popularMovies,
        popularTV,
        topRated,
        watchlist,
        favorites,
        history,
      ]) => {
        if (cancelled) {
          return;
        }

        const todayMovies = dedupeMedia(todayMoviesRaw).filter(
          (item) => releaseDateOf(item) === todayKey
        );

        const todayTV = dedupeMedia(todayTVRaw);

        const tvPremieresToday = todayTV.filter(
          (item) => releaseDateOf(item) === todayKey
        );

        const moreTVToday = todayTV.filter(
          (item) => releaseDateOf(item) !== todayKey
        );

        const newMovies = sortNewestFirst(
          dedupeMedia([
            ...(newMoviesRaw || []),
            ...(todayMovies || []),
          ])
        );

        const newTV = sortNewestFirst(
          dedupeMedia([
            ...(newTVRaw || []),
            ...(tvPremieresToday || []),
          ])
        );

        const normalisedWatchlist = (watchlist || []).map((item) =>
          normaliseLibraryItem(item)
        );

        const normalisedFavorites = (favorites || []).map((item) =>
          normaliseLibraryItem(
            item,
            item?.media_type || "movie"
          )
        );

        const seed = await resolveRecommendationSeed({
          historyRows: history,
          favorites: normalisedFavorites,
          watchlist: normalisedWatchlist,
        });

        if (cancelled) {
          return;
        }

        setRows({
          todayMovies,
          tvPremieresToday,
          moreTVToday,
          newMovies,
          newTV,
          trending,
          popularMovies,
          popularTV,
          topRated,
          watchlist: normalisedWatchlist,
          favorites: normalisedFavorites,
        });

        setHistoryRows(history || []);
        setRecommendationSeed(seed);

        const watchMap = {};

        normalisedWatchlist.forEach((item) => {
          const key = item?.tmdb_id || item?.id;

          if (key != null) {
            watchMap[key] = true;
          }
        });

        setWatched(watchMap);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [todayKey]);

  const completedHistoryTitles = useMemo(() => {
    const titles = new Set();

    (historyRows || []).forEach((record) => {
      if (progressRatio(record) < WATCHED_THRESHOLD) {
        return;
      }

      const meta = parseHistoryMeta(record);
      const title = normaliseTitle(meta.title);

      if (title) {
        titles.add(title);
      }
    });

    return titles;
  }, [historyRows]);

  const hero = useMemo(
    () =>
      dedupeMedia([
        ...(rows.todayMovies || []).slice(0, 2),
        ...(rows.tvPremieresToday || []).slice(0, 2),
        ...(rows.newMovies || []).slice(0, 2),
        ...(rows.trending || []).slice(0, 4),
      ]).slice(0, 6),
    [
      rows.todayMovies,
      rows.tvPremieresToday,
      rows.newMovies,
      rows.trending,
    ]
  );

  const becauseYouWatched = useMemo(() => {
    if (!recommendationSeed) {
      return [];
    }

    const seedId = mediaId(recommendationSeed);
    const seedType = mediaTypeOf(recommendationSeed);

    const pool = dedupeMedia([
      ...(rows.todayMovies || []),
      ...(rows.tvPremieresToday || []),
      ...(rows.newMovies || []),
      ...(rows.newTV || []),
      ...(rows.trending || []),
      ...(rows.popularMovies || []),
      ...(rows.popularTV || []),
      ...(rows.topRated || []),
    ]).filter((item) => {
      const sameSeed =
        mediaId(item) === seedId &&
        mediaTypeOf(item) === seedType;

      if (sameSeed) {
        return false;
      }

      const title = normaliseTitle(item?.title || item?.name);

      if (title && completedHistoryTitles.has(title)) {
        return false;
      }

      return true;
    });

    return pool
      .map((item) => ({
        item,
        score: recommendationScore(item, recommendationSeed),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ item }) => item);
  }, [
    recommendationSeed,
    completedHistoryTitles,
    rows.todayMovies,
    rows.tvPremieresToday,
    rows.newMovies,
    rows.newTV,
    rows.trending,
    rows.popularMovies,
    rows.popularTV,
    rows.topRated,
  ]);

  const open = (item, forcedType = "") => {
    const resolvedType =
      forcedType ||
      mediaTypeOf(item);

    const id =
      item?.tmdb_id ??
      item?.tmdbId ??
      item?.id ??
      null;

    if (id == null || id === "") {
      return;
    }

    setSelected({
      ...item,
      id,
      tmdb_id: id,
      tmdbId: id,
      title:
        item?.title ||
        item?.name ||
        item?.original_title ||
        item?.original_name ||
        "Untitled",
      poster_url:
        item?.poster_url ||
        item?.posterUrl ||
        item?.poster ||
        "",
      description:
        item?.description ||
        item?.overview ||
        "",
      media_type: resolvedType,
      mediaType: resolvedType,
      type:
        resolvedType === "tv"
          ? "tv"
          : "movie",
    });
  };

  const onWatchlist = async (movie) => {
    const id = movie?.id || movie?.tmdb_id || movie?.tmdbId;

    if (!id) {
      return;
    }

    if (watched[id]) {
      toast({
        title: "Already in Watchlist",
        description: movie.title,
      });

      return;
    }

    try {
      await base44.entities.WatchlistItem.create({
        title: movie.title,
        year: movie.year,
        poster_url: movie.poster_url,
        description: movie.description,
        tmdb_id: id,
      });

      const normalised = normaliseLibraryItem(
        {
          ...movie,
          tmdb_id: id,
        },
        mediaTypeOf(movie)
      );

      setWatched((current) => ({
        ...current,
        [id]: true,
      }));

      setRows((current) => ({
        ...current,
        watchlist: [
          normalised,
          ...(current.watchlist || []).filter(
            (item) =>
              String(item?.tmdb_id || item?.id) !== String(id)
          ),
        ],
      }));

      toast({
        title: "Added to Watchlist",
        description: movie.title,
      });
    } catch {
      toast({
        title: "Could not add",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 md:p-6 3xl:p-8 4xl:p-10">
        <div className="w-full h-[38svh] sm:h-[42vh] 3xl:h-[50vh] bg-mg-card rounded-xl animate-pulse mb-5 3xl:mb-8" />

        <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 3xl:grid-cols-9 4xl:grid-cols-10 gap-3 3xl:gap-4 4xl:gap-5">
          {Array.from({
            length: 20,
          }).map((_, index) => (
            <div
              key={index}
              className="aspect-[2/3] bg-mg-card rounded-md animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0" data-mg-home-dashboard="true">
      <HeroSlider
        items={hero}
        onWatch={open}
        onDetails={open}
        onWatchlist={onWatchlist}
      />

      <div data-mg-home-content="true" className="flex flex-col gap-6 3xl:gap-8 4xl:gap-10 py-5 sm:py-6 3xl:py-8">

        {/* FIRST ROW UNDER HERO */}
        <ContinueWatchingRow />

        {(rows.todayMovies || []).length > 0 && (
          <MediaRow
            title={`New Films Today — ${todayLabel}`}
            items={rows.todayMovies}
            onOpen={open}
            onWatchlist={onWatchlist}
            watched={watched}
          />
        )}

        {(rows.tvPremieresToday || []).length > 0 && (
          <MediaRow
            title={`New TV Premieres Today — ${todayLabel}`}
            items={rows.tvPremieresToday}
            onOpen={open}
            onWatchlist={onWatchlist}
            watched={watched}
          />
        )}

        {(rows.moreTVToday || []).length > 0 && (
          <MediaRow
            title="More TV Airing Today"
            items={rows.moreTVToday}
            onOpen={(item) => open(item, "tv")}
            onWatchlist={onWatchlist}
            watched={watched}
          />
        )}

        <MediaRow
          title="Newest Movies"
          items={rows.newMovies}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="New & On TV"
          items={rows.newTV}
          onOpen={(item) => open(item, "tv")}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        {becauseYouWatched.length > 0 &&
          recommendationSeed?.title && (
            <MediaRow
              title={`Because You Watched ${recommendationSeed.title}`}
              items={becauseYouWatched}
              onOpen={open}
              onWatchlist={onWatchlist}
              watched={watched}
            />
          )}

        <RecentlyWatchedRow />

        {(rows.watchlist || []).length > 0 && (
          <MediaRow
            title="My Watchlist"
            items={rows.watchlist}
            onOpen={open}
            onWatchlist={onWatchlist}
            watched={watched}
          />
        )}

        {(rows.favorites || []).length > 0 && (
          <MediaRow
            title="My Favorites"
            items={rows.favorites}
            onOpen={open}
            onWatchlist={onWatchlist}
            watched={watched}
          />
        )}

        <MediaRow
          title="Trending Now"
          items={rows.trending}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="Popular Movies"
          items={rows.popularMovies}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="Popular TV Shows"
          items={rows.popularTV}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />

        <MediaRow
          title="Top Rated Movies"
          items={rows.topRated}
          onOpen={open}
          onWatchlist={onWatchlist}
          watched={watched}
        />
      </div>

      <footer data-mg-home-footer="true" className="border-t border-white/5 py-6 3xl:py-8 mt-4 px-4 sm:px-6 3xl:px-10 text-center text-white/40 text-xs 3xl:text-sm">
        Media God — Your ultimate streaming destination
      </footer>

      {selected && (
        <HomeDetailErrorBoundary
          key={selected?.id || selected?.tmdb_id || selected?.title || "home-detail"}
          onClose={() => setSelected(null)}
        >
          <DetailModal
            item={selected}
            mediaType={selected?.media_type || mediaTypeOf(selected)}
            onClose={() => setSelected(null)}
          />
        </HomeDetailErrorBoundary>
      )}
    </div>
  );
}
