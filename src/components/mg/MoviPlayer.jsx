import React, { forwardRef } from "react";

// Thin wrapper around a native <video> element used as the HEVC/software-decoder
// fallback path in PlayerProvider. Forwards the ref so the parent can drive
// playback and read currentTime/duration just like a plain video element.
const MoviPlayer = forwardRef(function MoviPlayer(
  { src, autoPlay, controls = true, className, onTimeUpdate, onError, onLoadedMetadata },
  ref
) {
  return (
    <video
      ref={ref}
      src={src}
      autoPlay={autoPlay}
      controls={controls}
      playsInline
      className={className}
      onTimeUpdate={onTimeUpdate}
      onError={onError}
      onLoadedMetadata={onLoadedMetadata}
    />
  );
});

export default MoviPlayer;