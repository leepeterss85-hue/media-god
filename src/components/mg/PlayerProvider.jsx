import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { base44 } from "@/api/base44Client";
import VideoPlayer from "@/components/mg/VideoPlayer";

const PlayerContext = createContext(null);

const FOREIGN_RE =
  /(truefrench|vostfr|vost|subfrench|vf\b|vff|vfi|multi-audio|multiaudio|dual\.audio|\bdubbed\b|\bdub\b)/i;

const isForeign = (label) => FOREIGN_RE.test(label || "");

const RES_RE = /(\d{3,4})p/;

const sortEnglishFirst = (list) =>
  list.slice().sort((a, b) => {
    const fa = isForeign(a.label) ? 1 : 0;
    const fb = isForeign(b.label) ? 1 : 0;

    if (fa !== fb) return fa - fb;

    const ra = parseInt((a.label?.match(RES_RE) || [])[1] || "0", 10);
    const rb = parseInt((b.label?.match(RES_RE) || [])[1] || "0", 10);

    return rb - ra;
  });

const normaliseStream = (stream, addonName) => {
  const infoHash = stream?.infoHash || stream?.info_hash || "";

  let streamUrl =
    stream?.url ||
    stream?.link ||
    stream?.src ||
    "";

  if (!streamUrl && infoHash) {
    streamUrl = `magnet:?xt=urn:btih:${infoHash}`;
  }

  if (!streamUrl) return null;

  const isMagnet =
    streamUrl.toLowerCase().startsWith("magnet:") ||
    !!infoHash;

  const rawTitle =
    stream?.title ||
    stream?.name ||
    stream?.filename ||
    "";

  return {
    label: rawTitle
      ? `${addonName}: ${String(rawTitle).split("\n")[0]}`
      : `${addonName} Source`,
    type: isMagnet ? "rd" : "url",
    src: streamUrl,
    magnet: isMagnet ? streamUrl : undefined,
    infoHash: infoHash || undefined,
    addon: addonName,
  };
};

