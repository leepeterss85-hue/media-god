import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, Play, Tv2 } from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { Image } from "@/components/ui/image";

const PosterImage = /** @type {any} */ (Image);
const RECENT_DAYS = 21;
const UPCOMING_DAYS = 28;
const MAX_SHOWS = 8;
const MAX_ITEMS = 12;

const positiveInt = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const shiftDateKey = (base, days) => {
  const next = new Date(`${base}T12:00:00`);
  next.setDate(next.getDate() + days);
  return dateKey(next);
};

const unwrap = (response) => {
  const first = response?.data ?? response ?? {};
  return first &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    first.data &&
    typeof first.data === "object" &&
    !Array.isArray(first.data)
    ? first.data
    : first;
};

const parseHistoryMeta = (item) => {
  const key = String(item?.content_key || "");

  if (key.startsWith("mg2|")) {
    const [, tmdbId, mediaType, year, season, episode, encodedTitle] =
      key.split("|");

    let title = item?.title || "";
    try {
      title = decodeURIComponent(encodedTitle || "") || title;
    } catch {
      // Keep stored title.
    }

    return {
      tmdbId: String(tmdbId || ""),
      mediaType: mediaType === "tv" ? "tv" : "movie",
      year: String(year || item?.year || ""),
      season: positiveInt(season),
      episode: positiveInt(episode),
      title:
        String(title || item?.title || "")
          .replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, "")
          .trim() || "TV Show",
    };
  }

  const parts = key.split("|");
  const season = positiveInt(parts[2]);
  const episode = positiveInt(parts[3]);

  return {
    tmdbId: "",
    mediaType: season && episode ? "tv" : "movie",
    year: String(parts[1] || item?.year || ""),
    season,
    episode,
    title: String(parts[0] || item?.title || "TV Show")
      .replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, "")
      .trim(),
  };
};

const watchedTvSeeds = (historyRows) => {
  const seen = new Set();
  const sorted = [...(historyRows || [])].sort(
    (a, b) =>
      new Date(b?.updated_date || b?.created_date || 0).getTime() -
      new Date(a?.updated_date || a?.created_date || 0).getTime()
  );

  const out = [];

  for (const record of sorted) {
    const meta = parseHistoryMeta(record);
    if (meta.mediaType !== "tv" || !meta.tmdbId) continue;

    const identity = meta.tmdbId;
    if (seen.has(identity)) continue;
    seen.add(identity);

    out.push({
      ...meta,
      poster: record?.poster_url || "",
    });

    if (out.length >= MAX_SHOWS) break;
  }

  return out;
};

const candidateSeasonNumbers = (seasons, watchedSeason) => {
  const numbers = (seasons || [])
    .map((season) => positiveInt(season?.season_number))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!numbers.length) return [];

  const latest = numbers[numbers.length - 1];
  const selected = new Set([latest]);

  if (watchedSeason && numbers.includes(watchedSeason)) {
    selected.add(watchedSeason);
    const next = numbers.find((number) => number > watchedSeason);
    if (next) selected.add(next);
  }

  return Array.from(selected).sort((a, b) => a - b).slice(-2);
};

const episodeIsAfterWatched = (episode, seasonNumber, seed) => {
  if (!seed.season || !seed.episode) return true;
  if (seasonNumber > seed.season) return true;
  if (seasonNumber < seed.season) return false;
  return Number(episode?.episode_number || 0) > seed.episode;
};

const pickEpisodeForShow = (episodes, today) => {
  const released = episodes
    .filter((item) => item.airDate <= today)
    .sort((a, b) => b.airDate.localeCompare(a.airDate));

  if (released.length) return released[0];

  return episodes
    .filter((item) => item.airDate > today)
    .sort((a, b) => a.airDate.localeCompare(b.airDate))[0] || null;
};

