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