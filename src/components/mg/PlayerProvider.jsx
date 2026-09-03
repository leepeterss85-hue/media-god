import React, { createContext, useContext, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import VideoPlayer from "@/components/mg/VideoPlayer";

const NO_PLAYER = { play: () => {}, close: () => {} };
const PlayerContext = createContext(NO_PLAYER);

export const DEMO_VIDEO = "https://media.w3.org/2010/05/sintel/trailer.mp4";

export function buildMediaSources({ title, id, poster, trailerUrl, providers = [] }) {
  const sources = [];
  if (trailerUrl) sources.push({ label: "Trailer", type: "youtube", src: trailerUrl });
  providers.forEach((p) =>
    sources.push({ label: p.name, type: "provider", src: p.link, logo: p.logo })
  );
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

  const play = (s) => {
    let sources = s.sources || [];
    const isLive = sources.some((x) => x.live || x.type === "live");
    if (hasRd && !isLive && !s.noRd) {
      // Pass empty src so the backend handles the live Torrentio/library lookup cleanly
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
