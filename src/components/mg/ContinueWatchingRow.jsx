import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Clock3,
  History,
  Play,
  X,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { Image } from "@/components/ui/image";

const WATCHED_THRESHOLD = 0.92;
const MIN_PROGRESS_SECONDS = 5;

const positiveInt = (value) => {
  const number = Number(value);

  return Number.isInteger(number) && number > 0
    ? number
    : null;
};

const baseTitle = (value) =>
  String(value || "")
    .replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, "")
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
      canonical: true,
      tmdbId: String(tmdbId || ""),
      mediaType: mediaType === "tv" ? "tv" : "movie",
      year: String(year || item?.year || ""),
      season: positiveInt(season),
      episode: positiveInt(episode),
      title: baseTitle(title || item?.title || "Video") || "Video",
    };
  }

  const parts = key.split("|");
  const season = positiveInt(parts[2]);
  const episode = positiveInt(parts[3]);

  return {
    canonical: false,
    tmdbId: "",
    mediaType: season && episode ? "tv" : "movie",
    year: String(parts[1] || item?.year || ""),
    season,
    episode,
    title:
      baseTitle(parts[0] || item?.title || "Video") ||
      item?.title ||
      "Video",
  };
};

const progressRatio = (item) => {
  const progress = Number(item?.progress || 0);
  const duration = Number(item?.duration || 0);

  if (!duration || duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, progress / duration));
};

const formatRemaining = (item) => {
  const progress = Number(item?.progress || 0);
  const duration = Number(item?.duration || 0);

  if (!duration || duration <= progress) {
    return "";
  }

  const seconds = Math.max(0, duration - progress);
  const minutes = Math.max(1, Math.ceil(seconds / 60));

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return mins > 0
      ? `${hours}h ${mins}m left`
      : `${hours}h left`;
  }

  return `${minutes} min left`;
};

const identityFor = (meta) => {
  if (meta.mediaType === "tv") {
    return [
      "tv",
      meta.tmdbId || meta.title.toLowerCase(),
      meta.season || "",
      meta.episode || "",
    ].join(":");
  }

  return [
    "movie",
    meta.tmdbId || meta.title.toLowerCase(),
    meta.year || "",
  ].join(":");
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

    const sameYear = meta.year
      ? sameType.find(
          (candidate) =>
            String(candidate?.year || "") === String(meta.year)
        )
      : null;

    const match = sameYear || sameType[0] || candidates[0];

    return String(match?.id || match?.tmdb_id || "");
  } catch {
    return "";
  }
};

