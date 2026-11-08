const FIRE_TV_RE =
  /(?:\bAFT[A-Z0-9]*\b|Fire\s*TV|AmazonWebAppPlatform|Silk|MediaGodFireTV)/i;

// Android TV boxes do not always identify themselves as Fire TV. Some ship
// stock Android WebViews whose UA looks like a generic tablet, but devices
// that explicitly advertise TV hardware must receive D-pad focus handling.
// Keep this separate from the phone app marker (which always wins below).
const ANDROID_TV_RE =
  /(?:Android[\s/._-]*TV|Google[\s/._-]*TV|AndroidTV|\bLeanback\b|NVIDIA[\s_-]*SHIELD(?:[\s_-]*Android[\s_-]*TV)?|\bMi[\s_-]*Box\b|\bMIBOX\b|\bMi\s*TV(?:\s*Stick)?\b|\bMiTV\b|\bMecool\b|\bChromecast\s+with\s+Google\s+TV\b|\bONN[\s_-]*(?:4K|Streaming[\s_-]*Box)\b|\bTV[\s_-]*Box\b|Formuler|BuzzTV|Dynalink|Amlogic|Rockchip|\bMINIX\b|\bUgoos\b|\bSkyworth\b|\bNokia\s+Streaming\s+Box\b|\bADT-\d|\bAQUOS\b|\bBRAVIA\b|\bT95\b|\bX96\b|\bH96\b|\bA95X\b|\bM8S\b|\bHOMATICS\b|\bDune[\s_-]*HD\b|\bZIDOO\b|\bTANIX\b|\bVONTAR\b|\bSTRONG[\s_-]*LEAP[\s_-]*[A-Z0-9]*\b)/i;

export const isKnownTvUserAgent = (value) =>
  FIRE_TV_RE.test(String(value || "")) ||
  ANDROID_TV_RE.test(String(value || ""));

// Some generic Android TV box WebViews report keyboard keyCodes 37-40 for
// physical D-pad input, not native Android keyCodes 19-22. They can also
// falsely advertise touch points. When no explicit television UA is present,
// use two consecutive remote-like arrow keys to activate TV navigation. A
// single arrow key on an Android phone or tablet must never switch its layout.
export const createAndroidTvDpadDetector = ({ now = () => Date.now() } = {}) => {
  let lastAt = -Infinity;
  let lastDirection = "";
  let previousEvent = null;
  return (event, { userAgent = "", mobileApp = false, editable = false } = {}) => {
    // The bootstrap listens at both window and document capture levels.
    // Count each physical DOM event once, not twice in the same key press.
    if (event && event === previousEvent) return false;
    previousEvent = event;
    if (mobileApp || editable || !/Android/i.test(String(userAgent))) {
      lastAt = -Infinity;
      lastDirection = "";
      return false;
    }
    const key = String(event?.key || event?.code || "");
    const code = Number(event?.keyCode || event?.which || 0);
    const arrow =
      /^(?:ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(key) ||
      [37, 38, 39, 40].includes(code);
    if (!arrow) {
      // A keyboard action between arrows breaks the remote-gesture
      // sequence. Do not classify generic Android phones or tablets as
      // televisions after unrelated navigation or typing.
      lastAt = -Infinity;
      lastDirection = "";
      return false;
    }
    if (isKnownTvUserAgent(userAgent)) return true;
    const at = now();
    const confirmed = (at - lastAt < 1750) &&
      (lastDirection !== "" || Boolean(event?.repeat));
    lastAt = at;
    lastDirection = key || String(code);
    return confirmed;
  };
};

const ANDROID_MOBILE_APP_RE =
  /(?:MediaGodMobile|AndroidMobile)/i;

const hasClass = (name) => {
  if (typeof document === "undefined") return false;

  return Boolean(
    document.documentElement?.classList?.contains(name) ||
      document.body?.classList?.contains(name)
  );
};

export const isAndroidMobileRuntime = () => {
  const userAgent =
    typeof navigator !== "undefined"
      ? String(navigator.userAgent || "")
      : "";

  if (ANDROID_MOBILE_APP_RE.test(userAgent)) {
    return true;
  }

  return (
    hasClass("mg-android-mobile") ||
    hasClass("mg-native-android-mobile")
  );
};

const TV_REMOTE_MEMORY_KEY = "mg:tv-remote-confirmed:v1";

const storage = () => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

// A mouse or trackpad means this is a computer, not a television, even if the
// user agent mentions Android. Never trust remembered TV state on such a device.
const hasFinePointer = () => {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(any-pointer: fine) and (any-hover: hover)").matches
    );
  } catch {
    return false;
  }
};

