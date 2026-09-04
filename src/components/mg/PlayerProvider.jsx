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

const PlayerContext = createContext(null);

const FOREIGN_RE =
  /(truefrench|vostfr|vost|subfrench|vf\b|vff|vfi|multi-audio|multiaudio|dual\.audio|\bdubbed\b|\bdub\b)/i;
const RES_RE = /(\d{3,4})p/i;

const getSourceUrl = (item) =>
  String(
    item?.src ||
      item?.url ||
      item?.magnet ||
      item?.magnetLink ||
      ""
  ).trim();

const isMagnetSource = (item) => {
  const url = getSourceUrl(item).toLowerCase();

  return (
    item?.type === "rd" ||
    item?.type === "rd_torrent" ||
    item?.type === "magnet" ||
    item?.type === "torrent" ||
    url.startsWith("magnet:")
  );
};

const isDirectVideoSource = (item) => {
  const url = getSourceUrl(item);

  return (
    /^https?:\/\//i.test(url) &&
    !isMagnetSource(item) &&
    item?.type !== "provider" &&
    item?.type !== "youtube"
  );
};

const scoreSource = (item) => {
  const label = String(item?.label || item?.name || "");
  const resolution = Number((label.match(RES_RE) || [])[1] || 0);
  const languagePenalty = FOREIGN_RE.test(label) ? 10000 : 0;
  const directBonus = isDirectVideoSource(item) ? 5000 : 0;
  const rdBonus = item?.viaRealDebrid ? 20000 : 0;

  return rdBonus + directBonus + resolution - languagePenalty;
};

const sortSources = (items) =>
  [...items].sort((a, b) => scoreSource(b) - scoreSource(a));

const normaliseStream = (stream, addonName) => {
  if (!stream) return null;

  const infoHash = stream?.infoHash || stream?.info_hash || "";
  let url = stream?.url || stream?.link || stream?.src || "";

  if (!url && infoHash) {
    url = `magnet:?xt=urn:btih:${infoHash}`;
  }

  if (!url) return null;

  const magnet =
    String(url).toLowerCase().startsWith("magnet:") || Boolean(infoHash);

  const rawTitle =
    stream?.title || stream?.name || stream?.filename || "Stream";

  return {
    label: `${addonName}: ${String(rawTitle).split("\n")[0]}`,
    type: magnet ? "rd" : "url",
    src: url,
    url,
    magnet: magnet ? url : undefined,
    infoHash: infoHash || undefined,
    addon: addonName,
    behaviorHints:
      stream?.behaviorHints || stream?.behavior_hints || undefined,
  };
};

