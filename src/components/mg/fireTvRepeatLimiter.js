/*
 * Drop only surplus held-D-pad repeats, not initial taps or action keys.
 * Fire OS can deliver repeats faster than older WebViews can lay out/focus
 * complex catalogue pages. Source/player interactions remain native-owned.
 */
export const createFireTvRepeatLimiter = (minimumSpacingMs = 72) => {
  let lastDirection = "";
  let lastAllowedAt = -Infinity;

  return (event, now) => {
    const key = String(event?.key || event?.code || "");
    if (!/^Arrow(?:Up|Down|Left|Right)$/.test(key)) return false;
    if (!event.repeat) {
      lastDirection = key;
      lastAllowedAt = now;
      return false;
    }
    if (key !== lastDirection || now - lastAllowedAt >= minimumSpacingMs) {
      lastDirection = key;
      lastAllowedAt = now;
      return false;
    }
    return true;
  };
};
