import { useEffect } from "react";
import {
  clearFireTvStateFromAndroidMobile,
  isAndroidMobileRuntime,
  isFireTvRuntime,
} from "@/components/mg/runtimePlatform";

const isElement = (value) =>
  typeof HTMLElement !== "undefined" &&
  value instanceof HTMLElement;

const visible = (element) => {
  if (!isElement(element)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || 1) > 0.02
  );
};

const findPlayerOverlay = () => {
  if (typeof document === "undefined") {
    return null;
  }

  const player = document.querySelector(
    '[data-mg-player-root="true"]'
  );

  return isElement(player) && visible(player)
    ? player
    : null;
};

const remoteCode = (event) =>
  Number(event?.keyCode || event?.which || 0);

const remoteKey = (event) =>
  String(event?.key || event?.code || "");

const isStrongTvRemoteEvidence = (event) => {
  const code = remoteCode(event);
  const key = remoteKey(event);

  if (
    code === 4 ||
    code === 19 ||
    code === 20 ||
    code === 21 ||
    code === 22 ||
    code === 23 ||
    code === 82 ||
    code === 85 ||
    code === 89 ||
    code === 90 ||
    code === 126 ||
    code === 127 ||
    code === 166 ||
    code === 461
  ) {
    return true;
  }

  return (
    key === "Select" ||
    key === "Accept" ||
    key === "BrowserBack" ||
    key === "GoBack" ||
    key === "MediaPlayPause" ||
    key === "MediaRewind" ||
    key === "MediaFastForward"
  );
};

const initialTvEnvironment = () =>
  !isAndroidMobileRuntime() && isFireTvRuntime();

/*
 * Fire TV player lifecycle helper.
 *
 * Older versions of this component forcibly rewrote the player, wrapper,
 * header, video and navigation with inline !important styles. That made the
 * film title / Exit / source box sit permanently over the picture and also
 * fought the real player controls and D-pad focus handling.
 *
 * VideoPlayer and the Fire TV CSS now own sizing/fullscreen. This helper only
 * publishes whether playback is open and marks a Fire TV environment.
 */
export default function FireTvPlayerTakeover() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return undefined;
    }

    let tvEnvironment = initialTvEnvironment();
    let frame = 0;
    let publishedOpen = false;

    const publish = (open) => {
      if (publishedOpen === open) {
        return;
      }

      publishedOpen = open;

      window.dispatchEvent(
        new CustomEvent("mg:player-visibility", {
          detail: { open },
        })
      );
    };

    const markTvEnvironment = () => {
      if (isAndroidMobileRuntime()) {
        tvEnvironment = false;
        clearFireTvStateFromAndroidMobile();
        return;
      }

      if (tvEnvironment) {
        return;
      }

      tvEnvironment = true;

      document.documentElement.classList.add(
        "mg-fire-tv",
        "mg-tv-remote"
      );
      document.body?.classList.add(
        "mg-fire-tv",
        "mg-tv-remote"
      );

      window.dispatchEvent(
        new CustomEvent("mg:tv-remote-detected")
      );
    };

    const sync = () => {
      frame = 0;

      if (!tvEnvironment) {
        return;
      }

      const player = findPlayerOverlay();
      const open = Boolean(player);

      document.documentElement.classList.toggle(
        "mg-fire-tv-player-open",
        open
      );
      document.body?.classList.toggle(
        "mg-fire-tv-player-open",
        open
      );

      publish(open);

      if (!open) {
        const focused = document.activeElement;
        if (
          isElement(focused) &&
          focused.closest?.('[data-mg-player-root="true"]')
        ) {
          focused.blur?.();
        }
      }
    };

    const schedule = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(sync);
    };

    const onKeyDown = (event) => {
      if (isAndroidMobileRuntime()) {
        clearFireTvStateFromAndroidMobile();
        return;
      }

      if (isStrongTvRemoteEvidence(event)) {
        markTvEnvironment();
        schedule();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "data-mg-player-fullscreen",
        "data-mg-fullscreen",
      ],
    });

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    sync();

    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      document.documentElement.classList.remove(
        "mg-fire-tv-player-open"
      );
      document.body?.classList.remove(
        "mg-fire-tv-player-open"
      );
      publish(false);
    };
  }, []);

  return null;
}
