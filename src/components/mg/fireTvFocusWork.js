/**
 * Coalesce catalogue/poster DOM mutations into at most one overlay focus
 * inspection per animation frame on Fire TV. Never throttle physical key
 * presses: only passive MutationObserver work is scheduled.
 */
export const createFireTvFocusRefreshScheduler = (
  inspect,
  {
    requestFrame = (callback) => window.requestAnimationFrame(callback),
    cancelFrame = (id) => window.cancelAnimationFrame(id),
  } = {},
) => {
  let frame = null;
  let disposed = false;

  const schedule = () => {
    if (disposed || frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      if (!disposed) inspect();
    });
  };

  schedule.cancel = () => {
    disposed = true;
    if (frame !== null) {
      cancelFrame(frame);
      frame = null;
    }
  };

  return schedule;
};
