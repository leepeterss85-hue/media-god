const FIRE_TV_RE =
  /(?:\bAFT[A-Z0-9]*\b|Fire\s*TV|AmazonWebAppPlatform|Silk|MediaGodFireTV)/i;

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
    FIRE_TV_RE.test(userAgent) ||
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

export { FIRE_TV_RE, ANDROID_MOBILE_APP_RE };
