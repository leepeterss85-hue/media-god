import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ExternalLink,
  Globe,
  Link as LinkIcon,
  Loader2,
  Play,
  Radio,
  Tv,
  Zap,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import { cn } from "@/lib/utils";

const TMDB_KEY =
  "38267272847a9ef3878b273b37963d76";

const resolveImdbId = async ({
  tmdbId,
  imdbId,
  mediaType,
}) => {
  if (imdbId) {
    return imdbId;
  }

  if (!tmdbId) {
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
    const type =
      mediaType === "tv"
        ? "tv"
        : "movie";

    const response =
      await fetch(
        `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`
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
  season = null,
  episode = null,
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
  ] =
    useState(
      null
    );

  const [
    rdSearching,
    setRdSearching,
  ] =
    useState(
      false
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      ""
    );

  const [
    addonLoading,
    setAddonLoading,
  ] =
    useState(
      false
    );

  const [
    addonStreams,
    setAddonStreams,
  ] =
    useState(
      []
    );

  const [
    addonDiagnostics,
    setAddonDiagnostics,
  ] =
    useState(
      []
    );

  const [
    addonReason,
    setAddonReason,
  ] =
    useState(
      ""
    );

  const [
    addonsChecked,
    setAddonsChecked,
  ] =
    useState(
      0
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
        (matches) => {
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

    const loadAddonStreams =
      async () => {
        if (!title) {
          return;
        }

        if (
          mediaType ===
            "tv" &&
          (
            season == null ||
            episode == null
          )
        ) {
          setAddonStreams(
            []
          );

          setAddonDiagnostics(
            []
          );

          setAddonsChecked(
            0
          );

          setAddonReason(
            "Select an episode to search configured playback sources."
          );

          return;
        }

        setAddonLoading(
          true
        );

        setAddonStreams(
          []
        );

        setAddonDiagnostics(
          []
        );

        setAddonReason(
          ""
        );

        setAddonsChecked(
          0
        );

        try {
          const resolvedImdbId =
            await resolveImdbId(
              {
                tmdbId,
                imdbId,
                mediaType,
              }
            );

          const response =
            await base44.functions.invoke(
              "fetchAddonStreams",
              {
                imdb_id:
                  resolvedImdbId ||
                  "",

                title,

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

          if (
            cancelled
          ) {
            return;
          }

          const data =
            response?.data ||
            {};

          setAddonStreams(
            Array.isArray(
              data?.streams
            )
              ? data.streams
              : []
          );

          setAddonDiagnostics(
            Array.isArray(
              data?.diagnostics
            )
              ? data.diagnostics
              : []
          );

          setAddonsChecked(
            Number(
              data?.addons_checked ||
                0
            )
          );

          setAddonReason(
            data?.reason ||
              data?.error ||
              ""
          );
        } catch (error) {
          if (
            !cancelled
          ) {
            setAddonStreams(
              []
            );

            setAddonDiagnostics(
              []
            );

            setAddonsChecked(
              0
            );

            setAddonReason(
              error?.message ||
                "Configured source lookup failed."
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setAddonLoading(
              false
            );
          }
        }
      };

    loadAddonStreams();

    return () => {
      cancelled =
        true;
    };
  }, [
    title,
    tmdbId,
    imdbId,
    mediaType,
    season,
    episode,
  ]);

  const playableAddonStreams =
    useMemo(
      () =>
        addonStreams.filter(
          (stream) => {
            if (!stream) {
              return false;
            }

            if (
              stream.type ===
                "rd" &&
              !hasRd
            ) {
              return false;
            }

            return Boolean(
              stream.src ||
                stream.url ||
                stream.magnet
            );
          }
        ),
      [
        addonStreams,
        hasRd,
      ]
    );

  const failedAddonCount =
    useMemo(
      () =>
        addonDiagnostics.filter(
          (item) =>
            item?.status !==
            "ok"
        ).length,
      [
        addonDiagnostics,
      ]
    );

  const playRealDebrid =
    async () => {
      if (
        !hasRd ||
        rdSearching
      ) {
        if (!hasRd) {
          setMessage(
            "Connect Real-Debrid in Settings first."
          );
        }

        return;
      }

      setRdSearching(
        true
      );

      setMessage(
        "Searching configured sources and Real-Debrid…"
      );

      try {
        const opened =
          await player.play(
            {
              id:
                tmdbId,

              imdbId,

              title,
              poster,

              year:
                rdYear,

              mediaType,
              season,
              episode,

              rdTitle:
                title,

              rdYear,

              rdSeason:
                season,

              rdEpisode:
                episode,

              preferRd:
                true,

              sources:
                [],
            }
          );

        setMessage(
          opened
            ? ""
            : "No playable source was found for this title."
        );
      } catch (error) {
        setMessage(
          error?.message ||
            "Real-Debrid search failed."
        );
      } finally {
        setRdSearching(
          false
        );
      }
    };

  const playAddonStream =
    async (
      stream
    ) => {
      if (!stream) {
        return;
      }

      if (
        stream.type ===
          "rd" &&
        !hasRd
      ) {
        setMessage(
          "This source needs Real-Debrid. Connect it in Settings first."
        );

        return;
      }

      setMessage(
        ""
      );

      await player.play({
        id:
          tmdbId,

        imdbId,

        title,
        poster,

        year:
          rdYear,

        mediaType,
        season,
        episode,

        rdTitle:
          title,

        rdYear,

        rdSeason:
          season,

        rdEpisode:
          episode,

        preferRd:
          stream.type ===
          "rd",

        skipAddonLookup:
          true,

        sources: [
          stream,
        ],

        allowNonPlaybackFallback:
          stream.type ===
            "provider" ||
          stream.type ===
            "youtube",
      });
    };

  const pasteMagnet =
    async () => {
      if (!hasRd) {
        setMessage(
          "Connect Real-Debrid in Settings first."
        );

        return;
      }

      const value =
        window.prompt(
          "Paste your magnet link here."
        );

      if (
        value == null
      ) {
        return;
      }

      const magnet =
        String(
          value
        ).trim();

      if (
        !magnet
          .toLowerCase()
          .startsWith(
            "magnet:"
          )
      ) {
        setMessage(
          "That is not a valid magnet link."
        );

        return;
      }

      setMessage(
        ""
      );

      await player.play({
        id:
          tmdbId,

        imdbId,

        title,
        poster,

        year:
          rdYear,

        mediaType,
        season,
        episode,

        rdTitle:
          title,

        rdYear,

        rdSeason:
          season,

        rdEpisode:
          episode,

        skipAddonLookup:
          true,

        skipRdLookup:
          true,

        preferRd:
          true,

        sources: [
          {
            label:
              "Real-Debrid magnet",

            type:
              "rd",

            src:
              magnet,

            url:
              magnet,

            magnet,

            addon:
              "Your magnet",
          },
        ],
      });
    };

  const playTrailer =
    async () => {
      if (
        !trailerUrl
      ) {
        return;
      }

      await player.play({
        title,
        poster,
        mediaType,

        noRd:
          true,

        skipRdLookup:
          true,

        skipAddonLookup:
          true,

        allowNonPlaybackFallback:
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
    };

  const playLive =
    async (
      channel
    ) => {
      if (
        !channel?.url
      ) {
        return;
      }

      await player.play({
        type:
          "live",

        title:
          channel?.name ||
          title,

        poster:
          channel?.logo ||
          poster,

        noRd:
          true,

        skipRdLookup:
          true,

        skipAddonLookup:
          true,

        sources: [
          {
            label:
              channel?.name ||
              "LIVE",

            type:
              "live",

            src:
              channel.url,

            url:
              channel.url,

            live:
              true,

            addon:
              channel?.group ||
              "Live TV",
          },
        ],
      });
    };

  const rows = [
    {
      id:
        "rd",

      kind:
        "rd",

      label:
        "Real-Debrid",

      note:
        hasRd
          ? "Library, cached links and sources you provide"
          : "Connect Real-Debrid in Settings",

      onClick:
        playRealDebrid,
    },
  ];

  playableAddonStreams.forEach(
    (
      stream,
      index
    ) => {
      rows.push({
        id:
          stream.id ||
          `addon-${index}-${stream.label}`,

        kind:
          "addon-stream",

        label:
          stream.label ||
          "Configured source",

        note:
          stream.type ===
          "rd"
            ? `${stream.addon || "Addon"} • Real-Debrid`
            : stream.type ===
                "provider"
              ? `${stream.addon || "Addon"} • Provider`
              : stream.type ===
                  "youtube"
                ? `${stream.addon || "Addon"} • Video`
                : `${stream.addon || "Addon"} • Direct`,

        onClick:
          () =>
            playAddonStream(
              stream
            ),
      });
    }
  );

  rows.push({
    id:
      "paste",

    kind:
      "paste",

    label:
      "Paste Magnet",

    note:
      "Your own magnet via Real-Debrid",

    onClick:
      pasteMagnet,
  });

  if (trailerUrl) {
    rows.push({
      id:
        "trailer",

      kind:
        "trailer",

      label:
        "Trailer",

      note:
        "YouTube",

      onClick:
        playTrailer,
    });
  }

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
          `live-${index}`,

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

        onClick:
          () =>
            playLive(
              channel
            ),
      });
    }
  );

  rows.push({
    id:
      "archive",

    kind:
      "archive",

    label:
      "Free Archive",

    note:
      "Public-domain on Internet Archive",

    onClick:
      () =>
        window.open(
          `https://archive.org/search?query=${encodeURIComponent(
            title
          )}`,
          "_blank",
          "noopener,noreferrer"
        ),
  });

  (
    providers ||
    []
  ).forEach(
    (
      provider,
      index
    ) => {
      if (
        !provider?.link
      ) {
        return;
      }

      rows.push({
        id:
          `provider-${index}-${provider.name}`,

        kind:
          "provider",

        label:
          provider?.name ||
          "Provider",

        note:
          provider?.tier ||
          "Where to watch",

        logo:
          provider?.logo,

        onClick:
          () =>
            window.open(
              provider.link,
              "_blank",
              "noopener,noreferrer"
            ),
      });
    }
  );

  const iconFor =
    (
      kind
    ) => {
      if (
        kind ===
        "rd"
      ) {
        return rdSearching ? (
          <Loader2 className="w-4 h-4 text-mg-green animate-spin" />
        ) : (
          <Zap className="w-4 h-4 text-mg-green" />
        );
      }

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
        "paste"
      ) {
        return (
          <LinkIcon className="w-4 h-4 text-mg-green" />
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
          <Tv className="w-4 h-4 text-white/70" />
        );
      }

      return (
        <Play className="w-4 h-4 text-white/70" />
      );
    };

  return (
    <div className="mt-4 bg-mg-card border border-white/10 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-mg-green" />

          Stream Sources
        </h3>

        {addonLoading && (
          <span className="text-[10px] text-white/40 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />

            Checking sources
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-1.5">
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
                className="h-10 rounded-md bg-white/5 animate-pulse"
              />
            )
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map(
            (row) => (
              <button
                type="button"
                key={
                  row.id
                }
                onClick={
                  row.onClick
                }
                disabled={
                  row.kind ===
                    "rd" &&
                  rdSearching
                }
                className={cn(
                  "flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md transition-colors border",

                  row.kind ===
                    "rd"
                    ? "bg-mg-green/10 hover:bg-mg-green/20 border-mg-green/30"
                    : row.kind ===
                        "addon-stream"
                      ? "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30"
                      : row.kind ===
                          "live"
                        ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30"
                        : "bg-white/5 hover:bg-white/10 border-transparent",

                  row.kind ===
                    "rd" &&
                    !hasRd &&
                    "opacity-60"
                )}
              >
                <span className="w-8 h-8 rounded-md bg-black/30 flex items-center justify-center shrink-0 overflow-hidden">
                  {row.logo ? (
                    <img
                      src={
                        row.logo
                      }
                      alt={
                        row.label
                      }
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    iconFor(
                      row.kind
                    )
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-medium truncate",

                      row.kind ===
                        "rd" ||
                        row.kind ===
                          "addon-stream"
                        ? "text-mg-green"
                        : "text-white"
                    )}
                  >
                    {
                      row.label
                    }
                  </span>

                  <span className="block text-[10px] text-white/40 truncate">
                    {
                      row.note
                    }
                  </span>
                </span>

                {row.kind ===
                  "archive" ||
                row.kind ===
                  "provider" ? (
                  <ExternalLink className="w-3.5 h-3.5 text-white/40 shrink-0" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white/40 shrink-0" />
                )}
              </button>
            )
          )}

          {!addonLoading && (
            <div className="px-1 pt-1 space-y-1">
              {addonsChecked >
              0 ? (
                <p className="text-[10px] text-white/35">
                  Configured playback addons checked:{" "}
                  {
                    addonsChecked
                  }
                  . Playable sources found:{" "}
                  {
                    playableAddonStreams.length
                  }
                  .
                  {failedAddonCount >
                  0
                    ? ` ${failedAddonCount} addon${failedAddonCount === 1 ? "" : "s"} returned no usable source.`
                    : ""}
                </p>
              ) : addonReason ? (
                <p className="text-[10px] text-amber-300/70 break-words">
                  {
                    addonReason
                  }
                </p>
              ) : null}
            </div>
          )}

          {liveMatches ===
            null && (
            <p className="text-[10px] text-white/30 px-1 pt-1">
              Checking live channels…
            </p>
          )}

          {message && (
            <p className="text-[10px] text-white/50 px-1 pt-1 break-words">
              {
                message
              }
            </p>
          )}
        </div>
      )}
    </div>
  );
}
