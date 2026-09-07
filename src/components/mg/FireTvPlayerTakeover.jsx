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

  /*
   * The real media element is the most reliable player marker.
   * Do not depend on a particular control being visible because Fire TV
   * can hide/re-render controls while video continues playing.
   */
  const mediaElements = Array.from(
    document.querySelectorAll("video, iframe")
  ).reverse();

  for (const media of mediaElements) {
    if (!(media instanceof HTMLElement)) {
      continue;
    }

    const overlay = media.closest(".fixed.inset-0");

    if (overlay instanceof HTMLElement) {
      return overlay;
    }
  }

  /* Fallback while a stream is still resolving and the video is not mounted. */
  const overlays = Array.from(
    document.querySelectorAll(".fixed.inset-0")
  ).reverse();

  return (
    overlays.find(
      (element) =>
        element instanceof HTMLElement &&
        (element.querySelector('button[aria-label="No sound"]') ||
          element.querySelector('button[aria-label="Fullscreen"]') ||
          element.querySelector('button[aria-label="Back"]'))
    ) || null
  );
};

const findStage = (overlay) => {
  if (!(overlay instanceof HTMLElement)) {
    return null;
  }

  const media = overlay.querySelector("video, iframe");

  if (!(media instanceof HTMLElement)) {
    return null;
  }

  /* VideoPlayer mounts media directly inside the stage. */
  if (media.parentElement instanceof HTMLElement) {
    return media.parentElement;
  }

  return null;
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

      /*
       * Hide every Media God navigation rail while playback is active.
       * querySelectorAll is deliberate: it also covers any duplicated/stale
       * nav node left temporarily during React transitions.
       */
      document.querySelectorAll("#root .mg-fire-tv-nav").forEach((nav) => {
        if (!(nav instanceof HTMLElement)) {
          return;
        }

        force(nav, "display", "none");
        force(nav, "visibility", "hidden");
        force(nav, "pointer-events", "none");
      });

      const main = document.querySelector("#root .mg-fire-tv-nav + main");
      const globalBack = document.querySelector(
        'button[data-mg-global-back="true"]'
      );

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

      if (document.body instanceof HTMLElement) {
        force(document.body, "overflow", "hidden");
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
        force(wrapper, "max-width", "none");
        force(wrapper, "max-height", "none");
        force(wrapper, "min-width", "0");
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

    /*
     * Fire TV WebView can change the player DOM without a child mutation
     * when switching source/fullscreen. Re-assert takeover periodically so
     * the sidebar can never reappear during playback.
     */
    const watchdog = window.setInterval(sync, 250);

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
