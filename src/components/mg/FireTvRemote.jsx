import React, { useEffect, useRef } from "react";

const TV_REMOTE_STORAGE_KEY = "mg:fire-tv-settings-v2";

const FIRE_TV_RE =
  /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const TV_LAYOUT_WIDTH = 1920;

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

const FIRE_TV_CSS = `
html.mg-fire-tv-mode,
body.mg-fire-tv-mode {
  scroll-behavior: smooth;
}

/*
 * IMPORTANT:
 * Do not force widths on #root, main or aside here.
 *
 * The Fire TV viewport is corrected in JavaScript to a true 1920px
 * television layout viewport. Once that is done, the app's normal
 * Tailwind responsive rules are allowed to lay the page out normally.
 */
html.mg-tv-layout,
body.mg-tv-layout,
body.mg-tv-layout #root {
  min-width: 0 !important;
  max-width: none !important;
}

body.mg-tv-layout {
  margin: 0 !important;
  overflow-x: hidden !important;
}

body.mg-tv-layout #root {
  min-height: 100dvh !important;
}

body.mg-tv-layout img,
body.mg-tv-layout video,
body.mg-tv-layout iframe {
  max-width: 100%;
}

/* Strong, reliable TV focus ring. */
body.mg-fire-tv-mode button:focus,
body.mg-fire-tv-mode a:focus,
body.mg-fire-tv-mode input:focus,
body.mg-fire-tv-mode select:focus,
body.mg-fire-tv-mode textarea:focus,
body.mg-fire-tv-mode [role="button"]:focus,
body.mg-fire-tv-mode [role="menuitem"]:focus,
body.mg-fire-tv-mode [role="option"]:focus,
body.mg-fire-tv-mode [role="tab"]:focus,
body.mg-fire-tv-mode [tabindex]:focus,
body.mg-fire-tv-mode button:focus-visible,
body.mg-fire-tv-mode a:focus-visible,
body.mg-fire-tv-mode input:focus-visible,
body.mg-fire-tv-mode select:focus-visible,
body.mg-fire-tv-mode textarea:focus-visible,
body.mg-fire-tv-mode [role="button"]:focus-visible,
body.mg-fire-tv-mode [role="menuitem"]:focus-visible,
body.mg-fire-tv-mode [role="option"]:focus-visible,
body.mg-fire-tv-mode [role="tab"]:focus-visible,
body.mg-fire-tv-mode [tabindex]:focus-visible {
  outline: 4px solid hsl(var(--mg-green)) !important;
  outline-offset: 4px !important;
  box-shadow:
    0 0 0 2px rgba(0, 0, 0, 0.95),
    0 0 0 8px rgba(0, 255, 0, 0.20) !important;
}

body.mg-fire-tv-mode button:focus,
body.mg-fire-tv-mode a:focus,
body.mg-fire-tv-mode input:focus,
body.mg-fire-tv-mode select:focus,
body.mg-fire-tv-mode [role="button"]:focus,
body.mg-fire-tv-mode [role="menuitem"]:focus,
body.mg-fire-tv-mode [role="option"]:focus,
body.mg-fire-tv-mode [role="tab"]:focus {
  position: relative;
  z-index: 90;
}

body.mg-fire-tv-mode button,
body.mg-fire-tv-mode a,
body.mg-fire-tv-mode input,
body.mg-fire-tv-mode select,
body.mg-fire-tv-mode textarea,
body.mg-fire-tv-mode [role="button"],
body.mg-fire-tv-mode [role="menuitem"],
body.mg-fire-tv-mode [role="option"],
body.mg-fire-tv-mode [role="tab"],
body.mg-fire-tv-mode [tabindex] {
  scroll-margin: 14vh 8vw;
}

/* One clean focus target per poster card. */
body.mg-fire-tv-mode .mg-hover-action {
  opacity: 0 !important;
  pointer-events: none !important;
}

body.mg-fire-tv-mode
.group
> .relative
> .mg-hover-action:first-of-type {
  opacity: 1 !important;
  pointer-events: auto !important;
  background: transparent !important;
}

body.mg-fire-tv-mode
.group
> .relative
> .mg-hover-action:first-of-type
> span {
  opacity: 0 !important;
}

body.mg-fire-tv-mode
.group
> .relative
> .mg-hover-action:first-of-type:focus,
body.mg-fire-tv-mode
.group
> .relative
> .mg-hover-action:first-of-type:focus-visible {
  background: rgba(0, 0, 0, 0.28) !important;
}

body.mg-fire-tv-mode
.group
> .relative
> .mg-hover-action:first-of-type:focus
> span,
body.mg-fire-tv-mode
.group
> .relative
> .mg-hover-action:first-of-type:focus-visible
> span {
  opacity: 1 !important;
}

body.mg-fire-tv-mode article.group:focus-within > .relative,
body.mg-fire-tv-mode .group.shrink-0:focus-within > .relative {
  border-color: hsl(var(--mg-green)) !important;
}

body.mg-fire-tv-mode select,
body.mg-fire-tv-mode input[type="range"] {
  min-height: 42px;
}
`;

