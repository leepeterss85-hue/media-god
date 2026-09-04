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
    stream?.infoHash ||
    stream?.info_hash ||
    "";

  const url =
    stream?.url ||
    stream?.link ||
    stream?.src ||
    (infoHash
      ? `magnet:?xt=urn:btih:${infoHash}`
      : "");

  if (!url) return null;

  const magnet =
    String(url)
      .toLowerCase()
      .startsWith("magnet:") ||
    !!infoHash;

  const rawTitle =
    stream?.title ||
    stream?.name ||
    stream?.filename ||
    "Stream Source";

  return {
    id: `${addon?.name || "addon"}-${Math.random()
      .toString(36)
      .slice(2)}`,

    kind: "addon-stream",

    label: String(rawTitle).split("\n")[0],

    note:
      stream?.name ||
      addon?.name ||
      "Addon source",

    url,

    src: url,

    infoHash:
      infoHash ||
      undefined,

    type:
      magnet
        ? "rd"
        : "url",

    behaviorHints:
      stream?.behaviorHints ||
      stream?.behavior_hints ||
      {},

    addon:
      addon?.name ||
      "Addon",
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
}) {
  const player = usePlayer();

  const [liveMatches, setLiveMatches] =
    useState(null);

  const [scrapedStreams, setScrapedStreams] =
    useState([]);

  const [scraping, setScraping] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    setLiveMatches(null);
    setScrapedStreams([]);
    setScraping(true);

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

    const loadAddonSources =
      async () => {
        try {
          const addons =
            await base44.entities.Addon.list(
              "-created_date",
              100
            );

          const activeAddons =
            (addons || []).filter(
              (addon) =>
                addon?.active &&
                addon?.url
            );

          const isSeries =
            mediaType === "tv";

          let resolvedImdb =
            imdbId || "";

          /*
           * Resolve the TMDB id to IMDb if
           * the caller did not already provide
           * an IMDb id.
           */
          if (
            !resolvedImdb &&
            tmdbId != null
          ) {
            try {
              const res =
                await fetch(
                  `https://api.themoviedb.org/3/${
                    isSeries
                      ? "tv"
                      : "movie"
                  }/${tmdbId}/external_ids?api_key=38267272847a9ef3878b273b37963d76`
                );

              if (res.ok) {
                const data =
                  await res.json();

                resolvedImdb =
                  data?.imdb_id ||
                  "";
              }
            } catch {
              /*
               * PlayerProvider will also
               * attempt IMDb resolution when
               * playback starts.
               */
            }
          }

          /*
           * Without an IMDb id there is no
           * reliable addon stream lookup.
           */
          if (!resolvedImdb) {
            if (!cancelled) {
              setScrapedStreams([]);
            }

            return;
          }

          const media =
            isSeries
              ? "series"
              : "movie";

          const endpointId =
            resolvedImdb;

          const results =
            await Promise.all(
              activeAddons.map(
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

                    const targetUrl =
                      `${baseUrl}/stream/${media}/${endpointId}.json`;

                    const controller =
                      new AbortController();

                    const timeout =
                      setTimeout(
                        () =>
                          controller.abort(),
                        10000
                      );

                    try {
                      const res =
                        await fetch(
                          targetUrl,
                          {
                            signal:
                              controller.signal,
                          }
                        );

                      if (!res.ok) {
                        return [];
                      }

                      const data =
                        await res.json();

                      if (
                        !Array.isArray(
                          data?.streams
                        )
                      ) {
                        return [];
                      }

                      return data.streams
                        .map(
                          (stream) =>
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
                    String(
                      stream?.url ||
                        ""
                    ).trim();

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
              unique.slice(0, 25)
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
  ]);

  /*
   * The Real-Debrid row is a launcher.
   *
   * It must NEVER be passed to VideoPlayer
   * with an empty src. Instead, use the real
   * addon streams already discovered above.
   */
  const sources = [
    {
      id: "rd",
      kind: "rd",
      label: "Real-Debrid",

      note: scraping
        ? "Checking installed addons…"
        : scrapedStreams.length
          ? `${
              scrapedStreams.length
            } source${
              scrapedStreams.length === 1
                ? ""
                : "s"
            } available`
          : "No addon stream available",
    },

    ...scrapedStreams,

    {
      id: "paste",
      kind: "paste",
      label: "Paste Magnet",
      note:
        "Send your own magnet through Real-Debrid",
    },

    ...(trailerUrl
      ? [
          {
            id: "trailer",
            kind: "trailer",
            label: "Trailer",
            note: "YouTube",
          },
        ]
      : []),

    ...(liveMatches || []).map(
      (c, i) => ({
        id: `live-${i}`,
        kind: "live",
        label: c.name,
        note: `Live • ${
          c.group ||
          "Free-to-air"
        }`,
        logo: c.logo,
        channel: c,
      })
    ),

    {
      id: "archive",
      kind: "archive",
      label: "Free Archive",
      note:
        "Public-domain Internet Archive",
    },

    ...(providers || [])
      .filter((p) => p?.link)
      .map((p) => ({
        id: `provider-${p.name}`,
        kind: "provider",
        label: p.name,
        note:
          p.tier ||
          "Stream",
        logo: p.logo,
        link: p.link,
      })),
  ];

  const playSource = (s) => {
    /*
     * External provider.
     */
    if (
      s.kind === "provider"
    ) {
      window.open(
        s.link,
        "_blank",
        "noopener,noreferrer"
      );

      return;
    }

    /*
     * Internet Archive.
     */
    if (
      s.kind === "archive"
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
     * An actual addon stream.
     *
     * If it is a magnet, PlayerProvider /
     * VideoPlayer will send it through
     * Real-Debrid.
     *
     * If it is a direct HTTP URL, it can
     * be played directly.
     */
    if (
      s.kind === "addon-stream"
    ) {
      player.play({
        id: tmdbId,

        imdbId,

        title,

        poster,

        year: rdYear,

        mediaType,

        rdTitle: title,

        rdYear,

        sources: [
          {
            label:
              s.label,

            type:
              s.type,

            src:
              s.src,

            url:
              s.url,

            magnet:
              s.type === "rd"
                ? s.url
                : undefined,

            infoHash:
              s.infoHash,

            behaviorHints:
              s.behaviorHints,
          },
        ],
      });

      return;
    }

    /*
     * Trailer.
     */
    if (
      s.kind === "trailer"
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
     * Live channel.
     */
    if (
      s.kind === "live"
    ) {
      player.play({
        type: "live",

        title:
          s.channel.name,

        poster:
          s.channel.logo,

        sources: [
          {
            label: "LIVE",
            type: "live",
            src:
              s.channel.url,
            live: true,
          },
        ],
      });

      return;
    }

    /*
     * Paste Magnet.
     *
     * This deliberately remains available
     * for the user's own magnet input flow.
     */
    if (
      s.kind === "paste"
    ) {
      player.play({
        title,

        poster,

        rdTitle: title,

        rdYear,

        sources: [
          {
            label:
              "Real-Debrid",

            type: "rd",

            src: "",
          },
        ],
      });

      return;
    }

    /*
     * Real-Debrid launcher.
     *
     * IMPORTANT:
     * The old version sent:
     *
     * type: "rd",
     * src: ""
     *
     * which caused the exact error shown
     * in the screenshot.
     *
     * We now use the real discovered
     * addon streams instead.
     */
    if (
      s.kind === "rd"
    ) {
      /*
       * Do not attempt playback while
       * addon discovery is still running.
       */
      if (scraping) {
        return;
      }

      /*
       * Do not open VideoPlayer with an
       * empty Real-Debrid source.
       */
      if (
        !scrapedStreams.length
      ) {
        return;
      }

      /*
       * Pass every discovered stream into
       * PlayerProvider.
       *
       * PlayerProvider will prefer genuine
       * direct URLs and then Real-Debrid
       * torrent/magnet sources.
       */
      player.play({
        id: tmdbId,

        imdbId,

        title,

        poster,

        year: rdYear,

        mediaType,

        rdTitle: title,

        rdYear,

        sources:
          scrapedStreams.map(
            (stream) => ({
              label:
                stream.label ||
                "Addon Source",

              type:
                stream.type ||
                "url",

              src:
                stream.src ||
                stream.url ||
                "",

              url:
                stream.url ||
                stream.src ||
                "",

              magnet:
                stream.type === "rd"
                  ? stream.url ||
                    stream.src
                  : undefined,

              infoHash:
                stream.infoHash,

              behaviorHints:
                stream.behaviorHints,
            })
          ),
      });

      return;
    }
  };

  const iconFor = (kind) => {
    if (
      kind === "rd"
    ) {
      return (
        <Zap className="w-4 h-4 text-mg-green" />
      );
    }

    if (
      kind === "addon-stream"
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

    if (
      kind === "archive"
    ) {
      return (
        <Globe className="w-4 h-4 text-white/70" />
      );
    }

    return (
      <Tv className="w-4 h-4 text-white/70" />
    );
  };

  const rowClass = (kind) =>
    cn(
      "flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md transition-colors border",

      kind === "rd" &&
        "bg-mg-green/10 hover:bg-mg-green/20 border-mg-green/30",

      kind === "addon-stream" &&
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

  const labelClass = (kind) =>
    cn(
      "block text-sm font-medium truncate",

      [
        "rd",
        "addon-stream",
        "live",
      ].includes(kind)
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
          }).map((_, i) => (
            <div
              key={i}
              className="h-10 rounded-md bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() =>
                playSource(s)
              }
              disabled={
                s.kind === "rd" &&
                (
                  scraping ||
                  scrapedStreams.length ===
                    0
                )
              }
              className={cn(
                rowClass(
                  s.kind
                ),

                s.kind === "rd" &&
                  (
                    scraping ||
                    scrapedStreams.length ===
                      0
                  ) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="w-8 h-8 rounded-md bg-black/30 flex items-center justify-center shrink-0 overflow-hidden">
                {s.logo ? (
                  <img
                    src={s.logo}
                    alt={s.label}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  iconFor(
                    s.kind
                  )
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={labelClass(
                    s.kind
                  )}
                >
                  {s.label}
                </span>

                <span className="block text-[10px] text-white/40 truncate">
                  {s.note}
                </span>
              </span>

              {s.kind ===
                "provider" ||
              s.kind ===
                "archive" ? (
                <ExternalLink className="w-3.5 h-3.5 text-white/40 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 text-white/40 shrink-0" />
              )}
            </button>
          ))}

          {scraping && (
            <p className="text-[10px] text-white/30 px-1 pt-1">
              Checking installed addons…
            </p>
          )}

          {liveMatches ===
            null && (
            <p className="text-[10px] text-white/30 px-1 pt-1">
              Checking live channels…
            </p>
          )}

          {!scraping &&
            scrapedStreams.length ===
              0 && (
              <p className="text-[10px] text-white/30 px-1 pt-1">
                No addon streams returned yet.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
