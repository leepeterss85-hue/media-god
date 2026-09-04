import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { base44 } from "@/api/base44Client";
import VideoPlayer from "@/components/mg/VideoPlayer";

const PlayerContext =
  createContext(null);

const TMDB_KEY =
  "38267272847a9ef3878b273b37963d76";

const FOREIGN_RE =
  /(truefrench|vostfr|vost|subfrench|\bvf\b|\bvff\b|\bvfi\b|french|spanish|german|italian|\bdubbed\b)/i;

const RES_RE =
  /(2160|1080|720|480)p/i;

const getSourceUrl = (
  item
) =>
  String(
    item?.src ||
      item?.url ||
      item?.magnet ||
      item?.magnetLink ||
      ""
  ).trim();

const isMagnetSource = (
  item
) => {
  const value =
    getSourceUrl(
      item
    ).toLowerCase();

  return (
    item?.type ===
      "rd" ||
    item?.type ===
      "rd_torrent" ||
    item?.type ===
      "magnet" ||
    item?.type ===
      "torrent" ||
    value.startsWith(
      "magnet:"
    )
  );
};

const isDirectSource = (
  item
) => {
  const value =
    getSourceUrl(
      item
    );

  return (
    /^https?:\/\//i.test(
      value
    ) &&
    !isMagnetSource(
      item
    ) &&
    item?.type !==
      "provider" &&
    item?.type !==
      "youtube"
  );
};

const scoreSource = (
  item
) => {
  const label =
    String(
      item?.label ||
        item?.name ||
        ""
    );

  const resolution =
    Number(
      (
        label.match(
          RES_RE
        ) ||
        []
      )[1] ||
        0
    );

  const foreignPenalty =
    FOREIGN_RE.test(
      label
    )
      ? 10000
      : 0;

  const cachedBonus =
    item?.viaRealDebrid
      ? 20000
      : 0;

  const directBonus =
    isDirectSource(
      item
    )
      ? 5000
      : 0;

  return (
    cachedBonus +
    directBonus +
    resolution -
    foreignPenalty
  );
};

const sortSources = (
  items
) =>
  [...items].sort(
    (
      a,
      b
    ) =>
      scoreSource(
        b
      ) -
      scoreSource(
        a
      )
  );

const dedupeSources = (
  items
) => {
  const seen =
    new Set();

  return items.filter(
    (item) => {
      if (!item) {
        return false;
      }

      const url =
        getSourceUrl(
          item
        );

      if (!url) {
        return (
          item?.type ===
            "provider" ||
          item?.type ===
            "youtube"
        );
      }

      if (
        seen.has(
          url
        )
      ) {
        return false;
      }

      seen.add(
        url
      );

      return true;
    }
  );
};

const resolveImdbId =
  async ({
    id,
    imdbId,
    imdb_id,
    mediaType,
    title,
    year,
  }) => {
    if (
      imdbId ||
      imdb_id
    ) {
      return (
        imdbId ||
        imdb_id
      );
    }

    if (
      id &&
      String(
        id
      ).startsWith(
        "tt"
      )
    ) {
      return String(
        id
      );
    }

    const tmdbType =
      mediaType ===
      "tv"
        ? "tv"
        : "movie";

    if (
      id != null &&
      !Number.isNaN(
        Number(
          id
        )
      )
    ) {
      try {
        const response =
          await fetch(
            `https://api.themoviedb.org/3/${tmdbType}/${id}/external_ids?api_key=${TMDB_KEY}`
          );

        if (
          response.ok
        ) {
          const data =
            await response.json();

          if (
            data?.imdb_id
          ) {
            return data.imdb_id;
          }
        }
      } catch {
        // Fall through to title search.
      }
    }

    if (!title) {
      return "";
    }

    try {
      const query =
        new URLSearchParams({
          api_key:
            TMDB_KEY,

          query:
            title,
        });

      if (year) {
        if (
          tmdbType ===
          "tv"
        ) {
          query.set(
            "first_air_date_year",
            String(year)
          );
        } else {
          query.set(
            "year",
            String(year)
          );
        }
      }

      const searchResponse =
        await fetch(
          `https://api.themoviedb.org/3/search/${tmdbType}?${query.toString()}`
        );

      if (
        !searchResponse.ok
      ) {
        return "";
      }

      const searchData =
        await searchResponse.json();

      const match =
        searchData?.results?.[0];

      if (!match?.id) {
        return "";
      }

      const externalResponse =
        await fetch(
          `https://api.themoviedb.org/3/${tmdbType}/${match.id}/external_ids?api_key=${TMDB_KEY}`
        );

      if (
        !externalResponse.ok
      ) {
        return "";
      }

      const externalData =
        await externalResponse.json();

      return (
        externalData?.imdb_id ||
        ""
      );
    } catch {
      return "";
    }
  };

