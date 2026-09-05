import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  History,
  Play,
  X,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { Image } from "@/components/ui/image";

const fmtTime = (
  seconds
) => {
  if (
    !seconds ||
    seconds < 1 ||
    !isFinite(
      seconds
    )
  ) {
    return "0:00";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remainingSeconds =
    Math.floor(
      seconds % 60
    );

  const hours =
    Math.floor(
      minutes / 60
    );

  return hours > 0
    ? `${hours}:${String(
        minutes %
          60
      ).padStart(
        2,
        "0"
      )}:${String(
        remainingSeconds
      ).padStart(
        2,
        "0"
      )}`
    : `${minutes}:${String(
        remainingSeconds
      ).padStart(
        2,
        "0"
      )}`;
};

const positiveInt = (
  value
) => {
  const number =
    Number(
      value
    );

  return Number.isInteger(
    number
  ) &&
    number > 0
    ? number
    : null;
};

const parseContentKey = (
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
      season,
      episode,
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
      // Keep entity title.
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

      season:
        positiveInt(
          season
        ),

      episode:
        positiveInt(
          episode
        ),

      title:
        title ||
        item?.title ||
        "Video",
    };
  }

  const legacy =
    key.split(
      "|"
    );

  if (
    legacy.length >=
    4
  ) {
    const season =
      positiveInt(
        legacy[2]
      );

    const episode =
      positiveInt(
        legacy[3]
      );

    return {
      tmdbId:
        "",

      mediaType:
        season &&
        episode
          ? "tv"
          : "movie",

      year:
        legacy[1] ||
        item?.year ||
        "",

      season,

      episode,

      title:
        String(
          legacy[0] ||
            item?.title ||
            "Video"
        )
          .replace(
            /\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i,
            ""
          )
          .trim() ||
        item?.title ||
        "Video",
    };
  }

  return {
    tmdbId:
      "",

    mediaType:
      "movie",

    year:
      item?.year ||
      "",

    season:
      null,

    episode:
      null,

    title:
      item?.title ||
      "Video",
  };
};

const progressRatio = (
  item
) => {
  const duration =
    Number(
      item?.duration ||
        0
    );

  const progress =
    Number(
      item?.progress ||
        0
    );

  if (
    !duration ||
    duration <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      progress /
        duration
    )
  );
};

