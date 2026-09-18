let activePlaybackLease = null;

const safelyStop = (stop) => {
  try {
    stop?.();
  } catch {
    // A failed/removed decoder must never block the next playback owner.
  }
};

const mediaElementFrom = (surface) =>
  surface?.element || surface || null;

const surfacePosterFrom = (surface) =>
  String(surface?.poster || "").trim();

const retirePlaybackSurface = (surface) => {
  const media = mediaElementFrom(surface);
  if (!media) return;

  try {
    media.pause?.();
  } catch {
    // The decoder may already have been released.
  }

  try {
    media.removeAttribute?.("autoplay");
    media.removeAttribute?.("poster");
    media.removeAttribute?.("src");

    media.querySelectorAll?.("source").forEach((source) => {
      source.removeAttribute?.("src");
    });

    media.load?.();
  } catch {
    // Android WebView can detach a hardware surface during this cleanup.
  }

  if (media.dataset) {
    media.dataset.mgPlaybackRetired = "true";
  }

  try {
    media.style?.setProperty?.("display", "none", "important");
    media.style?.setProperty?.("visibility", "hidden", "important");
    media.style?.setProperty?.("pointer-events", "none", "important");
  } catch {
    // Styling is best effort for test doubles and detached DOM nodes.
  }
};

const restorePlaybackSurface = (surface) => {
  const media = mediaElementFrom(surface);
  if (!media) return;

  try {
    media.style?.removeProperty?.("display");
    media.style?.removeProperty?.("visibility");
    media.style?.removeProperty?.("pointer-events");
  } catch {
    // Styling is best effort for test doubles and detached DOM nodes.
  }

  if (media.dataset) {
    delete media.dataset.mgPlaybackRetired;
    media.dataset.mgPlaybackSurface = "active";
  }

  const poster = surfacePosterFrom(surface);
  try {
    if (poster) {
      media.setAttribute?.("poster", poster);
    } else {
      media.removeAttribute?.("poster");
    }
  } catch {
    // A poster is optional and must never block playback.
  }
};

export const claimExclusivePlayback = (owner, stop, surface = null) => {
  if (!owner || typeof stop !== "function") return false;

  const previous = activePlaybackLease;
  activePlaybackLease = { owner, stop, surface };

  if (
    previous &&
    (previous.owner !== owner || previous.surface !== surface)
  ) {
    safelyStop(previous.stop);
    retirePlaybackSurface(previous.surface);
  }

  restorePlaybackSurface(surface);
  return true;
};

export const releaseExclusivePlayback = (owner) => {
  if (activePlaybackLease?.owner === owner) {
    const current = activePlaybackLease;
    activePlaybackLease = null;
    retirePlaybackSurface(current.surface);
  }
};

export const stopExclusivePlayback = () => {
  const current = activePlaybackLease;
  activePlaybackLease = null;

  if (current) {
    safelyStop(current.stop);
    retirePlaybackSurface(current.surface);
  }
};

export const hasExclusivePlaybackOwner = () =>
  Boolean(activePlaybackLease);
