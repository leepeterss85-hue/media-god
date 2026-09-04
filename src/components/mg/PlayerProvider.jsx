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

const unwrap = (response) =>
  response?.data ??
  response ??
  {};

const getSourceUrl = (item) =>
  String(
    item?.src ||
      item?.url ||
      item?.magnet ||
      item?.magnetLink ||
      ""
  ).trim();

const isMagnetSource = (item) => {
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

const isDirectSource = (item) => {
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

const scoreSource = (item) => {
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

  const directBonus =
    isDirectSource(
      item
    )
      ? 5000
      : 0;

  const rdLibraryBonus =
    item?.viaRealDebrid
      ? 20000
      : 0;

  return (
    rdLibraryBonus +
    directBonus +
    resolution -
    foreignPenalty
  );
};

const sortSources = (items) =>
  [...items].sort(
    (a, b) =>
      scoreSource(
        b
      ) -
      scoreSource(
        a
      )
  );

const dedupeSources = (items) => {
  const seen =
    new Set();

  return items.filter(
    (item) => {
      if (!item) {
        return false;
      }

      const key =
        getSourceUrl(
          item
        ) ||
        `${item?.type || ""}:${item?.label || ""}`;

      if (
        !key ||
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

const normaliseOriginalSource =
  (item) => {
    if (!item) {
      return null;
    }

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
        // Continue to title lookup.
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
            String(
              year
            )
          );
        } else {
          query.set(
            "year",
            String(
              year
            )
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

      if (
        !match?.id
      ) {
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

const fetchAddonSources =
  async ({
    imdbId,
    mediaType,
    season,
    episode,
  }) => {
    if (!imdbId) {
      return {
        streams: [],

        diagnostics: [],

        addonsChecked:
          0,

        reason:
          "No IMDb id was available for source discovery.",
      };
    }

    try {
      const response =
        await base44.functions.invoke(
          "fetchAddonStreams",
          {
            imdb_id:
              imdbId,

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
        unwrap(
          response
        );

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

        addonsChecked:
          0,

        reason:
          error?.message ||
          "Configured source lookup failed.",
      };
    }
  };

const findRdLibrarySource =
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
          "realDebrid",
          {
            action:
              "find_cached",

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
        unwrap(
          response
        );

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
      // Other sources may still work.
    }

    return null;
  };

const orderSources =
  ({
    sources,
    hasRd,
    preferRd,
  }) => {
    const usable =
      hasRd
        ? sources
        : sources.filter(
            (item) =>
              !isMagnetSource(
                item
              )
          );

    const rdLibrary =
      usable.filter(
        (item) =>
          item
            ?.viaRealDebrid &&
          isDirectSource(
            item
          )
      );

    const direct =
      usable.filter(
        (item) =>
          !item
            ?.viaRealDebrid &&
          isDirectSource(
            item
          )
      );

    const rdMagnets =
      hasRd
        ? usable.filter(
            isMagnetSource
          )
        : [];

    const live =
      usable.filter(
        (item) =>
          item?.type ===
            "live" ||
          item?.live
      );

    const youtube =
      usable.filter(
        (item) =>
          item?.type ===
          "youtube"
      );

    const providers =
      usable.filter(
        (item) =>
          item?.type ===
          "provider"
      );

    const other =
      usable.filter(
        (item) =>
          !rdLibrary.includes(
            item
          ) &&
          !direct.includes(
            item
          ) &&
          !rdMagnets.includes(
            item
          ) &&
          !live.includes(
            item
          ) &&
          !youtube.includes(
            item
          ) &&
          !providers.includes(
            item
          )
      );

    if (
      preferRd
    ) {
      return [
        ...rdLibrary,

        ...sortSources(
          rdMagnets
        ),

        ...sortSources(
          direct
        ),

        ...live,

        ...other,

        ...youtube,

        ...providers,
      ];
    }

    return [
      ...rdLibrary,

      ...sortSources(
        direct
      ),

      ...sortSources(
        rdMagnets
      ),

      ...live,

      ...other,

      ...youtube,

      ...providers,
    ];
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
            ? request.sources
                .map(
                  normaliseOriginalSource
                )
                .filter(
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

        const addonPromise =
          !isLive &&
          !request?.skipAddonLookup
            ? fetchAddonSources(
                {
                  imdbId,

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

        const rdLibraryPromise =
          !isLive &&
          hasRd &&
          !request?.noRd &&
          !request?.skipRdLookup
            ? findRdLibrarySource(
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
          rdLibrarySource,
        ] =
          await Promise.all(
            [
              addonPromise,

              rdLibraryPromise,
            ]
          );

        const combined =
          dedupeSources(
            [
              ...(rdLibrarySource
                ? [
                    rdLibrarySource,
                  ]
                : []),

              ...(
                addonLookup
                  ?.streams ||
                []
              ),

              ...originalSources,
            ]
          );

        let orderedSources =
          orderSources({
            sources:
              combined,

            hasRd,

            preferRd:
              Boolean(
                request?.preferRd
              ),
          });

        if (
          orderedSources.length ===
          0
        ) {
          orderedSources = [
            {
              label:
                addonLookup
                  ?.reason ||
                "No playable source was returned for this title.",

              type:
                "status",

              src:
                "",

              url:
                "",
            },
          ];
        }

        const primary =
          orderedSources[0] ||
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
            orderedSources,

          src:
            activeUrl,

          url:
            activeUrl,

          hasRd,

          sourceDiagnostics: {
            addonsChecked:
              Number(
                addonLookup
                  ?.addonsChecked ||
                  0
              ),

            diagnostics:
              addonLookup
                ?.diagnostics ||
              [],

            reason:
              addonLookup
                ?.reason ||
              "",

            discoveredCount:
              Array.isArray(
                addonLookup
                  ?.streams
              )
                ? addonLookup
                    .streams
                    .length
                : 0,
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
      value={
        value
      }
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

  if (
    !context
  ) {
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

  if (
    trailerUrl
  ) {
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