const dedupeSources = (items) => {
  const seen = new Set();

  return items.filter((item) => {
    if (!item) return false;

    const url = getSourceUrl(item);

    if (!url) {
      return item?.type === "provider" || item?.type === "youtube";
    }

    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

const resolveImdbId = async ({
  id,
  imdbId,
  imdb_id,
  mediaType,
  title,
  year,
}) => {
  if (imdbId || imdb_id) {
    return imdbId || imdb_id;
  }

  if (id && String(id).startsWith("tt")) {
    return String(id);
  }

  const tmdbType = mediaType === "tv" ? "tv" : "movie";

  if (id != null && !Number.isNaN(Number(id))) {
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/${tmdbType}/${id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`
      );

      if (response.ok) {
        const data = await response.json();

        if (data?.imdb_id) {
          return data.imdb_id;
        }
      }
    } catch {
      // Continue to title lookup.
    }
  }

  if (!title) return "";

  try {
    const query = new URLSearchParams({
      api_key: "38267272847a9ef3878b273b37963d76",
      query: title,
    });

    if (year) {
      if (tmdbType === "tv") {
        query.set("first_air_date_year", String(year));
      } else {
        query.set("year", String(year));
      }
    }

    const searchResponse = await fetch(
      `https://api.themoviedb.org/3/search/${tmdbType}?${query.toString()}`
    );

    if (!searchResponse.ok) return "";

    const searchData = await searchResponse.json();
    const match = searchData?.results?.[0];

    if (!match?.id) return "";

    const externalResponse = await fetch(
      `https://api.themoviedb.org/3/${tmdbType}/${match.id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`
    );

    if (!externalResponse.ok) return "";

    const externalData = await externalResponse.json();

    return externalData?.imdb_id || "";
  } catch {
    return "";
  }
};

const fetchAddonStreams = async ({
  imdbId,
  mediaType,
  season,
  episode,
}) => {
  if (!imdbId) return [];

  const isSeries = mediaType === "tv";

  if (isSeries && (season == null || episode == null)) {
    return [];
  }

  let addons = [];

  try {
    addons = await base44.entities.Addon.list(
      "-created_date",
      100
    );
  } catch {
    return [];
  }

  const activeAddons = (addons || []).filter(
    (addon) => addon?.active && addon?.url
  );

  const endpointId = isSeries
    ? `${imdbId}:${season}:${episode}`
    : imdbId;

  const stremioType = isSeries ? "series" : "movie";

  const results = await Promise.allSettled(
    activeAddons.map(async (addon) => {
      const baseUrl = String(addon.url)
        .replace(/\/manifest\.json\/?$/i, "")
        .replace(/\/+$/, "");

      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        8000
      );

      try {
        const response = await fetch(
          `${baseUrl}/stream/${stremioType}/${endpointId}.json`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) return [];

        const data = await response.json();

        if (!Array.isArray(data?.streams)) {
          return [];
        }

        return data.streams
          .map((stream) =>
            normaliseStream(
              stream,
              addon?.name || "Addon"
            )
          )
          .filter(Boolean);
      } catch {
        return [];
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  return results.flatMap((result) =>
    result.status === "fulfilled"
      ? result.value
      : []
  );
};

const findRealDebridSource = async ({
  title,
  imdbId,
  year,
  mediaType,
  season,
  episode,
}) => {
  if (!title && !imdbId) return null;

  try {
    const response = await base44.functions.invoke(
      "realDebrid",
      {
        action: "find_cached",
        title: title || "",
        imdb_id: imdbId || "",
        media_type: mediaType || "movie",

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

    const data = response?.data || {};

    if (
      data?.status === "ready" &&
      data?.stream_url
    ) {
      return {
        label: data?.filename
          ? `Real-Debrid: ${data.filename}`
          : "Real-Debrid",

        type: "url",
        src: data.stream_url,
        url: data.stream_url,
        viaRealDebrid: true,
      };
    }

    if (data?.magnet) {
      return {
        label: data?.filename
          ? `Real-Debrid: ${data.filename}`
          : "Real-Debrid",

        type: "rd",
        src: data.magnet,
        url: data.magnet,
        magnet: data.magnet,
        viaRealDebrid: true,
      };
    }
  } catch {
    // Other available sources can still be used.
  }

  return null;
};

export function PlayerProvider({
  children,
}) {
  const [source, setSource] =
    useState(null);

  const [hasRd, setHasRd] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    base44.auth
      .me()
      .then((user) => {
        if (mounted) {
          setHasRd(
            Boolean(user?.rd_token)
          );
        }
      })
      .catch(() => {
        if (mounted) {
          setHasRd(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const play = useCallback(
    async (request = {}) => {
      const originalSources =
        Array.isArray(
          request?.sources
        )
          ? request.sources.filter(
              Boolean
            )
          : [];

      const isLive =
        request?.type === "live" ||
        originalSources.some(
          (item) =>
            item?.live ||
            item?.type === "live"
        );

      const mediaType =
        request?.mediaType === "tv" ||
        request?.type === "series" ||
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

      const imdbId = isLive
        ? request?.imdbId ||
          request?.imdb_id ||
          ""
        : await resolveImdbId({
            ...request,
            mediaType,
          });

      let sources =
        originalSources.map(
          (item) => {
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
          }
        );

      const shouldUseRd =
        !isLive &&
        hasRd &&
        !request?.noRd &&
        !request?.skipRdLookup;

      const addonPromise =
        !isLive &&
        !request?.skipAddonLookup
          ? fetchAddonStreams({
              imdbId,
              mediaType,
              season,
              episode,
            })
          : Promise.resolve([]);

      const rdPromise =
        shouldUseRd
          ? findRealDebridSource({
              title:
                request?.rdTitle ||
                request?.title ||
                "",

              imdbId,

              year:
                request?.rdYear ??
                request?.year ??
                null,

              mediaType,
              season,
              episode,
            })
          : Promise.resolve(null);

      const [
        discovered,
        rdSource,
      ] = await Promise.all([
        addonPromise,
        rdPromise,
      ]);

      sources = [
        ...(rdSource
          ? [rdSource]
          : []),

        ...sortSources(
          discovered
        ),

        ...sources,
      ];

      sources =
        dedupeSources(sources);

      const usableSources =
        hasRd
          ? sources
          : sources.filter(
              (item) =>
                !isMagnetSource(
                  item
                )
            );

      const rdReadyDirect =
        usableSources.filter(
          (item) =>
            item?.viaRealDebrid &&
            isDirectVideoSource(
              item
            )
        );

      const directSources =
        usableSources.filter(
          (item) =>
            !item?.viaRealDebrid &&
            isDirectVideoSource(
              item
            )
        );

      const rdSources =
        hasRd
          ? usableSources.filter(
              isMagnetSource
            )
          : [];

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

      const liveSources =
        usableSources.filter(
          (item) =>
            item?.type ===
              "live" ||
            item?.live
        );

      const otherSources =
        usableSources.filter(
          (item) =>
            !rdReadyDirect.includes(
              item
            ) &&
            !directSources.includes(
              item
            ) &&
            !rdSources.includes(
              item
            ) &&
            !trailerSources.includes(
              item
            ) &&
            !providerSources.includes(
              item
            ) &&
            !liveSources.includes(
              item
            )
        );

      const orderedSources = [
        ...rdReadyDirect,
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

      const hasActualPlaybackSource =
        orderedSources.some(
          (item) =>
            isDirectVideoSource(
              item
            ) ||
            isMagnetSource(
              item
            ) ||
            item?.type ===
              "live" ||
            item?.live
        );

      const explicitNonVideoRequest =
        request?.allowNonPlaybackFallback ||
        (
          request?.skipAddonLookup &&
          orderedSources.some(
            (item) =>
              item?.type ===
                "youtube" ||
              item?.type ===
                "provider"
          )
        );

      if (
        orderedSources.length === 0 ||
        (
          !hasActualPlaybackSource &&
          !explicitNonVideoRequest
        )
      ) {
        console.warn(
          "[Media God] No playable source was found",
          {
            title:
              request?.title,
            imdbId,
            mediaType,
            season,
            episode,
          }
        );

        return false;
      }

      const primary =
        orderedSources[0];

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
      });

      return true;
    },
    [hasRd]
  );

  const close =
    useCallback(() => {
      setSource(null);
    }, []);

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
          source={source}
          onClose={close}
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
  const sources = [];

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
