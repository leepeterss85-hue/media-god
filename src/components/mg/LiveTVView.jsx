import React, { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import Hls from "hls.js";

const LiveVideo = forwardRef(function LiveVideo(
  {
    src,
    poster,
    className,
    onLoadedMetadata,
    onTimeUpdate,
    onError,
    onEnded,
    controls = true,
  },
  ref
) {
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => videoRef.current, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls = null;
    let cancelled = false;
    const isHls = /\.m3u8(?:[?#].*)?$/i.test(String(src));

    const reportError = (error) => {
      if (typeof onError === "function") {
        onError(error);
      }
    };

    const playAutomatically = async () => {
      if (cancelled) return;

      try {
        video.muted = false;
        await video.play();
      } catch {
        try {
          video.muted = true;
          await video.play();
        } catch {
          // Browser autoplay policy may require a user gesture.
        }
      }
    };

    const nativeError = () => {
      reportError(new Error("The video source could not be played."));
    };

    video.addEventListener("error", nativeError);

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) {
          reportError(
            new Error(data.details || "HLS playback failed.")
          );
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        playAutomatically();
      });

      hls.loadSource(src);
      hls.attachMedia(video);
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", playAutomatically, {
        once: true,
      });
      video.load();
    } else {
      video.src = src;
      video.load();
      playAutomatically();
    }

    return () => {
      cancelled = true;
      video.removeEventListener("error", nativeError);

      if (hls) {
        hls.destroy();
        hls = null;
      }

      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, onError]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls={controls}
      playsInline
      preload="auto"
      className={className}
      onLoadedMetadata={onLoadedMetadata}
      onTimeUpdate={onTimeUpdate}
      onError={onError}
      onEnded={onEnded}
    />
  );
});

export default LiveVideo;