/*
 * A Fire Stick is recognised from its user agent on the first byte, so it
 * boots straight into the TV layout. Many Android TV boxes only reveal
 * themselves through a physical remote press. Remember that confirmed press
 * so the same box starts in TV mode on every later launch instead of falling
 * back to a tablet layout until two arrows are pressed again.
 */
// Phones and tablets (including ones with a keyboard cover) must never be
// locked into the television layout by a couple of arrow presses.
const tvMemoryAllowed = () => {
  if (isAndroidMobileRuntime() || hasFinePointer()) {
    return false;
  }

  const userAgent =
    typeof navigator !== "undefined"
      ? String(navigator.userAgent || "")
      : "";

  return !/\bMobile\b/i.test(userAgent);
};

export const rememberTvRemote = () => {
  if (!tvMemoryAllowed()) {
    return false;
  }

  try {
    storage()?.setItem(TV_REMOTE_MEMORY_KEY, "1");
    return true;
  } catch {
    return false;
  }
};

export const hasRememberedTvRemote = () => {
  if (!tvMemoryAllowed()) {
    return false;
  }

  try {
    return storage()?.getItem(TV_REMOTE_MEMORY_KEY) === "1";
  } catch {
    return false;
  }
};

export const forgetTvRemote = () => {
  try {
    storage()?.removeItem(TV_REMOTE_MEMORY_KEY);
  } catch {
    // Private browsing or a restricted WebView may refuse storage access.
  }
};

export const isFireTvRuntime = () => {
  if (isAndroidMobileRuntime()) {
    return false;
  }

  const userAgent =
    typeof navigator !== "undefined"
      ? String(navigator.userAgent || "")
      : "";

  const classDetected =
    hasClass("mg-fire-tv") ||
    hasClass("mg-fire-tv-mode") ||
    hasClass("mg-fire-tv-stable") ||
    hasClass("mg-tv-remote");

  const androidNoTouch =
    /Android/i.test(userAgent) &&
    typeof navigator !== "undefined" &&
    Number(navigator.maxTouchPoints || 0) === 0 &&
    !hasClass("mg-touch-device");

  return (
    isKnownTvUserAgent(userAgent) ||
    classDetected ||
    androidNoTouch ||
    hasRememberedTvRemote()
  );
};

export const clearFireTvStateFromAndroidMobile = () => {
  if (!isAndroidMobileRuntime() || typeof document === "undefined") {
    return false;
  }

  // A phone or tablet must never inherit a remembered television session.
  forgetTvRemote();

  const tvClasses = [
    "mg-fire-tv",
    "mg-fire-tv-mode",
    "mg-fire-tv-stable",
    "mg-fire-tv-player-open",
    "mg-tv-remote",
    "mg-native-fire-tv",
  ];

  for (const className of tvClasses) {
    document.documentElement?.classList?.remove(className);
    document.body?.classList?.remove(className);
  }

  if (typeof window !== "undefined") {
    window.__MG_FIRE_TV_STABLE_MODE__ = false;
  }

  document.documentElement?.classList?.add(
    "mg-android-mobile",
    "mg-native-android-mobile",
    "mg-touch-device"
  );
  document.body?.classList?.add(
    "mg-android-mobile",
    "mg-native-android-mobile",
    "mg-touch-device"
  );

  let viewport = document.querySelector('meta[name="viewport"]');

  if (!viewport) {
    viewport = document.createElement("meta");
    viewport.setAttribute("name", "viewport");
    document.head?.appendChild(viewport);
  }

  const current = String(viewport.getAttribute("content") || "");

  if (
    !current ||
    /(?:width\s*=\s*960|height\s*=\s*540|minimum-scale|maximum-scale|user-scalable\s*=\s*no)/i.test(
      current
    )
  ) {
    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, viewport-fit=cover"
    );
  }

  return true;
};

export { FIRE_TV_RE, ANDROID_TV_RE, ANDROID_MOBILE_APP_RE };