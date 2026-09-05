import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  Calendar,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";

import {
  buildMediaSources,
  usePlayer,
} from "@/components/mg/PlayerProvider";

const unwrap = (response) =>
  response?.data ??
  response ??
  {};

const isImdbId = (value) =>
  /^tt\d+$/i.test(
    String(value || "").trim()
  );

const positiveInt = (value) => {
  const number = Number(value);

  return Number.isInteger(number) &&
    number > 0
    ? number
    : null;
};

const normaliseSeasons = (items) =>
  (Array.isArray(items) ? items : [])
    .filter(
      (entry) =>
        positiveInt(
          entry?.season_number
        ) != null
    )
    .map((entry) => ({
      ...entry,

      season_number:
        Number(
          entry.season_number
        ),

      episode_count:
        Number(
          entry?.episode_count ||
            0
        ),
    }))
    .sort(
      (a, b) =>
        a.season_number -
        b.season_number
    );

const mergeSeasons = (
  first,
  second
) => {
  const map = new Map();

  [
    ...normaliseSeasons(first),
    ...normaliseSeasons(second),
  ].forEach((entry) => {
    const key =
      Number(
        entry.season_number
      );

    const previous =
      map.get(key) || {};

    map.set(key, {
      ...previous,
      ...entry,

      season_number:
        key,

      episode_count:
        Number(
          entry?.episode_count ??
            previous?.episode_count ??
            0
        ),
    });
  });

  return Array.from(
    map.values()
  ).sort(
    (a, b) =>
      a.season_number -
      b.season_number
  );
};

