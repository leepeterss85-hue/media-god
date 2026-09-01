import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

// Plays a live stream URL in a <video> element. HLS (.m3u8) streams are
// attached via hls.js on browsers without native HLS (desktop Chrome/Firefox);
// Safari/iOS and direct mp4/webm play natively.
export default function LiveVideo({ src, poster, className }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let hls = null;
    const isHls = /\.m3u8(\?|#|$)/i.test(src);
    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }
    video.muted = false;
    const p = video.play();
    if (p && p.catch) {
      p.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
    return () => {
      if (hls) hls.destroy();
    };
  }, [src]);

  return (
    <video ref={videoRef} poster={poster} controls playsInline className={className} />
  );
}