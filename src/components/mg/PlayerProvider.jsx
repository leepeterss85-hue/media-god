import React, { createContext, useContext, useState } from "react";
import VideoPlayer from "@/components/mg/VideoPlayer";

const NO_PLAYER = { play: () => {}, close: () => {} };
const PlayerContext = createContext(NO_PLAYER);

export const DEMO_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

// Build a stable magnet URI for a title (opens the user's torrent client).
export function buildMagnet(title, id) {
  const seed = String(id || title);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
  const hex = (Math.abs(h).toString(16).padStart(8, "0") + "0".repeat(32)).slice(0, 40);
  const dn = encodeURIComponent(title || "media");
  return `magnet:?xt=urn:btih:${hex}&dn=${dn}&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A1337&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz`;
}

// Build a .torrent file URL for a title.
export function buildTorrentUrl(id) {
  return `https://media-god.app/torrents/${id}.torrent`;
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