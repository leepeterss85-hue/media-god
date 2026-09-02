import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import VideoPlayer from "@/components/mg/VideoPlayer";

const PlayerContext = createContext(null);

const TRACKERS = [
  "udp://tracker.openbittorrent.com:1337",
  "udp://tracker.opentrackr.org:1337",
  "wss://tracker.btorrent.xyz",
  "udp://open.demonii.com:1337",
  "udp://tracker.torrent.eu.org:451",
  "udp://tracker.dler.org:6969",
  "udp://exodus.desync.com:6969",
  "wss://tracker.openwebtorrent.com",
];

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
    let sources = s?.sources || (s?.src ? [{ label: s.type === "live" ? "LIVE" : "Stream", type: s.type, src: s.src, live: s.type === "live" }] : []);
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

    if (!isLive && mediaId) {
      try {
        const addons = await base44.entities.Addon.list("-created_date", 100);
        const activeAddons = (addons || []).filter((a) => a.active && a.url);

        const scraperPromises = activeAddons.map(async (addon) => {
          try {
            const baseUrl = addon.url.replace(/\/manifest\.json$/, '');
            const mediaType = isSeries ? "series" : "movie";
            const mediaPath = isSeries && s.season && s.episode
              ? `${mediaId}:${s.season}:${s.episode}`
              : mediaId;
            
            const targetUrl = `${baseUrl}/stream/${mediaType}/${mediaPath}.json`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 7000);
            
            const res = await fetch(targetUrl, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await res.json();
            
            if (data?.streams) {
              return data.streams.map((st) => ({
                label: st.title ? st.title.split('\n')[0] : `${addon.name} Source`,
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

    const isPlayable = (x) =>
      x.type !== "youtube" && x.type !== "provider" &&
      !x.src?.includes("youtube") && !x.src?.includes("youtu.be");

    if (hasRd && !isLive && !s?.noRd && !sources.some(isPlayable)) {
      sources = [{ label: "Real-Debrid", type: "rd", src: "" }, ...sources];
    }

    const playableSource = sources.find(isPlayable);
    const activeUrl = playableSource ? playableSource.src : (sources.length > 0 ? sources[0].src : (s?.src || ""));
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
  const sources = [
    { label: "Real-Debrid", type: "rd", src: "" },
    { label: "Paste Magnet", type: "rd", src: "", skipAutoResolve: true },
  ];
  if (trailerUrl) sources.push({ label: "Trailer", type: "youtube", src: trailerUrl });
  (providers || []).forEach((p) => {
    sources.push({ label: p.name, type: "provider", src: p.link, logo: p.logo });
  });
  return sources;
}