export default function EpisodeSelector({
  item,
  seasons,
  trailerUrl,
  providers,
  imdbId = "",
}) {
  const player =
    usePlayer();

  const [
    availableSeasons,
    setAvailableSeasons,
  ] = useState(() =>
    normaliseSeasons(
      seasons
    )
  );

  const [
    season,
    setSeason,
  ] = useState("");

  const [
    episodes,
    setEpisodes,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    seasonsLoading,
    setSeasonsLoading,
  ] = useState(false);

  const [
    seasonsError,
    setSeasonsError,
  ] = useState("");

  const [
    episodeError,
    setEpisodeError,
  ] = useState("");

  const [
    playError,
    setPlayError,
  ] = useState("");

  const [
    reloadNonce,
    setReloadNonce,
  ] = useState(0);

  const [
    playingEpisode,
    setPlayingEpisode,
  ] = useState(null);

  const sortedSeasons =
    useMemo(
      () =>
        normaliseSeasons(
          availableSeasons
        ),
      [
        availableSeasons,
      ]
    );

  /*
   * Reset when the TV programme
   * itself changes.
   */
  useEffect(() => {
    setAvailableSeasons(
      normaliseSeasons(
        seasons
      )
    );

    setSeason("");
    setEpisodes([]);
    setSeasonsError("");
    setEpisodeError("");
    setPlayError("");
    setPlayingEpisode(null);
  }, [
    item?.id,
  ]);

  /*
   * If DetailModal supplies season
   * information, keep it.
   *
   * IMPORTANT:
   * We MERGE it rather than replacing
   * the full list.
   */
  useEffect(() => {
    const incoming =
      normaliseSeasons(
        seasons
      );

    if (
      incoming.length ===
      0
    ) {
      return;
    }

    setAvailableSeasons(
      (current) =>
        mergeSeasons(
          current,
          incoming
        )
    );
  }, [
    seasons,
  ]);

  /*
   * ALWAYS ask for the complete TV
   * series details.
   *
   * The old code stopped here if even
   * one season was already supplied.
   * That was why some shows only showed
   * the current season.
   */
  useEffect(() => {
    let cancelled =
      false;

    if (!item?.id) {
      setSeasonsError(
        "This show does not have a TMDB id."
      );

      return undefined;
    }

    const loadAllSeasons =
      async () => {
        setSeasonsLoading(
          true
        );

        setSeasonsError(
          ""
        );

        try {
          const response =
            await base44.functions.invoke(
              "getTmdbMovies",
              {
                media_type:
                  "tv",

                movie_id:
                  item.id,
              }
            );

          if (cancelled) {
            return;
          }

          const data =
            unwrap(
              response
            );

          const found =
            normaliseSeasons(
              data?.details
                ?.seasons
            );

          if (
            found.length >
            0
          ) {
            setAvailableSeasons(
              (current) =>
                mergeSeasons(
                  current,
                  found
                )
            );

            setSeasonsError(
              ""
            );
          } else {
            setSeasonsError(
              data?.error ||
                "No seasons were returned for this TV show."
            );
          }
        } catch (error) {
          if (
            !cancelled
          ) {
            setSeasonsError(
              error?.message ||
                "Could not load all seasons for this TV show."
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setSeasonsLoading(
              false
            );
          }
        }
      };

    loadAllSeasons();

    return () => {
      cancelled =
        true;
    };
  }, [
    item?.id,
    reloadNonce,
  ]);

  /*
   * Select the first valid season once
   * the complete list is available.
   *
   * If the user has already selected a
   * season, preserve that selection.
   */
  useEffect(() => {
    if (
      sortedSeasons.length ===
      0
    ) {
      return;
    }

    const existing =
      sortedSeasons.some(
        (entry) =>
          String(
            entry.season_number
          ) ===
          String(
            season
          )
      );

    if (existing) {
      return;
    }

    const firstWithEpisodes =
      sortedSeasons.find(
        (entry) =>
          Number(
            entry.episode_count ||
              0
          ) > 0
      ) ||
      sortedSeasons[0];

    setSeason(
      String(
        firstWithEpisodes
          ?.season_number ||
          ""
      )
    );
  }, [
    sortedSeasons,
    season,
  ]);

  /*
   * Load episodes whenever a different
   * season is selected.
   */
  useEffect(() => {
    let cancelled =
      false;

    if (
      season === "" ||
      !item?.id
    ) {
      return undefined;
    }

    const loadEpisodes =
      async () => {
        setLoading(
          true
        );

        setEpisodes(
          []
        );

        setEpisodeError(
          ""
        );

        setPlayError(
          ""
        );

        try {
          const response =
            await base44.functions.invoke(
              "getTmdbMovies",
              {
                media_type:
                  "tv",

                movie_id:
                  item.id,

                season_number:
                  Number(
                    season
                  ),
              }
            );

          if (cancelled) {
            return;
          }

          const data =
            unwrap(
              response
            );

          const found =
            Array.isArray(
              data?.episodes
            )
              ? data.episodes
              : [];

          setEpisodes(
            found
          );

          if (
            found.length ===
            0
          ) {
            setEpisodeError(
              data?.error ||
                "No episodes were returned for this season."
            );
          }
        } catch (error) {
          if (
            !cancelled
          ) {
            setEpisodes(
              []
            );

            setEpisodeError(
              error?.message ||
                "Could not load episodes for this season."
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setLoading(
              false
            );
          }
        }
      };

    loadEpisodes();

    return () => {
      cancelled =
        true;
    };
  }, [
    item?.id,
    season,
    reloadNonce,
  ]);

  const currentSeason =
    sortedSeasons.find(
      (entry) =>
        String(
          entry.season_number
        ) ===
        String(
          season
        )
    );

  /*
   * Resolve the series IMDb id before
   * asking addons for an episode.
   */
  const resolveEpisodeImdb =
    async () => {
      const fallback =
        String(
          imdbId ||
            item?.imdb_id ||
            item?.imdbId ||
            ""
        ).trim();

      if (item?.id) {
        try {
          const response =
            await base44.functions.invoke(
              "resolveTvImdb",
              {
                tmdb_id:
                  item.id,

                title:
                  item?.title ||
                  item?.name ||
                  "",

                year:
                  item?.year ||
                  "",
              }
            );

          const data =
            unwrap(
              response
            );

          const resolved =
            String(
              data?.imdb_id ||
                ""
            ).trim();

          if (
            isImdbId(
              resolved
            )
          ) {
            return resolved;
          }
        } catch (error) {
          console.warn(
            "[Media God] TV IMDb resolution failed",
            error
          );
        }
      }

      return isImdbId(
        fallback
      )
        ? fallback
        : "";
    };

  const playEpisode =
    async (
      episodeItem
    ) => {
      const seasonNumber =
        positiveInt(
          season
        );

      const episodeNumber =
        positiveInt(
          episodeItem
            ?.episode_number
        );

      if (
        !seasonNumber ||
        !episodeNumber
      ) {
        setPlayError(
          "This episode does not have a valid season/episode number."
        );

        return;
      }

      setPlayingEpisode(
        episodeNumber
      );

      setPlayError(
        ""
      );

      try {
        const resolvedImdb =
          await resolveEpisodeImdb();

        if (
          !resolvedImdb
        ) {
          throw new Error(
            "Could not resolve the IMDb series id for this episode."
          );
        }

        const seriesTitle =
          item?.title ||
          item?.name ||
          "TV Show";

        const episodeTitle =
          `${seriesTitle} — S${String(
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
          episodeItem
            ?.still_url ||
          item?.poster_url ||
          "";

        console.info(
          "[Media God] TV episode lookup",
          {
            tmdbId:
              item?.id,

            imdbId:
              resolvedImdb,

            season:
              seasonNumber,

            episode:
              episodeNumber,

            streamId:
              `${resolvedImdb}:${seasonNumber}:${episodeNumber}`,
          }
        );

        await player.play({
          id:
            item?.id,

          tmdbId:
            item?.id,

          imdbId:
            resolvedImdb,

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
            seasonNumber,

          episode:
            episodeNumber,

          rdTitle:
            seriesTitle,

          rdYear:
            item?.year,

          rdSeason:
            seasonNumber,

          rdEpisode:
            episodeNumber,

          preferRd:
            true,

          skipAddonLookup:
            false,

          skipRdLookup:
            false,

          sources:
            buildMediaSources({
              title:
                episodeTitle,

              id:
                item?.id,

              poster,

              trailerUrl,

              providers,
            }),
        });
      } catch (error) {
        setPlayError(
          error?.message ||
            "Could not start this episode."
        );
      } finally {
        setPlayingEpisode(
          null
        );
      }
    };

  return (
    <div
      id="mg-episode-selector"
      className="mt-5 3xl:mt-7 scroll-mt-4"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-white/80 text-xs 3xl:text-sm font-bold uppercase tracking-wider">
          Seasons & Episodes
        </h3>

        {sortedSeasons.length >
          0 && (
          <span className="text-[10px] 3xl:text-xs text-white/40">
            {
              sortedSeasons.length
            }{" "}
            season
            {sortedSeasons.length ===
            1
              ? ""
              : "s"}
          </span>
        )}
      </div>

      {seasonsLoading &&
        sortedSeasons.length ===
          0 && (
        <div className="bg-mg-card border border-white/10 rounded-lg p-4 flex items-center gap-2 text-white/60 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-mg-green" />
          Loading all seasons…
        </div>
      )}

      {!seasonsLoading &&
        sortedSeasons.length ===
          0 && (
        <div className="bg-mg-card border border-white/10 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />

            <div className="flex-1">
              <p className="text-white text-sm font-medium">
                Seasons are not
                available yet
              </p>

              <p className="text-white/45 text-xs mt-1">
                {seasonsError ||
                  "Media God did not receive season information for this show."}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setReloadNonce(
                  (value) =>
                    value + 1
                )
              }
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white/10 text-white text-xs hover:bg-white/15"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {sortedSeasons.length >
        0 && (
        <>
          {/* ALL SEASONS ARE ALWAYS VISIBLE HERE */}
          <div className="mb-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 overscroll-x-contain">
              {sortedSeasons.map(
                (entry) => {
                  const number =
                    Number(
                      entry
                        .season_number
                    );

                  const selected =
                    String(
                      number
                    ) ===
                    String(
                      season
                    );

                  return (
                    <button
                      type="button"
                      key={
                        number
                      }
                      onClick={() =>
                        setSeason(
                          String(
                            number
                          )
                        )
                      }
                      className={
                        "shrink-0 min-h-11 rounded-lg border px-3 py-2 text-left transition-colors " +
                        (selected
                          ? "bg-mg-green text-black border-mg-green"
                          : "bg-mg-card text-white/80 border-white/10 hover:border-mg-green/50 hover:text-white")
                      }
                    >
                      <span className="block text-xs sm:text-sm font-bold whitespace-nowrap">
                        Season{" "}
                        {
                          number
                        }
                      </span>

                      <span
                        className={
                          "block text-[10px] mt-0.5 whitespace-nowrap " +
                          (selected
                            ? "text-black/60"
                            : "text-white/40")
                        }
                      >
                        {Number(
                          entry
                            ?.episode_count ||
                            0
                        )}{" "}
                        episodes
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-white text-sm 3xl:text-base font-semibold">
                {currentSeason
                  ?.name ||
                  `Season ${season}`}
              </p>

              <p className="text-white/40 text-[10px] 3xl:text-xs">
                Choose an episode
                to play
              </p>
            </div>

            {seasonsLoading && (
              <span className="flex items-center gap-1.5 text-[10px] text-white/40">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating seasons
              </span>
            )}
          </div>

          {playError && (
            <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-200 text-xs">
              {
                playError
              }
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {Array.from({
                length: 4,
              }).map(
                (
                  _,
                  index
                ) => (
                  <div
                    key={
                      index
                    }
                    className="h-20 3xl:h-24 bg-mg-card rounded-lg animate-pulse"
                  />
                )
              )}
            </div>
          ) : (
            <div className="space-y-2 3xl:space-y-3">
              {episodes.map(
                (
                  episodeItem
                ) => {
                  const episodeNumber =
                    Number(
                      episodeItem
                        ?.episode_number
                    );

                  const isStarting =
                    playingEpisode ===
                    episodeNumber;

                  return (
                    <div
                      key={
                        episodeNumber
                      }
                      className="flex gap-3 3xl:gap-4 bg-mg-card border border-white/10 rounded-lg p-2 3xl:p-3 hover:border-mg-green/50 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          playEpisode(
                            episodeItem
                          )
                        }
                        disabled={
                          isStarting
                        }
                        className="relative w-24 sm:w-32 3xl:w-40 aspect-video rounded-md overflow-hidden bg-black shrink-0 group disabled:opacity-60"
                      >
                        {episodeItem
                          ?.still_url ? (
                          <Image
                            src={
                              episodeItem
                                .still_url
                            }
                            alt={
                              episodeItem?.name ||
                              `Episode ${episodeNumber}`
                            }
                            className="w-full h-full object-cover"
                            fittingType="fill"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px]">
                            No still
                          </div>
                        )}

                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 mg-hover-action transition-opacity">
                          <span className="w-8 h-8 3xl:w-10 3xl:h-10 rounded-full bg-mg-green text-black flex items-center justify-center">
                            {isStarting ? (
                              <Loader2 className="w-4 h-4 3xl:w-5 3xl:h-5 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4 3xl:w-5 3xl:h-5 fill-black" />
                            )}
                          </span>
                        </span>

                        <span className="absolute bottom-0.5 left-0.5 text-[10px] 3xl:text-xs font-bold bg-black/70 text-white px-1 rounded">
                          E
                          {
                            episodeNumber
                          }
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          playEpisode(
                            episodeItem
                          )
                        }
                        disabled={
                          isStarting
                        }
                        className="flex-1 min-w-0 text-left disabled:opacity-60"
                      >
                        <p className="text-white text-sm 3xl:text-base font-medium">
                          Episode{" "}
                          {
                            episodeNumber
                          }
                          {episodeItem
                            ?.name
                            ? ` — ${episodeItem.name}`
                            : ""}
                        </p>

                        <p className="text-white/40 text-xs 3xl:text-sm flex flex-wrap items-center gap-1 mt-0.5">
                          {episodeItem
                            ?.air_date && (
                            <>
                              <Calendar className="w-3 h-3 3xl:w-4 3xl:h-4" />

                              {
                                episodeItem
                                  .air_date
                              }
                            </>
                          )}

                          {episodeItem
                            ?.runtime && (
                            <>
                              <span>
                                •
                              </span>

                              <span>
                                {
                                  episodeItem
                                    .runtime
                                }
                                m
                              </span>
                            </>
                          )}
                        </p>

                        <p className="text-white/50 text-xs 3xl:text-sm mt-1 line-clamp-2">
                          {episodeItem
                            ?.overview ||
                            "No description."}
                        </p>
                      </button>
                    </div>
                  );
                }
              )}

              {episodes.length ===
                0 && (
                <div className="bg-mg-card border border-white/10 rounded-lg p-3">
                  <p className="text-white/50 text-xs">
                    {episodeError ||
                      "No episodes found for this season."}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setReloadNonce(
                        (
                          value
                        ) =>
                          value +
                          1
                      )
                    }
                    className="mt-2 flex items-center gap-1.5 text-xs text-mg-green"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
