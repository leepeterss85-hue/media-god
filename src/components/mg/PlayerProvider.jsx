import React, { createContext, useContext, useState } from "react";
import VideoPlayer from "@/components/mg/VideoPlayer";

const PlayerContext = createContext(null);

export const DEMO_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

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