// Focus and visibilitychange often describe the same return to a tab.
export function createVisibleRefreshGate({ refresh, isVisible, isBusy, now = Date.now, cooldownMs = 1000 }) {
  let lastStarted = -Infinity;
  return {
    markStarted() { lastStarted = now(); },
    request() {
      const time = now();
      if (!isVisible() || isBusy() || time - lastStarted < cooldownMs) return false;
      lastStarted = time;
      refresh();
      return true;
    },
  };
}
