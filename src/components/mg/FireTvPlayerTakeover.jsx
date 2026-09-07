import React, { useEffect } from "react";

const FIRE_TV_RE = /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const isFireTv = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return FIRE_TV_RE.test(String(navigator.userAgent || ""));
};

const closestPlayerOverlay = (element) => {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const overlay = element.closest(".fixed.inset-0");

  return overlay instanceof HTMLElement
    ? overlay
    : null;
};

const findPlayerOverlay = () => {
  if (typeof document === "undefined") {
    return null;
  }

  /*
   * Prefer controls that only belong to Media God's real player.
   * This avoids accidentally selecting a background iframe/video elsewhere
   * in the application.
   */
  const markers = Array.from(
    document.querySelectorAll(
      [
        'button[aria-label="No sound"]',
        'select[aria-label="Choose playback source"]',
        'select[aria-label="Choose source or quality while loading"]',
        'button[aria-label="Back to main menu"]',
      ].join(",")
    )
  ).reverse();

  for (const marker of markers) {
    const overlay = closestPlayerOverlay(marker);

    if (overlay) {
      return overlay;
    }
  }

  /* Once media mounts, it is the next strongest signal. */
  const mediaElements = Array.from(
    document.querySelectorAll("video, iframe")
  ).reverse();

  for (const media of mediaElements) {
    const overlay = closestPlayerOverlay(media);

    if (
      overlay &&
      (
        overlay.querySelector('button[aria-label="No sound"]') ||
        overlay.querySelector('button[aria-label="Fullscreen"]') ||
        overlay.querySelector('button[aria-label="Back"]')
      )
    ) {
      return overlay;
    }
  }

  return null;
};

const findStage = (overlay) => {
  if (!(overlay instanceof HTMLElement)) {
    return null;
  }

  const media = overlay.querySelector("video, iframe");

  if (!(media instanceof HTMLElement)) {
    return null;
  }

  return media.parentElement instanceof HTMLElement
    ? media.parentElement
    : null;
};

