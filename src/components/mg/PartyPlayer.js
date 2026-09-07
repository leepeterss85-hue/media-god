import { useEffect, useRef } from "react";

import LiveVideo from "@/components/mg/LiveVideo";

const SYNC_DRIFT_SECONDS = 1.25;
const HOST_PUBLISH_INTERVAL_MS = 1500;

export default function PartyPlayer({
  src,
  poster = "",
  isHost = false,
  isPlaying = false,
  currentTime = 0,
  onHostState,
}) {
  const videoRef = useRef(null);
  const lastHostPublishRef = useRef(0);
  const onHostStateRef = useRef(onHostState);

  onHostStateRef.current = onHostState;

  const publishHostState = (force = false) => {
    if (!isHost) {
      return;
    }

    const video = videoRef.current;
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    const now = Date.now();

    if (
      !force &&
      now - lastHostPublishRef.current < HOST_PUBLISH_INTERVAL_MS
    ) {
      return;
    }

    lastHostPublishRef.current = now;

    Promise.resolve(
      onHostStateRef.current?.({
        is_playing: !video.paused && !video.ended,
        current_time: Number(video.currentTime || 0),
      })
    ).catch(() => {});
  };

  useEffect(() => {
    const video = videoRef.current;

    if (!(video instanceof HTMLVideoElement)) {
      return undefined;
    }

    const onPlay = () => publishHostState(true);
    const onPause = () => publishHostState(true);
    const onSeeked = () => publishHostState(true);
    const onTimeUpdate = () => publishHostState(false);
    const onEnded = () => {
      if (!isHost) return;

      Promise.resolve(
        onHostStateRef.current?.({
          is_playing: false,
          current_time: Number(video.duration || video.currentTime || 0),
        })
      ).catch(() => {});
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [isHost, src]);

  useEffect(() => {
    const video = videoRef.current;

    if (
      isHost ||
      !(video instanceof HTMLVideoElement)
    ) {
      return;
    }

    const wantedTime = Math.max(0, Number(currentTime || 0));
    const actualTime = Number(video.currentTime || 0);

    if (
      Number.isFinite(wantedTime) &&
      Math.abs(actualTime - wantedTime) > SYNC_DRIFT_SECONDS
    ) {
      try {
        video.currentTime = wantedTime;
      } catch {
        // Keep the guest on the current frame if seeking is not available yet.
      }
    }

    if (isPlaying) {
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else if (!video.paused) {
      video.pause();
    }
  }, [currentTime, isHost, isPlaying, src]);

  const handleLoadedMetadata = (event) => {
    const video = event.currentTarget;
    const wantedTime = Math.max(0, Number(currentTime || 0));

    if (wantedTime > 0) {
      try {
        const duration = Number(video.duration || 0);
        video.currentTime =
          duration > 0
            ? Math.min(wantedTime, Math.max(0, duration - 1))
            : wantedTime;
      } catch {
        // Start at zero if the browser cannot seek yet.
      }
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black px-4 text-center text-sm text-white/50">
        This watch party does not have a video URL.
      </div>
    );
  }

  return (
    <LiveVideo
      ref={videoRef}
      src={src}
      poster={poster}
      controls={isHost}
      onLoadedMetadata={handleLoadedMetadata}
      className="h-full w-full bg-black object-contain"
    />
  );
}
