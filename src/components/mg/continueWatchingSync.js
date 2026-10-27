/*
 * Base44 ContinueWatching is account-backed; SDK subscriptions alone are not
 * sufficient to refresh a row when a different device writes to that account.
 * Keep a lightweight, visible-only poll plus an immediate refresh on return.
 */
export const CONTINUE_WATCHING_SAVED = 'mg:continue-watching-saved';
export const CONTINUE_WATCHING_SYNC_INTERVAL_MS = 15000;
export const PROFILE_CHANGED_EVENT = 'mg:household-profile-changed';

export function watchContinueWatchingChanges(refresh, {
  windowObject = typeof window === 'undefined' ? null : window,
  documentObject = typeof document === 'undefined' ? null : document,
  subscribe = null,
  intervalMs = CONTINUE_WATCHING_SYNC_INTERVAL_MS,
} = {}) {
  if (!windowObject || !documentObject) return () => {};
  let stopped = false;
  const refreshIfVisible = () => {
    if (!stopped && documentObject.visibilityState !== 'hidden') refresh();
  };
  const refreshOnVisible = () => {
    if (documentObject.visibilityState !== 'hidden') refreshIfVisible();
  };
  let unsubscribe = null;
  try { unsubscribe = subscribe?.(refreshIfVisible) || null; } catch { /* polling still works */ }
  for (const name of ['focus', 'online', 'mg:fire-tv-app-resume',
    PROFILE_CHANGED_EVENT, CONTINUE_WATCHING_SAVED]) {
    windowObject.addEventListener(name, refreshIfVisible);
  }
  documentObject.addEventListener('visibilitychange', refreshOnVisible);
  const timer = windowObject.setInterval(refreshIfVisible, intervalMs);
  refreshIfVisible();
  return () => {
    stopped = true;
    windowObject.clearInterval(timer);
    documentObject.removeEventListener('visibilitychange', refreshOnVisible);
    for (const name of ['focus', 'online', 'mg:fire-tv-app-resume',
      PROFILE_CHANGED_EVENT, CONTINUE_WATCHING_SAVED]) {
      windowObject.removeEventListener(name, refreshIfVisible);
    }
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}

export function notifyContinueWatchingSaved(windowObject = typeof window === 'undefined' ? null : window) {
  windowObject?.dispatchEvent(new CustomEvent(CONTINUE_WATCHING_SAVED));
}
