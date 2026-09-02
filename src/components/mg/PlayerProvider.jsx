import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import VideoPlayer from "@/components/mg/VideoPlayer";

const PlayerContext = createContext(null);

const FOREIGN_RE = /(truefrench|vostfr|vost|subfrench|vf\b|vff|vfi|multi-audio|multiaudio|dual\.audio|\bdubbed\b|\bdub\b)/i;
const isForeign = (label) => FOREIGN_RE.test(label || "");
const RES_RE = /(\d{3,4})p/;

const sortEnglishFirst = (list) =>
  list.slice().sort((a, b) => {
    const fa = isForeign(a.label) ? 1 : 0;
    const fb = isForeign(b.label) ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const ra = parseInt((a.label.match(RES_RE) || [])[1] || "0", 10);
    const rb = parseInt((b.label.match(RES_RE) || [])[1] || "0", 10);
    return rb - ra;
  });

export function PlayerProvider({ children }) {
  const [source, setSource] = useState(null);
  const [hasRd, setHasRd] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => setHasRd(!!u?.rd_token)).catch(() => {});
  }, []);

  const play = useCallback(async (s) => {
    let sources = s?.sources ? [...s.sources] : [];
    const isLive = s?.type === "live" || sources.some((x) => x.live || x.type === "live");
    const isSeries = s?.type === "series" || s?.season || s?.episode || s?.mediaType === "tv";

    let mediaId = s?.imdbId || s?.imdb_id;

    if (!mediaId && s?.id && !isNaN(s.id)) {
      try {
        const tmdbType = isSeries ? "tv" : "movie";
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${s.id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`);
        const tmdbData = await tmdbRes.json();
        if (tmdbData?.imdb_id) {
          mediaId = tmdbData.imdb_id;
        }
      } catch (e) {}
    }

    if (!mediaId && s?.id && String(s.id).startsWith('tt')) {
      mediaId = s.id;
    }

    if (!mediaId && s?.title) {
      try {
        const tmdbType = isSeries ? "tv" : "movie";
        const searchRes = await fetch(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=38267272847a9ef3878b273b37963d76&query=${encodeURIComponent(s.title)}${s.year ? `&year=${s.year}` : ""}`);
        const searchData = await searchRes.json();
        const firstMatch = searchData?.results?.[0];
        if (firstMatch?.id) {
          const extRes = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${firstMatch.id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`);
          const extData = await extRes.json();
          if (extData?.imdb_id) {
            mediaId = extData.imdb_id;
          }
        }
      } catch (e) {}
    }

    if (!isLive) {
      try {
        const addons = await base44.entities.Addon.list("-created_date", 100);
        const activeAddons = (addons || []).filter((a) => a.active && a.url);

        const scraperPromises = activeAddons.map(async (addon) => {
          try {
            const baseUrl = addon.url.replace(/\/manifest\.json$/, '');
            const mediaType = isSeries ? "series" : "movie";
            
            const queryPath = mediaId 
              ? (isSeries && s.season && s.episode ? `${mediaId}:${s.season}:${s.episode}` : mediaId)
              : `search:${encodeURIComponent(s.title || "")}`;

            const targetUrl = `${baseUrl}/stream/${mediaType}/${queryPath}.json`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 7000);
            
            const res = await fetch(targetUrl, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await res.json();
            
            if (data?.streams) {
              return data.streams.map((st) => ({
                label: st.title ? `${addon.name}: ${st.title.split('\n')[0]}` : `${addon.name} Source`,
                type: st.infoHash ? "torrent" : "url",
                src: st.url || `magnet:?xt=urn:btih:${st.infoHash}`,
              }));
            }
          } catch (err) {}
          return [];
        });

        const results = await Promise.all(scraperPromises);
        const allScraped = results.flat();
        if (allScraped.length > 0) {
          sources = [...sortEnglishFirst(allScraped), ...sources];
        }
      } catch (e) {}
    }

    if (hasRd && !isLive && !sources.some(x => x.type === "rd")) {
      sources.push({ label: "Real-Debrid Options", type: "rd", src: "" });
    }

    if (sources.length === 0 && s?.src) {
      sources.push({ label: "Stream", type: s.type || "url", src: s.src });
    }

    const playableSource = sources.find((x) => x.src);
    const activeUrl = playableSource ? playableSource.src : (sources[0]?.src || s?.src || "");
    
    setSource({ ...s, sources, url: activeUrl });
  }, [hasRd]);

  const close = useCallback(() => setSource(null), []);
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

export const DEMO_VIDEO = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export function buildMediaSources({ title, id, poster, trailerUrl, providers }) {
  const sources = [];
  if (trailerUrl) sources.push({ label: "Trailer", type: "youtube", src: trailerUrl });
  (providers || []).forEach((p) => {
    sources.push({ label: p.name, type: "provider", src: p.link, logo: p.logo });
  });
  return sources;
}
