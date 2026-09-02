import React, { forwardRef } from "react";

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

MoviPlayer.displayName = "MoviPlayer";

export default MoviPlayer;
