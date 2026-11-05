const FIRE_TV_RE =
  /(?:\bAFT[A-Z0-9]*\b|Fire\s*TV|AmazonWebAppPlatform|Silk|MediaGodFireTV)/i;

// Android TV boxes do not always identify themselves as Fire TV. Some ship
// stock Android WebViews whose UA looks like a generic tablet, but devices
// that explicitly advertise TV hardware must receive D-pad focus handling.
// Keep this separate from the phone app marker (which always wins below).
const ANDROID_TV_RE =
  /(?:Android[\s/._-]*TV|Google[\s/._-]*TV|NVIDIA[\s_-]*SHIELD(?:[\s_-]*Android[\s_-]*TV)?|\bMi[\s_-]*Box\b|\bMIBOX\b|\bMiTV\b|\bMecool\b|\bChromecast\s+with\s+Google\s+TV\b|\bONN[\s_-]*(?:4K|Streaming[\s_-]*Box)\b)/i;

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
  return (event, { userAgent = "", mobileApp = false, editable = false } = {}) => {
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
    if (!arrow) return false;
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
    androidNoTouch
  );
};

export const clearFireTvStateFromAndroidMobile = () => {
  if (!isAndroidMobileRuntime() || typeof document === "undefined") {
    return false;
  }

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
