import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  Play,
  X,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { Image } from "@/components/ui/image";

const WATCHED_THRESHOLD = 0.92;

const positiveInt = (value) => {
  const number = Number(value);

  return Number.isInteger(number) && number > 0
    ? number
    : null;
};

const progressRatio = (item) => {
  const duration = Number(item?.duration || 0);
  const progress = Number(item?.progress || 0);

  if (!duration || duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, progress / duration));
};

const normaliseTitle = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+[—-]\s+s\d{1,2}e\d{1,3}.*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseContentKey = (item) => {
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
        String(title || item?.title || "Video")
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

const resolveTmdbId = async (meta) => {
  if (meta.tmdbId) {
    return String(meta.tmdbId);
  }

  if (!meta.title) {
    return "";
  }

  try {
    const response = await base44.functions.invoke(
      "getTmdbMovies",
      {
        multi_search: meta.title,
      }
    );

    const candidates = Array.isArray(response?.data?.movies)
      ? response.data.movies
      : [];

    const sameType = candidates.filter(
      (candidate) =>
        String(candidate?.media_type || "") === meta.mediaType
    );

    const sameYear = sameType.find((candidate) =>
      meta.year
        ? String(candidate?.year || "") === String(meta.year)
        : false
    );

    const match = sameYear || sameType[0] || candidates[0];

    return String(match?.id || match?.tmdb_id || "");
  } catch {
    return "";
  }
};

export default function RecentlyWatchedRow() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();

  const load = () => {
    base44.entities.ContinueWatching
      .list("-updated_date", 100)
      .then((rows) => {
        const completed = [];
        const seen = new Set();

        for (const item of rows || []) {
          if (progressRatio(item) < WATCHED_THRESHOLD) {
            continue;
          }

          const meta = parseContentKey(item);

          const identity =
            meta.mediaType === "tv"
              ? `tv:${normaliseTitle(meta.title)}`
              : `movie:${normaliseTitle(meta.title)}:${meta.year}`;

          // Keep the latest completed episode for each TV series.
          if (seen.has(identity)) {
            continue;
          }

          seen.add(identity);
          completed.push(item);
        }

        setItems(completed.slice(0, 20));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();

    let unsubscribe = null;

    try {
      unsubscribe = base44.entities.ContinueWatching.subscribe(() =>
        load()
      );
    } catch {
      unsubscribe = null;
    }

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const remove = async (id, event) => {
    event?.stopPropagation();

    setItems((current) =>
      current.filter((item) => item.id !== id)
    );

    try {
      await base44.entities.ContinueWatching.delete(id);
    } catch {
      load();
    }
  };

  const replay = async (item) => {
    const meta = parseContentKey(item);
    const isTv = meta.mediaType === "tv";
    const tmdbId = await resolveTmdbId(meta);

    const title =
      isTv && meta.season && meta.episode
        ? `${meta.title} — S${String(meta.season).padStart(
            2,
            "0"
          )}E${String(meta.episode).padStart(2, "0")}`
        : meta.title;

    player.play({
      id: tmdbId || undefined,
      tmdbId: tmdbId || undefined,
      title,
      poster: item.poster_url,
      year: meta.year,
      mediaType: meta.mediaType,
      type: isTv ? "series" : "movie",
      season: meta.season || undefined,
      episode: meta.episode || undefined,
      rdTitle: meta.title,
      rdYear: meta.year,
      rdSeason: meta.season || undefined,
      rdEpisode: meta.episode || undefined,
      startTime: 0,
      preferRd: true,
      sources: [],
    });
  };

  const displayItems = useMemo(
    () =>
      items.map((item) => ({
        item,
        meta: parseContentKey(item),
      })),
    [items]
  );

  if (loading || displayItems.length === 0) {
    return null;
  }

  return (
    <section className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14 pt-2 sm:pt-4">
      <div className="flex items-center gap-2 3xl:gap-3 mb-3 3xl:mb-4">
        <CheckCircle2 className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />

        <div>
          <h2 className="text-white font-semibold text-sm sm:text-base 3xl:text-xl 4xl:text-2xl">
            Recently Watched
          </h2>

          <p className="text-[10px] 3xl:text-sm text-white/35">
            Finished titles stay here and help improve your recommendations.
          </p>
        </div>
      </div>

      <div className="flex gap-3 3xl:gap-5 overflow-x-auto overscroll-x-contain pb-2 scrollbar-hide snap-x snap-proximity">
        {displayItems.map(({ item, meta }) => (
          <div
            key={item.id}
            onClick={() => replay(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                replay(item);
              }
            }}
            className="group relative w-36 sm:w-44 md:w-48 xl:w-52 3xl:w-64 4xl:w-72 shrink-0 text-left cursor-pointer snap-start"
          >
            <div className="relative aspect-video rounded-lg 3xl:rounded-xl overflow-hidden bg-mg-card border border-white/10">
              <Image
                src={item.poster_url}
                fittingType="fill"
                className="w-full h-full object-cover"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

              <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-mg-green">
                <CheckCircle2 className="w-3 h-3" />
                Watched
              </div>

              {meta.mediaType === "tv" &&
                meta.season &&
                meta.episode && (
                  <span className="absolute left-2 bottom-2 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
                    S{String(meta.season).padStart(2, "0")} E
                    {String(meta.episode).padStart(2, "0")}
                  </span>
                )}

              <div className="mg-hover-action absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                <div className="w-9 h-9 3xl:w-12 3xl:h-12 4xl:w-14 4xl:h-14 rounded-full bg-mg-green text-black flex items-center justify-center">
                  <Play className="w-4 h-4 3xl:w-6 3xl:h-6 fill-black" />
                </div>
              </div>

              <button
                type="button"
                onClick={(event) => remove(item.id, event)}
                className="mg-hover-action absolute top-1 right-1 3xl:top-2 3xl:right-2 w-7 h-7 3xl:w-9 3xl:h-9 rounded-full bg-black/70 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="Remove from watch history"
              >
                <X className="w-3.5 h-3.5 3xl:w-4 3xl:h-4" />
              </button>
            </div>

            <div className="mt-1.5 3xl:mt-2 text-white font-semibold text-xs sm:text-sm 3xl:text-base truncate">
              {meta.title}
            </div>

            <div className="text-white/40 text-[10px] sm:text-xs 3xl:text-sm truncate">
              {meta.mediaType === "tv" && meta.season && meta.episode
                ? `Latest watched: S${String(meta.season).padStart(
                    2,
                    "0"
                  )} E${String(meta.episode).padStart(2, "0")}`
                : meta.year || "Watched"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
