import React, {
  useCallback,
  useEffect,
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

const TMDB_IMAGE_BASE =
  "https://image.tmdb.org/t/p/w500";

const normaliseMediaType = (
  value,
  item = {}
) => {
  const type = String(
    value || ""
  ).toLowerCase();

  if (
    type === "tv" ||
    type === "series" ||
    type === "show"
  ) {
    return "tv";
  }

  if (
    type === "movie" ||
    type === "film"
  ) {
    return "movie";
  }

  if (
    item?.first_air_date ||
    item?.firstAirDate
  ) {
    return "tv";
  }

  if (
    item?.release_date ||
    item?.releaseDate
  ) {
    return "movie";
  }

  if (
    item?.name &&
    !item?.title
  ) {
    return "tv";
  }

  return "";
};

const posterUrl = (
  item
) => {
  const value = String(
    item?.poster_url ||
      item?.posterUrl ||
      item?.poster_path ||
      item?.posterPath ||
      ""
  ).trim();

  if (!value) {
    return "";
  }

  if (
    /^https?:\/\//i.test(
      value
    )
  ) {
    return value;
  }

  return `${TMDB_IMAGE_BASE}${
    value.startsWith("/")
      ? value
      : `/${value}`
  }`;
};

const normaliseSearchResult = (
  item
) => {
  if (
    !item ||
    item?.id == null
  ) {
    return null;
  }

  const mediaType =
    normaliseMediaType(
      item?.media_type ||
        item?.mediaType ||
        item?.type,
      item
    );

  /*
   * TMDB multi-search also returns people.
   *
   * Media God DetailModal supports movies and TV shows,
   * so never hand unsupported result types to it.
   */
  if (!mediaType) {
    return null;
  }

  const title = String(
    item?.title ||
      item?.name ||
      item?.original_title ||
      item?.original_name ||
      "Untitled"
  ).trim();

  const date = String(
    item?.release_date ||
      item?.first_air_date ||
      item?.date ||
      ""
  );

  const year =
    item?.year ||
    (
      /^\d{4}/.test(
        date
      )
        ? date.slice(
            0,
            4
          )
        : ""
    );

  return {
    ...item,

    id:
      item.id,

    title,

    name:
      item?.name ||
      title,

    media_type:
      mediaType,

    mediaType,

    year:
      year
        ? String(
            year
          )
        : "",

    poster_url:
      posterUrl(
        item
      ),

    description:
      item?.description ||
      item?.overview ||
      "",

    vote_average:
      Number(
        item?.vote_average ||
          item?.rating ||
          0
      ),
  };
};

const extractResults = (
  response
) => {
  const data =
    response?.data ||
    {};

  const raw =
    Array.isArray(
      data?.movies
    )
      ? data.movies
      : Array.isArray(
            data?.results
          )
        ? data.results
        : Array.isArray(
              data
            )
          ? data
          : [];

  const seen =
    new Set();

  return raw
    .map(
      normaliseSearchResult
    )
    .filter(
      Boolean
    )
    .filter(
      (item) => {
        const key =
          `${item.media_type}:${item.id}`;

        if (
          seen.has(
            key
          )
        ) {
          return false;
        }

        seen.add(
          key
        );

        return true;
      }
    );
};

