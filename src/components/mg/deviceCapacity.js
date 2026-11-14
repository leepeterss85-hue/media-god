import { isFireTvRuntime } from "./runtimePlatform.js";

const positive = (value) => {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * Weak Android TV boxes under-report their memory: a 1 GB box may advertise
 * 4 GB, or nothing at all. Combine the reported memory with the core count so
 * optional catalogue caches, poster decoding and background scans stay small
 * on the hardware that cannot carry them.
 *
 * Only televisions qualify — phones and tablets keep their normal behaviour.
 */
export const isLowCapacityTvDevice = ({
  nav = typeof navigator !== "undefined" ? navigator : null,
} = {}) => {
  if (!isFireTvRuntime()) {
    return false;
  }

  const memory = positive(nav?.deviceMemory);
  const cores = positive(nav?.hardwareConcurrency);

  if (memory && memory <= 2) {
    return true;
  }

  if (cores && cores <= 2) {
    return true;
  }

  // Memory reporting is absent on most Android TV WebViews, so a small core
  // count is the only honest signal left for the cheapest boxes.
  return !memory && cores > 0 && cores <= 4;
};

export default isLowCapacityTvDevice;

/**
 * Older Android 9 TV-box WebViews can be sluggish despite advertising 4 GB of
 * memory and six or more cores (for example, the MINIX NEO U22-XJ). Treat
 * those as *legacy* for optional browse checks only. Do not lower image
 * resolution or change playback based on Android version alone.
 *
 * The native TV shell appends MediaGodFireTV/AmazonWebAppPlatform to its UA,
 * including on non-Amazon hardware. Those app tokens are not proof that the
 * underlying device is an actual Fire Stick; exclude real AFT/Silk hardware
 * signatures instead.
 */
export const isLegacyAndroidTvBox = ({
  nav = typeof navigator !== "undefined" ? navigator : null,
} = {}) => {
  if (!isFireTvRuntime()) return false;
  const agent = String(nav?.userAgent || "");
  const version = /\bAndroid[ /](\d+)(?:\.\d+)?/i.exec(agent);
  const major = Number(version?.[1]);
  if (!version || major < 4 || major > 9) return false;
  if (/\bAFT[A-Z0-9]*\b|\bSilk\b|\bFire OS\b/i.test(agent)) return false;
  return /\bMINIX\b|\bNEO[ _-]*U22[ _-]*XJ\b|\bAndroid[ _-]*TV\b|\bGoogle[ _-]*TV\b|\bAmlogic\b|\bRockchip\b|\bMecool\b|\bUgoos\b|\bTV[ _-]*Box\b/i.test(agent);
};
