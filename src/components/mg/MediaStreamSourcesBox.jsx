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

import {
  fetchBrowserAddonStreams,
  mergeAddonStreams,
  shouldUseBrowserAddonFallback,
} from "@/components/mg/addonBrowserFallback";

import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { buildVidSrcEmbedUrl } from "@/components/mg/vidsrcEmbed";
import { buildEmbedSuEmbedUrl } from "@/components/mg/webEmbedProviders";
import { buildVidCoreEmbedUrl } from "@/components/mg/vidCoreEmbed";
import { buildTwoEmbedEmbedUrl, buildCineSrcEmbedUrl, buildMultiEmbedEmbedUrl } from "@/components/mg/extraEmbedProviders"; import { buildOnlyFlixEmbedUrl } from "@/components/mg/onlyFlixEmbed";
import { fetchTmdbEmbedStreams } from "@/components/mg/tmdbEmbedStreams";
import { cn } from "@/lib/utils";
import { magnetFromInput } from "@/components/mg/magnetStreamHelpers";
import { launchReeznTv } from "@/components/mg/reeznTvLauncher";

const unwrap = (response) =>
  response?.data ??
  response ??
  {};



const resolveImdbId = async ({
  tmdbId,
  imdbId,
  title,
  year,
  mediaType,
}) => {
  const supplied =
    String(
      imdbId ||
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

      error:
        "",
    };
  }

  if (
    tmdbId &&
    /^tt\d+$/i.test(
      String(
        tmdbId
      )
    )
  ) {
    return {
      imdbId:
        String(
          tmdbId
        ),

      status:
        "OK",

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

const serverAddonLookup = async ({
  imdbId,
  tmdbId,
  title,
  year,
  alternateYears = [],
  mediaType,
  season,
  episode,
}) => {
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

          alternate_years:
            Array.isArray(alternateYears)
              ? alternateYears
              : [],

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

      error:
        error?.message ||
        "Configured source lookup failed.",
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
  alternateYears = [],
  tmdbId,
  imdbId,
  mediaType = "movie",
  season = null,
  episode = null,
}) {
  const player =
    usePlayer();

  const hasDebrid =
    Boolean(
      player?.hasDebrid
    );

  const [
    liveMatches,
    setLiveMatches,
  ] =
    useState(
      []
    );

  const [
    addonStreams,
    setAddonStreams,
  ] =
    useState(
      []
    );

  const [visibleSourceCount, setVisibleSourceCount] = useState(24);

  useEffect(() => {
    setVisibleSourceCount(24);
  }, [tmdbId, title, season, episode]);

  const [
    addonLoading,
    setAddonLoading,
  ] =
    useState(
      false
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

  const [
    resolvedImdb,
    setResolvedImdb,
  ] =
    useState(
      ""
    );

  const [
    imdbStatus,
    setImdbStatus,
  ] =
    useState(
      "IDLE"
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      ""
    );

  const [
    rdSearching,
    setRdSearching,
  ] =
    useState(
      false
    );

  const [
    browserAttempted,
    setBrowserAttempted,
  ] =
    useState(
      false
    );

  const [
    browserRecovered,
    setBrowserRecovered,
  ] =
    useState(
      0
    );

  useEffect(() => {
    let cancelled =
      false;

    try {
      const matches =
        findChannelsByTitle(
          title
        );

      if (
        !cancelled
      ) {
        setLiveMatches(
          Array.isArray(
            matches
          )
            ? matches
            : []
        );
      }
    } catch {
      if (
        !cancelled
      ) {
        setLiveMatches(
          []
        );
      }
    }

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

    const load =
      async () => {
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

        setResolvedImdb(
          ""
        );

        setImdbStatus(
          "CHECKING"
        );

        setBrowserAttempted(
          false
        );

        setBrowserRecovered(
          0
        );

        if (!title) {
          setImdbStatus(
            "FAILED"
          );

          setAddonReason(
            "A title is required before sources can be checked."
          );

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
          setImdbStatus(
            "WAITING"
          );

          setAddonReason(
            "Select an episode to search configured playback sources."
          );

          return;
        }

        setAddonLoading(
          true
        );

        try {
          const imdbResult =
            await resolveImdbId(
              {
                tmdbId,

                imdbId,

                title,

                year:
                  rdYear,

                mediaType,
              }
            );

          if (
            cancelled
          ) {
            return;
          }

          setResolvedImdb(
            imdbResult.imdbId
          );

          setImdbStatus(
            imdbResult.status
          );

          if (
            !imdbResult.imdbId &&
            !tmdbId &&
            !title
          ) {
            setAddonReason(
              imdbResult.error ||
              "No usable media identifier or title is available for source lookup."
            );

            return;
          }

          if (!imdbResult.imdbId) {
            setAddonReason(
              "IMDb id was not resolved; trying TMDb/title source fallbacks."
            );
          }

          const server =
            await serverAddonLookup(
              {
                imdbId:
                  imdbResult.imdbId,

                tmdbId,

                title,

                year:
                  rdYear,

                alternateYears,

                mediaType,

                season,

                episode,
              }
            );

          if (
            cancelled
          ) {
            return;
          }

          let streams =
            server.streams ||
            [];

          let diagnostics =
            server.diagnostics ||
            [];

          let checked =
            Number(
              server.addonsChecked ||
              0
            );

          let reason =
            server.reason ||
            "";

          if (
            shouldUseBrowserAddonFallback(
              server
            )
          ) {
            const browser =
              await fetchBrowserAddonStreams(
                {
                  imdbId:
                    imdbResult.imdbId,

                  tmdbId,

                  title,

                  year:
                    rdYear,

                  alternateYears,

                  mediaType,

                  season,

                  episode,
                }
              );

            if (
              cancelled
            ) {
              return;
            }

            streams =
              mergeAddonStreams(
                server.streams,

                browser.streams
              );

            diagnostics = [
              ...(
                server.diagnostics ||
                []
              ),

              ...(
                browser.diagnostics ||
                []
              ),
            ];

            checked =
              Math.max(
                Number(
                  server.addonsChecked ||
                  0
                ),

                Number(
                  browser.addonsChecked ||
                  0
                )
              );

            setBrowserAttempted(
              Boolean(
                browser.attempted
              )
            );

            setBrowserRecovered(
              Array.isArray(
                browser.streams
              )
                ? browser
                    .streams
                    .length
                : 0
            );

            if (
              browser.streams
                ?.length > 0
            ) {
              reason =
                `Browser fallback recovered ${browser.streams.length} playable source${
                  browser.streams.length ===
                  1
                    ? ""
                    : "s"
                }.`;
            } else if (
              !reason &&
              browser.error
            ) {
              reason =
                browser.error;
            }
          }

          try {
            const tmdbEmbed = await fetchTmdbEmbedStreams({
              tmdbId,
              mediaType,
              season,
              episode,
            });

            if (!cancelled && Array.isArray(tmdbEmbed.streams) && tmdbEmbed.streams.length > 0) {
              streams = [
                ...streams,
                ...tmdbEmbed.streams.map((stream) => ({
                  ...stream,
                  browserFallback: false,
                })),
              ];

              diagnostics = [
                ...diagnostics,
                {
                  name: "TMDB Embed API",
                  status: "ok",
                  message: `${tmdbEmbed.streams.length} TMDB Embed source${tmdbEmbed.streams.length === 1 ? "" : "s"}`,
                },
              ];

              checked = Math.max(checked, 1);
            }
          } catch {
            // TMDB Embed is an optional self-hosted source; ignore failures.
          }

          setAddonStreams(
            streams
          );

          setAddonDiagnostics(
            diagnostics
          );

          setAddonsChecked(
            checked
          );

          setAddonReason(
            reason
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

    load();

    return () => {
      cancelled =
        true;
    };
  }, [
    title,

    rdYear,

    alternateYears,

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
            if (
              !stream
            ) {
              return false;
            }

            if (
              stream?.type ===
                "rd" &&
              !hasDebrid
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

        hasDebrid,
      ]
    );

  const failedAddonCount =
    useMemo(
      () =>
        addonDiagnostics.filter(
          (item) => {
            const status =
              String(
                item?.status ||
                ""
              );

            return (
              status &&
              status !==
                "ok" &&
              status !==
                "browser_ok"
            );
          }
        ).length,
      [
        addonDiagnostics,
      ]
    );

  const playCombinedDebrid =
    async () => {
      if (!hasDebrid) {
        setMessage(
          "Connect a debrid service in Settings first."
        );

        return;
      }

      if (
        rdSearching
      ) {
        return;
      }

      setRdSearching(
        true
      );

      setMessage(
        ""
      );

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

          alternateYears,

          rdAlternateYears:
            alternateYears,

          rdSeason:
            season,

          rdEpisode:
            episode,

          preferRd:
            true,

          debridManual:
            true,

          sources:
            [],
          completeSources: visibleAddonStreams,
        });
      } catch (error) {
        setMessage(
          error?.message ||
          "Combined Debrid playback lookup failed."
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
        stream?.type ===
          "rd" &&
        !hasDebrid
      ) {
        setMessage(
          "This source needs a debrid service. Connect one in Settings first."
        );

        return;
      }

      setMessage(
        ""
      );

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

        alternateYears,

        rdAlternateYears:
          alternateYears,

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
        completeSources: visibleAddonStreams,
      });
    };

  const pasteMagnet =
    async () => {
      if (!hasDebrid) {
        setMessage(
          "Connect a debrid service in Settings first."
        );

        return;
      }

      const value =
        window.prompt(
          "Paste your magnet link or torrent hash here."
        );

      if (
        value == null
      ) {
        return;
      }

      const magnet =
        magnetFromInput(
          value
        );

      if (!magnet) {
        setMessage(
          "That is not a valid magnet link or torrent hash."
        );

        return;
      }

      setMessage(
        ""
      );

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

  const pasteMagnetForWebtor =
    async () => {
      const value =
        window.prompt(
          "Paste your magnet link or torrent hash for Webtor.io"
        );

      if (
        value == null
      ) {
        return;
      }

      const magnet =
        magnetFromInput(
          value
        );

      if (
        !magnet
      ) {
        setMessage(
          "That is not a valid magnet link or torrent hash."
        );

        return;
      }

      setMessage(
        ""
      );

      player.playWebtor({
        title,
        poster,
        magnet,
      });
    };

  const pasteMagnetForWebTorrent =
    async () => {
      const value =
        window.prompt(
          "Paste your magnet link or torrent hash for WebTorrent"
        );

      if (
        value == null
      ) {
        return;
      }

      const magnet =
        magnetFromInput(
          value
        );

      if (
        !magnet
      ) {
        setMessage(
          "That is not a valid magnet link or torrent hash."
        );

        return;
      }

      setMessage(
        ""
      );

      player.playWebTorrent({
        title,
        poster,
        magnet,
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

  const vidSrcUrl = buildVidSrcEmbedUrl({
    mediaType,
    imdbId: resolvedImdb || imdbId,
    tmdbId,
    season,
    episode,
  });

  const embedSuUrl = buildEmbedSuEmbedUrl({
    mediaType,
    tmdbId,
    season,
    episode,
  });

  const vidCoreUrl = buildVidCoreEmbedUrl({
    mediaType,
    tmdbId,
    season,
    episode,
  });

  const twoEmbedUrl = buildTwoEmbedEmbedUrl({ mediaType, tmdbId, imdbId: resolvedImdb || imdbId, season, episode });
  const cineSrcUrl = buildCineSrcEmbedUrl({ mediaType, tmdbId, season, episode });
  const multiEmbedUrl = buildMultiEmbedEmbedUrl({ mediaType, tmdbId, imdbId: resolvedImdb || imdbId, season, episode });
  const onlyFlixUrl = buildOnlyFlixEmbedUrl({ mediaType, tmdbId, imdbId: resolvedImdb || imdbId, season, episode });

  const rows = [
    {
      id:
        "rd",

      kind:
        "rd",

      label:
        "Combined Debrid",

      note:
        hasDebrid
          ? "Search addons and resolve through all connected debrid services"
          : "Connect a debrid service in Settings",

      onClick:
        playCombinedDebrid,
    },

    ...(vidSrcUrl ? [{
      id: "vidsrc-web-player",
      kind: "vidsrc",
      label: "VidSrc web player",
      note: "Manual backup • uses VidSrc's own controls",
      onClick: () => player.playVidSrc({
        id: tmdbId,
        tmdbId,
        imdbId: resolvedImdb || imdbId,
        title,
        poster,
        mediaType,
        season,
        episode,
      }),
    }] : []),

    ...(embedSuUrl ? [{
      id: "embedsu-web-player",
      kind: "embedsu",
      label: "Embed.su web player",
      note: "Manual backup • UpStream, MixDrop and VidCloud if discovered",
      onClick: () => player.playEmbedSu({
        id: tmdbId,
        tmdbId,
        title,
        poster,
        mediaType,
        season,
        episode,
      }),
    }] : []),

    ...(vidCoreUrl ? [{
      id: "vidcore-web-player",
      kind: "vidcore",
      label: "VidCore web player",
      note: "Manual backup • uses VidCore's own controls",
      onClick: () => player.playVidCore({
        id: tmdbId,
        tmdbId,
        title,
        poster,
        mediaType,
        season,
        episode,
      }),
    }] : []),

    ...(twoEmbedUrl ? [{
      id: "twoembed-web-player",
      kind: "twoembed",
      label: "2Embed web player",
      note: "Manual backup • uses 2Embed's own controls",
      onClick: () => player.playExtraEmbed("twoembed", { id: tmdbId, tmdbId, imdbId: resolvedImdb || imdbId, title, poster, mediaType, season, episode }),
    }] : []),

    ...(cineSrcUrl ? [{
      id: "cinesrc-web-player",
      kind: "cinesrc",
      label: "CineSrc web player",
      note: "Manual backup • controllable player",
      onClick: () => player.playExtraEmbed("cinesrc", { id: tmdbId, tmdbId, title, poster, mediaType, season, episode }),
    }] : []),

    ...(multiEmbedUrl ? [{
      id: "multiembed-web-player",
      kind: "multiembed",
      label: "MultiEmbed web player",
      note: "Manual backup • uses MultiEmbed's own controls",
      onClick: () => player.playExtraEmbed("multiembed", { id: tmdbId, tmdbId, imdbId: resolvedImdb || imdbId, title, poster, mediaType, season, episode }),
    }] : []),

    ...(onlyFlixUrl ? [{
      id: "onlyflix-web-player",
      kind: "onlyflix",
      label: "OnlyFlix • Multiple Servers",
      note: "Open OnlyFlix's own webpage and choose an available server for this film or episode",
      onClick: () => player.playOnlyFlix({ id: tmdbId, tmdbId, imdbId: resolvedImdb || imdbId, title, poster, mediaType, season, episode }),
    }] : []),

    ...(mediaType === "live" ? [{
      id: "reezntv-external-app",
      kind: "reezn",
      label: "ReeznTV app",
      note: "External app • open ReeznTV and choose the live channel",
      onClick: () => launchReeznTv(),
    }] : []),

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
            `${provider?.tier || "Where to watch"} • Official service`,

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

    ...visibleAddonStreams.slice(0, visibleSourceCount).map(
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

        providerBadge:
          /mediafusion/i.test(
            String(
              stream?.addon ||
              ""
            )
          )
            ? "MEDIAFUSION"
            : /aiostreams?/i.test(
                String(
                  stream?.addon ||
                  ""
                )
              )
              ? "AIO"
              : /comet/i.test(
                  String(
                    stream?.addon ||
                    ""
                  )
                )
                ? "COMET"
                : "",

        note:
          stream?.type ===
          "rd"
            ? `${stream?.addon || "Addon"} • Combined Debrid source${
                stream?.browserFallback
                  ? " • Browser fallback"
                  : ""
              }`
            : stream?.type ===
                "provider"
              ? `${stream?.addon || "Addon"} • Provider`
              : stream?.type ===
                  "youtube"
                ? `${stream?.addon || "Addon"} • Video`
                : `${stream?.addon || "Addon"} • Direct stream${
                    stream?.browserFallback
                      ? " • Browser fallback"
                      : ""
                  }`,

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
        "Send your own magnet through all connected debrid services",

      onClick:
        pasteMagnet,
    },

    {
      id:
        "webtor",

      kind:
        "webtor",

      label:
        "Webtor.io",

      note:
        "Stream your magnet via Webtor.io cloud player",

      onClick:
        pasteMagnetForWebtor,
    },

    {
      id:
        "webtorrent",

      kind:
        "webtorrent",

      label:
        "WebTorrent",

      note:
        "Stream your magnet directly in browser via WebRTC",

      onClick:
        pasteMagnetForWebTorrent,
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

  ];

  const iconFor = (
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

    if (kind === "vidsrc" || kind === "embedsu" || kind === "vidcore" || kind === "onlyflix") {
      return <ExternalLink className="w-4 h-4 text-amber-300" />;
    }

    if (kind === "webtor" || kind === "webtorrent") {
      return <Globe className="w-4 h-4 text-purple-400" />;
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

      <p className="text-[10px] text-white/45 leading-relaxed mb-2.5 px-1">
        Press <span className="text-mg-green font-semibold">Play</span> on any
        card for a confirmed working copy. Try the other links below for a
        potentially better copy, but some may not be in English, have no
        sound, or have worse picture quality.
      </p>

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
                    : (row.kind === "vidsrc" || row.kind === "embedsu" || row.kind === "vidcore" || row.kind === "onlyflix")
                      ? "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30"
                    : (row.kind === "webtor" || row.kind === "webtorrent")
                      ? "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30"
                    : row.kind ===
                        "addon-stream"
                      ? "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30"
                      : row.kind ===
                          "live"
                        ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30"
                        : "bg-white/5 hover:bg-white/10 border-transparent",

                  row.kind ===
                    "rd" &&
                    !hasDebrid &&
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

                {row.providerBadge && (
                  <span className="shrink-0 rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-cyan-300">
                    {row.providerBadge}
                  </span>
                )}

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

          {visibleAddonStreams.length > visibleSourceCount && (
            <button
              type="button"
              onClick={() => setVisibleSourceCount((count) => count + 24)}
              className="w-full min-h-11 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-mg-green hover:bg-white/10"
            >
              Show more sources ({visibleAddonStreams.length - visibleSourceCount} remaining)
            </button>
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
                {browserAttempted
                  ? ` · browser fallback ${browserRecovered}`
                  : ""}
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
                      key={`${item?.name || "addon"}-${item?.status || "status"}-${index}`}
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
                    source check
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