import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Film,
  Loader2,
  Search,
  Tv,
  X,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";

const RECENT_KEY =
  "mg_recent_searches_v2";

const loadRecent = () => {
  try {
    const parsed =
      JSON.parse(
        window.localStorage.getItem(
          RECENT_KEY
        ) ||
          "[]"
      );

    return Array.isArray(
      parsed
    )
      ? parsed
          .filter(
            Boolean
          )
          .slice(
            0,
            8
          )
      : [];
  } catch {
    return [];
  }
};

const saveRecent = (
  value
) => {
  const query =
    String(
      value || ""
    ).trim();

  if (!query) {
    return;
  }

  try {
    const current =
      loadRecent();

    const next = [
      query,

      ...current.filter(
        (
          item
        ) =>
          item.toLowerCase() !==
          query.toLowerCase()
      ),
    ].slice(
      0,
      8
    );

    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(
        next
      )
    );
  } catch {
    /*
     * Local storage can be
     * unavailable in restricted
     * WebViews.
     */
  }
};

const resultScore = (
  result,
  query
) => {
  const title =
    String(
      result?.title ||
        ""
    ).toLowerCase();

  const needle =
    String(
      query || ""
    )
      .trim()
      .toLowerCase();

  let score =
    Number(
      result?.vote_average ||
        0
    );

  if (!needle) {
    return score;
  }

  if (
    title ===
    needle
  ) {
    score +=
      1000;
  } else if (
    title.startsWith(
      needle
    )
  ) {
    score +=
      500;
  } else if (
    title.includes(
      needle
    )
  ) {
    score +=
      150;
  }

  if (
    result?.poster_url
  ) {
    score +=
      10;
  }

  return score;
};

