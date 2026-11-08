/*
 * Drop only surplus held-D-pad repeats, not initial taps or action keys.
 * Fire OS can deliver repeats faster than older WebViews can lay out/focus
 * complex catalogue pages. Source/player interactions remain native-owned.
 */
// Fire TV's dedicated Home/hero/card navigator: preserve every deliberate
// first press, pace only true held-key repeats. Live TV retains its original
// cadence and is not affected by the catalogue tuning.
export const shouldIgnoreStableTvMove = (event, now, lastMoveAt, onLiveTvCard = false) =>
  (Boolean(event?.repeat) || onLiveTvCard) &&
  now - lastMoveAt < (onLiveTvCard ? 115 : 85);

export const createFireTvRepeatLimiter = (minimumSpacingMs = 72) => {
  let lastDirection = "";
  let lastAllowedAt = -Infinity;

  return (event, now) => {
    // Generic Android TV WebViews sometimes expose the native DPAD keyCode
    // (19-22) or browser keyCode (37-40) with key="Unidentified".
    // Normalise only those four arrows; never throttle OK, Back, Menu, or
    // media keys, and keep the first press unthrottled.
    const keyName = String(event?.key || event?.code || "");
    const nativeCode = Number(event?.keyCode || event?.which || 0);
    const codeDirection = {
      19: "ArrowUp", 20: "ArrowDown", 21: "ArrowLeft", 22: "ArrowRight",
      38: "ArrowUp", 40: "ArrowDown", 37: "ArrowLeft", 39: "ArrowRight",
    }[nativeCode] || "";
    const key = /^Arrow(?:Up|Down|Left|Right)$/.test(keyName)
      ? keyName : codeDirection;
    if (!key) return false;
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
