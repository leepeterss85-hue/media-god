import React, { useEffect } from "react";

const FIRE_TV_RE = /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const isFireTv = () =>
  typeof navigator !== "undefined" &&
  FIRE_TV_RE.test(String(navigator.userAgent || ""));

const isElement = (value) =>
  typeof HTMLElement !== "undefined" &&
  value instanceof HTMLElement;

const PLAYER_CONTROL_SELECTOR = [
  'select[aria-label="Choose playback source"]',
  'select[aria-label="Choose source or quality while loading"]',
  'button[aria-label="No sound"]',
  'button[title="No sound"]',
  'button[aria-label="Fullscreen"]',
  'button[aria-label="Exit fullscreen"]',
  'button[aria-label="Back to main menu"]',
].join(",");

const findPlayerOverlay = () => {
  if (typeof document === "undefined") {
    return null;
  }

  /*
   * VideoPlayer's outer shell is the only Media God overlay that uses
   * bg-black/95. Detect that shell first so the navbar disappears before
   * the stream has even finished mounting its <video> element.
   */
  const overlays = Array.from(
    document.querySelectorAll(".fixed.inset-0")
  ).reverse();

  for (const overlay of overlays) {
    if (!isElement(overlay)) {
      continue;
    }

    const isPlayerShell =
      overlay.classList.contains("bg-black/95") ||
      Boolean(overlay.querySelector(PLAYER_CONTROL_SELECTOR));

    if (isPlayerShell) {
      return overlay;
    }
  }

  return null;
};

const findActiveMedia = (overlay) => {
  if (!isElement(overlay)) {
    return null;
  }

  const media = Array.from(
    overlay.querySelectorAll("video, iframe")
  );

  return media.length
    ? media[media.length - 1]
    : null;
};

export default function FireTvPlayerTakeover() {
  useEffect(() => {
    if (!isFireTv() || typeof document === "undefined") {
      return undefined;
    }

    const originalStyles = new Map();
    let activeOverlay = null;
    let lastSeenAt = 0;
    let frame = 0;
    let publishedOpen = false;

    const remember = (element) => {
      if (!isElement(element) || originalStyles.has(element)) {
        return;
      }

      originalStyles.set(element, element.getAttribute("style"));
    };

    const force = (element, property, value) => {
      if (!isElement(element)) {
        return;
      }

      remember(element);
      element.style.setProperty(property, value, "important");
    };

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

    const restoreStyles = () => {
      originalStyles.forEach((style, element) => {
        if (!isElement(element)) {
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
      lastSeenAt = 0;

      document.documentElement.classList.remove("mg-fire-tv-player-open");
      document.body?.classList.remove("mg-fire-tv-player-open");

      publish(false);
    };

    const clearConstrainingAncestors = (overlay) => {
      let node = overlay?.parentElement || null;

      while (isElement(node) && node !== document.body) {
        force(node, "transform", "none");
        force(node, "filter", "none");
        force(node, "perspective", "none");
        force(node, "contain", "none");
        force(node, "clip-path", "none");
        force(node, "overflow", "visible");
        force(node, "max-width", "none");
        force(node, "max-height", "none");
        force(node, "margin-left", "0");

        node = node.parentElement;
      }
    };

    const apply = (overlay) => {
      if (!isElement(overlay)) {
        return;
      }

      if (activeOverlay && activeOverlay !== overlay) {
        restoreStyles();
      }

      activeOverlay = overlay;
      lastSeenAt = Date.now();

      document.documentElement.classList.add("mg-fire-tv-player-open");
      document.body?.classList.add("mg-fire-tv-player-open");
      publish(true);

      clearConstrainingAncestors(overlay);

      document
        .querySelectorAll("#root .mg-fire-tv-nav")
        .forEach((nav) => {
          if (!isElement(nav)) {
            return;
          }

          force(nav, "display", "none");
          force(nav, "visibility", "hidden");
          force(nav, "pointer-events", "none");
          force(nav, "width", "0");
          force(nav, "min-width", "0");
          force(nav, "max-width", "0");
          force(nav, "flex-basis", "0");
        });

      const main = document.querySelector("#root main");

      if (isElement(main)) {
        force(main, "position", "static");
        force(main, "width", "100vw");
        force(main, "min-width", "100vw");
        force(main, "max-width", "100vw");
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

      if (isElement(document.body)) {
        force(document.body, "overflow", "hidden");
        force(document.body, "margin", "0");
        force(document.body, "padding", "0");
      }

      const root = document.getElementById("root");

      if (isElement(root)) {
        force(root, "width", "100vw");
        force(root, "max-width", "100vw");
        force(root, "margin", "0");
        force(root, "padding", "0");
        force(root, "transform", "none");
        force(root, "overflow", "visible");
      }

      document
        .querySelectorAll('button[data-mg-global-back="true"]')
        .forEach((button) => {
          if (isElement(button)) {
            force(button, "display", "none");
          }
        });

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
      force(overlay, "overflow", "hidden");
      force(overlay, "background", "#000");
      force(overlay, "z-index", "2147483646");

      const wrapper = overlay.firstElementChild;

      if (isElement(wrapper)) {
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

      const media = findActiveMedia(overlay);

      if (isElement(media)) {
        const stage = media.parentElement;

        if (isElement(stage)) {
          force(stage, "position", "fixed");
          force(stage, "inset", "0");
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
        }

        force(media, "position", "absolute");
        force(media, "inset", "0");
        force(media, "width", "100vw");
        force(media, "height", "100vh");
        force(media, "min-width", "100vw");
        force(media, "min-height", "100vh");
        force(media, "max-width", "none");
        force(media, "max-height", "none");
        force(media, "margin", "0");
        force(media, "padding", "0");
        force(media, "transform", "none");
        force(media, "background", "#000");

        if (media.tagName === "VIDEO") {
          force(media, "object-fit", "cover");
          force(media, "object-position", "center center");
          force(media, "aspect-ratio", "auto");
        } else {
          force(media, "border", "0");
        }
      }
    };

    const sync = () => {
      frame = 0;

      const overlay = findPlayerOverlay();

      if (overlay) {
        apply(overlay);
        return;
      }

      /* Keep the takeover alive during brief source-switch DOM gaps. */
      if (activeOverlay && Date.now() - lastSeenAt < 900) {
        apply(activeOverlay);
        return;
      }

      if (activeOverlay || originalStyles.size > 0) {
        restoreStyles();
      }
    };

    const schedule = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(schedule);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-mg-fullscreen"],
    });

    const watchdog = window.setInterval(sync, 80);

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    sync();

    return () => {
      observer.disconnect();
      window.clearInterval(watchdog);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      restoreStyles();
    };
  }, []);

  return null;
}
