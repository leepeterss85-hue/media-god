import React, { useEffect, useRef } from "react";

const FIRE_TV_RE =
  /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
  '[role="option"]:not([aria-disabled="true"])',
  '[role="tab"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const isFireTv = () =>
  typeof navigator !== "undefined" &&
  FIRE_TV_RE.test(String(navigator.userAgent || ""));

const keyCode = (event) =>
  Number(event?.keyCode || event?.which || 0);

const keyName = (event) =>
  String(event?.key || event?.code || "");

const directionFromEvent = (event) => {
  const key = keyName(event);
  const code = keyCode(event);

  if (key === "ArrowUp" || code === 19 || code === 38) {
    return "up";
  }

  if (key === "ArrowDown" || code === 20 || code === 40) {
    return "down";
  }

  if (key === "ArrowLeft" || code === 21 || code === 37) {
    return "left";
  }

  if (key === "ArrowRight" || code === 22 || code === 39) {
    return "right";
  }

  return null;
};

const isSelectKey = (event) => {
  const key = keyName(event);
  const code = keyCode(event);

  return (
    key === "Enter" ||
    key === "NumpadEnter" ||
    key === "Select" ||
    key === "Accept" ||
    code === 23 ||
    code === 66 ||
    code === 13
  );
};

const mediaActionFromEvent = (event) => {
  const key = keyName(event);
  const code = keyCode(event);

  if (key === "MediaPlayPause" || code === 85 || code === 179) {
    return "playpause";
  }

  if (key === "MediaPlay" || code === 126) {
    return "play";
  }

  if (key === "MediaPause" || code === 127) {
    return "pause";
  }

  if (key === "MediaRewind" || code === 89 || code === 227) {
    return "rewind";
  }

  if (key === "MediaFastForward" || code === 90 || code === 228) {
    return "fastforward";
  }

  return null;
};

const visible = (element) => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (
    element.hidden ||
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.getAttribute("aria-hidden") === "true"
  ) {
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
    style.pointerEvents !== "none" &&
    Number(style.opacity || 1) > 0.03
  );
};

const topOverlay = () => {
  const player = Array.from(
    document.querySelectorAll(".fixed.inset-0")
  )
    .filter(
      (element) =>
        visible(element) &&
        (
          element.classList.contains("bg-black/95") ||
          element.querySelector(
            'button[aria-label="Back to main menu"]'
          )
        )
    )
    .pop();

  if (player instanceof HTMLElement) {
    return player;
  }

  const overlays = Array.from(
    document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], .fixed.inset-0'
    )
  ).filter(visible);

  if (!overlays.length) {
    return null;
  }

  return overlays
    .map((element, index) => {
      const z = Number(window.getComputedStyle(element).zIndex);

      return {
        element,
        index,
        z: Number.isFinite(z) ? z : 0,
      };
    })
    .sort((a, b) =>
      a.z === b.z
        ? a.index - b.index
        : a.z - b.z
    )
    .pop()?.element || null;
};

const focusables = (scope) =>
  Array.from(scope?.querySelectorAll?.(FOCUSABLE) || [])
    .filter(visible);

const focusElement = (element) => {
  if (!(element instanceof HTMLElement) || !visible(element)) {
    return false;
  }

  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }

  try {
    element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  } catch {
    // Focus still succeeded.
  }

  return true;
};

