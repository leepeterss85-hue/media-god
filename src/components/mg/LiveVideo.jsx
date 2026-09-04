import React, {
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
} from "react";

import Hls from "hls.js";

const LiveVideo = forwardRef(
  function LiveVideo(
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
    const videoRef =
      useRef(null);

    useImperativeHandle(
      ref,
      () => videoRef.current,
      []
    );

    useEffect(() => {
      const video =
        videoRef.current;

      if (!video || !src) {
        return;
      }

      let hls = null;
      let destroyed = false;

      const isHls =
        /\.m3u8(?:[?#].*)?$/i.test(
          src
        );

      const startPlayback =
        async () => {
          if (destroyed) {
            return;
          }

          try {
            video.muted = false;

            const promise =
              video.play();

            if (promise) {
              await promise;
            }
          } catch {
            /*
             * Browsers may block autoplay
             * with sound.
             *
             * Retry muted.
             */
            try {
              video.muted = true;
              await video.play();
            } catch {
              // User can press play manually.
            }
          }
        };

      const handleError =
        (event) => {
          if (
            typeof onError ===
            "function"
          ) {
            onError(event);
          }
        };

      video.addEventListener(
        "error",
        handleError
      );

      if (
        isHls &&
        Hls.isSupported()
      ) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });

        hls.on(
          Hls.Events.ERROR,
          (
            _event,
            data
          ) => {
            if (
              data?.fatal &&
              typeof onError ===
                "function"
            ) {
              onError(
                new Error(
                  data.details ||
                    "HLS playback failed"
                )
              );
            }
          }
        );

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(
          Hls.Events.MANIFEST_PARSED,
          () => {
            startPlayback();
          }
        );
      } else {
        video.src = src;
        video.load();

        startPlayback();
      }

      return () => {
        destroyed = true;

        video.removeEventListener(
          "error",
          handleError
        );

        if (hls) {
          hls.destroy();
          hls = null;
        }

        video.pause();
        video.removeAttribute(
          "src"
        );
        video.load();
      };
    }, [
      src,
      onError,
    ]);

    return (
      <video
        ref={videoRef}
        poster={poster}
        controls={controls}
        playsInline
        preload="auto"
        className={className}
        onLoadedMetadata={
          onLoadedMetadata
        }
        onTimeUpdate={
          onTimeUpdate
        }
        onEnded={onEnded}
      />
    );
  }
);

export default LiveVideo;
