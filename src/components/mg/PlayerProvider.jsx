import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import VideoPlayer from "@/components/mg/VideoPlayer";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [source, setSource] = useState(null);
  const play = useCallback((s) => setSource(s), []);
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
