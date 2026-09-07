import React, { useEffect } from "react";

const FIRE_TV_RE = /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const isFireTv = () =>
  typeof navigator !== "undefined" &&
  FIRE_TV_RE.test(String(navigator.userAgent || ""));

const visible = (element) => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  if (rect.width < 4 || rect.height < 4) {
    return false;
  }

  const style = window.getComputedStyle(element);

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || 1) > 0.02
  );
};

const findVisibleMedia = () => {
  const media = Array.from(
    document.querySelectorAll("video, iframe")
  ).filter(visible);

  if (!media.length) {
    return null;
  }

  return media
    .map((element) => {
      const rect = element.getBoundingClientRect();

      return {
        element,
        area: rect.width * rect.height,
      };
    })
    .sort((a, b) => b.area - a.area)[0]?.element || null;
};

const findPlayerControl = () => {
  const selectors = [
    'select[aria-label="Choose playback source"]',
    'select[aria-label="Choose source or quality while loading"]',
    'button[aria-label="No sound"]',
    'button[title="No sound"]',
    'button[aria-label="Fullscreen"]',
    'button[aria-label="Exit fullscreen"]',
    'button[aria-label="Back to main menu"]',
  ];

  for (const selector of selectors) {
    const match = Array.from(
      document.querySelectorAll(selector)
    ).reverse().find(visible);

    if (match instanceof HTMLElement) {
      return match;
    }
  }

  return null;
};

const findPlayerOverlay = (media, control) => {
  for (const item of [media, control]) {
    if (!(item instanceof HTMLElement)) {
      continue;
    }

    const explicit = item.closest('[data-mg-player-overlay="true"]');

    if (explicit instanceof HTMLElement) {
      return explicit;
    }

    const fixed = item.closest(".fixed.inset-0");

    if (fixed instanceof HTMLElement) {
      return fixed;
    }

    const dialog = item.closest('[role="dialog"], [aria-modal="true"]');

    if (dialog instanceof HTMLElement) {
      return dialog;
    }
  }

  return null;
};

export default function FireTvPlayerTakeover() {
  useEffect(() => {
    if (!isFireTv() || typeof document === "undefined") {
      return undefined;
    }

    const originals = new Map();
    let playerOpen = false;
    let frame = 0;

    const remember = (element) => {
      if (!(element instanceof HTMLElement) || originals.has(element)) {
        return;
      }

      originals.set(element, element.getAttribute("style"));
    };

    const force = (element, property, value) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      remember(element);
      element.style.setProperty(property, value, "important");
    };

    const publish = (open) => {
      if (playerOpen === open) {
        return;
      }

      playerOpen = open;

      window.dispatchEvent(
        new CustomEvent("mg:player-visibility", {
          detail: { open },
        })
      );
    };

    const restoreAll = () => {
      originals.forEach((style, element) => {
        if (!(element instanceof HTMLElement)) {
          return;
        }

        if (style == null || style === "") {
          element.removeAttribute("style");
        } else {
          element.setAttribute("style", style);
        }
      });

      originals.clear();

      document.documentElement.classList.remove("mg-fire-tv-player-open");
      document.body?.classList.remove("mg-fire-tv-player-open");
    };

    const apply = (media, control, overlay) => {
      document.documentElement.classList.add("mg-fire-tv-player-open");
      document.body?.classList.add("mg-fire-tv-player-open");

      /* The navbar is not allowed to exist visually while media is open. */
      document
        .querySelectorAll("#root .mg-fire-tv-nav")
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

      const main = document.querySelector("#root main");

      if (main instanceof HTMLElement) {
        force(main, "width", "100vw");
        force(main, "max-width", "100vw");
        force(main, "min-width", "100vw");
        force(main, "margin", "0");
        force(main, "margin-left", "0");
        force(main, "padding", "0");
        force(main, "flex", "0 0 100vw");
        force(main, "overflow", "hidden");
        force(main, "transform", "none");
      }

      document
        .querySelectorAll('button[data-mg-global-back="true"]')
        .forEach((button) => {
          if (button instanceof HTMLElement) {
            force(button, "display", "none");
          }
        });

      if (document.body instanceof HTMLElement) {
        force(document.body, "overflow", "hidden");
      }

      if (overlay instanceof HTMLElement) {
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

        if (wrapper instanceof HTMLElement) {
          force(wrapper, "position", "absolute");
          force(wrapper, "inset", "0");
          force(wrapper, "width", "100vw");
          force(wrapper, "height", "100vh");
          force(wrapper, "max-width", "none");
          force(wrapper, "max-height", "none");
          force(wrapper, "margin", "0");
          force(wrapper, "padding", "0");
          force(wrapper, "transform", "none");
          force(wrapper, "overflow", "hidden");
        }
      }

      const activeMedia =
        media instanceof HTMLElement
          ? media
          : overlay?.querySelector?.("video, iframe") || null;

      if (activeMedia instanceof HTMLElement) {
        const stage = activeMedia.parentElement;

        if (stage instanceof HTMLElement) {
          force(stage, "position", "fixed");
          force(stage, "inset", "0");
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
          force(stage, "z-index", "2147483646");
        }

        force(activeMedia, "position", "fixed");
        force(activeMedia, "inset", "0");
        force(activeMedia, "left", "0");
        force(activeMedia, "top", "0");
        force(activeMedia, "width", "100vw");
        force(activeMedia, "height", "100vh");
        force(activeMedia, "min-width", "100vw");
        force(activeMedia, "min-height", "100vh");
        force(activeMedia, "max-width", "none");
        force(activeMedia, "max-height", "none");
        force(activeMedia, "margin", "0");
        force(activeMedia, "padding", "0");
        force(activeMedia, "transform", "none");
        force(activeMedia, "object-fit", "cover");
        force(activeMedia, "object-position", "center center");
        force(activeMedia, "aspect-ratio", "auto");
        force(activeMedia, "background", "#000");
      }

      if (control instanceof HTMLElement) {
        const controlOverlay = control.closest(".fixed.inset-0");

        if (controlOverlay instanceof HTMLElement) {
          force(controlOverlay, "z-index", "2147483646");
        }
      }
    };

    const sync = () => {
      frame = 0;

      const media = findVisibleMedia();
      const control = findPlayerControl();
      const overlay = findPlayerOverlay(media, control);
      const open = Boolean(media || (control && overlay));

      if (open) {
        apply(media, control, overlay);
        publish(true);
        return;
      }

      if (playerOpen || originals.size > 0) {
        restoreAll();
      }

      publish(false);
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
      attributeFilter: ["class", "src", "style", "data-mg-fullscreen"],
    });

    const watchdog = window.setInterval(sync, 100);

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

      restoreAll();
      publish(false);
    };
  }, []);

  return null;
}