const fetchAddonStreamsServer =
  async ({
    imdbId,
    title,
    mediaType,
    season,
    episode,
  }) => {
    if (
      !imdbId &&
      !title
    ) {
      return {
        streams: [],
        diagnostics: [],
        addonsChecked: 0,
        reason:
          "No IMDb id or title was available.",
      };
    }

    if (
      mediaType ===
        "tv" &&
      (
        season == null ||
        episode == null
      )
    ) {
      return {
        streams: [],
        diagnostics: [],
        addonsChecked: 0,
        reason:
          "Select a season and episode first.",
      };
    }

    try {
      const response =
        await base44.functions.invoke(
          "fetchAddonStreams",
          {
            imdb_id:
              imdbId ||
              "",

            title:
              title ||
              "",

            media_type:
              mediaType,

            ...(season != null
              ? {
                  season,
                }
              : {}),

            ...(episode != null
              ? {
                  episode,
                }
              : {}),
          }
        );

      const data =
        response?.data ||
        {};

      return {
        streams:
          Array.isArray(
            data?.streams
          )
            ? data.streams
            : [],

        diagnostics:
          Array.isArray(
            data?.diagnostics
          )
            ? data.diagnostics
            : [],

        addonsChecked:
          Number(
            data?.addons_checked ||
              0
          ),

        reason:
          data?.reason ||
          data?.error ||
          "",
      };
    } catch (error) {
      return {
        streams: [],
        diagnostics: [],
        addonsChecked: 0,

        reason:
          error?.message ||
          "Addon source lookup failed.",
      };
    }
  };

const findRealDebridSource =
  async ({
    title,
    year,
    season,
    episode,
  }) => {
    if (!title) {
      return null;
    }

    try {
      const response =
        await base44.functions.invoke(
          "findRdLibrary",
          {
            title,

            ...(year != null
              ? {
                  year,
                }
              : {}),

            ...(season != null
              ? {
                  season,
                }
              : {}),

            ...(episode != null
              ? {
                  episode,
                }
              : {}),
          }
        );

      const data =
        response?.data ||
        {};

      if (
        data?.status ===
          "ready" &&
        data?.stream_url
      ) {
        return {
          label:
            data?.filename ||
            "Real-Debrid Library",

          type:
            "url",

          src:
            data.stream_url,

          url:
            data.stream_url,

          addon:
            "Real-Debrid Library",

          viaRealDebrid:
            true,
        };
      }
    } catch {
      // Real-Debrid library lookup is optional.
    }

    return null;
  };

