import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import VideoPlayer from "@/components/mg/VideoPlayer";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [source, setSource] = useState(null);
  const [hasRd, setHasRd] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => setHasRd(!!u?.rd_token)).catch(() => {});
  }, []);

  const play = useCallback(async (s) => {
    let sources = s?.sources ? [...s.sources] : [];
    
    if (s?.src && !sources.some(x => x.src === s.src)) {
      sources.push({
        label: s.label || (s.type === "live" ? "LIVE" : "Stream"),
        type: s.type || "url",
        src: s.src,
        live: s.type === "live",
      });
    }

    if (hasRd && !sources.some(x => x.type === "rd")) {
      sources.push({ label: "Real-Debrid Options", type: "rd", src: "" });
    }

    const activeUrl = sources[0]?.src || s?.src || "";
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
  ];
  if (trailerUrl) sources.push({ label: "Trailer", type: "youtube", src: trailerUrl });
  (providers || []).forEach((p) => {
    sources.push({ label: p.name, type: "provider", src: p.link, logo: p.logo });
  });
  return sources;
}