export default function SearchDialog({
  open,
  onOpenChange,
  onSelect,
}) {
  const [
    query,
    setQuery,
  ] = useState("");

  const [
    results,
    setResults,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    filter,
    setFilter,
  ] = useState(
    "all"
  );

  const [
    recent,
    setRecent,
  ] = useState([]);

  const cacheRef =
    useRef(
      new Map()
    );

  const resultRefs =
    useRef([]);

  const search =
    useCallback(
      async (
        value
      ) => {
        const clean =
          String(
            value ||
              ""
          ).trim();

        if (
          clean.length <
          2
        ) {
          setResults(
            []
          );

          setLoading(
            false
          );

          return;
        }

        const cacheKey =
          clean.toLowerCase();

        const cached =
          cacheRef.current.get(
            cacheKey
          );

        /*
         * Stop repeatedly hitting the
         * backend for the same query.
         */
        if (
          cached &&
          Date.now() -
            cached.at <
            5 *
              60 *
              1000
        ) {
          setResults(
            cached.items
          );

          setLoading(
            false
          );

          return;
        }

        setLoading(
          true
        );

        try {
          const response =
            await base44.functions.invoke(
              "getTmdbMovies",
              {
                multi_search:
                  clean,
              }
            );

          const items =
            Array.isArray(
              response.data
                ?.movies
            )
              ? response.data.movies
              : [];

          cacheRef.current.set(
            cacheKey,
            {
              at:
                Date.now(),

              items,
            }
          );

          setResults(
            items
          );
        } catch {
          setResults(
            []
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );

  useEffect(() => {
    const timer =
      setTimeout(
        () =>
          search(
            query
          ),
        250
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [
    query,
    search,
  ]);

  useEffect(() => {
    if (open) {
      setRecent(
        loadRecent()
      );

      return;
    }

    setQuery(
      ""
    );

    setResults(
      []
    );

    setFilter(
      "all"
    );
  }, [
    open,
  ]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKey = (
      event
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        onOpenChange(
          false
        );
      }
    };

    window.addEventListener(
      "keydown",
      onKey
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKey
      );
  }, [
    open,
    onOpenChange,
  ]);

  const filteredResults =
    useMemo(
      () => {
        const clean =
          String(
            query ||
              ""
          ).trim();

        return [
          ...results,
        ]
          .filter(
            (
              result
            ) => {
              if (
                filter ===
                "all"
              ) {
                return true;
              }

              return (
                String(
                  result
                    ?.media_type ||
                    ""
                ) ===
                filter
              );
            }
          )
          .sort(
            (
              a,
              b
            ) =>
              resultScore(
                b,
                clean
              ) -
              resultScore(
                a,
                clean
              )
          );
      },
      [
        results,
        filter,
        query,
      ]
    );

  if (!open) {
    return null;
  }

  const choose = (
    result
  ) => {
    saveRecent(
      query ||
        result?.title
    );

    setRecent(
      loadRecent()
    );

    onSelect(
      result
    );

    onOpenChange(
      false
    );

    setQuery(
      ""
    );

    setResults(
      []
    );
  };

  const useRecent = (
    value
  ) => {
    setQuery(
      value
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-start justify-center sm:pt-[7vh] 3xl:pt-[9vh] p-0 sm:px-4"
      onClick={() =>
        onOpenChange(
          false
        )
      }
    >
      <div
        className="w-full sm:max-w-2xl 3xl:max-w-4xl 4xl:max-w-5xl max-h-[92svh] sm:max-h-[84vh] bg-mg-surface border border-white/10 rounded-t-2xl sm:rounded-xl 3xl:rounded-2xl overflow-hidden shadow-2xl mg-safe-bottom"
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-center gap-3 3xl:gap-4 px-4 sm:px-5 3xl:px-7 py-3.5 3xl:py-5 border-b border-white/10">
          <Search className="w-5 h-5 3xl:w-6 3xl:h-6 4xl:w-7 4xl:h-7 text-white/40 shrink-0" />

          <input
            value={
              query
            }
            onChange={(
              event
            ) =>
              setQuery(
                event.target
                  .value
              )
            }
            onKeyDown={(
              event
            ) => {
              if (
                event.key ===
                  "ArrowDown" &&
                filteredResults.length >
                  0
              ) {
                event.preventDefault();

                resultRefs.current[
                  0
                ]?.focus?.();
              }
            }}
            placeholder="Search movies, TV shows..."
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-white text-base sm:text-lg 3xl:text-xl 4xl:text-2xl placeholder:text-white/30"
            autoFocus
          />

          <button
            type="button"
            onClick={() => {
              if (
                query
              ) {
                setQuery(
                  ""
                );

                setResults(
                  []
                );
              } else {
                onOpenChange(
                  false
                );
              }
            }}
            className="w-10 h-10 3xl:w-12 3xl:h-12 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 shrink-0"
            aria-label={
              query
                ? "Clear search"
                : "Close search"
            }
          >
            <X className="w-5 h-5 3xl:w-6 3xl:h-6" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 sm:px-5 3xl:px-7 py-2.5 border-b border-white/5 overflow-x-auto">
          {[
            [
              "all",
              "All",
            ],

            [
              "movie",
              "Movies",
            ],

            [
              "tv",
              "TV Shows",
            ],
          ].map(
            ([
              value,
              label,
            ]) => (
              <button
                key={
                  value
                }
                type="button"
                onClick={() =>
                  setFilter(
                    value
                  )
                }
                className={
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                  (
                    filter ===
                    value
                      ? "border-mg-green/40 bg-mg-green/15 text-mg-green"
                      : "border-white/10 bg-white/5 text-white/55 hover:text-white"
                  )
                }
              >
                {
                  label
                }
              </button>
            )
          )}
        </div>

        <div className="max-h-[72svh] sm:max-h-[65vh] overflow-y-auto overscroll-contain">
          {loading && (
            <div className="p-8 3xl:p-12 text-center text-white/40 flex items-center justify-center gap-2 3xl:text-lg">
              <Loader2 className="w-4 h-4 3xl:w-6 3xl:h-6 animate-spin" />

              Searching...
            </div>
          )}

          {!loading &&
            query.trim()
              .length ===
              1 && (
              <div className="p-8 text-center text-white/35 text-sm">
                Type one more character to search.
              </div>
            )}

          {!loading &&
            query.trim()
              .length >=
              2 &&
            filteredResults.length ===
              0 && (
              <div className="p-8 3xl:p-12 text-center text-white/40 text-sm 3xl:text-lg">
                No{" "}
                {filter ===
                "movie"
                  ? "movies"
                  : filter ===
                      "tv"
                    ? "TV shows"
                    : "results"}{" "}
                found for
                &quot;
                {
                  query
                }
                &quot;
              </div>
            )}

          {!loading &&
            filteredResults.length >
              0 && (
              <div className="divide-y divide-white/5">
                {filteredResults.map(
                  (
                    result,
                    index
                  ) => (
                    <button
                      ref={(
                        node
                      ) => {
                        resultRefs.current[
                          index
                        ] =
                          node;
                      }}
                      type="button"
                      key={`${result.media_type}-${result.id}`}
                      onClick={() =>
                        choose(
                          result
                        )
                      }
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                          "ArrowDown"
                        ) {
                          event.preventDefault();

                          resultRefs.current[
                            index +
                              1
                          ]?.focus?.();
                        }

                        if (
                          event.key ===
                          "ArrowUp"
                        ) {
                          event.preventDefault();

                          resultRefs.current[
                            index -
                              1
                          ]?.focus?.();
                        }
                      }}
                      className="w-full flex items-center gap-3 sm:gap-4 3xl:gap-5 p-3 sm:p-4 3xl:p-5 hover:bg-white/5 focus:bg-white/5 focus:outline-none transition-colors text-left min-h-[78px] 3xl:min-h-[104px]"
                    >
                      <div className="w-11 h-16 sm:w-12 sm:h-17 3xl:w-16 3xl:h-24 4xl:w-20 4xl:h-28 rounded-md 3xl:rounded-lg overflow-hidden bg-mg-card shrink-0">
                        {result.poster_url ? (
                          <Image
                            src={
                              result.poster_url
                            }
                            alt={
                              result.title
                            }
                            className="w-full h-full object-cover"
                            fittingType="fill"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/30">
                            {result.media_type ===
                            "movie" ? (
                              <Film className="w-5 h-5 3xl:w-7 3xl:h-7" />
                            ) : (
                              <Tv className="w-5 h-5 3xl:w-7 3xl:h-7" />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm sm:text-base 3xl:text-xl 4xl:text-2xl truncate">
                          {
                            result.title
                          }
                        </p>

                        <div className="flex flex-wrap items-center gap-2 3xl:gap-3 text-xs 3xl:text-base text-white/40 mt-1">
                          <span className="capitalize">
                            {result.media_type ===
                            "tv"
                              ? "TV"
                              : "Movie"}
                          </span>

                          {result.year && (
                            <>
                              <span>
                                •
                              </span>

                              <span>
                                {
                                  result.year
                                }
                              </span>
                            </>
                          )}

                          {result.vote_average >
                            0 && (
                            <>
                              <span>
                                •
                              </span>

                              <span>
                                ★{" "}
                                {Number(
                                  result.vote_average
                                ).toFixed(
                                  1
                                )}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                )}
              </div>
            )}

          {!loading &&
            !query && (
              <div className="p-6 3xl:p-10">
                {recent.length >
                0 ? (
                  <>
                    <p className="text-xs 3xl:text-base font-semibold uppercase tracking-wide text-white/40 mb-3">
                      Recent searches
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {recent.map(
                        (
                          item
                        ) => (
                          <button
                            key={
                              item
                            }
                            type="button"
                            onClick={() =>
                              useRecent(
                                item
                              )
                            }
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs 3xl:text-base text-white/65 hover:border-mg-green/40 hover:text-mg-green"
                          >
                            {
                              item
                            }
                          </button>
                        )
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-4 text-center text-white/40 text-sm 3xl:text-lg">
                    Start typing to search movies and TV shows.
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
