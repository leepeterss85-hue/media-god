import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Loader2,
  Play,
  Radio,
  ShieldCheck,
  Tv,
  Zap,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { cn } from "@/lib/utils";

const TMDB_KEY =
  "38267272847a9ef3878b273b37963d76";

const getBaseUrl = (
  manifestUrl
) =>
  String(
    manifestUrl ||
      ""
  )
    .replace(
      /\/manifest\.json\/?$/i,
      ""
    )
    .replace(
      /\/+$/,
      ""
    );

const getStreamUrl = (
  stream
) => {
  const infoHash =
    stream?.infoHash ||
    stream?.info_hash ||
    "";

  return (
    stream?.url ||
    stream?.link ||
    stream?.src ||
    (
      infoHash
        ? `magnet:?xt=urn:btih:${infoHash}`
        : ""
    )
  );
};

const normaliseAddonStream =
  (
    stream,
    addon,
    index
  ) => {
    const url =
      getStreamUrl(
        stream
      );

    if (
      !url
    ) {
      return null;
    }

    const infoHash =
      stream?.infoHash ||
      stream?.info_hash ||
      "";

    const magnet =
      String(
        url
      )
        .toLowerCase()
        .startsWith(
          "magnet:"
        ) ||
      Boolean(
        infoHash
      );

    const rawTitle =
      stream?.title ||
      stream?.name ||
      stream?.filename ||
      "Stream Source";

    return {
      id:
        `${
          addon?.id ||
          addon?.name ||
          "addon"
        }-${index}-${String(
          url
        ).slice(-16)}`,

      kind:
        "addon-stream",

      label:
        String(
          rawTitle
        ).split(
          "\n"
        )[0],

      note:
        addon?.name ||
        stream?.name ||
        "Addon source",

      url,

      src:
        url,

      type:
        magnet
          ? "rd"
          : "url",

      infoHash:
        infoHash ||
        undefined,

      behaviorHints:
        stream?.behaviorHints ||
        stream?.behavior_hints ||
        undefined,

      addon:
        addon?.name ||
        "Addon",
    };
  };