const keyCode = (event) =>
  Number(
    event?.keyCode ||
      event?.which ||
      0
  );

const keyName = (event) =>
  String(
    event?.key ||
      event?.code ||
      ""
  );

const directionFromEvent = (event) => {
  const key = keyName(event);
  const code = keyCode(event);

  if (
    key === "ArrowUp" ||
    code === 19 ||
    code === 38
  ) {
    return "up";
  }

  if (
    key === "ArrowDown" ||
    code === 20 ||
    code === 40
  ) {
    return "down";
  }

  if (
    key === "ArrowLeft" ||
    code === 21 ||
    code === 37
  ) {
    return "left";
  }

  if (
    key === "ArrowRight" ||
    code === 22 ||
    code === 39
  ) {
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

const isBackKey = (event) => {
  const key = keyName(event);
  const code = keyCode(event);

  const tag = String(
    event?.target?.tagName ||
      ""
  ).toLowerCase();

  const editing =
    tag === "input" ||
    tag === "textarea" ||
    event?.target?.isContentEditable;

  if (
    key === "BrowserBack" ||
    key === "GoBack" ||
    key === "Escape" ||
    code === 4 ||
    code === 166 ||
    code === 461
  ) {
    return true;
  }

  return (
    (
      key === "Backspace" ||
      code === 8
    ) &&
    !editing
  );
};

const isMenuKey = (event) => {
  const key = keyName(event);
  const code = keyCode(event);

  return (
    key === "ContextMenu" ||
    key === "Menu" ||
    code === 82
  );
};

const mediaActionFromEvent = (event) => {
  const key = keyName(event);
  const code = keyCode(event);

  if (
    key === "MediaPlayPause" ||
    code === 85 ||
    code === 179
  ) {
    return "playpause";
  }

  if (
    key === "MediaPlay" ||
    code === 126
  ) {
    return "play";
  }

  if (
    key === "MediaPause" ||
    code === 127
  ) {
    return "pause";
  }

  if (
    key === "MediaRewind" ||
    code === 89 ||
    code === 227
  ) {
    return "rewind";
  }

  if (
    key === "MediaFastForward" ||
    code === 90 ||
    code === 228
  ) {
    return "fastforward";
  }

  if (
    key === "MediaTrackNext" ||
    code === 87 ||
    code === 176
  ) {
    return "next";
  }

  if (
    key === "MediaTrackPrevious" ||
    code === 88 ||
    code === 177
  ) {
    return "previous";
  }

  return null;
};

const isActualFireTv = () => {
  if (
    typeof navigator === "undefined"
  ) {
    return false;
  }

  return FIRE_TV_RE.test(
    String(
      navigator.userAgent ||
        ""
    )
  );
};

const readRemoteSettings = () => {
  const defaults = {
    enabled: true,
    focusRing: true,
    autoFocus: true,
  };

  try {
    const raw =
      window.localStorage.getItem(
        TV_REMOTE_STORAGE_KEY
      );

    if (!raw) {
      return defaults;
    }

    const parsed =
      JSON.parse(raw);

    return {
      ...defaults,
      ...(parsed &&
      typeof parsed === "object"
        ? parsed
        : {}),
    };
  } catch {
    return defaults;
  }
};

const dispatchRemoteStatus = (detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent(
        "mg:remote-status",
        {
          detail,
        }
      )
    );
  } catch {
    // Optional status event.
  }
};

/*
 * Fire TV / Android WebView frequently reports a 960px or 1280px CSS
 * viewport even when the television is 1920x1080 or 3840x2160.
 *
 * That makes Tailwind believe it is laying out a tablet and is the real
 * reason the UI can look squeezed. Changing sidebar widths afterwards
 * cannot fix the responsive breakpoints.
 *
 * On Fire TV only, give the WebView a 1920px layout viewport and choose
 * an initial scale that still fits the actual visible width.
 */
