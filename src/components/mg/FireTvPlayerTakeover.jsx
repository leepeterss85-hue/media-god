import { useEffect } from "react";

const FIRE_TV_RE =
  /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

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

  const explicit = document.querySelector(
    '[data-mg-player-root="true"]'
  );

  if (isElement(explicit) && visible(explicit)) {
    return explicit;
  }

  const overlays = Array.from(
    document.querySelectorAll(".fixed.inset-0")
  ).reverse();

  for (const overlay of overlays) {
    if (!isElement(overlay) || !visible(overlay)) {
      continue;
    }

    if (overlay.classList.contains("bg-black/95")) {
      return overlay;
    }

    const hasPlaybackControl = Boolean(
      overlay.querySelector(
        [
          'select[aria-label="Choose playback source"]',
          'select[aria-label="Choose source or quality while loading"]',
          'button[aria-label="No sound"]',
          'button[title="No sound"]',
          'button[aria-label="Back to main menu"]',
        ].join(",")
      )
    );

    const hasMedia = Boolean(
      overlay.querySelector("video, iframe")
    );

    if (hasPlaybackControl || hasMedia) {
      return overlay;
    }
  }

  return null;
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

const initialTvEnvironment = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = String(navigator.userAgent || "");
  const noTouch = Number(navigator.maxTouchPoints || 0) === 0;

  return (
    FIRE_TV_RE.test(ua) ||
    (/Android/i.test(ua) && noTouch) ||
    document.documentElement.classList.contains("mg-fire-tv") ||
    document.body?.classList.contains("mg-fire-tv")
  );
};

export default function FireTvPlayerTakeover() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return undefined;
    }

    const originalStyles = new Map();
    let tvEnvironment = initialTvEnvironment();
    let activeOverlay = null;
    let frame = 0;
    let publishedOpen = false;

    const remember = (element) => {
      if (!isElement(element) || originalStyles.has(element)) {
        return;
      }

      originalStyles.set(
        element,
        element.getAttribute("style")
      );
    };

    const force = (element, property, value) => {
      if (!isElement(element)) {
        return;
      }

      remember(element);
      element.style.setProperty(
        property,
        value,
        "important"
      );
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

    const markTvEnvironment = () => {
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

    const restore = () => {
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

      document.documentElement.classList.remove(
        "mg-fire-tv-player-open"
      );
      document.body?.classList.remove(
        "mg-fire-tv-player-open"
      );

      publish(false);
    };

    const clearStackingAncestors = (overlay) => {
      let node = overlay?.parentElement || null;

      while (isElement(node) && node !== document.body) {
        force(node, "transform", "none");
        force(node, "filter", "none");
        force(node, "perspective", "none");
        force(node, "contain", "none");
        force(node, "isolation", "auto");
        force(node, "clip-path", "none");
        force(node, "overflow", "visible");
        force(node, "max-width", "none");
        force(node, "max-height", "none");
        force(node, "z-index", "auto");

        node = node.parentElement;
      }
    };

    const apply = (overlay) => {
      if (!tvEnvironment || !isElement(overlay)) {
        return;
      }

      if (activeOverlay && activeOverlay !== overlay) {
        restore();
      }

      activeOverlay = overlay;

      document.documentElement.classList.add(
        "mg-fire-tv-player-open"
      );
      document.body?.classList.add(
        "mg-fire-tv-player-open"
      );

      publish(true);
      clearStackingAncestors(overlay);

      document
        .querySelectorAll("#root .mg-fire-tv-nav")
        .forEach((nav) => {
          force(nav, "display", "none");
          force(nav, "visibility", "hidden");
          force(nav, "pointer-events", "none");
          force(nav, "width", "0");
          force(nav, "min-width", "0");
          force(nav, "max-width", "0");
          force(nav, "flex-basis", "0");
        });

      document
        .querySelectorAll(
          'button[data-mg-global-back="true"]'
        )
        .forEach((button) => {
          force(button, "display", "none");
        });

      force(overlay, "position", "fixed");
      force(overlay, "inset", "0");
      force(overlay, "top", "0");
      force(overlay, "right", "0");
      force(overlay, "bottom", "0");
      force(overlay, "left", "0");
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
        force(wrapper, "position", "fixed");
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

        const header = wrapper.children?.[0];
        const stage = wrapper.children?.[1];

        if (isElement(header)) {
          force(header, "position", "fixed");
          force(header, "top", "0");
          force(header, "left", "0");
          force(header, "right", "0");
          force(header, "width", "100vw");
          force(header, "min-height", "64px");
          force(header, "margin", "0");
          force(header, "padding", "10px 18px");
          force(header, "gap", "12px");
          force(header, "box-sizing", "border-box");
          force(header, "z-index", "2147483647");
        }

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
          force(stage, "background", "#000");
          force(stage, "overflow", "hidden");
          force(stage, "z-index", "2147483645");
        }
      }

      overlay
        .querySelectorAll("video, iframe")
        .forEach((media) => {
          if (!isElement(media)) {
            return;
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
            force(media, "object-fit", "contain");
            force(media, "object-position", "center center");
            force(media, "aspect-ratio", "auto");
          } else {
            force(media, "border", "0");
          }
        });
    };

    const sync = () => {
      frame = 0;

      if (!tvEnvironment) {
        return;
      }

      const overlay = findPlayerOverlay();

      if (overlay) {
        apply(overlay);
        return;
      }

      if (activeOverlay || originalStyles.size > 0) {
        restore();
      }
    };

    const schedule = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(sync);
    };

    const onKeyDown = (event) => {
      if (isStrongTvRemoteEvidence(event)) {
        markTvEnvironment();
        schedule();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", onKeyDown, true);

    const observer = new MutationObserver(schedule);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-mg-fullscreen"],
    });

    const watchdog = window.setInterval(sync, 60);

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    sync();

    return () => {
      observer.disconnect();
      window.clearInterval(watchdog);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      restore();
    };
  }, []);

  return null;
}
