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
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { cn } from "@/lib/utils";

const unwrap = (response) => response?.data ?? response ?? {};

const resolveImdbId = async ({
  tmdbId,
  imdbId,
  title,
  year,
  mediaType,
}) => {
  const supplied = String(imdbId || "").trim();

  if (/^tt\d+$/i.test(supplied)) {
    return {
      imdbId: supplied,
      status: "OK",
      error: "",
    };
  }

  if (
    tmdbId &&
    /^tt\d+$/i.test(String(tmdbId))
  ) {
    return {
      imdbId: String(tmdbId),
      status: "OK",
      error: "",
    };
  }

  try {
    const response = await base44.functions.invoke(
      "resolveImdb",
      {
        imdb_id: supplied,

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
          mediaType === "tv"
            ? "tv"
            : "movie",
      }
    );

    const data = unwrap(response);

    const resolved = String(
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

        error:
          "",
      };
    }

    return {
      imdbId:
        "",

      status:
        "FAILED",

      error:
        data?.error ||
        "IMDb id could not be resolved.",
    };
  } catch (error) {
    return {
      imdbId:
        "",

      status:
        "FAILED",

      error:
        error?.message ||
        "IMDb lookup failed.",
    };
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
  const player = usePlayer();

  const hasRd = Boolean(
    player?.hasRd
  );

  const [
    liveMatches,
    setLiveMatches,
  ] = useState([]);

  const [
    addonStreams,
    setAddonStreams,
  ] = useState([]);

  const [
    addonLoading,
    setAddonLoading,
  ] = useState(false);

  const [
    addonDiagnostics,
    setAddonDiagnostics,
  ] = useState([]);

  const [
    addonReason,
    setAddonReason,
  ] = useState("");

  const [
    addonsChecked,
    setAddonsChecked,
  ] = useState(0);

  const [
    resolvedImdb,
    setResolvedImdb,
  ] = useState("");

  const [
    imdbStatus,
    setImdbStatus,
  ] = useState("IDLE");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    rdSearching,
    setRdSearching,
  ] = useState(false);

  useEffect(() => {
    let cancelled = false;

    findChannelsByTitle(title)
      .then((matches) => {
        if (!cancelled) {
          setLiveMatches(
            matches ||
            []
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveMatches([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [title]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAddonStreams([]);
      setAddonDiagnostics([]);
      setAddonReason("");
      setAddonsChecked(0);
      setResolvedImdb("");
      setImdbStatus("CHECKING");

      if (!title) {
        setImdbStatus("FAILED");

        setAddonReason(
          "A title is required before sources can be checked."
        );

        return;
      }

      if (
        mediaType === "tv" &&
        (
          season == null ||
          episode == null
        )
      ) {
        setImdbStatus("WAITING");

        setAddonReason(
          "Select an episode to search configured playback sources."
        );

        return;
      }

      setAddonLoading(true);

      try {
        const imdbResult =
          await resolveImdbId({
            tmdbId,
            imdbId,
            title,
            year:
              rdYear,
            mediaType,
          });

        if (cancelled) {
          return;
        }

        setResolvedImdb(
          imdbResult.imdbId
        );

        setImdbStatus(
          imdbResult.status
        );

        if (
          !imdbResult.imdbId
        ) {
          setAddonReason(
            imdbResult.error ||
              "IMDb id could not be resolved for this title."
          );

          return;
        }

        const response =
          await base44.functions.invoke(
            "fetchAddonStreams",
            {
              imdb_id:
                imdbResult.imdbId,

              tmdb_id:
                tmdbId ??
                "",

              title:
                title ||
                "",

              year:
                rdYear ??
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

        if (cancelled) {
          return;
        }

        const data =
          unwrap(
            response
          );

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
        if (!cancelled) {
          setAddonStreams([]);

          setAddonDiagnostics([]);

          setAddonsChecked(0);

          setAddonReason(
            error?.message ||
              "Configured source lookup failed."
          );
        }
      } finally {
        if (!cancelled) {
          setAddonLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [
    title,
    rdYear,
    tmdbId,
    imdbId,
    mediaType,
    season,
    episode,
  ]);

  const visibleAddonStreams =
    useMemo(
      () =>
        addonStreams.filter(
          (stream) => {
            if (!stream) {
              return false;
            }

            if (
              stream?.type ===
                "rd" &&
              !hasRd
            ) {
              return false;
            }

            return Boolean(
              stream?.src ||
                stream?.url ||
                stream?.magnet
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
            item?.status &&
            item.status !==
              "ok"
        ).length,
      [
        addonDiagnostics,
      ]
    );

  const playRealDebrid =
    async () => {
      if (!hasRd) {
        setMessage(
          "Connect Real-Debrid in Settings first."
        );

        return;
      }

      if (rdSearching) {
        return;
      }

      setRdSearching(true);

      setMessage("");

      try {
        await player.play({
          id:
            tmdbId,

          tmdbId,

          imdbId:
            resolvedImdb ||
            imdbId ||
            "",

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
        });
      } catch (error) {
        setMessage(
          error?.message ||
            "Real-Debrid playback lookup failed."
        );
      } finally {
        setRdSearching(false);
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
        stream?.type ===
          "rd" &&
        !hasRd
      ) {
        setMessage(
          "This source needs Real-Debrid. Connect it in Settings first."
        );

        return;
      }

      setMessage("");

      await player.play({
        id:
          tmdbId,

        tmdbId,

        imdbId:
          resolvedImdb ||
          imdbId ||
          "",

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
          stream?.type ===
          "rd",

        skipAddonLookup:
          true,

        skipRdLookup:
          true,

        allowNonPlaybackFallback:
          stream?.type ===
            "provider" ||
          stream?.type ===
            "youtube",

        sources: [
          stream,
        ],
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

      setMessage("");

      await player.play({
        id:
          tmdbId,

        tmdbId,

        imdbId:
          resolvedImdb ||
          imdbId ||
          "",

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

        skipAddonLookup:
          true,

        skipRdLookup:
          true,

        sources: [
          {
            label:
              "Your magnet",

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
      if (!trailerUrl) {
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
          ? "Your RD library plus selected sources"
          : "Connect Real-Debrid in Settings",

      onClick:
        playRealDebrid,
    },

    ...visibleAddonStreams.map(
      (
        stream,
        index
      ) => ({
        id:
          stream?.id ||
          `addon-${index}`,

        kind:
          "addon-stream",

        label:
          stream?.label ||
          `Source ${index + 1}`,

        note:
          stream?.type ===
          "rd"
            ? `${stream?.addon || "Addon"} • Real-Debrid source`
            : stream?.type ===
                "provider"
              ? `${stream?.addon || "Addon"} • Provider`
              : stream?.type ===
                  "youtube"
                ? `${stream?.addon || "Addon"} • Video`
                : `${stream?.addon || "Addon"} • Direct stream`,

        onClick:
          () =>
            playAddonStream(
              stream
            ),
      })
    ),

    {
      id:
        "paste",

      kind:
        "paste",

      label:
        "Paste Magnet",

      note:
        "Send your own magnet through Real-Debrid",

      onClick:
        pasteMagnet,
    },

    ...(trailerUrl
      ? [
          {
            id:
              "trailer",

            kind:
              "trailer",

            label:
              "Trailer",

            note:
              "YouTube preview",

            onClick:
              playTrailer,
          },
        ]
      : []),

    ...(liveMatches || []).map(
      (
        channel,
        index
      ) => ({
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
      })
    ),

    {
      id:
        "archive",

      kind:
        "archive",

      label:
        "Free Archive",

      note:
        "Search public-domain material on Internet Archive",

      onClick:
        () =>
          window.open(
            `https://archive.org/search?query=${encodeURIComponent(
              title
            )}`,
            "_blank",
            "noopener,noreferrer"
          ),
    },

    ...(providers || [])
      .filter(
        (provider) =>
          provider?.link
      )
      .map(
        (
          provider,
          index
        ) => ({
          id:
            `provider-${index}-${provider?.name || "provider"}`,

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
        })
      ),
  ];

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

            Checking
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({
            length:
              4,
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
            (
              row
            ) => (
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
            <details className="mt-1 rounded-md border border-white/5 bg-black/20 px-2.5 py-2">
              <summary className="cursor-pointer text-[10px] text-white/45">
                Source diagnostics — IMDb:{" "}
                {
                  resolvedImdb ||
                  "not resolved"
                }{" "}
                ·{" "}
                {
                  imdbStatus
                }{" "}
                ·{" "}
                {
                  addonsChecked
                }{" "}
                addon
                {addonsChecked ===
                1
                  ? ""
                  : "s"}{" "}
                checked ·{" "}
                {
                  visibleAddonStreams.length
                }{" "}
                source
                {visibleAddonStreams.length ===
                1
                  ? ""
                  : "s"}{" "}
                shown
              </summary>

              <div className="mt-2 space-y-1 text-[10px] text-white/40">
                {addonReason && (
                  <p className="break-words">
                    {
                      addonReason
                    }
                  </p>
                )}

                {addonDiagnostics.map(
                  (
                    item,
                    index
                  ) => (
                    <p
                      key={`${item?.name || "addon"}-${index}`}
                      className="break-words"
                    >
                      <span className="text-white/60">
                        {
                          item?.name ||
                          "Addon"
                        }
                        :
                      </span>{" "}
                      {item?.message ||
                        item?.status ||
                        "No details"}
                    </p>
                  )
                )}

                {failedAddonCount >
                  0 && (
                  <p>
                    {
                      failedAddonCount
                    }{" "}
                    configured addon
                    {failedAddonCount ===
                    1
                      ? ""
                      : "s"}{" "}
                    returned no usable source or could not be reached.
                  </p>
                )}

                {!addonReason &&
                  addonDiagnostics.length ===
                    0 && (
                    <p>
                      No additional diagnostics were returned.
                    </p>
                  )}
              </div>
            </details>
          )}

          {message && (
            <p className="text-[10px] text-white/55 px-1 pt-1 break-words">
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
