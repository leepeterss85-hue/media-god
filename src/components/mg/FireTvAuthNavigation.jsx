import React, { useEffect } from "react";

const FIRE_TV_RE = /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const isFireTv = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = String(navigator.userAgent || "");
  const classDetected =
    typeof document !== "undefined" &&
    (
      document.documentElement.classList.contains("mg-fire-tv") ||
      document.body?.classList.contains("mg-fire-tv")
    );
  const androidNoTouch =
    /Android/i.test(userAgent) &&
    Number(navigator.maxTouchPoints || 0) === 0;

  return (
    FIRE_TV_RE.test(userAgent) ||
    classDetected ||
    androidNoTouch
  );
};

const visible = (element) => {
  if (!(element instanceof HTMLElement)) return false;

  if (
    element.hidden ||
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;

  const style = window.getComputedStyle(element);

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || 1) > 0.03 &&
    style.pointerEvents !== "none"
  );
};

const directionFromEvent = (event) => {
  const key = String(event?.key || event?.code || "");
  const code = Number(event?.keyCode || event?.which || 0);

  if (key === "ArrowUp" || code === 19 || code === 38) return "up";
  if (key === "ArrowDown" || code === 20 || code === 40) return "down";
  if (key === "ArrowLeft" || code === 21 || code === 37) return "left";
  if (key === "ArrowRight" || code === 22 || code === 39) return "right";

  return null;
};

const isSelectKey = (event) => {
  const key = String(event?.key || event?.code || "");
  const code = Number(event?.keyCode || event?.which || 0);

  return (
    key === "Enter" ||
    key === "NumpadEnter" ||
    key === "Select" ||
    key === "Accept" ||
    code === 13 ||
    code === 23 ||
    code === 66
  );
};

const authPage = () =>
  document.querySelector('[data-mg-auth-page="true"]');

const authFocusables = () => {
  const page = authPage();
  if (!(page instanceof HTMLElement)) return [];

  return Array.from(
    page.querySelectorAll(
      [
        "button:not([disabled])",
        "input:not([disabled]):not([type='hidden'])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "a[href]",
        "[role='button']:not([aria-disabled='true'])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",")
    )
  )
    .filter(visible)
    .sort((a, b) => {
      const orderA = Number(a.getAttribute("data-mg-fire-tv-auth-order"));
      const orderB = Number(b.getAttribute("data-mg-fire-tv-auth-order"));
      const hasOrderA = Number.isFinite(orderA) && orderA > 0;
      const hasOrderB = Number.isFinite(orderB) && orderB > 0;

      if (hasOrderA || hasOrderB) {
        if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
        if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;
      }

      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();

      if (Math.abs(rectA.top - rectB.top) > 6) {
        return rectA.top - rectB.top;
      }

      return rectA.left - rectB.left;
    });
};

const focusElement = (element) => {
  if (!(element instanceof HTMLElement) || !visible(element)) return false;

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
    element.scrollIntoView();
  }

  return true;
};

const focusPrimary = () => {
  const page = authPage();
  if (!(page instanceof HTMLElement)) return false;

  const primary = page.querySelector('[data-mg-fire-tv-auth-primary="true"]');

  return focusElement(primary) || focusElement(authFocusables()[0]);
};

export default function FireTvAuthNavigation() {
  useEffect(() => {
    let lastMoveAt = 0;

    const initialFocus = () => {
      if (!isFireTv()) return;

      const page = authPage();
      if (!(page instanceof HTMLElement)) return;

      const active = document.activeElement;

      if (!(active instanceof HTMLElement) || !page.contains(active)) {
        focusPrimary();
      }
    };

    const timerOne = window.setTimeout(initialFocus, 80);
    const timerTwo = window.setTimeout(initialFocus, 350);

    const onKeyDown = (event) => {
      if (!isFireTv()) return;

      const page = authPage();
      if (!(page instanceof HTMLElement)) return;

      const direction = directionFromEvent(event);
      const select = isSelectKey(event);

      if (!direction && !select) return;

      const current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (select) {
        if (!current || !page.contains(current)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          focusPrimary();
          return;
        }

        const tag = String(current.tagName || "").toLowerCase();

        if (tag === "input" || tag === "textarea" || tag === "select") {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        current.click();
        return;
      }

      const tag = String(current?.tagName || "").toLowerCase();

      if (
        (tag === "input" || tag === "textarea") &&
        (direction === "left" || direction === "right")
      ) {
        return;
      }

      const items = authFocusables();
      if (!items.length) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const now = Date.now();
      if (event.repeat || now - lastMoveAt < 120) return;
      lastMoveAt = now;

      let index = current ? items.indexOf(current) : -1;

      if (index < 0) {
        focusPrimary();
        return;
      }

      const backwards = direction === "up" || direction === "left";
      const step = backwards ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(items.length - 1, index + step));

      focusElement(items[nextIndex]);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mg:tv-remote-detected", initialFocus);

    const observer = new MutationObserver(initialFocus);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.clearTimeout(timerOne);
      window.clearTimeout(timerTwo);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mg:tv-remote-detected", initialFocus);
      observer.disconnect();
    };
  }, []);

  return null;
}
