import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

// Synced video element for watch parties. The host's play/pause/seek report
// to the shared room state; guests follow that state.
export default function PartyPlayer({ src, isHost, isPlaying, currentTime, onHostState }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const lastSyncRef = useRef(0);

  // Attach the source (HLS via hls.js, otherwise native).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    const isHls = /\.m3u8(\?|#|$)/i.test(src);
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = src;
    }
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [src]);

  // Host reports play/pause/seek + a periodic position heartbeat.
  useEffect(() => {
    if (!isHost) return;
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => onHostState({ is_playing: true, current_time: video.currentTime });
    const onPause = () => onHostState({ is_playing: false, current_time: video.currentTime });
    const onSeek = () => onHostState({ current_time: video.currentTime });
    const onTime = () => {
      const now = Date.now();
      if (now - lastSyncRef.current > 8000) {
        lastSyncRef.current = now;
        onHostState({ current_time: video.currentTime });
      }
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("timeupdate", onTime);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [isHost, onHostState]);

  // Guest follows the shared state.
  useEffect(() => {
    if (isHost) return;
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying && video.paused) video.play().catch(() => {});
    if (!isPlaying && !video.paused) video.pause();
    if (typeof currentTime === "number" && Math.abs((video.currentTime || 0) - currentTime) > 2) {
      try { video.currentTime = currentTime; } catch {}
    }
  }, [isHost, isPlaying, currentTime]);

  return (
    <video
      ref={videoRef}
      controls={isHost}
      playsInline
      className="w-full h-full object-contain bg-black"
    />
  );
}