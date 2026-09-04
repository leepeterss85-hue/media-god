import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { base44 } from "@/api/base44Client";

import {
  fetchBrowserAddonStreams,
  mergeAddonStreams,
  shouldUseBrowserAddonFallback,
} from "@/components/mg/addonBrowserFallback";

import VideoPlayer from "@/components/mg/VideoPlayer";

const PlayerContext = createContext(null);

const FOREIGN_RE =
  /(truefrench|vostfr|vost|subfrench|\bvf\b|\bvff\b|\bvfi\b|french|spanish|german|italian|\bdubbed\b|multi-audio|multiaudio|dual[ ._-]?audio)/i;

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
    item?.type === "rd" ||
    item?.type === "rd_torrent" ||
    item?.type === "magnet" ||
    item?.type === "torrent" ||
    value.startsWith("magnet:")
  );
};

const isDirectSource = (item) => {
  const value =
    getSourceUrl(item);

  return (
    /^https?:\/\//i.test(value) &&
    !isMagnetSource(item) &&
    item?.type !== "provider" &&
    item?.type !== "youtube"
  );
};

const normaliseSource = (item) => {
  if (!item) {
    return null;
  }

  const url =
    getSourceUrl(item);

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

const dedupeSources = (items) =>
  mergeAddonStreams(items);

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

  const rdLibraryBonus =
    item?.viaRealDebrid
      ? 20000
      : 0;

  const directBonus =
    isDirectSource(item)
      ? 5000
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
      scoreSource(b) -
      scoreSource(a)
  );

const resolveImdbInfo = async ({
  id,
  tmdbId,
  tmdb_id,
  imdbId,
  imdb_id,
  mediaType,
  title,
  year,
}) => {
  const supplied =
    String(
      imdbId ||
      imdb_id ||
      ""
    ).trim();

  if (
    /^tt\d+$/i.test(
      supplied
    )
  ) {
    return {
      imdbId:
        supplied,

      status:
        "OK",

      method:
        "supplied",

      error:
        "",
    };
  }

  if (
    id &&
    /^tt\d+$/i.test(
      String(id)
    )
  ) {
    return {
      imdbId:
        String(id),

      status:
        "OK",

      method:
        "item_id",

      error:
        "",
    };
  }

  try {
    const response =
      await base44.functions.invoke(
        "resolveImdb",
        {
          imdb_id:
            supplied,

          tmdb_id:
            tmdbId ??
            tmdb_id ??
            id ??
            "",

          title:
            title ||
            "",

          year:
            year ??
            "",

          media_type:
            mediaType ===
            "tv"
              ? "tv"
              : "movie",
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
      /^tt\d+$/i.test(
        resolved
      )
    ) {
      return {
        imdbId:
          resolved,

        status:
          "OK",

        method:
          data?.source ||
          "resolveImdb",

        error:
          "",
      };
    }

    return {
      imdbId:
        "",

      status:
        "FAILED",

      method:
        "resolveImdb",

      error:
        data?.error ||
        "IMDb id was not returned.",
    };
  } catch (error) {
    return {
      imdbId:
        "",

      status:
        "FAILED",

      method:
        "resolveImdb",

      error:
        error?.message ||
        "IMDb lookup call failed.",
    };
  }
};

const fetchServerAddonSources = async ({
  imdbId,
  tmdbId,
  title,
  year,
  mediaType,
  season,
  episode,
}) => {
  if (!imdbId) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      reason:
        "IMDb id could not be resolved for this title.",

      status:
        "BLOCKED",

      error:
        "IMDb missing",
    };
  }

  if (
    mediaType === "tv" &&
    (
      season == null ||
      episode == null
    )
  ) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      reason:
        "Select a season and episode first.",

      status:
        "BLOCKED",

      error:
        "Episode missing",
    };
  }

  try {
    const response =
      await base44.functions.invoke(
        "fetchAddonStreams",
        {
          imdb_id:
            imdbId,

          tmdb_id:
            tmdbId ??
            "",

          title:
            title ||
            "",

          year:
            year ??
            "",

          media_type:
            mediaType ===
            "tv"
              ? "tv"
              : "movie",

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

      status:
        data?.error
          ? "FAILED"
          : "OK",

      error:
        data?.error ||
        "",
    };
  } catch (error) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      reason:
        error?.message ||
        "Configured source lookup failed.",

      status:
        "FAILED",

      error:
        error?.message ||
        "fetchAddonStreams call failed.",
    };
  }
};

