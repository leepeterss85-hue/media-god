/**
 * TV boxes receiving commands through HDMI-CEC adapters often emit native
 * Android KEYCODE_ESCAPE (111) or a literal "Back" key instead of the
 * browser-standard Escape / BrowserBack / KEYCODE_BACK (4).
 *
 * These aliases are accepted only after TV hardware/remote detection.
 * Never turn an ordinary desktop/phone keyboard action into a TV Back press.
 */
export const isAndroidCecBackKey = (event, { tvMode = false } = {}) => {
  if (!tvMode) return false;
  const key = String(event?.key || event?.code || "");
  const code = Number(event?.keyCode || event?.which || 0);
  return key === "Back" || key === "TVBack" || code === 111;
};

/**
 * Listeners at window and document capture levels can receive the same
 * event. A WeakSet also handles native WebView events that are non-extensible
 * and cannot receive the legacy __mgBackHandled marker.
 */
export const createTvBackEventDeduper = () => {
  const handled = new WeakSet();
  return event => {
    if (!event || typeof event !== "object") return false;
    if (handled.has(event)) return true;
    handled.add(event);
    return false;
  };
};

/** Extra TV-only OK labels commonly produced by CEC adapters. */
export const isAndroidCecConfirmKey = (event, { tvMode = false } = {}) => {
  if (!tvMode) return false;
  const key = String(event?.key || event?.code || "");
  const code = Number(event?.keyCode || event?.which || 0);
  return key === "OK" || code === 160;
};