export default function SearchDialog({
  open,
  onOpenChange,
  onSelect,
}) {
  const [
    query,
    setQuery,
  ] = useState(
    ""
  );

  const [
    results,
    setResults,
  ] = useState(
    []
  );

  const [
    loading,
    setLoading,
  ] = useState(
    false
  );

  const [
    error,
    setError,
  ] = useState(
    ""
  );

  const requestRef =
    useRef(
      0
    );

  const inputRef =
    useRef(
      null
    );

  const search =
    useCallback(
      async (
        value
      ) => {
        const cleanQuery =
          String(
            value ||
              ""
          ).trim();

        const requestId =
          ++requestRef.current;

        if (
          !cleanQuery
        ) {
          setResults(
            []
          );

          setLoading(
            false
          );

          setError(
            ""
          );

          return;
        }

        setLoading(
          true
        );

        setError(
          ""
        );

        try {
          const response =
            await base44.functions.invoke(
              "getTmdbMovies",
              {
                multi_search:
                  cleanQuery,
              }
            );

          if (
            requestId !==
            requestRef.current
          ) {
            return;
          }

          setResults(
            extractResults(
              response
            )
          );
        } catch (
          searchError
        ) {
          if (
            requestId !==
            requestRef.current
          ) {
            return;
          }

          setResults(
            []
          );

          setError(
            searchError?.message ||
              "Search could not be completed."
          );
        } finally {
          if (
            requestId ===
            requestRef.current
          ) {
            setLoading(
              false
            );
          }
        }
      },
      []
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () =>
            search(
              query
            ),
          180
        );

      return () =>
        window.clearTimeout(
          timer
        );
    },
    [
      query,
      search,
    ]
  );

  useEffect(
    () => {
      if (!open) {
        requestRef.current +=
          1;

        setQuery(
          ""
        );

        setResults(
          []
        );

        setLoading(
          false
        );

        setError(
          ""
        );

        return;
      }

      const timer =
        window.setTimeout(
          () => {
            try {
              inputRef.current?.focus?.();
            } catch {
              /*
               * Focus is optional on
               * Android / Fire TV.
               */
            }
          },
          60
        );

      return () =>
        window.clearTimeout(
          timer
        );
    },
    [
      open,
    ]
  );

  useEffect(
    () => {
      if (!open) {
        return undefined;
      }

      const onKey =
        (
          event
        ) => {
          if (
            event.key ===
            "Escape"
          ) {
            event.preventDefault();

            onOpenChange(
              false
            );
          }
        };

      window.addEventListener(
        "keydown",
        onKey
      );

      return () => {
        window.removeEventListener(
          "keydown",
          onKey
        );
      };
    },
    [
      open,
      onOpenChange,
    ]
  );

  if (!open) {
    return null;
  }

  const choose =
    (
      rawResult
    ) => {
      const result =
        normaliseSearchResult(
          rawResult
        );

      if (
        !result
      ) {
        setError(
          "That search result is not a movie or TV show."
        );

        return;
      }

      /*
       * Important on Android / Fire TV:
       *
       * Close the search overlay BEFORE
       * mounting DetailModal.
       *
       * This avoids two full-screen dialogs
       * existing during the same frame.
       */
      try {
        document
          .activeElement
          ?.blur?.();
      } catch {
        // Optional.
      }

      onOpenChange(
        false
      );

      window.requestAnimationFrame(
        () => {
          onSelect?.(
            result
          );
        }
      );
    };

  const close =
    () => {
      onOpenChange(
        false
      );
    };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search movies and TV shows"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-start justify-center sm:pt-[7vh] 3xl:pt-[9vh] p-0 sm:px-4"
      onClick={
        close
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
            ref={
              inputRef
            }
            value={
              query
            }
            onChange={(
              event
            ) =>
              setQuery(
                event
                  .target
                  .value
              )
            }
            placeholder="Search movies, TV shows..."
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-white text-base sm:text-lg 3xl:text-xl 4xl:text-2xl placeholder:text-white/30"
            autoComplete="off"
            aria-label="Search"
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

                setError(
                  ""
                );

                inputRef.current?.focus?.();
              } else {
                close();
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

        <div className="max-h-[75svh] sm:max-h-[68vh] overflow-y-auto overscroll-contain">
          {loading && (
            <div className="p-8 3xl:p-12 text-center text-white/40 flex items-center justify-center gap-2 3xl:text-lg">
              <Loader2 className="w-4 h-4 3xl:w-6 3xl:h-6 animate-spin" />

              Searching...
            </div>
          )}

          {!loading &&
            error && (
              <div className="p-6 3xl:p-10 text-center">
                <p className="text-sm 3xl:text-lg text-red-300">
                  {
                    error
                  }
                </p>
              </div>
            )}

          {!loading &&
            !error &&
            query &&
            results.length ===
              0 && (
              <div className="p-8 3xl:p-12 text-center text-white/40 text-sm 3xl:text-lg">
                No movie or TV results found for &quot;
                {
                  query
                }
                &quot;
              </div>
            )}

          {!loading &&
            !error &&
            results.length >
              0 && (
              <div className="divide-y divide-white/5">
                {results.map(
                  (
                    result
                  ) => (
                    <button
                      type="button"
                      key={`${result.media_type}-${result.id}`}
                      onClick={() =>
                        choose(
                          result
                        )
                      }
                      className="w-full flex items-center gap-3 sm:gap-4 3xl:gap-5 p-3 sm:p-4 3xl:p-5 hover:bg-white/5 focus:bg-white/10 focus:outline-none transition-colors text-left min-h-[78px] 3xl:min-h-[104px]"
                      aria-label={`Open ${result.title}`}
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
                          <span>
                            {result.media_type ===
                            "tv"
                              ? "TV show"
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
            !error &&
            !query && (
              <div className="p-8 3xl:p-12 text-center text-white/40 text-sm 3xl:text-lg">
                Start typing to search movies and TV shows
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
