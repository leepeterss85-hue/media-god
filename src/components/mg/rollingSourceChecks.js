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
  const canScan = () => !stopped && documentObject.visibilityState !== 'hidden' &&
    windowObject.navigator?.onLine !== false;
  const identity = item => {
    const id = item?.tmdb_id ?? item?.tmdbId ?? item?.id;
    // Browse rows may use media_type, mediaType or type depending on their
    // source. Without this normalisation, a TV series and a film with the
    // same numeric TMDB ID can share a pending slot on generic TV boxes,
    // while the same film can be checked twice under its object aliases.
    const rawType = String(item?.media_type || item?.mediaType || item?.type || 'movie').toLowerCase();
    const type = ['tv', 'series', 'show', 'episode'].includes(rawType) ? 'tv' : 'movie';
    return id == null ? item : JSON.stringify([type, String(id), String(item.year || '')]);
  };
  const scan = () => {
    if (!canScan()) return;
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
      const key = identity(item);
      if (pending.has(key)) continue;
      pending.add(key);
      Promise.resolve()
        // Visibility/connectivity may change after scheduling this microtask.
        .then(() => canScan() ? check(item) : undefined)
        .catch(() => {})
        .finally(() => pending.delete(key));
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
