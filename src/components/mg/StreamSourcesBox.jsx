import React, { useEffect, useState } from "react";
import {
  Zap,
  Play,
  Tv,
  ExternalLink,
  Link as LinkIcon,
  Globe,
  Radio,
} from "lucide-react";

import { usePlayer } from "@/components/mg/PlayerProvider";
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const normaliseAddonStream = (stream, addon) => {
  if (!stream) return null;

  const infoHash =
    stream.infoHash ||
    stream.info_hash ||
    "";

  const url =
    stream.url ||
    stream.link ||
    stream.src ||
    (infoHash
      ? `magnet:?xt=urn:btih:${infoHash}`
      : "");

  if (!url) return null;

  const magnet =
    String(url)
      .toLowerCase()
      .startsWith("magnet:");

  const title =
    stream.title ||
    stream.name ||
    stream.filename ||
    "Stream Source";

  return {
    id:
      `${addon.name || "addon"}-${Math.random()
        .toString(36)
        .slice(2)}`,

    kind: "addon-stream",

    label: String(title).split("\n")[0],

    note:
      stream.name ||
      addon.name ||
      "Addon source",

    url,

    infoHash: infoHash || undefined,

    type: magnet ? "rd" : "url",

    behaviorHints:
      stream.behaviorHints ||
      stream.behavior_hints ||
      {},

    addon: addon.name || "Addon",
  };
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
  season,
  episode,
}) {
  const player = usePlayer();

  const [liveMatches, setLiveMatches] =
    useState(null);

  const [scrapedStreams, setScrapedStreams] =
    useState([]);

  const [scraping, setScraping] =
    useState(true);

  /*
   * Ask the PlayerProvider to resolve the
   * actual media and all active addons.
   *
   * This deliberately does NOT scrape addons
   * using the title.
   */
  useEffect(() => {
    let cancelled = false;

    setLiveMatches(null);
    setScrapedStreams([]);

    findChannelsByTitle(title)
      .then((matches) => {
        if (!cancelled) {
          setLiveMatches(matches || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveMatches([]);
        }
      });

    /*
     * We still show addon sources in the source
     * list, but use the same IMDb/TMDB metadata
     * that PlayerProvider uses.
     */
    const loadAddonSources = async () => {
      setScraping(true);

      try {
        const addons =
          await base44.entities.Addon.list(
            "-created_date",
            100
          );

        const active =
          (addons || []).filter(
            (addon) =>
              addon?.active &&
              addon?.url
          );

        const isTv =
          mediaType === "tv" ||
          season != null ||
          episode != null;

        let resolvedImdb =
          imdbId ||
          "";

        /*
         * Convert TMDB -> IMDb when necessary.
         */
        if (
          !resolvedImdb &&
          tmdbId != null
        ) {
          try {
            const result =
              await fetch(
                `https://api.themoviedb.org/3/${isTv ? "tv" : "movie"}/${tmdbId}/external_ids?api_key=38267272847a9ef3878b273b37963d76`
              );

            if (result.ok) {
              const data =
                await result.json();

              resolvedImdb =
                data?.imdb_id ||
                "";
            }
          } catch {
            // Continue without IMDb ID.
          }
        }

        if (!resolvedImdb) {
          return;
        }

        const media =
          isTv
            ? "series"
            : "movie";

        const idPath =
          isTv &&
          season != null &&
          episode != null
            ? `${resolvedImdb}:${season}:${episode}`
            : resolvedImdb;

        const results =
          await Promise.all(
            active.map(
              async (addon) => {
                try {
                  const baseUrl =
                    String(addon.url)
                      .replace(
                        /\/manifest\.json\/?$/i,
                        ""
                      )
                      .replace(
                        /\/+$/,
                        ""
                      );

                  const endpoint =
                    `${baseUrl}/stream/${media}/${idPath}.json`;

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
                        endpoint,
                        {
                          signal:
                            controller.signal,
                        }
                      );

                    if (!response.ok) {
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
                      .map((stream) =>
                        normaliseAddonStream(
                          stream,
                          addon
                        )
                      )
                      .filter(Boolean);
                  } finally {
                    clearTimeout(
                      timeout
                    );
                  }
                } catch {
                  return [];
                }
              }
            )
          );

        if (!cancelled) {
          const seen =
            new Set();

          const unique =
            results
              .flat()
              .filter((stream) => {
                const key =
                  stream.url;

                if (
                  !key ||
                  seen.has(key)
                ) {
                  return false;
                }

                seen.add(key);

                return true;
              });

          setScrapedStreams(
            unique
          );
        }
      } catch {
        if (!cancelled) {
          setScrapedStreams([]);
        }
      } finally {
        if (!cancelled) {
          setScraping(false);
        }
      }
    };

    loadAddonSources();

    return () => {
      cancelled = true;
    };
  }, [
    title,
    tmdbId,
    imdbId,
    mediaType,
    season,
    episode,
  ]);

  const sources = [];

  /*
   * RD fallback.
   */
  sources.push({
    id: "rd",
    kind: "rd",
    label: "Real-Debrid",
    note:
      "Find cached stream or resolve a source",
  });

  /*
   * Addon streams.
   */
  scrapedStreams.forEach(
    (stream) => {
      sources.push(stream);
    }
  );

  /*
   * User magnet.
   */
  sources.push({
    id: "paste",
    kind: "paste",
    label: "Paste Magnet",
    note:
      "Send your magnet through Real-Debrid",
  });

  /*
   * Trailer.
   */
  if (trailerUrl) {
    sources.push({
      id: "trailer",
      kind: "trailer",
      label: "Trailer",
      note: "YouTube",
    });
  }

  /*
   * Live channels.
   */
  (liveMatches || []).forEach(
    (channel, index) => {
      sources.push({
        id:
          `live-${index}`,
        kind: "live",
        label:
          channel.name,
        note:
          `Live • ${
            channel.group ||
            "Free-to-air"
          }`,
        logo:
          channel.logo,
        channel,
      });
    }
  );

  /*
   * Public archive search.
   */
  sources.push({
    id: "archive",
    kind: "archive",
    label: "Free Archive",
    note:
      "Public-domain Internet Archive",
  });

  /*
   * Official providers.
   */
  (providers || []).forEach(
    (provider) => {
      if (!provider?.link) return;

      sources.push({
        id:
          `provider-${provider.name}`,
        kind: "provider",
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

  /*
   * Start playback.
   */
  const playSource = (source) => {
    if (!source) return;

    /*
     * Official provider:
     * open externally.
     */
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

    /*
     * Archive:
     * open externally.
     */
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

    /*
     * Addon source.
     *
     * IMPORTANT:
     * Do not set noRd=true.
     *
     * A torrent/infoHash must be allowed
     * to go through Real-Debrid.
     */
    if (
      source.kind ===
      "addon-stream"
    ) {
      player.play({
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

        sources: [
          {
            label:
              source.label,

            type:
              source.type,

            src:
              source.url,

            url:
              source.url,

            magnet:
              source.type === "rd"
                ? source.url
                : undefined,

            infoHash:
              source.infoHash,

            behaviorHints:
              source.behaviorHints,
          },
        ],
      });

      return;
    }

    /*
     * Trailer.
     */
    if (
      source.kind ===
      "trailer"
    ) {
      player.play({
        title,
        poster,
        sources: [
          {
            label: "Trailer",
            type: "youtube",
            src: trailerUrl,
          },
        ],
      });

      return;
    }

    /*
     * Live TV.
     */
    if (
      source.kind ===
      "live"
    ) {
      player.play({
        title:
          source.channel.name,

        poster:
          source.channel.logo,

        type: "live",

        sources: [
          {
            label: "LIVE",
            type: "live",
            src:
              source.channel.url,
            live: true,
          },
        ],
      });

      return;
    }

    /*
     * Manual magnet.
     */
    if (
      source.kind ===
      "paste"
    ) {
      player.play({
        title,

        poster,

        rdTitle:
          title,

        rdYear,

        rdSeason:
          season,

        rdEpisode:
          episode,

        sources: [
          {
            label:
              "Real-Debrid",

            type: "rd",

            src: "",

            skipAutoResolve:
              true,
          },
        ],
      });

      return;
    }

    /*
     * RD automatic search.
     */
    if (
      source.kind ===
      "rd"
    ) {
      player.play({
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

        sources: [
          {
            label:
              "Real-Debrid",

            type:
              "rd",

            src: "",
          },
        ],
      });
    }
  };

  const iconFor = (
    kind
  ) => {
    if (
      kind === "rd"
    ) {
      return (
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
      kind === "paste"
    ) {
      return (
        <LinkIcon className="w-4 h-4 text-mg-green" />
      );
    }

    if (
      kind === "trailer"
    ) {
      return (
        <Play className="w-4 h-4 text-white/70" />
      );
    }

    if (
      kind === "live"
    ) {
      return (
        <Radio className="w-4 h-4 text-red-400" />
      );
    }

    return (
      <Tv className="w-4 h-4 text-white/70" />
    );
  };

  const rowClass =
    (kind) =>
      cn(
        "flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md transition-colors border",

        kind === "rd" &&
          "bg-mg-green/10 hover:bg-mg-green/20 border-mg-green/30",

        kind ===
          "addon-stream" &&
          "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30",

        kind === "live" &&
          "bg-red-500/10 hover:bg-red-500/20 border-red-500/30",

        ![
          "rd",
          "addon-stream",
          "live",
        ].includes(kind) &&
          "bg-white/5 hover:bg-white/10 border-transparent"
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
          }).map((_, index) => (
            <div
              key={index}
              className="h-10 rounded-md bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sources.map(
            (source) => (
              <button
                key={
                  source.id
                }
                onClick={() =>
                  playSource(
                    source
                  )
                }
                className={rowClass(
                  source.kind
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
                    className={cn(
                      "block text-sm font-medium truncate",
                      [
                        "rd",
                        "addon-stream",
                        "live",
                      ].includes(
                        source.kind
                      )
                        ? "text-mg-green"
                        : "text-white"
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

                {[
                  "provider",
                  "archive",
                ].includes(
                  source.kind
                ) ? (
                  <ExternalLink className="w-3.5 h-3.5 text-white/40 shrink-0" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white/40 shrink-0" />
                )}
              </button>
            )
          )}

          {scraping && (
            <p className="text-[10px] text-white/30 px-1 pt-1">
              Checking installed addons…
            </p>
          )}

          {liveMatches === null && (
            <p className="text-[10px] text-white/30 px-1 pt-1">
              Checking live channels…
            </p>
          )}

          {!scraping &&
            scrapedStreams.length ===
              0 && (
              <p className="text-[10px] text-white/30 px-1 pt-1">
                No addon streams returned.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