const fetchAddonSources = async (
  args
) => {
  const server =
    await fetchServerAddonSources(
      args
    );

  if (
    !shouldUseBrowserAddonFallback(
      server
    )
  ) {
    return {
      ...server,

      browserAttempted:
        false,

      browserRecovered:
        0,

      browserDiagnostics:
        [],
    };
  }

  const browser =
    await fetchBrowserAddonStreams({
      imdbId:
        args.imdbId,

      mediaType:
        args.mediaType,

      season:
        args.season,

      episode:
        args.episode,
    });

  const streams =
    mergeAddonStreams(
      server.streams,
      browser.streams
    );

  return {
    ...server,

    streams,

    diagnostics: [
      ...(
        server.diagnostics ||
        []
      ),

      ...(
        browser.diagnostics ||
        []
      ),
    ],

    addonsChecked:
      Math.max(
        Number(
          server.addonsChecked ||
          0
        ),

        Number(
          browser.addonsChecked ||
          0
        )
      ),

    status:
      streams.length > 0
        ? "OK"
        : server.status,

    reason:
      browser.streams
        ?.length > 0
        ? `Browser fallback recovered ${browser.streams.length} playable source${
            browser.streams.length ===
            1
              ? ""
              : "s"
          }.`
        : server.reason ||
          browser.error ||
          "",

    browserAttempted:
      Boolean(
        browser.attempted
      ),

    browserRecovered:
      Array.isArray(
        browser.streams
      )
        ? browser.streams.length
        : 0,

    browserDiagnostics:
      browser.diagnostics ||
      [],
  };
};

const findRdLibrarySource = async ({
  title,
  year,
  season,
  episode,
}) => {
  if (!title) {
    return {
      source:
        null,

      status:
        "SKIPPED",

      detail:
        "No title",
    };
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
        source: {
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
        },

        status:
          "FOUND",

        detail:
          "Library match ready",
      };
    }

    if (data?.error) {
      return {
        source:
          null,

        status:
          "FAILED",

        detail:
          data.error,
      };
    }

    return {
      source:
        null,

      status:
        "CONNECTED",

      detail:
        data?.status ||
        "No library match",
    };
  } catch (error) {
    return {
      source:
        null,

      status:
        "FAILED",

      detail:
        error?.message ||
        "Real-Debrid lookup failed.",
    };
  }
};

