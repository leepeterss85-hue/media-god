/* Continuous, small foreground discovery batches. Do not run an unlimited
 * scraper loop or a timer while the application is backgrounded. */
import { isLowCapacityTvDevice, isLegacyAndroidTvBox } from "./deviceCapacity.js";

export const ROLLING_SOURCE_CHECK_MS = 45_000;
export const ROLLING_SOURCE_BATCH = 4;
export function createRollingSourceChecks(getItems, check, {
  windowObject = window, documentObject = document,
  // A low-capacity Android box cannot afford a full batch every 45 seconds.
  intervalMs = isLowCapacityTvDevice() || isLegacyAndroidTvBox() ? ROLLING_SOURCE_CHECK_MS * 2 : ROLLING_SOURCE_CHECK_MS,
  batchSize = isLowCapacityTvDevice() ? 2 : isLegacyAndroidTvBox() ? 2 : ROLLING_SOURCE_BATCH,
  // Skip optional background discovery while someone uses an older TV remote.
  // Never delay a key, playback request or a user-initiated source search.
  deferDuringNavigation = isLowCapacityTvDevice() || isLegacyAndroidTvBox(),
  navigationQuietMs = 2000,
  now = () => Date.now(),
} = {}) {
  let cursor = 0;
  let stopped = false;
  let lastNavigationAt = -Infinity;
  const quietMs = Math.max(0, Number(navigationQuietMs) || 0);
  const onNavigation = () => { lastNavigationAt = now(); };
  const navigating = () => deferDuringNavigation && (now() - lastNavigationAt) < quietMs;
  const pending = new Set();
  const limit = Math.max(1, Math.floor(Number(batchSize) || ROLLING_SOURCE_BATCH));
  // Catalogue evidence checks are opportunistic, never a playback dependency.
  // The native/web player stays mounted inside the same document on Android
  // boxes, so visibilityState alone does not stop these background requests.
  // Avoid competing with an active video for bandwidth/CPU and let the next
  // normal foreground scan resume after the player closes.
  const playerActive = () => Boolean(
    documentObject.querySelector?.('[data-mg-player-root="true"]')
  );
  const canScan = () => !stopped && documentObject.visibilityState !== 'hidden' &&
    windowObject.navigator?.onLine !== false && !playerActive() && !navigating();
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
  if (deferDuringNavigation) {
    documentObject.addEventListener('keydown', onNavigation, { passive: true });
    documentObject.addEventListener('scroll', onNavigation, { capture: true, passive: true });
  }
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
    if (deferDuringNavigation) {
      documentObject.removeEventListener('keydown', onNavigation);
      documentObject.removeEventListener('scroll', onNavigation, true);
    }
  };
}