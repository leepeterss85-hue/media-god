import React, { createContext, useContext, useState } from "react";
import VideoPlayer from "@/components/mg/VideoPlayer";

const NO_PLAYER = { play: () => {}, close: () => {} };
const PlayerContext = createContext(NO_PLAYER);

export const DEMO_VIDEO = "https://media.w3.org/2010/05/sintel/trailer.mp4";

// Public trackers from around the world — included in every magnet so peers
// can be discovered even if the user's default tracker is down.
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

const QUALITIES = ["720p", "1080p", "4K"];

// Build a stable magnet URI for a title + quality (opens the user's torrent
// client). Quality is folded into the infohash seed so each resolution gets a
// distinct magnet, and every worldwide tracker is attached for discovery.
export function buildMagnet(title, id, quality) {
  const seed = `${id || title}|${quality || ""}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
  const hex = (Math.abs(h).toString(16).padStart(8, "0") + "0".repeat(32)).slice(0, 40);
  const dn = encodeURIComponent(`${title || "media"}${quality ? ` ${quality}` : ""}`);
  const tr = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${hex}&dn=${dn}${tr}`;
}

// Build a .torrent file URL for a title + quality.
export function buildTorrentUrl(id, quality) {
  const q = quality ? `-${quality.toLowerCase()}` : "";
  return `https://media-god.app/torrents/${id}${q}.torrent`;
}

// Build the full source list for a movie/show: trailer (if available), multiple
// stream mirrors, and magnet + torrent variants across several qualities.
export function buildMediaSources({ title, id, poster, trailerUrl, providers = [] }) {
  const sources = [];
  if (trailerUrl) sources.push({ label: "Trailer", type: "youtube", src: trailerUrl });
  providers.forEach((p) =>
    sources.push({ label: p.name, type: "provider", src: p.link, logo: p.logo })
  );
  QUALITIES.forEach((q) =>
    sources.push({ label: `Magnet ${q}`, type: "magnet", src: buildMagnet(title, id, q) })
  );
  QUALITIES.forEach((q) =>
    sources.push({ label: `Torrent ${q}`, type: "torrent", src: buildTorrentUrl(id, q) })
  );
  return sources;
}

export function usePlayer() {
  return useContext(PlayerContext);
}

export function PlayerProvider({ children }) {
  const [source, setSource] = useState(null);
  const play = (s) => setSource(s);
  const close = () => setSource(null);

  return (
    <PlayerContext.Provider value={{ play, close }}>
      {children}
      {source && <VideoPlayer source={source} onClose={close} />}
    </PlayerContext.Provider>
  );
}