export default function ContinueWatchingRow() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();

  const load = () => {
    base44.entities.ContinueWatching
      .list("-updated_date", 100)
      .then((rows) => {
        const sorted = [...(rows || [])]
          .map((item) => ({
            item,
            meta: parseContentKey(item),
            ratio: progressRatio(item),
            updatedAt: new Date(
              item?.updated_date || item?.created_date || 0
            ).getTime(),
          }))
          .filter(
            ({ item, ratio }) =>
              Number(item?.progress || 0) >= MIN_PROGRESS_SECONDS &&
              ratio < WATCHED_THRESHOLD
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);

        const byIdentity = new Map();

        sorted.forEach((entry) => {
          const identity = identityFor(entry.meta);
          const existing = byIdentity.get(identity);

          if (!existing) {
            byIdentity.set(identity, entry);
            return;
          }

          if (!existing.meta.canonical && entry.meta.canonical) {
            byIdentity.set(identity, entry);
          }
        });

        setItems(
          Array.from(byIdentity.values())
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 20)
            .map(({ item }) => item)
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();

    let unsubscribe = null;

    try {
      unsubscribe = base44.entities.ContinueWatching.subscribe(load);
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

  const resume = async (item) => {
    const meta = parseContentKey(item);
    const isTv = meta.mediaType === "tv";
    const tmdbId = await resolveTmdbId(meta);

    const playbackTitle =
      isTv && meta.season && meta.episode
        ? `${meta.title} — S${String(meta.season).padStart(2, "0")}E${String(
            meta.episode
          ).padStart(2, "0")}`
        : meta.title;

    const sources = item?.video_url
      ? [
          {
            label: "Previous resume source",
            type: "file",
            src: item.video_url,
            url: item.video_url,
          },
        ]
      : [];

    player.play({
      id: tmdbId || undefined,
      tmdbId: tmdbId || undefined,
      title: playbackTitle,
      poster: item.poster_url || "",
      year: meta.year,
      mediaType: meta.mediaType,
      type: isTv ? "series" : "movie",
      season: meta.season || undefined,
      episode: meta.episode || undefined,
      rdTitle: meta.title,
      rdYear: meta.year,
      rdSeason: meta.season || undefined,
      rdEpisode: meta.episode || undefined,
      startTime: Number(item.progress || 0),
      preferRd: true,
      sources,
    });
  };

  const displayItems = useMemo(
    () =>
      items.map((item) => {
        const meta = parseContentKey(item);
        const ratio = progressRatio(item);

        return {
          item,
          meta,
          progress: ratio * 100,
          remaining: formatRemaining(item),
        };
      }),
    [items]
  );

  if (loading || displayItems.length === 0) {
    return null;
  }

  return (
    <section className="mg-fire-tv-resume-section px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14 pt-3 sm:pt-5">
      <div className="flex items-center gap-2.5 3xl:gap-3 mb-4 3xl:mb-5">
        <History className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />

        <div>
          <h2 className="text-white font-semibold text-sm sm:text-base 3xl:text-xl 4xl:text-2xl">
            Continue Watching
          </h2>

          <p className="mt-0.5 text-[11px] sm:text-xs 3xl:text-sm text-white/40">
            Pick up exactly where you stopped.
          </p>
        </div>
      </div>

      <div
        className="mg-fire-tv-resume-row flex gap-4 3xl:gap-6 overflow-x-auto overscroll-x-contain pb-4 scrollbar-hide snap-x snap-proximity"
        data-mg-tv-row="true"
        aria-label="Continue Watching"
      >
        {displayItems.map(({ item, meta, progress, remaining }) => {
          const episodeLabel =
            meta.mediaType === "tv" && meta.season && meta.episode
              ? `S${String(meta.season).padStart(2, "0")} E${String(
                  meta.episode
                ).padStart(2, "0")}`
              : "";

          const detailLine = [episodeLabel, remaining]
            .filter(Boolean)
            .join(" · ");

          return (
            <div
              key={item.id}
              onClick={() => resume(item)}
              role="button"
              tabIndex={0}
              aria-label={`Resume ${meta.title}${episodeLabel ? ` ${episodeLabel}` : ""}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  resume(item);
                }
              }}
              className="mg-fire-tv-resume-card group relative w-44 sm:w-52 md:w-56 xl:w-60 3xl:w-72 4xl:w-80 shrink-0 text-left cursor-pointer snap-start rounded-xl focus:outline-none focus:ring-2 focus:ring-mg-green focus:ring-offset-2 focus:ring-offset-mg-background"
            >
              <div className="relative aspect-video rounded-xl overflow-hidden bg-mg-card border border-white/10 shadow-lg shadow-black/20 group-focus:border-mg-green">
                <Image
                  src={item.poster_url}
                  fittingType="fill"
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity pointer-events-none">
                  <div className="w-9 h-9 3xl:w-12 3xl:h-12 4xl:w-14 4xl:h-14 rounded-full bg-mg-green text-black flex items-center justify-center shadow-xl">
                    <Play className="w-4 h-4 3xl:w-6 3xl:h-6 fill-black" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => remove(item.id, event)}
                  className="mg-fire-tv-secondary-action absolute top-1 right-1 3xl:top-2 3xl:right-2 w-7 h-7 3xl:w-9 3xl:h-9 rounded-full bg-black/75 text-white/75 hover:text-white hover:bg-black flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-mg-green"
                  aria-label={`Remove ${meta.title} from Continue Watching`}
                  title="Remove from Continue Watching"
                >
                  <X className="w-3.5 h-3.5 3xl:w-4 3xl:h-4" />
                </button>

                {episodeLabel && (
                  <span className="absolute left-2 top-2 rounded bg-black/80 px-2 py-1 text-[10px] font-bold text-white shadow">
                    {episodeLabel}
                  </span>
                )}

                {remaining && (
                  <span className="absolute left-2 bottom-2 flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[9px] font-semibold text-white/90">
                    <Clock3 className="w-3 h-3 text-mg-green" />
                    {remaining}
                  </span>
                )}

                <div className="absolute bottom-0 left-0 right-0 h-1 3xl:h-1.5 bg-white/20">
                  <div
                    className="h-full bg-mg-green"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-2 text-white font-semibold text-sm sm:text-[15px] 3xl:text-base truncate">
                {meta.title}
              </div>

              <div className="mt-1 min-h-[1rem] text-white/50 text-[11px] sm:text-xs 3xl:text-sm truncate">
                {detailLine || `${Math.round(progress)}% watched`}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
