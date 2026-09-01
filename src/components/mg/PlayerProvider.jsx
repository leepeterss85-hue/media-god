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

export function buildMagnet(title, id, quality) {
  const seed = `${id || title}|${quality || ""}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
  const hex = (Math.abs(h).toString(16).padStart(8, "0") + "0".repeat(32)).slice(0, 40);
  const dn = encodeURIComponent(`${title || "media"}${quality ? ` ${quality}` : ""}`);
  const tr = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${hex}&dn=${dn}${tr}`;
}

// Builds the base source list (trailer + legal providers) for a title. The
// PlayerProvider prepends Real-Debrid and scraped addon sources at play time.
export function buildMediaSources({ title, id, poster, trailerUrl, providers = [] }) {
  const sources = [];
  if (trailerUrl) {
    sources.push({ label: "Trailer", type: "youtube", src: trailerUrl });
  }
  (providers || []).forEach((p) => {
    if (p.link) {
      sources.push({ label: p.name, type: "provider", src: p.link, logo: p.logo });
    }
  });
  return sources;
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

    // Automatically query active scrapers/addons when playing a title
    if (!isLive && s.title) {
      try {
        const addons = await base44.entities.Addon.list("-created_date", 100);
        const activeAddons = (addons || []).filter((a) => a.active && a.url);

        for (const addon of activeAddons) {
          try {
            const targetUrl = addon.url.replace('/manifest.json', `/stream/movie/${encodeURIComponent(s.title)}.json`);
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