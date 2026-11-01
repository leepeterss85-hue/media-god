import { useEffect } from "react";

/**
 * Dedicated Search / microphone key on some Android TV and Fire TV remotes.
 *
 * Fire OS keeps the Alexa microphone overlay for itself; where a remote does
 * send a Search key to the app we route it into Media God's own voice search.
 * Playback surfaces keep full ownership of the remote.
 */
const SEARCH_KEYCODE = 84;
const SEARCH_KEY_NAMES = new Set(["Search", "LaunchSearch"]);

const playerOwnsScreen = () => {
  if (typeof document === "undefined") {
    return true;
  }

  return (
    document.body?.classList.contains("mg-fire-tv-player-open") ||
    document.documentElement.classList.contains("mg-fire-tv-player-open") ||
    Boolean(document.querySelector('[data-mg-player-root="true"]'))
  );
};

export default function VoiceSearchRemoteKey() {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event?.defaultPrevented) {
        return;
      }

      const code = Number(event?.keyCode || event?.which || 0);
      const key = String(event?.key || event?.code || "");

      if (code !== SEARCH_KEYCODE && !SEARCH_KEY_NAMES.has(key)) {
        return;
      }

      if (playerOwnsScreen()) {
        return;
      }

      event.preventDefault();
      window.dispatchEvent(new CustomEvent("mg:voice-search-request"));
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}