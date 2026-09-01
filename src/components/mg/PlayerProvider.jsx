import React, { createContext, useContext, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import VideoPlayer from "@/components/mg/VideoPlayer";

const NO_PLAYER = { play: () => {}, close: () => {} };
const PlayerContext = createContext(NO_PLAYER);

export const DEMO_VIDEO = "https://media.w3.org/2010/05/sintel/trailer.mp4";

const TRACKERS = [
  "udp://tracker.openbittorrent.com:1337",
  "udp://tracker.opentrackr.org:1337",
  "wss://tracker.btorrent.xyz",
  "udp://open.demonii.com:1337",
  "udp://tracker.torrent.eu.org:451",
  "udp://tracker.dler.org:6969",
  "udp://exodus.desync.com:6969",
  "wss://tracker.openwebtorrent.com",
  "udp://tracker.tiny-vps.com:6969",
  "udp://retracker.lanta-net.ru:2710",
  "udp://tracker.cyberia.is:6969",
  "udp://tracker2.itzhost.com:6969",
];

// Builds the standard source list passed into player.play({ sources }).
// Centralized here so every entry point (detail modal, episodes, watchlist,
// favorites, roadmap) produces identical sources for a given title.
export function buildMediaSources({ title, id, poster, trailerUrl, providers } = {}) {
  const sources = [];
  if (trailerUrl) sources.push({ label: "Trailer", type: "youtube", src: trailerUrl });
  (providers || []).forEach((p) => {
    if (p && p.link) sources.push({ label: p.name || "Provider", type: "provider", src: p.link });
  });
  return sources;
}

export function buildMagnet(title, id, quality) {
  const seed = `${id || title}|${quality || ""}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
  const hex = (Math.abs(h).toString(16).padStart(8, "0") + "0".repeat(32)).slice(0, 40);
  const dn = encodeURIComponent(`${title || "media"}${quality ? ` ${quality}` : ""}`);
  const tr = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${hex}&dn=${dn}${tr}`;
}

export function usePlayer() {
  return useContext(PlayerContext);
}

export function PlayerProvider({ children }) {
  const [source, setSource] = useState(null);
  const [hasRd, setHasRd] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => setHasRd(!!u?.rd_token)).catch(() => {});
  }, []);

  const play = async (s) => {
    let sources = s.sources || [];
    const isLive = sources.some((x) => x.live || x.type === "live");

    // Use media id (e.g. IMDb ID starting with tt) or fallback to title
    const mediaId = s.id || s.imdbId || (s.title ? `tt${Math.abs(s.title.split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString().padEnd(7, "0").slice(0, 7)}` : null);

    if (!isLive && mediaId) {
      try {
        const addons = await base44.entities.Addon.list("-created_date", 100);
        const activeAddons = (addons || []).filter((a) => a.active && a.url);

        for (const addon of activeAddons) {
          try {
            // Correct Stremio manifest format: replaces manifest.json with stream endpoint using ID
            const targetUrl = addon.url.replace('/manifest.json', `/stream/movie/${mediaId}.json`);
            const res = await fetch(targetUrl);
            const data = await res.json();
            if (data && data.streams) {
              const scraped = data.streams.map((st) => ({
                label: st.title ? st.title.split('\n')[0] : "Scraped Source",
                type: "url",
                src: st.url || st.infoHash,
              }));
              sources = [...scraped, ...sources];
            }
          } catch (err) {
            // Skip failing addon endpoints quietly
          }
        }
      } catch (e) {
        // Fallback if addon fetch fails entirely
      }
    }

    if (hasRd && !isLive && !s.noRd) {
      sources = [{ label: "Real-Debrid", type: "rd", src: "" }, ...sources];
    }
    setSource({ ...s, sources });
  };

  const close = () => setSource(null);

  return (
    <PlayerContext.Provider value={{ play, close }}>
      {children}
      {source && <VideoPlayer source={source} onClose={close} />}
    </PlayerContext.Provider>
  );
}