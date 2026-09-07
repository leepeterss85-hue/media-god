import React, { useEffect } from "react";

const FIRE_TV_RE = /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const isFireTv = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return FIRE_TV_RE.test(String(navigator.userAgent || ""));
};

const findPlayerOverlay = () => {
  if (typeof document === "undefined") {
    return null;
  }

  return (
    Array.from(document.querySelectorAll(".fixed.inset-0")).find(
      (element) =>
        element instanceof HTMLElement &&
        element.querySelector('button[aria-label="No sound"]')
    ) || null
  );
};

export default function FireTvPlayerTakeover() {
  useEffect(() => {
    if (!isFireTv() || typeof document === "undefined") {
      return undefined;
    }

    const originalStyles = new Map();
    let activeOverlay = null;
    let frame = 0;

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

      document.documentElement.classList.remove("mg-fire-tv-player-open");
      document.body?.classList.remove("mg-fire-tv-player-open");
    };

    const applyTakeover = (overlay) => {
      if (!(overlay instanceof HTMLElement)) {
        restoreAll();
        return;
      }

      if (activeOverlay && activeOverlay !== overlay) {
        restoreAll();
      }

      activeOverlay = overlay;

      document.documentElement.classList.add("mg-fire-tv-player-open");
      document.body?.classList.add("mg-fire-tv-player-open");

      const nav = document.querySelector("#root .mg-fire-tv-nav");
      const main = document.querySelector("#root .mg-fire-tv-nav + main");
      const globalBack = document.querySelector(
        'button[data-mg-global-back="true"]'
      );

      if (nav instanceof HTMLElement) {
        force(nav, "display", "none");
        force(nav, "visibility", "hidden");
        force(nav, "pointer-events", "none");
      }

      if (main instanceof HTMLElement) {
        force(main, "width", "100vw");
        force(main, "max-width", "100vw");
        force(main, "min-width", "100vw");
        force(main, "margin-left", "0");
        force(main, "flex", "0 0 100vw");
        force(main, "overflow", "hidden");
        force(main, "transform", "none");
        force(main, "filter", "none");
        force(main, "perspective", "none");
      }

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
      force(overlay, "max-width", "none");
      force(overlay, "max-height", "none");
      force(overlay, "margin", "0");
      force(overlay, "background", "#000");
      force(overlay, "z-index", "2147483000");

      const wrapper = overlay.firstElementChild;

      if (wrapper instanceof HTMLElement) {
        force(wrapper, "width", "100%");
        force(wrapper, "max-width", "none");
        force(wrapper, "min-width", "0");
        force(wrapper, "margin", "0 auto");
      }

      overlay.querySelectorAll("video").forEach((video) => {
        if (!(video instanceof HTMLElement)) {
          return;
        }

        force(video, "width", "100%");
        force(video, "height", "100%");
        force(video, "max-width", "100%");
        force(video, "max-height", "100%");
        force(video, "object-fit", "contain");
        force(video, "object-position", "center center");
        force(video, "background", "#000");
      });
    };

    const sync = () => {
      frame = 0;
      const overlay = findPlayerOverlay();

      if (overlay) {
        applyTakeover(overlay);
      } else if (activeOverlay || originalStyles.size > 0) {
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
    });

    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);

    sync();

    return () => {
      observer.disconnect();
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