const installFireTvViewport = () => {
  if (
    typeof document ===
    "undefined"
  ) {
    return () => {};
  }

  let meta =
    document.querySelector(
      'meta[name="viewport"]'
    );

  const created =
    !meta;

  if (!meta) {
    meta =
      document.createElement(
        "meta"
      );

    meta.setAttribute(
      "name",
      "viewport"
    );

    document.head.appendChild(
      meta
    );
  }

  const originalContent =
    meta.getAttribute(
      "content"
    );

  const apply = () => {
    const visibleWidth =
      Math.max(
        1,
        Number(
          window.innerWidth ||
            0
        ),
        Number(
          document
            .documentElement
            .clientWidth ||
            0
        )
      );

    /*
     * If the WebView already exposes a proper desktop/TV viewport, do not
     * zoom it further. Otherwise calculate the fit scale for 1920px.
     */
    const fitScale =
      visibleWidth >= 1600
        ? 1
        : Math.max(
            0.35,
            Math.min(
              1,
              visibleWidth /
                TV_LAYOUT_WIDTH
            )
          );

    meta.setAttribute(
      "content",
      [
        `width=${TV_LAYOUT_WIDTH}`,
        `initial-scale=${fitScale.toFixed(
          4
        )}`,
        `minimum-scale=${fitScale.toFixed(
          4
        )}`,
        `maximum-scale=${fitScale.toFixed(
          4
        )}`,
        "user-scalable=no",
        "viewport-fit=cover",
      ].join(", ")
    );

    document.documentElement.style.setProperty(
      "--mg-tv-design-width",
      `${TV_LAYOUT_WIDTH}px`
    );

    document.documentElement.style.setProperty(
      "--mg-tv-fit-scale",
      String(
        fitScale
      )
    );
  };

  apply();

  /*
   * Android WebView can apply the new viewport asynchronously. A second
   * write after the first reflow makes it reliable without reloading.
   */
  const settleTimer =
    window.setTimeout(
      apply,
      180
    );

  return () => {
    window.clearTimeout(
      settleTimer
    );

    document.documentElement.style.removeProperty(
      "--mg-tv-design-width"
    );

    document.documentElement.style.removeProperty(
      "--mg-tv-fit-scale"
    );

    if (created) {
      meta.remove();
    } else if (
      originalContent == null
    ) {
      meta.removeAttribute(
        "content"
      );
    } else {
      meta.setAttribute(
        "content",
        originalContent
      );
    }
  };
};

const visible = (
  element,
  stopAt = null
) => {
  if (
    !(
      element instanceof
      HTMLElement
    )
  ) {
    return false;
  }

  if (
    element.hasAttribute(
      "disabled"
    ) ||
    element.getAttribute(
      "aria-disabled"
    ) === "true" ||
    element.getAttribute(
      "aria-hidden"
    ) === "true"
  ) {
    return false;
  }

  const rect =
    element.getBoundingClientRect();

  if (
    rect.width < 2 ||
    rect.height < 2
  ) {
    return false;
  }

  let node =
    element;

  while (
    node &&
    node instanceof
      HTMLElement
  ) {
    if (
      node.hidden ||
      node.hasAttribute(
        "inert"
      ) ||
      node.getAttribute(
        "aria-hidden"
      ) === "true"
    ) {
      return false;
    }

    const style =
      window.getComputedStyle(
        node
      );

    if (
      style.display ===
        "none" ||
      style.visibility ===
        "hidden" ||
      Number(
        style.opacity ||
          1
      ) < 0.03 ||
      style.pointerEvents ===
        "none"
    ) {
      return false;
    }

    if (
      node === stopAt ||
      node ===
        document.body
    ) {
      break;
    }

    node =
      node.parentElement;
  }

  return true;
};