export function PlayerProvider({
  children,
}) {
  const [
    source,
    setSource,
  ] =
    useState(
      null
    );

  const [
    hasRd,
    setHasRd,
  ] =
    useState(
      false
    );

  useEffect(() => {
    let mounted =
      true;

    base44.auth
      .me()
      .then(
        (user) => {
          if (
            mounted
          ) {
            setHasRd(
              Boolean(
                user?.rd_token
              )
            );
          }
        }
      )
      .catch(() => {
        if (
          mounted
        ) {
          setHasRd(
            false
          );
        }
      });

    return () => {
      mounted =
        false;
    };
  }, []);

  const play =
    useCallback(
      async (
        request = {}
      ) => {
        const originalSources =
          Array.isArray(
            request?.sources
          )
            ? request.sources.filter(
                Boolean
              )
            : [];

        const isLive =
          request?.type ===
            "live" ||
          originalSources.some(
            (item) =>
              item?.live ||
              item?.type ===
                "live"
          );

        const mediaType =
          request?.mediaType ===
            "tv" ||
          request?.type ===
            "series" ||
          request?.season != null ||
          request?.episode != null ||
          request?.rdSeason != null ||
          request?.rdEpisode != null
            ? "tv"
            : "movie";

        const season =
          request?.season ??
          request?.rdSeason ??
          null;

        const episode =
          request?.episode ??
          request?.rdEpisode ??
          null;

        const imdbId =
          isLive
            ? request?.imdbId ||
              request?.imdb_id ||
              ""
            : await resolveImdbId(
                {
                  ...request,
                  mediaType,
                }
              );

        let sources =
          originalSources.map(
            (item) => {
              const url =
                getSourceUrl(
                  item
                );

              return {
                ...item,

                src:
                  item?.src ||
                  url,

                url:
                  item?.url ||
                  url,
              };
            }
          );

        const addonPromise =
          !isLive &&
          !request?.skipAddonLookup
            ? fetchAddonStreamsServer(
                {
                  imdbId,

                  title:
                    request?.title ||
                    "",

                  mediaType,
                  season,
                  episode,
                }
              )
            : Promise.resolve(
                {
                  streams: [],
                  diagnostics: [],
                  addonsChecked:
                    0,
                  reason:
                    "",
                }
              );

        const rdPromise =
          !isLive &&
          hasRd &&
          !request?.noRd &&
          !request?.skipRdLookup
            ? findRealDebridSource(
                {
                  title:
                    request?.rdTitle ||
                    request?.title ||
                    "",

                  year:
                    request?.rdYear ??
                    request?.year ??
                    null,

                  season,
                  episode,
                }
              )
            : Promise.resolve(
                null
              );

        const [
          addonLookup,
          rdSource,
        ] =
          await Promise.all(
            [
              addonPromise,
              rdPromise,
            ]
          );

        const addonSources =
          Array.isArray(
            addonLookup
              ?.streams
          )
            ? addonLookup
                .streams
            : [];

        sources =
          dedupeSources(
            [
              ...(rdSource
                ? [
                    rdSource,
                  ]
                : []),

              ...addonSources,

              ...sources,
            ]
          );

        const usableSources =
          hasRd
            ? sources
            : sources.filter(
                (item) =>
                  !isMagnetSource(
                    item
                  )
              );

        const rdReady =
          usableSources.filter(
            (item) =>
              item
                ?.viaRealDebrid &&
              isDirectSource(
                item
              )
          );

        const directSources =
          usableSources.filter(
            (item) =>
              !item
                ?.viaRealDebrid &&
              isDirectSource(
                item
              )
          );

        const rdSources =
          hasRd
            ? usableSources.filter(
                isMagnetSource
              )
            : [];

        const liveSources =
          usableSources.filter(
            (item) =>
              item?.type ===
                "live" ||
              item?.live
          );

        const trailerSources =
          usableSources.filter(
            (item) =>
              item?.type ===
              "youtube"
          );

        const providerSources =
          usableSources.filter(
            (item) =>
              item?.type ===
              "provider"
          );

        const otherSources =
          usableSources.filter(
            (item) =>
              !rdReady.includes(
                item
              ) &&
              !directSources.includes(
                item
              ) &&
              !rdSources.includes(
                item
              ) &&
              !liveSources.includes(
                item
              ) &&
              !trailerSources.includes(
                item
              ) &&
              !providerSources.includes(
                item
              )
          );

        const preferRd =
          Boolean(
            request?.preferRd
          );

        const orderedSources =
          preferRd
            ? [
                ...rdReady,

                ...sortSources(
                  rdSources
                ),

                ...sortSources(
                  directSources
                ),

                ...liveSources,

                ...otherSources,

                ...trailerSources,

                ...providerSources,
              ]
            : [
                ...rdReady,

                ...sortSources(
                  directSources
                ),

                ...sortSources(
                  rdSources
                ),

                ...liveSources,

                ...otherSources,

                ...trailerSources,

                ...providerSources,
              ];

        const hasPlaybackSource =
          orderedSources.some(
            (item) =>
              isDirectSource(
                item
              ) ||
              isMagnetSource(
                item
              ) ||
              item?.type ===
                "live" ||
              item?.live
          );

        const allowNonPlaybackFallback =
          Boolean(
            request
              ?.allowNonPlaybackFallback
          );

        if (
          orderedSources.length ===
            0 &&
          !allowNonPlaybackFallback
        ) {
          console.warn(
            "[Media God] No source found",
            {
              title:
                request?.title,

              imdbId,
              mediaType,
              season,
              episode,

              addonsChecked:
                addonLookup
                  ?.addonsChecked ||
                0,

              addonReason:
                addonLookup
                  ?.reason ||
                "",
            }
          );

          return false;
        }

        const finalSources =
          hasPlaybackSource
            ? orderedSources
            : [
                {
                  label:
                    addonLookup
                      ?.reason ||
                    "No full playback source was found",

                  type:
                    "status",

                  src:
                    "",

                  url:
                    "",
                },

                ...orderedSources,
              ];

        const primary =
          finalSources[0] ||
          {};

        const activeUrl =
          getSourceUrl(
            primary
          );

        setSource({
          ...request,

          id:
            request?.id,

          imdbId,

          title:
            request?.title ||
            "Video",

          poster:
            request?.poster ||
            request?.poster_url ||
            "",

          year:
            request?.year,

          mediaType,
          season,
          episode,

          rdTitle:
            request?.rdTitle ||
            request?.title ||
            "",

          rdYear:
            request?.rdYear ??
            request?.year ??
            null,

          rdSeason:
            request?.rdSeason ??
            season,

          rdEpisode:
            request?.rdEpisode ??
            episode,

          sources:
            finalSources,

          src:
            activeUrl,

          url:
            activeUrl,

          hasRd,

          sourceDiagnostics:
            {
              addonsChecked:
                addonLookup
                  ?.addonsChecked ||
                0,

              diagnostics:
                addonLookup
                  ?.diagnostics ||
                [],

              reason:
                addonLookup
                  ?.reason ||
                "",

              discoveredCount:
                addonSources.length,
            },
        });

        return true;
      },
      [
        hasRd,
      ]
    );

  const close =
    useCallback(
      () => {
        setSource(
          null
        );
      },
      []
    );

  const value =
    useMemo(
      () => ({
        play,
        close,
        hasRd,
      }),
      [
        play,
        close,
        hasRd,
      ]
    );

  return (
    <PlayerContext.Provider
      value={value}
    >
      {children}

      {source && (
        <VideoPlayer
          source={
            source
          }
          onClose={
            close
          }
        />
      )}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context =
    useContext(
      PlayerContext
    );

  if (!context) {
    throw new Error(
      "usePlayer must be used within a PlayerProvider"
    );
  }

  return context;
}

usePlayer.displayName =
  "usePlayer";

export const DEMO_VIDEO =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export function buildMediaSources({
  trailerUrl,
  providers,
}) {
  const sources =
    [];

  if (trailerUrl) {
    sources.push({
      label:
        "Trailer",

      type:
        "youtube",

      src:
        trailerUrl,

      url:
        trailerUrl,
    });
  }

  (
    providers ||
    []
  ).forEach(
    (provider) => {
      if (
        !provider?.link
      ) {
        return;
      }

      sources.push({
        label:
          provider?.name ||
          "Provider",

        type:
          "provider",

        src:
          provider.link,

        url:
          provider.link,

        logo:
          provider.logo,

        tier:
          provider.tier,
      });
    }
  );

  return sources;
}