const dedupe = (
  items
) => {
  const seen =
    new Set();

  return items.filter(
    (
      item
    ) => {
      const key =
        String(
          item?.url ||
          item?.src ||
          item?.id ||
          ""
        );

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

const resolveImdbId =
  async ({
    tmdbId,
    imdbId,
    mediaType,
  }) => {
    if (
      imdbId
    ) {
      return imdbId;
    }

    if (
      !tmdbId
    ) {
      return "";
    }

    if (
      String(
        tmdbId
      ).startsWith(
        "tt"
      )
    ) {
      return String(
        tmdbId
      );
    }

    try {
      const response =
        await fetch(
          `https://api.themoviedb.org/3/${
            mediaType ===
            "tv"
              ? "tv"
              : "movie"
          }/${tmdbId}/external_ids?api_key=${TMDB_KEY}`
        );

      if (
        !response.ok
      ) {
        return "";
      }

      const data =
        await response.json();

      return (
        data?.imdb_id ||
        ""
      );
    } catch {
      return "";
    }
  };

export default function StreamSourcesBox({
  title,
  poster,
  trailerUrl,
  providers,
  loading,
  rdYear,
  tmdbId,
  imdbId,
  mediaType = "movie",
}) {
  const player =
    usePlayer();

  const hasRd =
    Boolean(
      player?.hasRd
    );

  const [
    liveMatches,
    setLiveMatches,
  ] = useState(
    null
  );

  const [
    addonStreams,
    setAddonStreams,
  ] = useState(
    []
  );

  const [
    scraping,
    setScraping,
  ] = useState(
    false
  );

  const [
    alternatesOpen,
    setAlternatesOpen,
  ] = useState(
    false
  );

  useEffect(() => {
    let cancelled =
      false;

    setLiveMatches(
      null
    );

    findChannelsByTitle(
      title
    )
      .then(
        (
          matches
        ) => {
          if (
            !cancelled
          ) {
            setLiveMatches(
              matches ||
                []
            );
          }
        }
      )
      .catch(() => {
        if (
          !cancelled
        ) {
          setLiveMatches(
            []
          );
        }
      });

    return () => {
      cancelled =
        true;
    };
  }, [
    title,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    /*
     * Movie detail can be queried immediately.
     * For TV we wait for EpisodeSelector because
     * season/episode are required.
     */
    if (
      mediaType ===
      "tv"
    ) {
      setAddonStreams(
        []
      );

      setScraping(
        false
      );

      return () => {
        cancelled =
          true;
      };
    }

    const load =
      async () => {
        setScraping(
          true
        );

        setAddonStreams(
          []
        );

        try {
          const resolvedImdb =
            await resolveImdbId(
              {
                tmdbId,

                imdbId,

                mediaType,
              }
            );

          if (
            !resolvedImdb
          ) {
            return;
          }

          const addons =
            await base44.entities.Addon.list(
              "-created_date",
              100
            );

          const activeAddons =
            (
              addons ||
              []
            ).filter(
              (
                addon
              ) =>
                addon?.active &&
                addon?.url
            );

          const results =
            await Promise.allSettled(
              activeAddons.map(
                async (
                  addon
                ) => {
                  const controller =
                    new AbortController();

                  const timeout =
                    setTimeout(
                      () =>
                        controller.abort(),
                      10000
                    );

                  try {
                    const response =
                      await fetch(
                        `${getBaseUrl(
                          addon.url
                        )}/stream/movie/${resolvedImdb}.json`,
                        {
                          signal:
                            controller.signal,
                        }
                      );

                    if (
                      !response.ok
                    ) {
                      return [];
                    }

                    const data =
                      await response.json();

                    if (
                      !Array.isArray(
                        data?.streams
                      )
                    ) {
                      return [];
                    }

                    return data.streams
                      .map(
                        (
                          stream,
                          index
                        ) =>
                          normaliseAddonStream(
                            stream,
                            addon,
                            index
                          )
                      )
                      .filter(
                        Boolean
                      );
                  } finally {
                    clearTimeout(
                      timeout
                    );
                  }
                }
              )
            );

          const collected =
            dedupe(
              results.flatMap(
                (
                  result
                ) =>
                  result.status ===
                  "fulfilled"
                    ? result.value
                    : []
              )
            ).slice(
              0,
              30
            );

          if (
            !cancelled
          ) {
            setAddonStreams(
              collected
            );
          }
        } catch {
          if (
            !cancelled
          ) {
            setAddonStreams(
              []
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setScraping(
              false
            );
          }
        }
      };

    load();

    return () => {
      cancelled =
        true;
    };
  }, [
    tmdbId,
    imdbId,
    mediaType,
  ]);

  const directAddonStreams =
    useMemo(
      () =>
        addonStreams.filter(
          (
            stream
          ) =>
            stream.type !==
            "rd"
        ),
      [
        addonStreams,
      ]
    );

  const rdAddonStreams =
    useMemo(
      () =>
        addonStreams.filter(
          (
            stream
          ) =>
            stream.type ===
            "rd"
        ),
      [
        addonStreams,
      ]
    );

  const freeProviders =
    useMemo(
      () =>
        (
          providers ||
          []
        ).filter(
          (
            provider
          ) =>
            provider?.link &&
            (
              provider?.tier ===
                "Free" ||
              provider?.tier ===
                "Free with Ads"
            )
        ),
      [
        providers,
      ]
    );

  const alternateSources =
    useMemo(
      () => {
        const rows =
          [];

        directAddonStreams.forEach(
          (
            stream
          ) =>
            rows.push(
              stream
            )
        );

        (
          liveMatches ||
          []
        ).forEach(
          (
            channel,
            index
          ) => {
            rows.push({
              id:
                `live-${index}-${
                  channel?.name ||
                  "channel"
                }`,

              kind:
                "live",

              label:
                channel?.name ||
                "Live TV",

              note:
                `Live • ${
                  channel?.group ||
                  "Free-to-air"
                }`,

              logo:
                channel?.logo,

              channel,
            });
          }
        );

        freeProviders.forEach(
          (
            provider,
            index
          ) => {
            rows.push({
              id:
                `free-provider-${index}-${
                  provider?.name ||
                  "provider"
                }`,

              kind:
                "provider",

              label:
                provider?.name ||
                "Free provider",

              note:
                provider?.tier ||
                "Free",

              logo:
                provider?.logo,

              link:
                provider?.link,
            });
          }
        );

        rows.push({
          id:
            "archive",

          kind:
            "archive",

          label:
            "Internet Archive",

          note:
            "Search archive availability (rights vary by title)",
        });

        if (
          trailerUrl
        ) {
          rows.push({
            id:
              "trailer",

            kind:
              "trailer",

            label:
              "Trailer",

            note:
              "YouTube",
          });
        }

        return rows;
      },
      [
        directAddonStreams,

        liveMatches,

        freeProviders,

        trailerUrl,
      ]
    );

  const playAddonStream =
    (
      stream
    ) => {
      player.play({
        id:
          tmdbId,

        imdbId,

        title,

        poster,

        year:
          rdYear,

        mediaType,

        rdTitle:
          title,

        rdYear,

        skipAddonLookup:
          true,

        sources: [
          {
            label:
              stream.label,

            type:
              stream.type,

            src:
              stream.src,

            url:
              stream.url,

            magnet:
              stream.type ===
              "rd"
                ? stream.url
                : undefined,

            infoHash:
              stream.infoHash,

            behaviorHints:
              stream.behaviorHints,
          },
        ],
      });
    };

  const playSource =
    (
      source
    ) => {
      if (
        source.kind ===
        "addon-stream"
      ) {
        playAddonStream(
          source
        );

        return;
      }

      if (
        source.kind ===
        "provider"
      ) {
        window.open(
          source.link,
          "_blank",
          "noopener,noreferrer"
        );

        return;
      }

      if (
        source.kind ===
        "archive"
      ) {
        window.open(
          `https://archive.org/search?query=${encodeURIComponent(
            title
          )}`,
          "_blank",
          "noopener,noreferrer"
        );

        return;
      }

      if (
        source.kind ===
        "trailer"
      ) {
        player.play({
          title,

          poster,

          mediaType,

          skipAddonLookup:
            true,

          sources: [
            {
              label:
                "Trailer",

              type:
                "youtube",

              src:
                trailerUrl,

              url:
                trailerUrl,
            },
          ],
        });

        return;
      }

      if (
        source.kind ===
        "live"
      ) {
        player.play({
          type:
            "live",

          title:
            source?.channel?.name ||
            title,

          poster:
            source?.channel?.logo ||
            poster,

          skipAddonLookup:
            true,

          sources: [
            {
              label:
                "LIVE",

              type:
                "live",

              src:
                source?.channel?.url,

              url:
                source?.channel?.url,

              live:
                true,
            },
          ],
        });
      }
    };

  const playWithRealDebrid =
    () => {
      if (
        !hasRd
      ) {
        return;
      }

      /*
       * Do not disable RD simply because the browser-side
       * addon requests returned no magnet results.
       *
       * PlayerProvider will also use the server-side
       * realDebrid/find_cached action.
       */
      player.play({
        id:
          tmdbId,

        imdbId,

        title,

        poster,

        year:
          rdYear,

        mediaType,

        rdTitle:
          title,

        rdYear,

        skipAddonLookup:
          true,

        sources:
          rdAddonStreams.map(
            (
              stream
            ) => ({
              label:
                stream.label,

              type:
                "rd",

              src:
                stream.src,

              url:
                stream.url,

              magnet:
                stream.url,

              infoHash:
                stream.infoHash,

              behaviorHints:
                stream.behaviorHints,
            })
          ),
      });
    };

  const iconFor =
    (
      kind
    ) => {
      if (
        kind ===
        "addon-stream"
      ) {
        return (
          <Globe className="w-4 h-4 text-cyan-400" />
        );
      }

      if (
        kind ===
        "live"
      ) {
        return (
          <Radio className="w-4 h-4 text-red-400" />
        );
      }

      if (
        kind ===
        "archive"
      ) {
        return (
          <Globe className="w-4 h-4 text-white/70" />
        );
      }

      if (
        kind ===
        "provider"
      ) {
        return (
          <Tv className="w-4 h-4 text-mg-green" />
        );
      }

      return (
        <Play className="w-4 h-4 text-white/70" />
      );
    };

  const rowClass =
    (
      kind
    ) =>
      cn(
        "flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md transition-colors border",

        kind ===
          "addon-stream"
          ? "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30"
          : kind ===
              "live"
            ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30"
            : "bg-white/5 hover:bg-white/10 border-transparent"
      );

  return (
    <div className="mt-4 bg-mg-card border border-white/10 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-mg-green" />

          Stream Sources
        </h3>

        {scraping && (
          <span className="text-[10px] text-white/40 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />

            Checking
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({
            length:
              3,
          }).map(
            (
              _,
              index
            ) => (
              <div
                key={
                  index
                }
                className="h-10 rounded-md bg-white/5 animate-pulse"
              />
            )
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={
              playWithRealDebrid
            }
            disabled={
              !hasRd
            }
            className={cn(
              "flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md border transition-colors",

              hasRd
                ? "bg-mg-green/10 hover:bg-mg-green/20 border-mg-green/30"
                : "bg-white/5 border-white/10 opacity-60 cursor-not-allowed"
            )}
          >
            <span className="w-8 h-8 rounded-md bg-black/30 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-mg-green" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-mg-green truncate">
                Real-Debrid
              </span>

              <span className="block text-[10px] text-white/40 truncate">
                {!hasRd
                  ? "Connect Real-Debrid to use Real-Debrid playback"
                  : scraping
                    ? "Checking installed addons…"
                    : rdAddonStreams.length >
                        0
                      ? `${
                          rdAddonStreams.length
                        } Real-Debrid source${
                          rdAddonStreams.length ===
                          1
                            ? ""
                            : "s"
                        } available`
                      : mediaType ===
                          "tv"
                        ? "Select an episode, then search Real-Debrid"
                        : "Search Real-Debrid for this title"}
              </span>
            </span>

            <Play className="w-3.5 h-3.5 text-white/40 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() =>
              setAlternatesOpen(
                (
                  open
                ) =>
                  !open
              )
            }
            className="flex items-center gap-2.5 w-full text-left px-2.5 py-2.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <span className="w-8 h-8 rounded-md bg-black/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-mg-green" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white truncate">
                Alternate Sources
              </span>

              <span className="block text-[10px] text-white/40 truncate">
                {
                  alternateSources.length
                }{" "}
                option
                {alternateSources.length ===
                1
                  ? ""
                  : "s"}{" "}
                • direct,
                free-provider,
                live and archive
                links
              </span>
            </span>

            {alternatesOpen ? (
              <ChevronUp className="w-4 h-4 text-white/50 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-white/50 shrink-0" />
            )}
          </button>

          {alternatesOpen && (
            <div className="flex flex-col gap-1.5 pt-0.5">
              {alternateSources.map(
                (
                  source
                ) => (
                  <button
                    type="button"
                    key={
                      source.id
                    }
                    onClick={() =>
                      playSource(
                        source
                      )
                    }
                    className={
                      rowClass(
                        source.kind
                      )
                    }
                  >
                    <span className="w-8 h-8 rounded-md bg-black/30 flex items-center justify-center shrink-0 overflow-hidden">
                      {source.logo ? (
                        <img
                          src={
                            source.logo
                          }
                          alt={
                            source.label
                          }
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        iconFor(
                          source.kind
                        )
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-white truncate">
                        {
                          source.label
                        }
                      </span>

                      <span className="block text-[10px] text-white/40 truncate">
                        {
                          source.note
                        }
                      </span>
                    </span>

                    {source.kind ===
                      "provider" ||
                    source.kind ===
                      "archive" ? (
                      <ExternalLink className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    )}
                  </button>
                )
              )}

              {mediaType ===
                "tv" && (
                <p className="text-[10px] text-white/35 px-1 pt-1">
                  For TV
                  episodes,
                  select the
                  episode first;
                  the player
                  will then look
                  up episode-specific
                  streams.
                </p>
              )}

              {liveMatches ===
                null && (
                <p className="text-[10px] text-white/35 px-1 pt-1">
                  Checking free
                  live channels…
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
