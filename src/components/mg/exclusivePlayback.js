let activePlaybackLease = null;

const safelyStop = (stop) => {
  try {
    stop?.();
  } catch {
    // A failed/removed decoder must never block the next playback owner.
  }
};

export const claimExclusivePlayback = (owner, stop) => {
  if (!owner || typeof stop !== "function") return false;

  const previous = activePlaybackLease;
  activePlaybackLease = { owner, stop };

  if (previous && previous.owner !== owner) {
    safelyStop(previous.stop);
  }

  return true;
};

export const releaseExclusivePlayback = (owner) => {
  if (activePlaybackLease?.owner === owner) {
    activePlaybackLease = null;
  }
};

export const stopExclusivePlayback = () => {
  const current = activePlaybackLease;
  activePlaybackLease = null;

  if (current) {
    safelyStop(current.stop);
  }
};

export const hasExclusivePlaybackOwner = () =>
  Boolean(activePlaybackLease);