export function PlayerProvider({ children }) {
  const [source, setSource] = useState(null);
  const [hasRd, setHasRd] = useState(false);

  useEffect(() => {
    let mounted = true;

    base44.auth
      .me()
      .then((u) => {
        if (mounted) setHasRd(!!u?.rd_token);
      })
      .catch(() => {
        if (mounted) setHasRd(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const play = useCallback(
    async (s) => {
      const originalSources = s?.sources ? [...s.sources] : [];

      const isLive =
        s?.type === "live" ||
        originalSources.some(
          (x) => x?.live || x?.type === "live"
        );

      const isSeries =
        s?.type === "series" ||
        s?.mediaType === "tv" ||
        s?.season != null ||
        s?.episode != null;

      /*
       * Convert a numeric TMDB id to an IMDb id.
       * Addons generally work much better with IMDb ids.
       */
      let mediaId = s?.imdbId || s?.imdb_id || "";

      if (!mediaId && s?.id && !isNaN(s.id)) {
        try {
          const tmdbType = isSeries ? "tv" : "movie";

          const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/${tmdbType}/${s.id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`
          );

          if (tmdbRes.ok) {
            const tmdbData = await tmdbRes.json();

            if (tmdbData?.imdb_id) {
              mediaId = tmdbData.imdb_id;
            }
          }
        } catch {
          // Keep going. Title search below is the fallback.
        }
      }

      if (
        !mediaId &&
        s?.id &&
        String(s.id).startsWith("tt")
      ) {
        mediaId = String(s.id);
      }

      /*
       * Final metadata fallback.
       */
      if (!mediaId && s?.title) {
        try {
          const tmdbType = isSeries ? "tv" : "movie";

          const searchUrl =
            `https://api.themoviedb.org/3/search/${tmdbType}` +
            `?api_key=38267272847a9ef3878b273b37963d76` +
            `&query=${encodeURIComponent(s.title)}` +
            (s.year
              ? `&year=${encodeURIComponent(s.year)}`
              : "");

          const searchRes = await fetch(searchUrl);

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const firstMatch = searchData?.results?.[0];

            if (firstMatch?.id) {
              const extRes = await fetch(
                `https://api.themoviedb.org/3/${tmdbType}/${firstMatch.id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`
              );

              if (extRes.ok) {
                const extData = await extRes.json();

                if (extData?.imdb_id) {
                  mediaId = extData.imdb_id;
                }
              }
            }
          }
        } catch {
          // We can still use title search with the addons.
        }
      }

      let sources = [];

      /*
       * Keep explicit sources supplied by the caller.
       * Trailer/provider links are preserved.
       */
      for (const item of originalSources) {
        if (!item) continue;

        sources.push({
          ...item,
          src:
            item.src ||
            item.url ||
            item.magnet ||
            item.magnetLink ||
            "",
        });
      }

      /*
       * Ask every active addon for real playable sources.
       *
       * IMPORTANT:
       * We do this regardless of whether the item exists in
       * the Real-Debrid library.
       */
      if (!isLive) {
        try {
          const addons = await base44.entities.Addon.list(
            "-created_date",
            100
          );

          const activeAddons = (addons || []).filter(
            (addon) => addon?.active && addon?.url
          );

          const addonPromises = activeAddons.map(
            async (addon) => {
              try {
                const baseUrl = String(addon.url)
                  .replace(/\/manifest\.json\/?$/, "")
                  .replace(/\/+$/, "");

                const mediaType = isSeries
                  ? "series"
                  : "movie";

                /*
                 * For TV:
                 * IMDb:season:episode
                 *
                 * For movies:
                 * IMDb
                 */
                let queryPath = "";

                if (mediaId) {
                  if (
                    isSeries &&
                    s?.season != null &&
                    s?.episode != null
                  ) {
                    queryPath =
                      `${mediaId}:${s.season}:${s.episode}`;
                  } else {
                    queryPath = mediaId;
                  }
                } else {
                  queryPath =
                    `search:${encodeURIComponent(
                      s?.title || ""
                    )}`;
                }

                const targetUrl =
                  `${baseUrl}/stream/${mediaType}/${queryPath}.json`;

                const controller = new AbortController();

                const timeout = setTimeout(() => {
                  controller.abort();
                }, 10000);

                try {
                  const response = await fetch(
                    targetUrl,
                    {
                      signal: controller.signal,
                    }
                  );

                  if (!response.ok) {
                    return [];
                  }

                  const data = await response.json();

                  if (!Array.isArray(data?.streams)) {
                    return [];
                  }

                  return data.streams
                    .map((stream) =>
                      normaliseStream(
                        stream,
                        addon.name || "Addon"
                      )
                    )
                    .filter(Boolean);
                } finally {
                  clearTimeout(timeout);
                }
              } catch {
                return [];
              }
            }
          );

          const addonResults =
            await Promise.all(addonPromises);

          const discoveredSources =
            addonResults.flat();

          sources = [
            ...sortEnglishFirst(discoveredSources),
            ...sources,
          ];
        } catch {
          // Explicit sources can still be used.
        }
      }

      /*
       * Remove duplicate URLs/magnets.
       */
      const seen = new Set();

      sources = sources.filter((item) => {
        const key = String(
          item?.src ||
            item?.url ||
            item?.magnet ||
            item?.magnetLink ||
            ""
        ).trim();

        if (!key) return false;

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      });

      /*
       * Do NOT make the entire catalogue depend on the RD library.
       *
       * If the user has RD, every magnet source can be sent through
       * RD by VideoPlayer.
       *
       * We intentionally don't add a fake empty RD source here.
       * That used to create a "Real-Debrid Options" source with no
       * actual media behind it.
       */

      if (sources.length === 0 && s?.src) {
        sources.push({
          label: "Stream",
          type: s.type || "url",
          src: s.src,
        });
      }

      /*
       * If we have a direct URL, prefer it.
       * Otherwise prefer a magnet/RD source.
       */
      const directSource = sources.find((x) => {
        const url = x?.src || "";
        return (
          url &&
          !String(url)
            .toLowerCase()
            .startsWith("magnet:")
        );
      });

      const magnetSource = sources.find((x) => {
        const url = x?.src || "";
        return String(url)
          .toLowerCase()
          .startsWith("magnet:");
      });

      const playableSource =
        directSource || magnetSource || sources[0];

      const activeUrl =
        playableSource?.src ||
        playableSource?.url ||
        playableSource?.magnet ||
        s?.src ||
        "";

      /*
       * Open the player immediately.
       * VideoPlayer is responsible for resolving magnets through RD.
       */
      setSource({
        ...s,

        id: s?.id,

        imdbId: mediaId || s?.imdbId || s?.imdb_id,

        title: s?.title || "Video",

        poster: s?.poster || s?.poster_url || "",

        rdTitle:
          s?.rdTitle ||
          s?.title ||
          "",

        rdYear:
          s?.rdYear ??
          s?.year ??
          null,

        rdSeason:
          s?.rdSeason ??
          s?.season ??
          null,

        rdEpisode:
          s?.rdEpisode ??
          s?.episode ??
          null,

        mediaType:
          s?.mediaType ||
          (isSeries ? "tv" : "movie"),

        sources,

        url: activeUrl,

        hasRd,
      });
    },
    [hasRd]
  );

  const close = useCallback(() => {
    setSource(null);
  }, []);

  const value = useMemo(
    () => ({
      play,
      close,
    }),
    [play, close]
  );

  return (
    <PlayerContext.Provider value={value}>
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

usePlayer.displayName = "usePlayer";

export function usePlayer() {
  const ctx = useContext(PlayerContext);

  if (!ctx) {
    throw new Error(
      "usePlayer must be used within a PlayerProvider"
    );
  }

  return ctx;
}

export const DEMO_VIDEO =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export function buildMediaSources({
  title,
  id,
  poster,
  trailerUrl,
  providers,
}) {
  const sources = [];

  if (trailerUrl) {
    sources.push({
      label: "Trailer",
      type: "youtube",
      src: trailerUrl,
    });
  }

  (providers || []).forEach((provider) => {
    if (!provider?.link) return;

    sources.push({
      label: provider.name,
      type: "provider",
      src: provider.link,
      logo: provider.logo,
    });
  });

  return sources;
}