export default function ContinueWatchingRow() {
  const [
    items,
    setItems,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const player =
    usePlayer();

  const load = () => {
    base44.entities.ContinueWatching
      .list(
        "-updated_date",
        40
      )
      .then(
        async (
          rows
        ) => {
          const completed =
            [];

          const visible =
            [];

          const seen =
            new Set();

          (
            rows ||
            []
          ).forEach(
            (
              item
            ) => {
              const ratio =
                progressRatio(
                  item
                );

              /*
               * Finished movies/episodes
               * automatically disappear.
               */
              if (
                ratio >=
                0.96
              ) {
                completed.push(
                  item
                );

                return;
              }

              /*
               * Ignore accidental
               * 1-2 second plays.
               */
              if (
                Number(
                  item
                    ?.progress ||
                    0
                ) < 5
              ) {
                return;
              }

              const identity =
                String(
                  item
                    ?.content_key ||
                    ""
                ) ||
                `${item?.title}|${item?.year}|${item?.video_url}`;

              if (
                seen.has(
                  identity
                )
              ) {
                return;
              }

              seen.add(
                identity
              );

              visible.push(
                item
              );
            }
          );

          setItems(
            visible.slice(
              0,
              20
            )
          );

          if (
            completed.length >
            0
          ) {
            Promise.all(
              completed.map(
                (
                  item
                ) =>
                  base44.entities.ContinueWatching
                    .delete(
                      item.id
                    )
                    .catch(
                      () => {}
                    )
              )
            ).catch(
              () => {}
            );
          }
        }
      )
      .catch(
        () => {}
      )
      .finally(
        () =>
          setLoading(
            false
          )
      );
  };

  useEffect(() => {
    load();

    const unsubscribe =
      base44.entities.ContinueWatching.subscribe(
        () =>
          load()
      );

    return unsubscribe;
  }, []);

  const remove =
    async (
      id,
      event
    ) => {
      event?.stopPropagation();

      setItems(
        (
          current
        ) =>
          current.filter(
            (
              item
            ) =>
              item.id !==
              id
          )
      );

      try {
        await base44.entities.ContinueWatching.delete(
          id
        );
      } catch {
        load();
      }
    };

  const resume =
    async (
      item
    ) => {
      const meta =
        parseContentKey(
          item
        );

      const isTv =
        meta.mediaType ===
        "tv";

      let tmdbId =
        meta.tmdbId ||
        "";

      /*
       * Older Continue Watching
       * records did not contain a
       * TMDB id.
       *
       * Recover it from title/year
       * so season switching and next
       * episode still work after
       * resuming.
       */
      if (
        !tmdbId &&
        meta.title
      ) {
        try {
          const response =
            await base44.functions.invoke(
              "getTmdbMovies",
              {
                multi_search:
                  meta.title,
              }
            );

          const candidates =
            Array.isArray(
              response.data
                ?.movies
            )
              ? response.data.movies
              : [];

          const sameType =
            candidates.filter(
              (
                candidate
              ) =>
                String(
                  candidate
                    ?.media_type ||
                    ""
                ) ===
                meta.mediaType
            );

          const sameYear =
            sameType.find(
              (
                candidate
              ) =>
                meta.year
                  ? String(
                      candidate
                        ?.year ||
                        ""
                    ) ===
                    String(
                      meta.year
                    )
                  : false
            );

          const match =
            sameYear ||
            sameType[0] ||
            candidates[0];

          tmdbId =
            String(
              match?.id ||
                match?.tmdb_id ||
                ""
            );
        } catch {
          /*
           * PlayerProvider can still
           * fall back to title/year.
           */
        }
      }

      const episodeTitle =
        isTv &&
        meta.season &&
        meta.episode
          ? `${meta.title} — S${String(
              meta.season
            ).padStart(
              2,
              "0"
            )}E${String(
              meta.episode
            ).padStart(
              2,
              "0"
            )}`
          : meta.title;

      const sources =
        item?.video_url
          ? [
              {
                label:
                  "Resume source",

                type:
                  "file",

                src:
                  item.video_url,

                url:
                  item.video_url,
              },
            ]
          : [];

      player.play({
        id:
          tmdbId ||
          undefined,

        tmdbId:
          tmdbId ||
          undefined,

        title:
          episodeTitle,

        poster:
          item.poster_url,

        year:
          meta.year,

        mediaType:
          meta.mediaType,

        type:
          isTv
            ? "series"
            : "movie",

        season:
          meta.season ||
          undefined,

        episode:
          meta.episode ||
          undefined,

        rdTitle:
          meta.title,

        rdYear:
          meta.year,

        rdSeason:
          meta.season ||
          undefined,

        rdEpisode:
          meta.episode ||
          undefined,

        startTime:
          Number(
            item.progress ||
              0
          ),

        preferRd:
          true,

        sources,
      });
    };

  const displayItems =
    useMemo(
      () =>
        items.map(
          (
            item
          ) => ({
            item,

            meta:
              parseContentKey(
                item
              ),

            progress:
              progressRatio(
                item
              ) * 100,
          })
        ),
      [
        items,
      ]
    );

  if (
    loading ||
    displayItems.length ===
      0
  ) {
    return null;
  }

  return (
    <section className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14 pt-2 sm:pt-4">
      <div className="flex items-center gap-2 3xl:gap-3 mb-3 3xl:mb-4">
        <History className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />

        <div>
          <h2 className="text-white font-semibold text-sm sm:text-base 3xl:text-xl 4xl:text-2xl">
            Continue Watching
          </h2>

          <p className="text-[10px] 3xl:text-sm text-white/35">
            Resume on any device signed into the same Media God account.
          </p>
        </div>
      </div>

      <div className="flex gap-3 3xl:gap-5 overflow-x-auto overscroll-x-contain pb-2 scrollbar-hide snap-x snap-proximity">
        {displayItems.map(
          ({
            item,
            meta,
            progress,
          }) => (
            <div
              key={
                item.id
              }
              onClick={() =>
                resume(
                  item
                )
              }
              role="button"
              tabIndex={
                0
              }
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                    "Enter" ||
                  event.key ===
                    " "
                ) {
                  event.preventDefault();

                  resume(
                    item
                  );
                }
              }}
              className="group relative w-36 sm:w-44 md:w-48 xl:w-52 3xl:w-64 4xl:w-72 shrink-0 text-left cursor-pointer snap-start"
            >
              <div className="relative aspect-video rounded-lg 3xl:rounded-xl overflow-hidden bg-mg-card border border-white/10">
                <Image
                  src={
                    item.poster_url
                  }
                  fittingType="fill"
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                <div className="mg-hover-action absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <div className="w-9 h-9 3xl:w-12 3xl:h-12 4xl:w-14 4xl:h-14 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-4 h-4 3xl:w-6 3xl:h-6 fill-black" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(
                    event
                  ) =>
                    remove(
                      item.id,
                      event
                    )
                  }
                  className="mg-hover-action absolute top-1 right-1 3xl:top-2 3xl:right-2 w-7 h-7 3xl:w-9 3xl:h-9 rounded-full bg-black/70 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Remove from Continue Watching"
                >
                  <X className="w-3.5 h-3.5 3xl:w-4 3xl:h-4" />
                </button>

                {meta.mediaType ===
                  "tv" &&
                  meta.season &&
                  meta.episode && (
                    <span className="absolute left-2 top-2 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
                      S
                      {String(
                        meta.season
                      ).padStart(
                        2,
                        "0"
                      )}{" "}
                      E
                      {String(
                        meta.episode
                      ).padStart(
                        2,
                        "0"
                      )}
                    </span>
                  )}

                <div className="absolute bottom-0 left-0 right-0 h-1 3xl:h-1.5 bg-white/20">
                  <div
                    className="h-full bg-mg-green"
                    style={{
                      width:
                        `${progress}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-1.5 3xl:mt-2 text-white font-semibold text-xs sm:text-sm 3xl:text-base truncate">
                {
                  meta.title
                }
              </div>

              <div className="flex items-center justify-between gap-2 text-white/40 text-[10px] sm:text-xs 3xl:text-sm">
                <span>
                  {fmtTime(
                    item.progress
                  )}
                </span>

                <span>
                  {Math.round(
                    progress
                  )}
                  %
                </span>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}