const topByStacking = (
  elements
) => {
  if (!elements.length) {
    return null;
  }

  const sorted =
    elements
      .map(
        (
          element,
          index
        ) => {
          const z =
            Number(
              window.getComputedStyle(
                element
              ).zIndex
            );

          return {
            element,
            index,
            z:
              Number.isFinite(
                z
              )
                ? z
                : 0,
          };
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          a.z ===
          b.z
            ? a.index -
              b.index
            : a.z -
              b.z
      );

  return sorted[
    sorted.length -
      1
  ]?.element || null;
};

const seasonPickerScope =
  () => {
    const close =
      Array.from(
        document.querySelectorAll(
          'button[aria-label="Close season and episode picker"]'
        )
      ).find(
        (item) =>
          visible(item)
      );

    return (
      close?.closest(
        ".absolute.inset-0"
      ) || null
    );
  };

const popupScope =
  () => {
    const candidates =
      Array.from(
        document.querySelectorAll(
          [
            '[role="menu"]',
            '[role="listbox"]',
            '[data-radix-menu-content]',
            '[data-radix-select-content]',
            '[data-state="open"][role="menu"]',
            '[data-state="open"][role="listbox"]',
          ].join(",")
        )
      ).filter(
        (item) =>
          visible(item)
      );

    return topByStacking(
      candidates
    );
  };

const modalScope =
  () => {
    const picker =
      seasonPickerScope();

    if (
      picker &&
      visible(picker)
    ) {
      return picker;
    }

    const overlays =
      Array.from(
        document.querySelectorAll(
          '[role="dialog"], [aria-modal="true"], .fixed.inset-0'
        )
      ).filter(
        (item) =>
          visible(item)
      );

    return topByStacking(
      overlays
    );
  };

const navigationScope =
  () =>
    modalScope() ||
    popupScope() ||
    document.body;

const focusables = (
  scope
) =>
  Array.from(
    scope.querySelectorAll(
      FOCUSABLE
    )
  ).filter(
    (item) =>
      visible(
        item,
        scope
      )
  );

const centre = (
  rect
) => ({
  x:
    rect.left +
    rect.width / 2,

  y:
    rect.top +
    rect.height / 2,
});

const overlap = (
  a1,
  a2,
  b1,
  b2
) =>
  Math.max(
    0,
    Math.min(
      a2,
      b2
    ) -
      Math.max(
        a1,
        b1
      )
  );

const cardRoot = (
  element
) =>
  element instanceof
  HTMLElement
    ? element.closest(
        "article.group, .group.shrink-0, [data-media-card]"
      )
    : null;

const rowRoot = (
  element
) =>
  element instanceof
  HTMLElement
    ? element.closest(
        '.overflow-x-auto, [data-tv-row], [role="row"]'
      )
    : null;

const menuRoot = (
  element
) =>
  element instanceof
  HTMLElement
    ? element.closest(
        [
          "aside nav",
          '[role="menu"]',
          '[role="listbox"]',
          '[role="tablist"]',
          "[data-tv-nav]",
          ".mg-tv-menu",
        ].join(",")
      )
    : null;

const scoreDirection = (
  fromRect,
  toRect,
  direction
) => {
  const from =
    centre(fromRect);

  const to =
    centre(toRect);

  const dx =
    to.x -
    from.x;

  const dy =
    to.y -
    from.y;

  if (
    direction ===
      "right" &&
    dx <= 4
  ) {
    return Infinity;
  }

  if (
    direction ===
      "left" &&
    dx >= -4
  ) {
    return Infinity;
  }

  if (
    direction ===
      "down" &&
    dy <= 4
  ) {
    return Infinity;
  }

  if (
    direction ===
      "up" &&
    dy >= -4
  ) {
    return Infinity;
  }

  const horizontal =
    direction ===
      "left" ||
    direction ===
      "right";

  const main =
    horizontal
      ? Math.abs(dx)
      : Math.abs(dy);

  const cross =
    horizontal
      ? Math.abs(dy)
      : Math.abs(dx);

  const crossOverlap =
    horizontal
      ? overlap(
          fromRect.top,
          fromRect.bottom,
          toRect.top,
          toRect.bottom
        )
      : overlap(
          fromRect.left,
          fromRect.right,
          toRect.left,
          toRect.right
        );

  return (
    main +
    cross *
      (
        crossOverlap >
        0
          ? 0.3
          : 2.4
      ) +
    Math.hypot(
      dx,
      dy
    ) *
      0.08
  );
};

const focusElement = (
  element
) => {
  if (
    !(
      element instanceof
      HTMLElement
    )
  ) {
    return false;
  }

  try {
    element.focus({
      preventScroll:
        true,
    });
  } catch {
    element.focus();
  }

  try {
    element.scrollIntoView({
      block:
        "center",

      inline:
        "center",

      behavior:
        "smooth",
    });
  } catch {
    element.scrollIntoView();
  }

  return true;
};

const defaultFocus = (
  scope
) => {
  const items =
    focusables(scope);

  if (!items.length) {
    return null;
  }

  const selectors = [
    '[role="option"][aria-selected="true"]',
    '[role="tab"][aria-selected="true"]',
    '[role="menuitem"]',
    'button[aria-label="Play"]',
    'button[aria-label="Pause"]',
    'aside nav button[title="Home"]',
    "aside nav button",
    'aside button[title="Search"]',
  ];

  for (
    const selector of
    selectors
  ) {
    const found =
      items.find(
        (item) =>
          item.matches(
            selector
          )
      );

    if (found) {
      return found;
    }
  }

  return items[0];
};

const moveInsideMenu = (
  current,
  direction
) => {
  const root =
    menuRoot(current);

  if (!root) {
    return false;
  }

  const items =
    focusables(root);

  if (
    items.length <
    2
  ) {
    return false;
  }

  const currentIndex =
    items.indexOf(
      current
    );

  if (
    currentIndex <
    0
  ) {
    return false;
  }

  const isSidebar =
    Boolean(
      root.closest(
        "aside"
      )
    );

  const role =
    String(
      root.getAttribute(
        "role"
      ) || ""
    ).toLowerCase();

  const isTabs =
    role ===
    "tablist";

  const rects =
    items.map(
      (item) =>
        item.getBoundingClientRect()
    );

  const centres =
    rects.map(
      centre
    );

  const xValues =
    centres.map(
      (point) =>
        point.x
    );

  const yValues =
    centres.map(
      (point) =>
        point.y
    );

  const xSpread =
    Math.max(
      ...xValues
    ) -
    Math.min(
      ...xValues
    );

  const ySpread =
    Math.max(
      ...yValues
    ) -
    Math.min(
      ...yValues
    );

  const vertical =
    isSidebar ||
    (
      !isTabs &&
      ySpread >=
        xSpread
    );

  const horizontal =
    isTabs ||
    !vertical;

  let step =
    0;

  if (
    vertical &&
    direction ===
      "up"
  ) {
    step =
      -1;
  }

  if (
    vertical &&
    direction ===
      "down"
  ) {
    step =
      1;
  }

  if (
    horizontal &&
    direction ===
      "left"
  ) {
    step =
      -1;
  }

  if (
    horizontal &&
    direction ===
      "right"
  ) {
    step =
      1;
  }

  if (!step) {
    return false;
  }

  const nextIndex =
    currentIndex +
    step;

  if (
    nextIndex <
      0 ||
    nextIndex >=
      items.length
  ) {
    return false;
  }

  return focusElement(
    items[
      nextIndex
    ]
  );
};

const moveFocus = (
  direction
) => {
  const scope =
    navigationScope();

  const current =
    document.activeElement;

  const items =
    focusables(scope);

  if (!items.length) {
    return false;
  }

  if (
    !(
      current instanceof
      HTMLElement
    ) ||
    !scope.contains(
      current
    ) ||
    !items.includes(
      current
    )
  ) {
    return focusElement(
      defaultFocus(
        scope
      )
    );
  }

  if (
    moveInsideMenu(
      current,
      direction
    )
  ) {
    return true;
  }

  const fromRect =
    current.getBoundingClientRect();

  const currentCard =
    cardRoot(current);

  const currentRow =
    rowRoot(current);

  let candidates =
    items.filter(
      (item) =>
        item !==
        current
    );

  if (
    currentCard &&
    currentRow &&
    (
      direction ===
        "left" ||
      direction ===
        "right"
    )
  ) {
    const cardCandidates =
      candidates.filter(
        (item) => {
          const card =
            cardRoot(
              item
            );

          return (
            card &&
            card !==
              currentCard &&
            rowRoot(
              item
            ) ===
              currentRow
          );
        }
      );

    if (
      cardCandidates.length
    ) {
      const byCard =
        new Map();

      for (
        const item of
        cardCandidates
      ) {
        const card =
          cardRoot(
            item
          );

        if (
          !byCard.has(
            card
          )
        ) {
          const preferred =
            Array.from(
              card.querySelectorAll(
                FOCUSABLE
              )
            ).find(
              (
                candidate
              ) => {
                const label =
                  String(
                    candidate.getAttribute(
                      "aria-label"
                    ) || ""
                  ).toLowerCase();

                return (
                  visible(
                    candidate,
                    card
                  ) &&
                  (
                    label.startsWith(
                      "play "
                    ) ||
                    label.startsWith(
                      "choose episode"
                    )
                  )
                );
              }
            );

          byCard.set(
            card,
            preferred ||
              item
          );
        }
      }

      candidates =
        Array.from(
          byCard.values()
        );
    }
  }

  let best =
    null;

  let bestScore =
    Infinity;

  for (
    const candidate of
    candidates
  ) {
    const score =
      scoreDirection(
        fromRect,
        candidate.getBoundingClientRect(),
        direction
      );

    if (
      score <
      bestScore
    ) {
      best =
        candidate;

      bestScore =
        score;
    }
  }

  return (
    best &&
    Number.isFinite(
      bestScore
    )
  )
    ? focusElement(
        best
      )
    : false;
};

const adjustSelect = (
  select,
  direction
) => {
  if (
    !(
      select instanceof
      HTMLSelectElement
    )
  ) {
    return false;
  }

  const step =
    direction ===
      "down"
      ? 1
      : -1;

  let next =
    Math.max(
      0,
      select.selectedIndex
    ) +
    step;

  while (
    next >= 0 &&
    next <
      select.options.length
  ) {
    const option =
      select.options[
        next
      ];

    if (
      !option.disabled &&
      !option.hidden
    ) {
      select.selectedIndex =
        next;

      select.dispatchEvent(
        new Event(
          "input",
          {
            bubbles:
              true,
          }
        )
      );

      select.dispatchEvent(
        new Event(
          "change",
          {
            bubbles:
              true,
          }
        )
      );

      return true;
    }

    next +=
      step;
  }

  return false;
};

const showPlayerControls =
  () => {
    const scope =
      navigationScope();

    const controls =
      Array.from(
        scope.querySelectorAll(
          "div.absolute.inset-0"
        )
      ).find(
        (
          element
        ) =>
          element.querySelector(
            'button[aria-label="Play"], button[aria-label="Pause"]'
          )
      );

    if (!controls) {
      return false;
    }

    controls.dispatchEvent(
      new MouseEvent(
        "mousemove",
        {
          bubbles:
            true,

          cancelable:
            false,

          view:
            window,
        }
      )
    );

    return true;
  };

const focusPlayerControl =
  () => {
    showPlayerControls();

    window.setTimeout(
      () => {
        const scope =
          navigationScope();

        const items =
          focusables(
            scope
          );

        const target =
          items.find(
            (item) =>
              [
                "Play",
                "Pause",
              ].includes(
                item.getAttribute(
                  "aria-label"
                )
              )
          ) ||
          defaultFocus(
            scope
          );

        focusElement(
          target
        );
      },
      40
    );
  };

const activeVideo =
  () => {
    const scope =
      navigationScope();

    const videos =
      Array.from(
        scope.querySelectorAll(
          "video"
        )
      ).filter(
        (video) =>
          visible(
            video,
            scope
          )
      );

    return videos.length
      ? videos[
          videos.length -
            1
        ]
      : null;
  };

const remoteBackButton =
  (scope) => {
    const selectors = [
      'button[aria-label="Exit fullscreen"]',
      'button[aria-label="Close season and episode picker"]',
      'button[aria-label^="Close "]',
      'button[aria-label="Close"]',
      'button[title="Close"]',
    ];

    for (
      const selector of
      selectors
    ) {
      const found =
        Array.from(
          scope.querySelectorAll(
            selector
          )
        ).find(
          (item) =>
            visible(
              item,
              scope
            )
        );

      if (found) {
        return found;
      }
    }

    return null;
  };

const syntheticEscape =
  () => {
    const target =
      document.activeElement instanceof
      HTMLElement
        ? document.activeElement
        : document.body;

    const event =
      new KeyboardEvent(
        "keydown",
        {
          key:
            "Escape",

          code:
            "Escape",

          bubbles:
            true,

          cancelable:
            true,
        }
      );

    try {
      Object.defineProperty(
        event,
        "__mgRemoteSynthetic",
        {
          value:
            true,
        }
      );
    } catch {
      // No-op.
    }

    target.dispatchEvent(
      event
    );
  };

const activateRemoteMode =
  ({
    tvLayout =
      false,
  } = {}) => {
    document.documentElement.classList.add(
      "mg-fire-tv-mode"
    );

    document.body.classList.add(
      "mg-fire-tv-mode"
    );

    if (tvLayout) {
      document.documentElement.classList.add(
        "mg-tv-layout"
      );

      document.body.classList.add(
        "mg-tv-layout"
      );
    }
  };

export default function FireTvRemote({
  onBack,
}) {
  const activeRef =
    useRef(
      false
    );

  const timerRef =
    useRef(
      null
    );

  useEffect(() => {
    const fireTv =
      isActualFireTv();

    let settings =
      readRemoteSettings();

    const removeTvViewport =
      fireTv
        ? installFireTvViewport()
        : () => {};

    const report =
      () => {
        dispatchRemoteStatus(
          {
            active:
              activeRef.current,

            fireTv,

            enabled:
              settings.enabled !==
              false,
          }
        );
      };

    const activate =
      () => {
        if (
          settings.enabled ===
          false
        ) {
          return false;
        }

        activeRef.current =
          true;

        activateRemoteMode(
          {
            tvLayout:
              fireTv ||
              document.documentElement.classList.contains(
                "mg-tv-layout"
              ) ||
              document.body.classList.contains(
                "mg-tv-layout"
              ),
          }
        );

        report();

        return true;
      };

    const refocusForNewOverlay =
      () => {
        if (
          !activeRef.current ||
          settings.enabled ===
            false ||
          settings.autoFocus ===
            false
        ) {
          return;
        }

        if (
          timerRef.current
        ) {
          window.clearTimeout(
            timerRef.current
          );
        }

        timerRef.current =
          window.setTimeout(
            () => {
              const scope =
                navigationScope();

              const current =
                document.activeElement;

              if (
                current instanceof
                  HTMLElement &&
                scope.contains(
                  current
                ) &&
                visible(
                  current,
                  scope
                )
              ) {
                return;
              }

              if (
                scope.querySelector(
                  "video"
                )
              ) {
                focusPlayerControl();
              } else {
                focusElement(
                  defaultFocus(
                    scope
                  )
                );
              }
            },
            70
          );
      };

    const onSettingsChanged =
      (event) => {
        settings = {
          ...readRemoteSettings(),

          ...(event?.detail &&
          typeof event.detail ===
            "object"
            ? event.detail
            : {}),
        };

        if (
          settings.enabled ===
          false
        ) {
          activeRef.current =
            false;

          document.documentElement.classList.remove(
            "mg-fire-tv-mode"
          );

          document.body.classList.remove(
            "mg-fire-tv-mode"
          );

          report();

          return;
        }

        if (fireTv) {
          activate();

          refocusForNewOverlay();
        }
      };

    const onKeyDown =
      (event) => {
        if (
          event?.__mgRemoteSynthetic
        ) {
          return;
        }

        const direction =
          directionFromEvent(
            event
          );

        const mediaAction =
          mediaActionFromEvent(
            event
          );

        const select =
          isSelectKey(
            event
          );

        const back =
          isBackKey(
            event
          );

        const menu =
          isMenuKey(
            event
          );

        if (
          !direction &&
          !mediaAction &&
          !select &&
          !back &&
          !menu
        ) {
          return;
        }

        if (!activate()) {
          return;
        }

        const target =
          event.target;

        const tag =
          String(
            target?.tagName ||
              ""
          ).toLowerCase();

        const type =
          String(
            target?.type ||
              ""
          ).toLowerCase();

        if (direction) {
          if (
            (
              (
                tag ===
                  "input" &&
                type !==
                  "range"
              ) ||
              tag ===
                "textarea" ||
              target?.isContentEditable
            ) &&
            (
              direction ===
                "left" ||
              direction ===
                "right"
            )
          ) {
            return;
          }

          if (
            tag ===
              "input" &&
            type ===
              "range" &&
            (
              direction ===
                "left" ||
              direction ===
                "right"
            )
          ) {
            return;
          }

          if (
            tag ===
              "select" &&
            (
              direction ===
                "up" ||
              direction ===
                "down"
            )
          ) {
            event.preventDefault();

            event.stopImmediatePropagation();

            adjustSelect(
              target,
              direction
            );

            return;
          }

          /*
           * Capture D-pad arrows before VideoPlayer or a menu can turn them
           * into seek/volume shortcuts. On Fire TV arrows navigate focus.
           */
          event.preventDefault();

          event.stopImmediatePropagation();

          const scope =
            navigationScope();

          if (
            scope.querySelector(
              "video"
            )
          ) {
            showPlayerControls();
          }

          window.setTimeout(
            () =>
              moveFocus(
                direction
              ),
            scope.querySelector(
              "video"
            )
              ? 20
              : 0
          );

          return;
        }

        if (select) {
          const focused =
            document.activeElement;

          /*
           * Let Android open a native select normally.
           */
          if (
            focused instanceof
            HTMLSelectElement
          ) {
            return;
          }

          event.preventDefault();

          event.stopImmediatePropagation();

          if (
            focused instanceof
              HTMLElement &&
            focused !==
              document.body &&
            visible(
              focused,
              navigationScope()
            )
          ) {
            focused.click();
          } else {
            focusElement(
              defaultFocus(
                navigationScope()
              )
            );
          }

          return;
        }

        if (back) {
          const scope =
            navigationScope();

          if (
            scope !==
            document.body
          ) {
            event.preventDefault();

            event.stopImmediatePropagation();

            const close =
              remoteBackButton(
                scope
              );

            if (close) {
              close.click();
            } else {
              syntheticEscape();
            }

            return;
          }

          if (
            onBack?.() ===
            true
          ) {
            event.preventDefault();

            event.stopImmediatePropagation();
          }

          return;
        }

        if (menu) {
          event.preventDefault();

          event.stopImmediatePropagation();

          const focused =
            document.activeElement;

          const card =
            cardRoot(
              focused
            );

          if (card) {
            const details =
              Array.from(
                card.querySelectorAll(
                  "button"
                )
              ).find(
                (
                  button
                ) =>
                  String(
                    button.textContent ||
                      ""
                  )
                    .trim()
                    .toLowerCase() ===
                  "details"
              );

            if (details) {
              details.click();

              return;
            }
          }

          if (
            navigationScope().querySelector(
              "video"
            )
          ) {
            focusPlayerControl();

            return;
          }

          focusElement(
            document.querySelector(
              'aside button[title="Search"]'
            )
          );

          return;
        }

        if (mediaAction) {
          event.preventDefault();

          event.stopImmediatePropagation();

          const video =
            activeVideo();

          if (
            mediaAction ===
            "next"
          ) {
            window.dispatchEvent(
              new CustomEvent(
                "mg:play-next-episode"
              )
            );

            return;
          }

          if (!video) {
            return;
          }

          if (
            mediaAction ===
            "playpause"
          ) {
            if (
              video.paused
            ) {
              video
                .play()
                .catch(
                  () => {}
                );
            } else {
              video.pause();
            }

            return;
          }

          if (
            mediaAction ===
            "play"
          ) {
            video
              .play()
              .catch(
                () => {}
              );

            return;
          }

          if (
            mediaAction ===
            "pause"
          ) {
            video.pause();

            return;
          }

          if (
            mediaAction ===
            "rewind"
          ) {
            video.currentTime =
              Math.max(
                0,
                (
                  video.currentTime ||
                  0
                ) -
                  10
              );

            showPlayerControls();

            return;
          }

          if (
            mediaAction ===
            "fastforward"
          ) {
            if (
              video.duration
            ) {
              video.currentTime =
                Math.min(
                  video.duration,
                  (
                    video.currentTime ||
                    0
                  ) +
                    10
                );
            }

            showPlayerControls();

            return;
          }

          if (
            mediaAction ===
            "previous"
          ) {
            video.currentTime =
              0;

            showPlayerControls();
          }
        }
      };

    const observer =
      new MutationObserver(
        refocusForNewOverlay
      );

    /*
     * Capture phase is deliberate: FireTvRemote owns the Fire TV D-pad
     * globally, including the player and popup menus.
     */
    window.addEventListener(
      "keydown",
      onKeyDown,
      true
    );

    window.addEventListener(
      "mg:remote-settings-changed",
      onSettingsChanged
    );

    observer.observe(
      document.body,
      {
        childList:
          true,

        subtree:
          true,
      }
    );

    if (
      fireTv &&
      settings.enabled !==
        false
    ) {
      activate();

      if (
        settings.autoFocus !==
        false
      ) {
        window.setTimeout(
          () => {
            const scope =
              navigationScope();

            const current =
              document.activeElement;

            if (
              !(
                current instanceof
                HTMLElement
              ) ||
              current ===
                document.body ||
              !visible(
                current,
                scope
              )
            ) {
              focusElement(
                defaultFocus(
                  scope
                )
              );
            }
          },
          220
        );
      }
    } else {
      report();
    }

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
        true
      );

      window.removeEventListener(
        "mg:remote-settings-changed",
        onSettingsChanged
      );

      observer.disconnect();

      if (
        timerRef.current
      ) {
        window.clearTimeout(
          timerRef.current
        );
      }

      removeTvViewport();

      document.documentElement.classList.remove(
        "mg-fire-tv-mode"
      );

      document.body.classList.remove(
        "mg-fire-tv-mode"
      );

      document.documentElement.classList.remove(
        "mg-tv-layout"
      );

      document.body.classList.remove(
        "mg-tv-layout"
      );
    };
  }, [onBack]);

  return (
    <style>
      {FIRE_TV_CSS}
    </style>
  );
}
