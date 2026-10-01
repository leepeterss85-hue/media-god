import { useEffect } from "react";

/*
 * Popup blocker for third-party web embed players.
 *
 * VidSrc / Embed.su / VidCore / 2Embed / CineSrc / MultiEmbed pages are ad
 * supported and routinely try to open new windows or redirect the host tab.
 * The iframe is cross-origin so we cannot see clicks inside it, but we can:
 *   1. sandbox the iframe so it cannot navigate the top-level app tab.
 *   2. override window.open on this window, allowing popups that originate
 *      from a genuine user gesture (the embed's real "Play" button) while
 *      blocking purely scripted popups (ads, redirects) that fire with no
 *      user interaction.
 *
 * Use this hook from every embed player component for the lifetime of the
 * embed. Pair it with the `sandbox` attribute on the iframe itself.
 */
export default function useEmbedPopupBlocker() {
  useEffect(() => {
    const originalOpen = window.open;
    let lastGestureAt = 0;
    const GESTURE_WINDOW_MS = 2000;

    const onGesture = () => {
      lastGestureAt = Date.now();
    };

    const gestureEvents = ["click", "keydown", "touchend", "pointerdown"];
    gestureEvents.forEach((event) =>
      window.addEventListener(event, onGesture, {
        capture: true,
        passive: true,
      })
    );

    const blockedOpen = (...args) => {
      const sinceGesture = Date.now() - lastGestureAt;

      // Allow popups that follow a real user gesture — the embed's own Play
      // button opens the video stream this way. Block only scripted popups
      // (ads, auto-redirects) that fire with no recent interaction.
      if (sinceGesture <= GESTURE_WINDOW_MS) {
        return originalOpen.apply(window, args);
      }

      try {
        window.dispatchEvent(
          new CustomEvent("mg:embed-popup-blocked", {
            detail: { url: String(args?.[0] || "") },
          })
        );
      } catch {
        // ignore
      }

      return null;
    };

    window.open = blockedOpen;

    const beforeUnload = (event) => {
      // Block scripted top-level redirects away from the app while the embed
      // is open. A user-initiated back/exit is a normal SPA navigation, not a
      // beforeunload trigger, so this only fires on hijack attempts.
      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", beforeUnload);

    return () => {
      window.open = originalOpen;
      window.removeEventListener("beforeunload", beforeUnload);
      gestureEvents.forEach((event) =>
        window.removeEventListener(event, onGesture, { capture: true })
      );
    };
  }, []);
}