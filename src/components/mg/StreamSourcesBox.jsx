import React, {
  useEffect,
  useState,
} from "react";

import {
  Zap,
  Play,
  Tv,
  ExternalLink,
  Link as LinkIcon,
  Globe,
  Radio,
  Loader2,
} from "lucide-react";

import { usePlayer } from "@/components/mg/PlayerProvider";
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import { cn } from "@/lib/utils";

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

  const [
    liveMatches,
    setLiveMatches,
  ] = useState(null);

  const [
    rdSearching,
    setRdSearching,
  ] = useState(false);

  const [
    actionMessage,
    setActionMessage,
  ] = useState("");

  const hasRd =
    Boolean(
      player?.hasRd
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
  }, [title]);

  const sources = [
    {
      id:
        "rd",

      kind:
        "rd",

      label:
        "Real-Debrid",

      note:
        hasRd
          ? "Cached stream or your magnet"
          : "Connect Real-Debrid in Settings",
    },

    {
      id:
        "paste",

      kind:
        "paste",

      label:
        "Paste Magnet",

      note:
        "Your own magnet via Real-Debrid",
    },
  ];

  if (trailerUrl) {
    sources.push({
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

  (
    liveMatches ||
    []
  ).forEach(
    (
      channel,
      index
    ) => {
      sources.push({
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

        channel,
      });
    }
  );

  sources.push({
    id:
      "archive",

    kind:
      "archive",

    label:
      "Free Archive",

    note:
      "Public-domain on Internet Archive",
  });

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
        id:
          `prov-${provider.name}`,

        kind:
          "provider",

        label:
          provider.name,

        note:
          provider.tier ||
          "Stream",

        logo:
          provider.logo,

        link:
          provider.link,
      });
    }
  );

  const playRealDebrid =
    async () => {
      if (
        !hasRd ||
        rdSearching
      ) {
        if (!hasRd) {
          setActionMessage(
            "Connect Real-Debrid in Settings first."
          );
        }

        return;
      }

      setRdSearching(
        true
      );

      setActionMessage(
        "Searching Real-Debrid sources…"
      );

      try {
        const opened =
          await player.play({
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

            forceRdSearch:
              true,

            sources:
              [],
          });

        if (!opened) {
          setActionMessage(
            "No Real-Debrid source was found for this title right now."
          );
        } else {
          setActionMessage(
            ""
          );
        }
      } catch (error) {
        setActionMessage(
          error?.message ||
            "Real-Debrid search could not be completed."
        );
      } finally {
        setRdSearching(
          false
        );
      }
    };

  const pasteMagnet =
    async () => {
      if (!hasRd) {
        setActionMessage(
          "Connect Real-Debrid in Settings first."
        );

        return;
      }

      const magnet =
        window.prompt(
          "Paste your magnet link here. It must start with magnet:?xt=…"
        );

      if (
        magnet == null
      ) {
        return;
      }

      const value =
        String(
          magnet
        ).trim();

      if (
        !value
          .toLowerCase()
          .startsWith(
            "magnet:"
          )
      ) {
        setActionMessage(
          "That is not a valid magnet link."
        );

        return;
      }

      setActionMessage(
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

        rdTitle:
          title,

        rdYear,

        skipAddonLookup:
          true,

        skipRdLookup:
          true,

        sources: [
          {
            label:
              "Real-Debrid",

            type:
              "rd",

            src:
              value,

            url:
              value,

            magnet:
              value,
          },
        ],
      });
    };

  const playSource =
    async (
      source
    ) => {
      if (
        source.kind ===
        "rd"
      ) {
        await playRealDebrid();
        return;
      }

      if (
        source.kind ===
        "paste"
      ) {
        await pasteMagnet();
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

        return;
      }

      if (
        source.kind ===
        "live"
      ) {
        await player.play({
          type:
            "live",

          title:
            source.channel?.name ||
            title,

          poster:
            source.channel?.logo ||
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
                "LIVE",

              type:
                "live",

              src:
                source.channel?.url,

              url:
                source.channel?.url,

              live:
                true,
            },
          ],
        });
      }
    };

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
        "paste"
      ) {
        return (
          <LinkIcon className="w-4 h-4 text-mg-green" />
        );
      }

      if (
        kind ===
        "trailer"
      ) {
        return (
          <Play className="w-4 h-4 text-white/70" />
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

      return (
        <Tv className="w-4 h-4 text-white/70" />
      );
    };

  const rowClass =
    (
      kind
    ) =>
      cn(
        "flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md transition-colors border",

        kind === "rd"
          ? "bg-mg-green/10 hover:bg-mg-green/20 border-mg-green/30"
          : kind === "live"
            ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30"
            : "bg-white/5 hover:bg-white/10 border-transparent"
      );

  const labelClass =
    (
      kind
    ) =>
      cn(
        "block text-sm font-medium truncate",

        kind === "rd" ||
          kind === "live"
          ? "text-mg-green"
          : "text-white"
      );

  return (
    <div className="mt-4 bg-mg-card border border-white/10 rounded-lg p-3">
      <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-mg-green" />
        Stream Sources
      </h3>

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
          {sources.map(
            (source) => (
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
                disabled={
                  source.kind ===
                    "rd" &&
                  rdSearching
                }
                className={cn(
                  rowClass(
                    source.kind
                  ),

                  source.kind ===
                    "rd" &&
                    !hasRd &&
                    "opacity-60"
                )}
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
                  <span
                    className={labelClass(
                      source.kind
                    )}
                  >
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

          {liveMatches ===
            null && (
            <p className="text-[10px] text-white/30 px-1 pt-1">
              Checking live
              channels…
            </p>
          )}

          {actionMessage && (
            <p className="text-[10px] text-white/50 px-1 pt-1 break-words">
              {
                actionMessage
              }
            </p>
          )}
        </div>
      )}
    </div>
  );
}
