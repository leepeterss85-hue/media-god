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
  const scan = () => {
    if (stopped || documentObject.visibilityState === 'hidden') return;
    const items = getItems().filter(Boolean);
    if (!items.length) return;
    // Round-robin across all discoveries, not only the first eight posters.
    const size = Math.min(batchSize, items.length);
    for (let offset = 0; offset < size; offset++) {
      const item = items[(cursor + offset) % items.length];
      Promise.resolve().then(() => check(item)).catch(() => {});
    }
    cursor = (cursor + size) % items.length;
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
