/**
 * Privacy-safe Fire TV / Android TV D-pad responsiveness sampling.
 * Counts focus transitions only; never stores pressed key values, typed text,
 * channel names, stream URLs, focused element IDs or interaction history.
 *
 * This measures the delay *after* WebView has received a keydown, not the
 * Bluetooth/HDMI-CEC transport delay before the event reaches the page.
 */
export function createTvRemoteFocusTiming({ now = () => Date.now(), slowMs = 250 } = {}) {
  let pendingAt = null;
  let arrowKeys = 0;
  let focusMoves = 0;
  let slowFocusMoves = 0;
  let totalMs = 0;
  let longestMs = 0;

  const onKeyDown = event => {
    const name = String(event?.key || event?.code || "");
    const code = Number(event?.keyCode || event?.which || 0);
    if (!/^(?:ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(name) &&
        ![37, 38, 39, 40].includes(code)) return;
    // Ignore press auto-repeat from a held key until the current press lands.
    if (event?.repeat) return;
    arrowKeys = Math.min(9999, arrowKeys + 1);
    pendingAt = now();
  };

  const onFocusIn = () => {
    if (pendingAt == null) return;
    const elapsed = now() - pendingAt;
    pendingAt = null;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 10000) return;
    focusMoves = Math.min(9999, focusMoves + 1);
    slowFocusMoves = Math.min(9999, slowFocusMoves + (elapsed >= slowMs ? 1 : 0));
    longestMs = Math.max(longestMs, Math.round(elapsed));
    totalMs += elapsed;
  };

  const clearPending = () => { pendingAt = null; };
  const snapshot = () => ({
    arrowKeys, focusMoves, slowFocusMoves,
    averageFocusMs: focusMoves ? Math.round(totalMs / focusMoves) : null,
    longestFocusMs: focusMoves ? longestMs : null,
  });
  return { onKeyDown, onFocusIn, clearPending, snapshot };
}
