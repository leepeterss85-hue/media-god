import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";

import {
  buildMediaSources,
  usePlayer,
} from "@/components/mg/PlayerProvider";

const asPositiveInt = (
  value
) => {
  const number =
    Number(
      value
    );

  return (
    Number.isInteger(
      number
    ) &&
    number > 0
  )
    ? number
    : null;
};

const episodeKey = (
  season,
  episode
) =>
  `${Number(
    season
  )}:${Number(
    episode
  )}`;

const progressRatio = (
  record
) => {
  const progress =
    Number(
      record
        ?.progress ||
        0
    );

  const duration =
    Number(
      record
        ?.duration ||
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

const parseProgressRecord = (
  record
) => {
  const key =
    String(
      record
        ?.content_key ||
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
      ,
      season,
      episode,
    ] =
      key.split(
        "|"
      );

    return {
      tmdbId:
        String(
          tmdbId ||
            ""
        ),

      mediaType:
        mediaType ===
        "tv"
          ? "tv"
          : "movie",

      season:
        asPositiveInt(
          season
        ),

      episode:
        asPositiveInt(
          episode
        ),
    };
  }

  const parts =
    key.split(
      "|"
    );

  return {
    tmdbId:
      "",

    mediaType:
      asPositiveInt(
        parts[2]
      ) &&
      asPositiveInt(
        parts[3]
      )
        ? "tv"
        : "movie",

    season:
      asPositiveInt(
        parts[2]
      ),

    episode:
      asPositiveInt(
        parts[3]
      ),
  };
};

const showTitleOf = (
  item
) =>
  item?.title ||
  item?.name ||
  "TV Show";

export default function EpisodeSelector({
  item,
  seasons,
  trailerUrl,
  providers,
}) {
  const player =
    usePlayer();

  const regularSeasons =
    useMemo(
      () =>
        (
          seasons ||
          []
        )
          .filter(
            (
              seasonItem
            ) =>
              Number(
                seasonItem
                  ?.season_number
              ) > 0
          )
          .sort(
            (
              a,
              b
            ) =>
              Number(
                a
                  .season_number
              ) -
              Number(
                b
                  .season_number
              )
          ),
      [
        seasons,
      ]
    );

  const [
    season,
    setSeason,
  ] =
    useState(
      ""
    );

  const [
    episodes,
    setEpisodes,
  ] =
    useState(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );

  const [
    progressRows,
    setProgressRows,
  ] =
    useState(
      []
    );

  const [
    progressLoading,
    setProgressLoading,
  ] =
    useState(
      true
    );

  const showTitle =
    showTitleOf(
      item
    );

  const tmdbId =
    String(
      item?.id ||
        item
          ?.tmdb_id ||
        item
          ?.tmdbId ||
        ""
    );

  useEffect(() => {
    let mounted =
      true;

    const loadProgress =
      () => {
        setProgressLoading(
          true
        );

        base44.entities.ContinueWatching
          .list(
            "-updated_date",
            100
          )
          .then(
            (
              rows
            ) => {
              if (
                !mounted
              ) {
                return;
              }

              const matching =
                (
                  rows ||
                  []
                ).filter(
                  (
                    record
                  ) => {
                    const parsed =
                      parseProgressRecord(
                        record
                      );

                    if (
                      parsed.mediaType !==
                        "tv" ||
                      !parsed.season ||
                      !parsed.episode
                    ) {
                      return false;
                    }

                    if (
                      parsed.tmdbId &&
                      tmdbId &&
                      parsed.tmdbId ===
                        tmdbId
                    ) {
                      return true;
                    }

                    const storedTitle =
                      String(
                        record
                          ?.title ||
                          record
                            ?.content_key ||
                          ""
                      ).toLowerCase();

                    return storedTitle.includes(
                      showTitle.toLowerCase()
                    );
                  }
                );

              setProgressRows(
                matching
              );
            }
          )
          .catch(
            () => {
              if (
                mounted
              ) {
                setProgressRows(
                  []
                );
              }
            }
          )
          .finally(
            () => {
              if (
                mounted
              ) {
                setProgressLoading(
                  false
                );
              }
            }
          );
      };

    loadProgress();

    let unsubscribe =
      null;

    try {
      unsubscribe =
        base44.entities.ContinueWatching.subscribe(
          () =>
            loadProgress()
        );
    } catch {
      unsubscribe =
        null;
    }

    return () => {
      mounted =
        false;

      if (
        typeof unsubscribe ===
        "function"
      ) {
        unsubscribe();
      }
    };
  }, [
    showTitle,
    tmdbId,
  ]);

  const progressMap =
    useMemo(
      () => {
        const map =
          new Map();

        progressRows.forEach(
          (
            record
          ) => {
            const parsed =
              parseProgressRecord(
                record
              );

            if (
              !parsed.season ||
              !parsed.episode
            ) {
              return;
            }

            const key =
              episodeKey(
                parsed.season,
                parsed.episode
              );

            const existing =
              map.get(
                key
              );

            if (
              !existing ||
              Number(
                record
                  ?.progress ||
                  0
              ) >
                Number(
                  existing
                    ?.progress ||
                    0
                )
            ) {
              map.set(
                key,
                record
              );
            }
          }
        );

        return map;
      },
      [
        progressRows,
      ]
    );

  const latestProgress =
    useMemo(
      () =>
        progressRows
          .map(
            (
              record
            ) => ({
              record,

              parsed:
                parseProgressRecord(
                  record
                ),
            })
          )
          .filter(
            ({
              parsed,
              record,
            }) =>
              parsed.season &&
              parsed.episode &&
              Number(
                record
                  ?.progress ||
                  0
              ) >= 5 &&
              progressRatio(
                record
              ) < 0.96
          )
          .sort(
            (
              a,
              b
            ) => {
              const aDate =
                new Date(
                  a.record
                    ?.updated_date ||
                    a.record
                      ?.created_date ||
                    0
                ).getTime();

              const bDate =
                new Date(
                  b.record
                    ?.updated_date ||
                    b.record
                      ?.created_date ||
                    0
                ).getTime();

              return (
                bDate -
                aDate
              );
            }
          )[0] ||
        null,
      [
        progressRows,
      ]
    );

  useEffect(() => {
    if (
      !regularSeasons.length
    ) {
      return;
    }

    const resumeSeason =
      latestProgress
        ?.parsed
        ?.season;

    const hasResumeSeason =
      resumeSeason &&
      regularSeasons.some(
        (
          seasonItem
        ) =>
          Number(
            seasonItem
              .season_number
          ) ===
          Number(
            resumeSeason
          )
      );

    setSeason(
      String(
        hasResumeSeason
          ? resumeSeason
          : regularSeasons[0]
              .season_number
      )
    );
  }, [
    regularSeasons,
    latestProgress
      ?.parsed
      ?.season,
  ]);

  useEffect(() => {
    if (
      season ===
      ""
    ) {
      return;
    }

    let mounted =
      true;

    setLoading(
      true
    );

    setEpisodes(
      []
    );

    base44.functions
      .invoke(
        "getTmdbMovies",
        {
          media_type:
            "tv",

          movie_id:
            item?.id ||
            item
              ?.tmdb_id ||
            item
              ?.tmdbId,

          season_number:
            Number(
              season
            ),
        }
      )
      .then(
        (
          response
        ) => {
          if (
            !mounted
          ) {
            return;
          }

          setEpisodes(
            Array.isArray(
              response
                ?.data
                ?.episodes
            )
              ? response
                  .data
                  .episodes
              : []
          );
        }
      )
      .catch(
        () => {
          if (
            mounted
          ) {
            setEpisodes(
              []
            );
          }
        }
      )
      .finally(
        () => {
          if (
            mounted
          ) {
            setLoading(
              false
            );
          }
        }
      );

    return () => {
      mounted =
        false;
    };
  }, [
    item?.id,
    item?.tmdb_id,
    item?.tmdbId,
    season,
  ]);

  const currentSeasonIndex =
    regularSeasons.findIndex(
      (
        seasonItem
      ) =>
        String(
          seasonItem
            .season_number
        ) ===
        String(
          season
        )
    );

  const goPreviousSeason =
    () => {
      if (
        currentSeasonIndex <=
        0
      ) {
        return;
      }

      setSeason(
        String(
          regularSeasons[
            currentSeasonIndex -
              1
          ].season_number
        )
      );
    };

  const goNextSeason =
    () => {
      if (
        currentSeasonIndex <
          0 ||
        currentSeasonIndex >=
          regularSeasons.length -
            1
      ) {
        return;
      }

      setSeason(
        String(
          regularSeasons[
            currentSeasonIndex +
              1
          ].season_number
        )
      );
    };

  const playEpisodeNumber =
    ({
      seasonNumber,
      episodeNumber,
      episodeData =
        null,
      startTime =
        0,
    }) => {
      const episodeTitle =
        `${showTitle} — S${String(
          seasonNumber
        ).padStart(
          2,
          "0"
        )}E${String(
          episodeNumber
        ).padStart(
          2,
          "0"
        )}`;

      const poster =
        episodeData
          ?.still_url ||
        item
          ?.poster_url ||
        item?.poster ||
        "";

      player.play({
        id:
          item?.id ||
          item
            ?.tmdb_id ||
          item
            ?.tmdbId,

        tmdbId:
          item?.id ||
          item
            ?.tmdb_id ||
          item
            ?.tmdbId,

        tmdb_id:
          item?.id ||
          item
            ?.tmdb_id ||
          item
            ?.tmdbId,

        title:
          episodeTitle,

        poster,

        year:
          item?.year,

        mediaType:
          "tv",

        type:
          "series",

        season:
          Number(
            seasonNumber
          ),

        episode:
          Number(
            episodeNumber
          ),

        rdTitle:
          showTitle,

        rdYear:
          item?.year,

        rdSeason:
          Number(
            seasonNumber
          ),

        rdEpisode:
          Number(
            episodeNumber
          ),

        startTime:
          Number(
            startTime ||
              0
          ),

        preferRd:
          true,

        sources:
          buildMediaSources({
            title:
              episodeTitle,

            id:
              item?.id ||
              item
                ?.tmdb_id ||
              item
                ?.tmdbId,

            poster,

            trailerUrl,

            providers,
          }),
      });
    };

  const playEpisode =
    (
      episodeData
    ) => {
      const episodeNumber =
        Number(
          episodeData
            ?.episode_number
        );

      const seasonNumber =
        Number(
          season
        );

      const progressRecord =
        progressMap.get(
          episodeKey(
            seasonNumber,
            episodeNumber
          )
        );

      const ratio =
        progressRatio(
          progressRecord
        );

      const startTime =
        progressRecord &&
        Number(
          progressRecord
            ?.progress ||
            0
        ) >= 5 &&
        ratio <
          0.96
          ? Number(
              progressRecord
                .progress ||
                0
            )
          : 0;

      playEpisodeNumber({
        seasonNumber,
        episodeNumber,
        episodeData,
        startTime,
      });
    };

  const resumeLatest =
    () => {
      if (
        !latestProgress
      ) {
        return;
      }

      playEpisodeNumber({
        seasonNumber:
          latestProgress
            .parsed
            .season,

        episodeNumber:
          latestProgress
            .parsed
            .episode,

        startTime:
          Number(
            latestProgress
              .record
              ?.progress ||
              0
          ),
      });
    };

  if (
    !regularSeasons.length
  ) {
    return null;
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider">
          Episodes
        </h3>

        {progressLoading && (
          <span className="inline-flex items-center gap-1 text-[10px] text-white/35">
            <Loader2 className="w-3 h-3 animate-spin" />

            Syncing progress
          </span>
        )}
      </div>

      {latestProgress && (
        <button
          type="button"
          onClick={
            resumeLatest
          }
          className="mb-3 w-full min-h-11 flex items-center justify-between gap-3 rounded-lg border border-mg-green/25 bg-mg-green/10 px-3 py-2.5 text-left hover:bg-mg-green/15 focus:outline-none focus:ring-2 focus:ring-mg-green"
        >
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-mg-green">
              Continue this series
            </span>

            <span className="block text-[11px] text-white/55 mt-0.5">
              Resume S
              {String(
                latestProgress
                  .parsed
                  .season
              ).padStart(
                2,
                "0"
              )}
              E
              {String(
                latestProgress
                  .parsed
                  .episode
              ).padStart(
                2,
                "0"
              )}
              {" · "}
              {Math.round(
                progressRatio(
                  latestProgress
                    .record
                ) *
                  100
              )}
              % watched
            </span>
          </span>

          <RotateCcw className="w-4 h-4 text-mg-green shrink-0" />
        </button>
      )}

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 mb-3">
        <button
          type="button"
          onClick={
            goPreviousSeason
          }
          disabled={
            currentSeasonIndex <=
            0
          }
          className="w-11 h-11 rounded-lg border border-white/10 bg-mg-card text-white/70 flex items-center justify-center hover:text-white hover:border-white/20 disabled:opacity-25 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-mg-green"
          aria-label="Previous season"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <select
          value={
            season
          }
          onChange={(
            event
          ) =>
            setSeason(
              event.target
                .value
            )
          }
          className="w-full min-h-11 bg-mg-card border border-white/10 rounded-lg px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-mg-green"
          aria-label="Choose season"
        >
          {regularSeasons.map(
            (
              seasonItem
            ) => (
              <option
                key={
                  seasonItem
                    .season_number
                }
                value={
                  String(
                    seasonItem
                      .season_number
                  )
                }
              >
                {seasonItem.name ||
                  `Season ${seasonItem.season_number}`}

                {seasonItem
                  .episode_count
                  ? ` · ${seasonItem.episode_count} episodes`
                  : ""}
              </option>
            )
          )}
        </select>

        <button
          type="button"
          onClick={
            goNextSeason
          }
          disabled={
            currentSeasonIndex <
              0 ||
            currentSeasonIndex >=
              regularSeasons.length -
                1
          }
          className="w-11 h-11 rounded-lg border border-white/10 bg-mg-card text-white/70 flex items-center justify-center hover:text-white hover:border-white/20 disabled:opacity-25 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-mg-green"
          aria-label="Next season"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({
            length:
              5,
          }).map(
            (
              _,
              index
            ) => (
              <div
                key={
                  index
                }
                className="h-20 rounded-lg bg-mg-card animate-pulse"
              />
            )
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {episodes.map(
            (
              episodeData
            ) => {
              const episodeNumber =
                Number(
                  episodeData
                    ?.episode_number
                );

              const seasonNumber =
                Number(
                  season
                );

              const progressRecord =
                progressMap.get(
                  episodeKey(
                    seasonNumber,
                    episodeNumber
                  )
                );

              const ratio =
                progressRatio(
                  progressRecord
                );

              const percent =
                Math.round(
                  ratio *
                    100
                );

              const hasResume =
                Number(
                  progressRecord
                    ?.progress ||
                    0
                ) >=
                  5 &&
                ratio >
                  0 &&
                ratio <
                  0.96;

              const nearlyWatched =
                ratio >=
                0.92;

              return (
                <div
                  key={
                    episodeData.id ||
                    `${seasonNumber}-${episodeNumber}`
                  }
                  className="group relative flex gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2 hover:bg-white/[0.04] focus-within:border-mg-green/30"
                >
                  <button
                    type="button"
                    onClick={() =>
                      playEpisode(
                        episodeData
                      )
                    }
                    className="relative w-28 sm:w-32 aspect-video shrink-0 overflow-hidden rounded-md bg-mg-card border border-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green"
                    aria-label={`${
                      hasResume
                        ? "Resume"
                        : "Play"
                    } episode ${episodeNumber}`}
                  >
                    {episodeData
                      .still_url ? (
                      <Image
                        src={
                          episodeData
                            .still_url
                        }
                        alt={
                          episodeData
                            .name ||
                          `Episode ${episodeNumber}`
                        }
                        className="w-full h-full object-cover"
                        fittingType="fill"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/25">
                        <Play className="w-5 h-5" />
                      </div>
                    )}

                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <span className="w-9 h-9 rounded-full bg-mg-green text-black flex items-center justify-center">
                        {hasResume ? (
                          <RotateCcw className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4 fill-black" />
                        )}
                      </span>
                    </span>

                    <span className="absolute top-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      E
                      {
                        episodeNumber
                      }
                    </span>

                    {nearlyWatched && (
                      <span className="absolute top-1 right-1 rounded-full bg-black/75 p-1 text-mg-green">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </span>
                    )}

                    {ratio >
                      0 && (
                      <span className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <span
                          className="block h-full bg-mg-green"
                          style={{
                            width:
                              `${percent}%`,
                          }}
                        />
                      </span>
                    )}
                  </button>

                  <div className="flex-1 min-w-0 py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {episodeData.name ||
                            `Episode ${episodeNumber}`}
                        </p>

                        <p className="text-white/40 text-xs flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                          {episodeData
                            .air_date && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />

                              {
                                episodeData
                                  .air_date
                              }
                            </span>
                          )}

                          {hasResume && (
                            <span className="text-mg-green font-semibold">
                              Resume ·{" "}
                              {
                                percent
                              }
                              %
                            </span>
                          )}

                          {nearlyWatched &&
                            !hasResume && (
                              <span className="text-mg-green font-semibold">
                                Watched
                              </span>
                            )}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          playEpisode(
                            episodeData
                          )
                        }
                        className="shrink-0 min-h-10 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 text-[11px] font-semibold text-white/70 hover:text-white hover:border-mg-green/30 focus:outline-none focus:ring-2 focus:ring-mg-green"
                      >
                        {hasResume ? (
                          <RotateCcw className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}

                        {hasResume
                          ? "Resume"
                          : "Play"}
                      </button>
                    </div>

                    <p className="text-white/50 text-xs mt-1 line-clamp-2 leading-relaxed">
                      {episodeData.overview ||
                        "No description available."}
                    </p>
                  </div>
                </div>
              );
            }
          )}

          {episodes.length ===
            0 && (
            <p className="text-white/40 text-xs rounded-lg border border-white/10 bg-mg-card p-4">
              No episodes found for this season.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