const centre = (element) => {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

const directionalTarget = (current, candidates, direction) => {
  if (!(current instanceof HTMLElement)) {
    return candidates[0] || null;
  }

  const from = centre(current);
  let best = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    if (candidate === current) {
      continue;
    }

    const to = centre(candidate);
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (direction === "left" && dx >= -2) continue;
    if (direction === "right" && dx <= 2) continue;
    if (direction === "up" && dy >= -2) continue;
    if (direction === "down" && dy <= 2) continue;

    const primary =
      direction === "left" || direction === "right"
        ? Math.abs(dx)
        : Math.abs(dy);

    const secondary =
      direction === "left" || direction === "right"
        ? Math.abs(dy)
        : Math.abs(dx);

    const score = primary + secondary * 2.25;

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
};

const activeVideo = () => {
  const overlay = topOverlay();

  if (overlay instanceof HTMLElement) {
    const media = Array.from(
      overlay.querySelectorAll("video")
    ).filter(visible);

    if (media.length) {
      return media[media.length - 1];
    }
  }

  return null;
};

const runMediaAction = (action) => {
  const video = activeVideo();

  if (!(video instanceof HTMLMediaElement)) {
    return false;
  }

  if (action === "playpause") {
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }

    return true;
  }

  if (action === "play") {
    video.play().catch(() => {});
    return true;
  }

  if (action === "pause") {
    video.pause();
    return true;
  }

  if (action === "rewind") {
    try {
      video.currentTime = Math.max(0, video.currentTime - 10);
    } catch {
      // Ignore non-seekable streams.
    }

    return true;
  }

  if (action === "fastforward") {
    try {
      video.currentTime = Math.min(
        Number.isFinite(video.duration)
          ? video.duration
          : video.currentTime + 10,
        video.currentTime + 10
      );
    } catch {
      // Ignore non-seekable streams.
    }

    return true;
  }

  return false;
};

export default function FireTvRemote() {
  const lastScopeRef = useRef(null);

  useEffect(() => {
    if (!isFireTv() || typeof document === "undefined") {
      return undefined;
    }

    /*
     * IMPORTANT:
     * This component deliberately does NOT alter the viewport and does NOT
     * handle the physical Back button. Stable home navigation lives in
     * fireTvStableMode.js and Back is owned centrally by main.jsx.
     *
     * Its only job now is D-pad/select/media handling inside overlays such as
     * details, episode selectors and the video player.
     */
    document.documentElement.classList.add("mg-fire-tv-mode");
    document.body?.classList.add("mg-fire-tv-mode");

    const focusOverlay = () => {
      const scope = topOverlay();

      if (!(scope instanceof HTMLElement)) {
        lastScopeRef.current = null;
        return;
      }

      if (lastScopeRef.current === scope) {
        return;
      }

      lastScopeRef.current = scope;

      const preferred =
        scope.querySelector(
          'button[aria-label="Back to main menu"], button[aria-label="Back"], button[aria-label="Close details"], button[aria-label="Close search"]'
        ) ||
        focusables(scope)[0] ||
        null;

      window.setTimeout(() => {
        focusElement(preferred);
      }, 30);
    };

    const onKeyDown = (event) => {
      const mediaAction = mediaActionFromEvent(event);

      if (mediaAction && runMediaAction(mediaAction)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const scope = topOverlay();

      if (!(scope instanceof HTMLElement)) {
        return;
      }

      /* main.jsx owns Back before this handler sees it. */
      const direction = directionFromEvent(event);

      if (direction) {
        const candidates = focusables(scope);
        const current =
          document.activeElement instanceof HTMLElement &&
          scope.contains(document.activeElement)
            ? document.activeElement
            : null;

        const target = directionalTarget(
          current,
          candidates,
          direction
        );

        if (target && focusElement(target)) {
          event.preventDefault();
          event.stopPropagation();
        }

        return;
      }

      if (isSelectKey(event)) {
        const current = document.activeElement;

        if (
          current instanceof HTMLElement &&
          scope.contains(current) &&
          visible(current)
        ) {
          event.preventDefault();
          event.stopPropagation();
          current.click();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, false);

    const observer = new MutationObserver(focusOverlay);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    focusOverlay();

    return () => {
      window.removeEventListener("keydown", onKeyDown, false);
      observer.disconnect();
      document.documentElement.classList.remove("mg-fire-tv-mode");
      document.body?.classList.remove("mg-fire-tv-mode");
    };
  }, []);

  return null;
}