export default function NewEpisodesRow({
  historyRows = [],
  region = "",
  todayKey = dateKey(new Date()),
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const player = usePlayer();

  const seeds = useMemo(() => watchedTvSeeds(historyRows), [historyRows]);
  const seedKey = useMemo(
    () =>
      seeds
        .map((seed) =>
          [seed.tmdbId, seed.season || "", seed.episode || ""].join(":")
        )
        .join("|"),
    [seeds]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!seeds.length) {
        setItems([]);
        return;
      }

      setLoading(true);
      const earliest = shiftDateKey(todayKey, -RECENT_DAYS);
      const latest = shiftDateKey(todayKey, UPCOMING_DAYS);

      const results = await Promise.all(
        seeds.map(async (seed) => {
          try {
            const detailResponse = await base44.functions.invoke(
              "getTmdbMovies",
              {
                media_type: "tv",
                movie_id: seed.tmdbId,
                region,
              }
            );

            const details = unwrap(detailResponse)?.details || {};
            const seasonNumbers = candidateSeasonNumbers(
              details?.seasons,
              seed.season
            );

            const seasons = await Promise.all(
              seasonNumbers.map(async (seasonNumber) => {
                const response = await base44.functions.invoke(
                  "getTmdbMovies",
                  {
                    media_type: "tv",
                    movie_id: seed.tmdbId,
                    season_number: seasonNumber,
                    region,
                  }
                );

                return {
                  seasonNumber,
                  episodes: Array.isArray(unwrap(response)?.episodes)
                    ? unwrap(response).episodes
                    : [],
                };
              })
            );

            const candidates = seasons.flatMap(({ seasonNumber, episodes }) =>
              episodes
                .filter((episode) =>
                  episodeIsAfterWatched(episode, seasonNumber, seed)
                )
                .map((episode) => ({
                  tmdbId: seed.tmdbId,
                  showTitle: seed.title,
                  year: seed.year,
                  poster: episode?.still_url || seed.poster || "",
                  season: seasonNumber,
                  episode: positiveInt(episode?.episode_number),
                  episodeName:
                    String(episode?.name || "").trim() ||
                    `Episode ${episode?.episode_number || ""}`,
                  overview: episode?.overview || "",
                  airDate: String(episode?.air_date || "").slice(0, 10),
                }))
                .filter(
                  (episode) =>
                    episode.episode &&
                    episode.airDate &&
                    episode.airDate >= earliest &&
                    episode.airDate <= latest
                )
            );

            return pickEpisodeForShow(candidates, todayKey);
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      const loaded = results
        .filter(Boolean)
        .sort((a, b) => {
          const aUpcoming = a.airDate > todayKey;
          const bUpcoming = b.airDate > todayKey;

          if (aUpcoming !== bUpcoming) return aUpcoming ? 1 : -1;
          return aUpcoming
            ? a.airDate.localeCompare(b.airDate)
            : b.airDate.localeCompare(a.airDate);
        })
        .slice(0, MAX_ITEMS);

      setItems(loaded);
      setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [seedKey, region, todayKey]);

  const playEpisode = (item) => {
    if (!item || item.airDate > todayKey) return;

    const episodeCode = `S${String(item.season).padStart(2, "0")}E${String(
      item.episode
    ).padStart(2, "0")}`;

    player.play({
      id: item.tmdbId,
      tmdbId: item.tmdbId,
      title: `${item.showTitle} — ${episodeCode}`,
      poster: item.poster,
      year: item.year,
      mediaType: "tv",
      type: "series",
      season: item.season,
      episode: item.episode,
      rdTitle: item.showTitle,
      rdYear: item.year,
      rdSeason: item.season,
      rdEpisode: item.episode,
      episodeName: item.episodeName,
      preferRd: true,
      sources: [],
    });
  };

  if (loading || items.length === 0) return null;

  return (
    <section
      data-mg-new-episodes-row="true"
      className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14"
    >
      <div className="mb-3 flex items-center gap-2.5 3xl:mb-4 3xl:gap-3">
        <Tv2 className="h-4 w-4 text-mg-green 3xl:h-5 3xl:w-5" />
        <div>
          <h2 className="text-sm font-semibold text-white sm:text-base 3xl:text-xl 4xl:text-2xl">
            New & Upcoming Episodes from Your Shows
          </h2>
          <p className="mt-0.5 text-[10px] text-white/40 sm:text-xs 3xl:text-sm">
            Fresh episodes and the next scheduled episode from shows you have been watching.
          </p>
        </div>
      </div>

      <div
        data-mg-tv-row="true"
        aria-label="New and upcoming episodes from your shows"
        className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3 scrollbar-hide snap-x snap-proximity 3xl:gap-5"
      >
        {items.map((item) => {
          const upcoming = item.airDate > todayKey;
          const episodeCode = `S${String(item.season).padStart(2, "0")} E${String(
            item.episode
          ).padStart(2, "0")}`;

          return (
            <button
              key={`${item.tmdbId}:${item.season}:${item.episode}`}
              type="button"
              onClick={() => playEpisode(item)}
              disabled={upcoming}
              className="mg-fire-tv-resume-card group w-44 shrink-0 snap-start rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-mg-green focus:ring-offset-2 focus:ring-offset-mg-background disabled:cursor-default disabled:opacity-90 sm:w-52 md:w-56 xl:w-60 3xl:w-72 4xl:w-80"
              aria-label={
                upcoming
                  ? `${item.showTitle} ${episodeCode} airs ${item.airDate}`
                  : `Play ${item.showTitle} ${episodeCode}`
              }
            >
              <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-mg-card shadow-lg shadow-black/20 group-focus:border-mg-green">
                {item.poster ? (
                  <PosterImage
                    src={item.poster}
                    alt=""
                    fittingType="fill"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/20">
                    <Tv2 className="h-8 w-8" />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />

                {!upcoming && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-mg-green text-black shadow-xl 3xl:h-12 3xl:w-12">
                      <Play className="h-4 w-4 fill-black 3xl:h-6 3xl:w-6" />
                    </span>
                  </div>
                )}

                <span className="absolute left-2 top-2 rounded bg-black/80 px-2 py-1 text-[10px] font-bold text-white">
                  {episodeCode}
                </span>

                <span
                  className={`absolute bottom-2 left-2 flex items-center gap-1 rounded px-2 py-1 text-[9px] font-semibold ${
                    upcoming
                      ? "bg-amber-400/90 text-black"
                      : "bg-mg-green/90 text-black"
                  }`}
                >
                  <CalendarClock className="h-3 w-3" />
                  {upcoming ? `Coming ${item.airDate}` : `New ${item.airDate}`}
                </span>
              </div>

              <div className="mt-2 truncate text-sm font-semibold text-white sm:text-[15px] 3xl:text-base">
                {item.showTitle}
              </div>
              <div className="mt-1 truncate text-[11px] text-white/50 sm:text-xs 3xl:text-sm">
                {item.episodeName}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
