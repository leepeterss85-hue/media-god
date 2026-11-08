import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import VoiceSearchButton from "./VoiceSearchButton";

/**
 * Keep the verified LiveTVView JSX (player, channels and inline text search)
 * byte-identical. Attach the optional microphone alongside its existing
 * search box instead of modifying protected Live TV logic.
 */
export default function LiveTvVoiceSearchAccessory({ onResult }) {
  const [host, setHost] = useState(null);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const findHost = () => {
      const container = document.querySelector(
        '[data-mg-live-tv-controls="true"] [data-mg-live-tv-search="true"]'
      );
      const input = container?.querySelector(
        'input[aria-label="Search Live TV channels"]'
      );
      if (!container || !input) return null;
      const previousPadding = input.style.paddingRight;
      // The old search field is unchanged. Reserve room for the new button
      // without moving existing channel navigation or control elements.
      input.style.paddingRight = "3rem";
      setHost(container);
      return () => {
        input.style.paddingRight = previousPadding;
      };
    };

    let cleanup = findHost();
    let frame = 0;
    // A postponed mount on a slower Android-box WebView gets one more frame.
    if (!cleanup && typeof window !== "undefined") {
      frame = window.requestAnimationFrame(() => { cleanup = findHost(); });
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, []);

  return host ? createPortal(
    <VoiceSearchButton
      className="absolute right-1 top-1/2 -translate-y-1/2"
      label="Search Live TV by voice"
      onResult={onResult}
    />,
    host,
  ) : null;
}
