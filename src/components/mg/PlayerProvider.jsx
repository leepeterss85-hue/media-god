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
        originalSources.some((x) => x?.live || x?.type === "live");

      const isSeries =
        s?.type === "series" ||
        s?.mediaType === "tv" ||
        s?.season != null ||
        s?.episode != null;

      let mediaId = s?.imdbId || s?.imdb_id || "";

      if (!mediaId && s?.id && !isNaN(s.id)) {
        try {
          const tmdbType = isSeries ? "tv" : "movie";
          const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/${tmdbType}/${s.id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`
          );
          if (tmdbRes.ok) {
            const tmdbData = await tmdbRes.json();
            if (tmdbData?.imdb_id) mediaId = tmdbData.imdb_id;
          }
        } catch {}
      }

      if (!mediaId && s?.id && String(s.id).startsWith("tt")) {
        mediaId = String(s.id);
      }

      let sources = [];

      for (const item of originalSources) {
        if (!item) continue;
        sources.push({
          ...item,
          src: item.src || item.url || item.magnet || item.magnetLink || "",
        });
      }

      // Fetch discovered sources securely via the backend function to prevent browser CORS blocks
      if (!isLive) {
        try {
          const response = await base44.functions.invoke("realDebrid", {
            action: "fetch_streams",
            title: s?.title || "",
            imdb_id: mediaId,
            season: isSeries ? (s?.season ?? s?.rdSeason) : undefined,
            episode: isSeries ? (s?.episode ?? s?.rdEpisode) : undefined,
          });

          const discovered = response?.sources || response?.data?.sources || [];
          if (Array.isArray(discovered) && discovered.length > 0) {
            sources = [...sortEnglishFirst(discovered), ...sources];
          }
        } catch (err) {
          console.error("Backend addon stream fetch error:", err);
        }
      }

      // Deduplicate sources
      const seen = new Set();
      sources = sources.filter((item) => {
        const key = String(item?.src || item?.url || item?.magnet || "").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (sources.length === 0 && s?.src) {
        sources.push({
          label: "Stream",
          type: s.type || "url",
          src: s.src,
        });
      }

      const getSourceUrl = (item) =>
        String(item?.src || item?.url || item?.magnet || "").trim();

      const playableSource = sources[0];
      const activeUrl = getSourceUrl(playableSource) || s?.src || "";

      setSource({
        ...s,
        id: s?.id,
        imdbId: mediaId || s?.imdbId || s?.imdb_id,
        title: s?.title || "Video",
        poster: s?.poster || s?.poster_url || "",
        rdTitle: s?.rdTitle || s?.title || "",
        rdYear: s?.rdYear ?? s?.year ?? null,
        rdSeason: s?.rdSeason ?? s?.season ?? null,
        rdEpisode: s?.rdEpisode ?? s?.episode ?? null,
        mediaType: s?.mediaType || (isSeries ? "tv" : "movie"),
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

  const value = useMemo(() => ({ play, close }), [play, close]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {source && <VideoPlayer source={source} onClose={close} />}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}
