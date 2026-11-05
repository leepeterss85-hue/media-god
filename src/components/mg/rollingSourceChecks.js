/* Continuous, small foreground discovery batches. Do not run an unlimited
 * scraper loop or a timer while the application is backgrounded. */
export const ROLLING_SOURCE_CHECK_MS = 45_000;
export const ROLLING_SOURCE_BATCH = 4;
export function createRollingSourceChecks(getItems, check, {
  windowObject = window, documentObject = document, intervalMs = ROLLING_SOURCE_CHECK_MS,
  batchSize = ROLLING_SOURCE_BATCH,
} = {}) {
  let cursor = 0;
  let stopped = false;
  const pending = new Set();
  const limit = Math.max(1, Math.floor(Number(batchSize) || ROLLING_SOURCE_BATCH));
  const scan = () => {
    if (stopped || documentObject.visibilityState === 'hidden') return;
    let items;
    try {
      items = getItems().filter(Boolean);
    } catch {
      return; // A temporarily unavailable catalogue must not break the timer.
    }
    if (!items.length || pending.size >= limit) return;

    // Do not pile up requests when a TV box has a slow network connection.
    // Each title can have only one outstanding check; use free slots only.
    let inspected = 0;
    while (inspected < items.length && pending.size < limit) {
      const item = items[cursor % items.length];
      cursor = (cursor + 1) % items.length;
      inspected += 1;
      if (pending.has(item)) continue;
      pending.add(item);
      Promise.resolve()
        .then(() => stopped ? undefined : check(item))
        .catch(() => {})
        .finally(() => pending.delete(item));
    }
  };
  const timer = windowObject.setInterval(scan, intervalMs);
  const onReturn = () => scan();
  windowObject.addEventListener('focus', onReturn);
  windowObject.addEventListener('online', onReturn);
  documentObject.addEventListener('visibilitychange', onReturn);
  scan();
  return () => {
    stopped = true;
    windowObject.clearInterval(timer);
    windowObject.removeEventListener('focus', onReturn);
    windowObject.removeEventListener('online', onReturn);
    documentObject.removeEventListener('visibilitychange', onReturn);
  };
}
