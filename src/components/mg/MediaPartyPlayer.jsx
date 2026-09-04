import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

// Synced video element for watch parties. The host's play/pause/seek events
// are written to the shared room state; guests follow that state.
export default function MediaPartyPlayer({
  src,
  isHost,
  isPlaying,
  currentTime,
  onHostState,
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const lastSyncRef = useRef(0);

  // Attach the source. HLS uses hls.js when needed; other sources use the
  // browser's native video support.
  useEffect(() => {
    const video = videoRef.current;

    if (!video || !src) {
      return undefined;
    }

    const source = String(src).trim();
    const isHls = /\.m3u8(?:\?|#|$)/i.test(source);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
      });

      hls.loadSource(source);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = source;
      video.load();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  // The host reports play/pause/seek and sends a periodic playback-position
  // heartbeat so guests can stay aligned.
  useEffect(() => {
    if (!isHost) {
      return undefined;
    }

    const video = videoRef.current;

    if (!video || typeof onHostState !== "function") {
      return undefined;
    }

    const report = (patch) => {
      Promise.resolve(onHostState(patch)).catch(() => {});
    };

    const onPlay = () => {
      report({
        is_playing: true,
        current_time: video.currentTime || 0,
      });
    };

    const onPause = () => {
      report({
        is_playing: false,
        current_time: video.currentTime || 0,
      });
    };

    const onSeek = () => {
      report({
        current_time: video.currentTime || 0,
      });
    };

    const onTime = () => {
      const now = Date.now();

      if (now - lastSyncRef.current >= 8000) {
        lastSyncRef.current = now;

        report({
          current_time: video.currentTime || 0,
          is_playing: !video.paused,
        });
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

  // Guests follow the host's shared playback state.
  useEffect(() => {
    if (isHost) {
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (
      typeof currentTime === "number" &&
      Number.isFinite(currentTime) &&
      Math.abs((video.currentTime || 0) - currentTime) > 2
    ) {
      try {
        video.currentTime = currentTime;
      } catch {
        // Some streams cannot seek until metadata has loaded.
      }
    }

    if (isPlaying) {
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else if (!video.paused) {
      video.pause();
    }
  }, [isHost, isPlaying, currentTime]);

  return (
    <video
      ref={videoRef}
      controls={Boolean(isHost)}
      playsInline
      preload="metadata"
      className="w-full h-full object-contain bg-black"
    />
  );
}