const orderSources = ({
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
        item?.viaRealDebrid &&
        isDirectSource(
          item
        )
    );

  const direct =
    usable.filter(
      (item) =>
        !item?.viaRealDebrid &&
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

  if (preferRd) {
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

const compactAddonDiagnostics = (
  diagnostics
) => {
  const browserRecovered =
    (
      diagnostics ||
      []
    ).filter(
      (item) =>
        item?.status ===
        "browser_ok"
    );

  if (
    browserRecovered.length >
    0
  ) {
    return browserRecovered
      .slice(
        0,
        4
      )
      .map(
        (item) =>
          `${String(
            item?.name ||
            "Addon"
          ).trim()}: ${Number(
            item?.playable_count ||
            0
          )} browser usable`
      )
      .join(
        " · "
      );
  }

  return (
    diagnostics ||
    []
  )
    .filter(
      (item) =>
        !item?.browser
    )
    .slice(
      0,
      4
    )
    .map(
      (item) => {
        const name =
          String(
            item?.name ||
            "Addon"
          ).trim();

        const status =
          String(
            item?.status ||
            "unknown"
          ).trim();

        const playable =
          Number(
            item?.playable_count ||
            0
          );

        if (
          status === "ok"
        ) {
          return `${name}: ${playable} usable`;
        }

        return `${name}: ${status}`;
      }
    )
    .join(
      " · "
    );
};

const buildDiagnosticLabel = ({
  imdbInfo,
  addonLookup,
  rdLookup,
  hasRd,
}) => {
  const parts = [];

  parts.push(
    imdbInfo?.imdbId
      ? `IMDb ${imdbInfo.imdbId} ✓`
      : "IMDb FAILED"
  );

  parts.push(
    addonLookup?.status ===
    "OK"
      ? "Source search ✓"
      : addonLookup?.status ===
          "BLOCKED"
        ? "Source search BLOCKED"
        : "Source search FAILED"
  );

  parts.push(
    `Addons ${Number(
      addonLookup?.addonsChecked ||
      0
    )}`
  );

  parts.push(
    `Returned ${
      Array.isArray(
        addonLookup?.streams
      )
        ? addonLookup
            .streams
            .length
        : 0
    }`
  );

  if (
    addonLookup
      ?.browserAttempted
  ) {
    parts.push(
      `Browser ${Number(
        addonLookup
          ?.browserRecovered ||
        0
      )}`
    );
  }

  parts.push(
    hasRd
      ? `RD ${
          rdLookup?.status ||
          "CONNECTED"
        }`
      : "RD NOT CONNECTED"
  );

  const addonDetails =
    compactAddonDiagnostics(
      addonLookup?.diagnostics
    );

  if (addonDetails) {
    parts.push(
      addonDetails
    );
  }

  const reason =
    addonLookup?.reason ||
    imdbInfo?.error ||
    rdLookup?.detail ||
    "No playable source was returned.";

  if (reason) {
    parts.push(
      reason
    );
  }

  return parts.join(
    " | "
  );
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
                  normaliseSource
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
          request?.season !=
            null ||
          request?.episode !=
            null ||
          request?.rdSeason !=
            null ||
          request?.rdEpisode !=
            null
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

        const tmdbId =
          request?.tmdbId ??
          request?.tmdb_id ??
          request?.id ??
          "";

        const imdbInfo =
          isLive
            ? {
                imdbId:
                  request?.imdbId ||
                  request?.imdb_id ||
                  "",

                status:
                  "SKIPPED",

                method:
                  "live",

                error:
                  "",
              }
            : await resolveImdbInfo(
                {
                  ...request,

                  tmdbId,

                  mediaType,
                }
              );

        const imdbId =
          imdbInfo.imdbId;

        const addonPromise =
          !isLive &&
          !request
            ?.skipAddonLookup
            ? fetchAddonSources(
                {
                  imdbId,

                  tmdbId,

                  title:
                    request?.rdTitle ||
                    request?.title ||
                    "",

                  year:
                    request?.rdYear ??
                    request?.year ??
                    "",

                  mediaType,

                  season,

                  episode,
                }
              )
            : Promise.resolve(
                {
                  streams:
                    [],

                  diagnostics:
                    [],

                  addonsChecked:
                    0,

                  reason:
                    "Source lookup skipped.",

                  status:
                    "SKIPPED",

                  error:
                    "",

                  browserAttempted:
                    false,

                  browserRecovered:
                    0,

                  browserDiagnostics:
                    [],
                }
              );

        const rdPromise =
          !isLive &&
          hasRd &&
          !request?.noRd &&
          !request
            ?.skipRdLookup
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
                {
                  source:
                    null,

                  status:
                    hasRd
                      ? "SKIPPED"
                      : "NOT CONNECTED",

                  detail:
                    hasRd
                      ? "RD lookup skipped"
                      : "No RD token",
                }
              );

        const [
          addonLookup,
          rdLookup,
        ] =
          await Promise.all(
            [
              addonPromise,

              rdPromise,
            ]
          );

        const combined =
          dedupeSources(
            [
              ...(rdLookup
                ?.source
                ? [
                    rdLookup
                      .source,
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
                request
                  ?.preferRd
              ),
          });

        const playbackSources =
          orderedSources.filter(
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

        const nonPlaybackSources =
          orderedSources.filter(
            (item) =>
              !playbackSources.includes(
                item
              )
          );

        const diagnosticLabel =
          buildDiagnosticLabel(
            {
              imdbInfo,

              addonLookup,

              rdLookup,

              hasRd,
            }
          );

        if (
          playbackSources.length ===
            0 &&
          !request
            ?.allowNonPlaybackFallback
        ) {
          orderedSources = [
            {
              label:
                diagnosticLabel,

              type:
                "status",

              src:
                "",

              url:
                "",

              diagnostic:
                true,
            },

            ...nonPlaybackSources,
          ];
        }

        if (
          orderedSources.length ===
          0
        ) {
          orderedSources = [
            {
              label:
                diagnosticLabel,

              type:
                "status",

              src:
                "",

              url:
                "",

              diagnostic:
                true,
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

          tmdbId,

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
            imdbId,

            tmdbId,

            mediaType,

            season,

            episode,

            imdbStatus:
              imdbInfo?.status ||
              "UNKNOWN",

            imdbMethod:
              imdbInfo?.method ||
              "",

            imdbError:
              imdbInfo?.error ||
              "",

            addonLookupStatus:
              addonLookup?.status ||
              "UNKNOWN",

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

            browserAttempted:
              Boolean(
                addonLookup
                  ?.browserAttempted
              ),

            browserRecovered:
              Number(
                addonLookup
                  ?.browserRecovered ||
                0
              ),

            browserDiagnostics:
              addonLookup
                ?.browserDiagnostics ||
              [],

            rdConnected:
              hasRd,

            rdLookupStatus:
              rdLookup?.status ||
              (
                hasRd
                  ? "UNKNOWN"
                  : "NOT CONNECTED"
              ),

            rdLookupDetail:
              rdLookup?.detail ||
              "",

            diagnosticLabel,
          },
        });

        console.info(
          "[Media God] Playback diagnostics",
          {
            title:
              request?.title,

            tmdbId,

            imdbId,

            mediaType,

            season,

            episode,

            imdbStatus:
              imdbInfo?.status,

            addonLookupStatus:
              addonLookup
                ?.status,

            addonsChecked:
              addonLookup
                ?.addonsChecked,

            discoveredCount:
              Array.isArray(
                addonLookup
                  ?.streams
              )
                ? addonLookup
                    .streams
                    .length
                : 0,

            browserAttempted:
              addonLookup
                ?.browserAttempted,

            browserRecovered:
              addonLookup
                ?.browserRecovered,

            addonDiagnostics:
              addonLookup
                ?.diagnostics ||
              [],

            rdConnected:
              hasRd,

            rdLookupStatus:
              rdLookup
                ?.status,

            rdLookupDetail:
              rdLookup
                ?.detail,
          }
        );

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