export default function FireTvPlayerTakeover() {
  useEffect(() => {
    if (!isFireTv() || typeof document === "undefined") {
      return undefined;
    }

    const originalStyles = new Map();
    let activeOverlay = null;
    let frame = 0;
    let lastSeenPlayerAt = 0;

    const remember = (element) => {
      if (!(element instanceof HTMLElement) || originalStyles.has(element)) {
        return;
      }

      originalStyles.set(element, element.getAttribute("style"));
    };

    const force = (element, property, value) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      remember(element);

      if (
        element.style.getPropertyValue(property) !== value ||
        element.style.getPropertyPriority(property) !== "important"
      ) {
        element.style.setProperty(property, value, "important");
      }
    };

    const restoreAll = () => {
      originalStyles.forEach((style, element) => {
        if (!(element instanceof HTMLElement)) {
          return;
        }

        if (style == null || style === "") {
          element.removeAttribute("style");
        } else {
          element.setAttribute("style", style);
        }
      });

      originalStyles.clear();
      activeOverlay = null;
      lastSeenPlayerAt = 0;

      document.documentElement.classList.remove("mg-fire-tv-player-open");
      document.body?.classList.remove("mg-fire-tv-player-open");
    };

    const clearConstrainingAncestors = (overlay) => {
      let node = overlay.parentElement;

      while (
        node instanceof HTMLElement &&
        node !== document.body
      ) {
        force(node, "transform", "none");
        force(node, "filter", "none");
        force(node, "perspective", "none");
        force(node, "contain", "none");
        force(node, "clip-path", "none");
        force(node, "overflow", "visible");
        force(node, "max-width", "none");

        node = node.parentElement;
      }

      if (document.documentElement instanceof HTMLElement) {
        force(document.documentElement, "overflow", "hidden");
      }

      if (document.body instanceof HTMLElement) {
        force(document.body, "overflow", "hidden");
        force(document.body, "margin", "0");
        force(document.body, "padding", "0");
        force(document.body, "width", "100vw");
        force(document.body, "height", "100vh");
        force(document.body, "max-width", "none");
      }

      const root = document.getElementById("root");

      if (root instanceof HTMLElement) {
        force(root, "width", "100vw");
        force(root, "height", "100vh");
        force(root, "max-width", "none");
        force(root, "margin", "0");
        force(root, "padding", "0");
        force(root, "transform", "none");
        force(root, "overflow", "visible");
      }
    };

    const applyTakeover = (overlay) => {
      if (!(overlay instanceof HTMLElement)) {
        return;
      }

      if (activeOverlay && activeOverlay !== overlay) {
        restoreAll();
      }

      activeOverlay = overlay;
      lastSeenPlayerAt = Date.now();

      document.documentElement.classList.add("mg-fire-tv-player-open");
      document.body?.classList.add("mg-fire-tv-player-open");

      clearConstrainingAncestors(overlay);

      /* Hide every possible navigation rail while playback is active. */
      document
        .querySelectorAll("#root .mg-fire-tv-nav, #root aside")
        .forEach((nav) => {
          if (!(nav instanceof HTMLElement)) {
            return;
          }

          force(nav, "display", "none");
          force(nav, "visibility", "hidden");
          force(nav, "pointer-events", "none");
          force(nav, "width", "0");
          force(nav, "min-width", "0");
          force(nav, "max-width", "0");
        });

      const main =
        overlay.closest("main") ||
        document.querySelector("#root main");

      if (main instanceof HTMLElement) {
        force(main, "position", "static");
        force(main, "width", "100vw");
        force(main, "max-width", "none");
        force(main, "min-width", "100vw");
        force(main, "height", "100vh");
        force(main, "margin", "0");
        force(main, "margin-left", "0");
        force(main, "padding", "0");
        force(main, "flex", "0 0 100vw");
        force(main, "overflow", "visible");
        force(main, "transform", "none");
        force(main, "filter", "none");
        force(main, "perspective", "none");
        force(main, "contain", "none");
      }

      const globalBack = document.querySelector(
        'button[data-mg-global-back="true"]'
      );

      if (globalBack instanceof HTMLElement && !overlay.contains(globalBack)) {
        force(globalBack, "display", "none");
      }

      force(overlay, "position", "fixed");
      force(overlay, "inset", "0");
      force(overlay, "left", "0");
      force(overlay, "top", "0");
      force(overlay, "right", "0");
      force(overlay, "bottom", "0");
      force(overlay, "width", "100vw");
      force(overlay, "height", "100vh");
      force(overlay, "min-width", "100vw");
      force(overlay, "min-height", "100vh");
      force(overlay, "max-width", "none");
      force(overlay, "max-height", "none");
      force(overlay, "margin", "0");
      force(overlay, "padding", "0");
      force(overlay, "transform", "none");
      force(overlay, "background", "#000");
      force(overlay, "overflow", "hidden");
      force(overlay, "z-index", "2147483646");

      const wrapper = overlay.firstElementChild;

      if (wrapper instanceof HTMLElement) {
        force(wrapper, "position", "absolute");
        force(wrapper, "inset", "0");
        force(wrapper, "width", "100vw");
        force(wrapper, "height", "100vh");
        force(wrapper, "min-width", "100vw");
        force(wrapper, "min-height", "100vh");
        force(wrapper, "max-width", "none");
        force(wrapper, "max-height", "none");
        force(wrapper, "margin", "0");
        force(wrapper, "padding", "0");
        force(wrapper, "transform", "none");
        force(wrapper, "overflow", "hidden");
      }

      const stage = findStage(overlay);

      if (stage instanceof HTMLElement) {
        force(stage, "position", "fixed");
        force(stage, "inset", "0");
        force(stage, "left", "0");
        force(stage, "top", "0");
        force(stage, "right", "0");
        force(stage, "bottom", "0");
        force(stage, "width", "100vw");
        force(stage, "height", "100vh");
        force(stage, "min-width", "100vw");
        force(stage, "min-height", "100vh");
        force(stage, "max-width", "none");
        force(stage, "max-height", "none");
        force(stage, "margin", "0");
        force(stage, "padding", "0");
        force(stage, "border", "0");
        force(stage, "border-radius", "0");
        force(stage, "aspect-ratio", "auto");
        force(stage, "transform", "none");
        force(stage, "overflow", "hidden");
        force(stage, "background", "#000");
        force(stage, "display", "flex");
        force(stage, "align-items", "center");
        force(stage, "justify-content", "center");
        force(stage, "z-index", "2147483646");
      }

      overlay.querySelectorAll("video").forEach((video) => {
        if (!(video instanceof HTMLElement)) {
          return;
        }

        force(video, "position", "absolute");
        force(video, "inset", "0");
        force(video, "left", "0");
        force(video, "top", "0");
        force(video, "width", "100vw");
        force(video, "height", "100vh");
        force(video, "min-width", "100vw");
        force(video, "min-height", "100vh");
        force(video, "max-width", "none");
        force(video, "max-height", "none");
        force(video, "margin", "0");
        force(video, "padding", "0");
        force(video, "transform", "none");
        force(video, "object-fit", "cover");
        force(video, "object-position", "center center");
        force(video, "aspect-ratio", "auto");
        force(video, "background", "#000");
      });

      overlay.querySelectorAll("iframe").forEach((frameElement) => {
        if (!(frameElement instanceof HTMLElement)) {
          return;
        }

        force(frameElement, "position", "absolute");
        force(frameElement, "inset", "0");
        force(frameElement, "width", "100vw");
        force(frameElement, "height", "100vh");
        force(frameElement, "min-width", "100vw");
        force(frameElement, "min-height", "100vh");
        force(frameElement, "max-width", "none");
        force(frameElement, "max-height", "none");
        force(frameElement, "border", "0");
        force(frameElement, "transform", "none");
        force(frameElement, "background", "#000");
      });
    };

    const sync = () => {
      frame = 0;

      const overlay = findPlayerOverlay();

      if (overlay) {
        applyTakeover(overlay);
        return;
      }

      /*
       * Source switches briefly remove/reinsert the media element. Keep the
       * takeover alive through that short gap instead of flashing the navbar.
       */
      if (
        activeOverlay &&
        Date.now() - lastSeenPlayerAt < 1000
      ) {
        applyTakeover(activeOverlay);
        return;
      }

      if (activeOverlay || originalStyles.size > 0) {
        restoreAll();
      }
    };

    const scheduleSync = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(scheduleSync);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-mg-fullscreen"],
    });

    const watchdog = window.setInterval(sync, 100);

    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);

    sync();

    return () => {
      observer.disconnect();
      window.clearInterval(watchdog);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      restoreAll();
    };
  }, []);

  return null;
}
