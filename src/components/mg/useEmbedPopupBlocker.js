import { useEffect } from "react";

/*
 * Popup blocker for third-party web embed players.
 *
 * VidSrc / Embed.su / VidCore / 2Embed / CineSrc / MultiEmbed pages are ad
 * supported and routinely try to open new windows or redirect the host tab.
 * The iframe is cross-origin so we cannot see clicks inside it, but we can:
 *   1. sandbox the iframe so it cannot call window.open or navigate top.
 *   2. override window.open on this window while an embed is mounted, so any
 *      script that reaches the parent (e.g. via postMessage bridges or the
 *      "Open separately" link being hijacked) is neutralised.
 *
 * Use this hook from every embed player component for the lifetime of the
 * embed. Pair it with the `sandbox` attribute on the iframe itself.
 */
export default function useEmbedPopupBlocker() {
  useEffect(() => {
    const originalOpen = window.open;

    const blockedOpen = (...args) => {
      // Swallow programmatic popups spawned while the embed player is open.
      // Return the same null a blocked popup would yield so caller code that
      // checks the return value does not crash.
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
    };
  }, []);
}