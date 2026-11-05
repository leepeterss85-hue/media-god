import { isKnownTvUserAgent } from "./runtimePlatform";

/**
 * Media God has two independently versioned Android package identities:
 * com.mediagod.mobile (phone/tablet) and com.mediagod.firetv (Fire TV).
 * A Fire TV with the phone APK installed must not be told that the phone
 * version number is an available update to the dedicated TV app.
 */
export const isFireTvHardware = ({ userAgent = "", platform = "", tvRemote = false } = {}) =>
  Boolean(tvRemote || isKnownTvUserAgent(`${userAgent} ${platform}`));

export const isMobileUpdaterSignatureError = (message) =>
  /downloaded apk signing identity does not match media god mobile/i.test(
    String(message || "")
  );
