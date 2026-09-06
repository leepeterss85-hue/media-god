import React, { useEffect, useRef } from "react";

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const TV_REMOTE_STORAGE_KEY = "mg:fire-tv-settings-v2";

const DEFAULT_REMOTE_SETTINGS = {
  remoteMode: "auto",
  focusStyle: "strong",
  seekSeconds: 10,
  wrapNavigation: true,
  scrollFallback: true,
  autoFocus: true,
};

const FIRE_TV_CSS = `
html.mg-fire-tv-mode,
body.mg-fire-tv-mode {
  scroll-behavior: smooth;
}

html.mg-tv-layout {
  font-size: 15px !important;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

body.mg-tv-layout {
  width: 100vw;
  min-width: 0;
  max-width: 100vw;
  min-height: 100dvh;
  overflow-x: hidden !important;
}

body.mg-tv-layout #root {
  width: 100vw;
  min-width: 0;
  max-width: 100vw;
  min-height: 100dvh;
  overflow-x: hidden;
}

body.mg-tv-layout main {
  min-width: 0;
  max-width: 100%;
}

body.mg-tv-layout img,
body.mg-tv-layout video,
body.mg-tv-layout iframe {
  max-width: 100%;
}

body.mg-fire-tv-mode button:focus-visible,
body.mg-fire-tv-mode a:focus-visible,
body.mg-fire-tv-mode input:focus-visible,
body.mg-fire-tv-mode select:focus-visible,
body.mg-fire-tv-mode textarea:focus-visible,
body.mg-fire-tv-mode [tabindex]:focus-visible {
  outline: 4px solid hsl(var(--mg-green)) !important;
  outline-offset: 4px !important;
  box-shadow:
    0 0 0 2px rgba(0,0,0,.95),
    0 0 0 8px rgba(0,255,0,.20) !important;
}

body.mg-fire-tv-mode.mg-remote-focus-standard button:focus-visible,
body.mg-fire-tv-mode.mg-remote-focus-standard a:focus-visible,
body.mg-fire-tv-mode.mg-remote-focus-standard input:focus-visible,
body.mg-fire-tv-mode.mg-remote-focus-standard select:focus-visible,
body.mg-fire-tv-mode.mg-remote-focus-standard textarea:focus-visible,
body.mg-fire-tv-mode.mg-remote-focus-standard [tabindex]:focus-visible {
  outline-width: 2px !important;
  outline-offset: 2px !important;
  box-shadow:
    0 0 0 1px rgba(0,0,0,.9),
    0 0 0 5px rgba(0,255,0,.14) !important;
}

body.mg-fire-tv-mode button:focus-visible,
body.mg-fire-tv-mode a:focus-visible,
body.mg-fire-tv-mode select:focus-visible,
body.mg-fire-tv-mode input:focus-visible {
  position: relative;
  z-index: 80;
}

body.mg-fire-tv-mode button,
body.mg-fire-tv-mode a,
body.mg-fire-tv-mode input,
body.mg-fire-tv-mode select,
body.mg-fire-tv-mode textarea,
body.mg-fire-tv-mode [tabindex] {
  scroll-margin: 12vh 8vw;
}

body.mg-fire-tv-mode .mg-hover-action {
  opacity: 0 !important;
  pointer-events: none !important;
}

body.mg-fire-tv-mode .group > .relative > .mg-hover-action:first-of-type {
  opacity: 1 !important;
  pointer-events: auto !important;
  background: transparent !important;
}

body.mg-fire-tv-mode .group > .relative > .mg-hover-action:first-of-type > span {
  opacity: 0 !important;
}

body.mg-fire-tv-mode .group > .relative > .mg-hover-action:first-of-type:focus-visible {
  background: rgba(0,0,0,.28) !important;
}

body.mg-fire-tv-mode .group > .relative > .mg-hover-action:first-of-type:focus-visible > span {
  opacity: 1 !important;
}

body.mg-fire-tv-mode article.group:focus-within > .relative,
body.mg-fire-tv-mode .group.shrink-0:focus-within > .relative {
  border-color: hsl(var(--mg-green)) !important;
}

body.mg-fire-tv-mode select,
body.mg-fire-tv-mode input[type="range"] {
  min-height: 40px;
}
`;

const normaliseRemoteSettings = (value) => {
  const raw =
    value && typeof value === "object"
      ? value
      : {};

  const seekSeconds = Number(
    raw.seekSeconds
  );

  return {
    remoteMode:
      raw.remoteMode === "always"
        ? "always"
        : "auto",

    focusStyle:
      raw.focusStyle === "standard"
        ? "standard"
        : "strong",

    seekSeconds:
      [10, 20, 30].includes(
        seekSeconds
      )
        ? seekSeconds
        : DEFAULT_REMOTE_SETTINGS.seekSeconds,

    wrapNavigation:
      typeof raw.wrapNavigation === "boolean"
        ? raw.wrapNavigation
        : DEFAULT_REMOTE_SETTINGS.wrapNavigation,

    scrollFallback:
      typeof raw.scrollFallback === "boolean"
        ? raw.scrollFallback
        : DEFAULT_REMOTE_SETTINGS.scrollFallback,

    autoFocus:
      typeof raw.autoFocus === "boolean"
        ? raw.autoFocus
        : DEFAULT_REMOTE_SETTINGS.autoFocus,
  };
};

const readRemoteSettings = () => {
  if (
    typeof window ===
    "undefined"
  ) {
    return DEFAULT_REMOTE_SETTINGS;
  }

  try {
    const raw =
      window.localStorage.getItem(
        TV_REMOTE_STORAGE_KEY
      );

    return raw
      ? normaliseRemoteSettings(
          JSON.parse(raw)
        )
      : DEFAULT_REMOTE_SETTINGS;
  } catch {
    return DEFAULT_REMOTE_SETTINGS;
  }
};

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

const directionFromEvent = (
  event
) => {
  const key =
    keyName(event);

  const code =
    keyCode(event);

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

const isSelectKey = (
  event
) => {
  const key =
    keyName(event);

  const code =
    keyCode(event);

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

const isBackKey = (
  event
) => {
  const key =
    keyName(event);

  const code =
    keyCode(event);

  const tag =
    String(
      event?.target?.tagName ||
        ""
    ).toLowerCase();

  const editing =
    tag === "input" ||
    tag === "textarea" ||
    event?.target
      ?.isContentEditable;

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
    (key === "Backspace" ||
      code === 8) &&
    !editing
  );
};

const isMenuKey = (
  event
) => {
  const key =
    keyName(event);

  const code =
    keyCode(event);

  return (
    key === "ContextMenu" ||
    key === "Menu" ||
    code === 82
  );
};

const mediaActionFromEvent = (
  event
) => {
  const key =
    keyName(event);

  const code =
    keyCode(event);

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

const looksLikeFireTv = () => {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return false;
  }

  const ua =
    String(
      navigator.userAgent ||
        ""
    );

  const platform =
    String(
      navigator.platform ||
        ""
    );

  return /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i.test(
    `${ua} ${platform}`
  );
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
    node instanceof HTMLElement
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
        style.opacity || 1
      ) < 0.03 ||
      style.pointerEvents ===
        "none"
    ) {
      return false;
    }

    if (
      node === stopAt ||
      node === document.body
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
          a.z === b.z
            ? a.index -
              b.index
            : a.z - b.z
      );

  return sorted.length
    ? sorted[
        sorted.length - 1
      ].element
    : null;
};

const seasonPickerScope =
  () => {
    const close =
      Array.from(
        document.querySelectorAll(
          'button[aria-label="Close season and episode picker"]'
        )
      ).find(
        (
          item
        ) =>
          visible(item)
      );

    return (
      close?.closest(
        ".absolute.inset-0"
      ) || null
    );
  };

const modalScope = () => {
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
      (
        item
      ) =>
        visible(item)
    );

  return topByStacking(
    overlays
  );
};

const navigationScope =
  () =>
    modalScope() ||
    document.body;

const focusables = (
  scope
) =>
  Array.from(
    scope.querySelectorAll(
      FOCUSABLE
    )
  ).filter(
    (
      item
    ) =>
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
  element instanceof HTMLElement
    ? element.closest(
        "article.group, .group.shrink-0"
      )
    : null;

const rowRoot = (
  element
) =>
  element instanceof HTMLElement
    ? element.closest(
        ".overflow-x-auto"
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
    to.x - from.x;

  const dy =
    to.y - from.y;

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
        crossOverlap > 0
          ? 0.35
          : 2.2
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
      preventScroll: true,
    });
  } catch {
    element.focus();
  }

  try {
    element.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "smooth",
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
    'button[aria-label="Play"]',
    'button[aria-label="Pause"]',
    'input[autofocus]',
    'aside nav button[title="Home"]',
    'aside nav button',
    'aside button[title="Search"]',
  ];

  for (
    const selector of
    selectors
  ) {
    const found =
      items.find(
        (
          item
        ) =>
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

const preferredCardTarget = (
  card
) => {
  if (!card) {
    return null;
  }

  const items =
    Array.from(
      card.querySelectorAll(
        FOCUSABLE
      )
    ).filter(
      (
        item
      ) =>
        visible(
          item,
          card
        )
    );

  const preferred =
    items.find(
      (
        item
      ) => {
        const label =
          String(
            item.getAttribute(
              "aria-label"
            ) || ""
          ).toLowerCase();

        return (
          label.startsWith(
            "play "
          ) ||
          label.startsWith(
            "choose episode"
          )
        );
      }
    );

  return (
    preferred ||
    items[0] ||
    null
  );
};

const rowCardTargets = (
  row
) => {
  if (!row) {
    return [];
  }

  return Array.from(
    row.querySelectorAll(
      "article.group, .group.shrink-0"
    )
  )
    .filter(
      (
        card
      ) =>
        visible(
          card,
          row
        )
    )
    .map(
      (
        card
      ) =>
        preferredCardTarget(
          card
        )
    )
    .filter(Boolean)
    .sort(
      (
        a,
        b
      ) =>
        a.getBoundingClientRect()
          .left -
        b.getBoundingClientRect()
          .left
    );
};

const wrapHorizontalFocus = (
  current,
  direction
) => {
  const row =
    rowRoot(current);

  if (!row) {
    return false;
  }

  const targets =
    rowCardTargets(row);

  if (
    targets.length < 2
  ) {
    return false;
  }

  const target =
    direction === "right"
      ? targets[0]
      : targets[
          targets.length - 1
        ];

  if (
    !target ||
    target === current
  ) {
    return false;
  }

  return focusElement(
    target
  );
};

const moveFocus = (
  direction,
  settings
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

  const fromRect =
    current.getBoundingClientRect();

  const currentCard =
    cardRoot(current);

  const currentRow =
    rowRoot(current);

  let candidates =
    items.filter(
      (
        item
      ) =>
        item !== current
    );

  if (
    currentCard &&
    currentRow &&
    (
      direction === "left" ||
      direction === "right"
    )
  ) {
    const cardCandidates =
      candidates.filter(
        (
          item
        ) => {
          const card =
            cardRoot(item);

          return (
            card &&
            card !==
              currentCard &&
            rowRoot(item) ===
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
          cardRoot(item);

        if (
          !byCard.has(
            card
          )
        ) {
          byCard.set(
            card,
            preferredCardTarget(
              card
            ) ||
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

  if (
    best &&
    Number.isFinite(
      bestScore
    )
  ) {
    return focusElement(
      best
    );
  }

  if (
    settings
      ?.wrapNavigation &&
    (
      direction === "left" ||
      direction === "right"
    )
  ) {
    return wrapHorizontalFocus(
      current,
      direction
    );
  }

  return false;
};

const scrollForDirection = (
  direction
) => {
  const current =
    document.activeElement;

  const row =
    rowRoot(current);

  if (
    row &&
    (
      direction === "left" ||
      direction === "right"
    )
  ) {
    const amount =
      Math.max(
        180,
        Math.floor(
          row.clientWidth *
            0.72
        )
      );

    row.scrollBy({
      left:
        direction === "right"
          ? amount
          : -amount,

      behavior:
        "smooth",
    });

    return true;
  }

  const verticalAmount =
    Math.max(
      240,
      Math.floor(
        window.innerHeight *
          0.66
      )
    );

  const horizontalAmount =
    Math.max(
      240,
      Math.floor(
        window.innerWidth *
          0.66
      )
    );

  if (
    direction === "up" ||
    direction === "down"
  ) {
    window.scrollBy({
      top:
        direction === "down"
          ? verticalAmount
          : -verticalAmount,

      behavior:
        "smooth",
    });

    return true;
  }

  window.scrollBy({
    left:
      direction === "right"
        ? horizontalAmount
        : -horizontalAmount,

    behavior:
      "smooth",
  });

  return true;
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
    direction === "down"
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
      select.options[next];

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
            bubbles: true,
          }
        )
      );

      select.dispatchEvent(
        new Event(
          "change",
          {
            bubbles: true,
          }
        )
      );

      return true;
    }

    next += step;
  }

  return false;
};

const playerControlRoot = (
  scope
) => {
  const candidates =
    Array.from(
      scope.querySelectorAll(
        "div.absolute.inset-0"
      )
    );

  return (
    candidates.find(
      (
        element
      ) =>
        element.querySelector(
          'button[aria-label="Play"], button[aria-label="Pause"]'
        )
    ) ||
    null
  );
};

const showPlayerControls =
  () => {
    const scope =
      navigationScope();

    const controls =
      playerControlRoot(
        scope
      );

    if (!controls) {
      return false;
    }

    controls.dispatchEvent(
      new MouseEvent(
        "mousemove",
        {
          bubbles: true,
          cancelable: false,
          view: window,
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
            (
              item
            ) =>
              item.getAttribute(
                "aria-label"
              ) === "Play" ||
              item.getAttribute(
                "aria-label"
              ) === "Pause"
          ) ||
          items.find(
            (
              item
            ) =>
              String(
                item.getAttribute(
                  "aria-label"
                ) ||
                  ""
              )
                .toLowerCase()
                .includes(
                  "season"
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

const activeMedia = () => {
  const scope =
    navigationScope();

  const videos =
    Array.from(
      scope.querySelectorAll(
        "video"
      )
    ).filter(
      (
        video
      ) =>
        visible(
          video,
          scope
        )
    );

  if (
    videos.length
  ) {
    return videos[
      videos.length - 1
    ];
  }

  const audios =
    Array.from(
      document.querySelectorAll(
        "audio"
      )
    ).filter(
      (
        audio
      ) =>
        Boolean(
          audio.currentSrc ||
            audio.src
        )
    );

  return (
    audios.find(
      (
        audio
      ) =>
        !audio.paused
    ) ||
    audios[
      audios.length - 1
    ] ||
    null
  );
};

const activeVideo = () => {
  const media =
    activeMedia();

  return media instanceof HTMLVideoElement
    ? media
    : null;
};

const remoteBackButton = (
  scope
) => {
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
        (
          item
        ) =>
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

const syntheticEscape = () => {
  const target =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : document.body;

  const event =
    new KeyboardEvent(
      "keydown",
      {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }
    );

  try {
    Object.defineProperty(
      event,
      "__mgRemoteSynthetic",
      {
        value: true,
      }
    );
  } catch {
    // No-op.
  }

  target.dispatchEvent(
    event
  );
};

const isEditingTarget = (
  target
) => {
  const tag =
    String(
      target?.tagName ||
        ""
    ).toLowerCase();

  return (
    tag === "input" ||
    tag === "textarea" ||
    target
      ?.isContentEditable
  );
};

const dispatchRemoteStatus = (
  detail
) => {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      "mg:remote-status",
      {
        detail,
      }
    )
  );
};

const applyRemoteClasses = ({
  active,
  tvLayout,
  focusStyle,
}) => {
  const html =
    document.documentElement;

  const body =
    document.body;

  const standard =
    Boolean(
      active &&
      focusStyle ===
        "standard"
    );

  html.classList.toggle(
    "mg-fire-tv-mode",
    Boolean(active)
  );

  body.classList.toggle(
    "mg-fire-tv-mode",
    Boolean(active)
  );

  html.classList.toggle(
    "mg-tv-layout",
    Boolean(
      active &&
      tvLayout
    )
  );

  body.classList.toggle(
    "mg-tv-layout",
    Boolean(
      active &&
      tvLayout
    )
  );

  html.classList.toggle(
    "mg-remote-focus-standard",
    standard
  );

  body.classList.toggle(
    "mg-remote-focus-standard",
    standard
  );
};

export default function FireTvRemote({
  onBack,
}) {
  const activeRef =
    useRef(false);

  const settingsRef =
    useRef(
      readRemoteSettings()
    );

  const remoteSeenRef =
    useRef(false);

  const timerRef =
    useRef(null);

  const directionRepeatRef =
    useRef({
      direction: null,
      at: 0,
    });

  useEffect(() => {
    const fireTv =
      looksLikeFireTv();

    const guardActiveRef = {
      current: false,
    };

    const historyGuardEnabledRef = {
      current: false,
    };

    const ensureHistoryGuard =
      () => {
        if (
          guardActiveRef.current ||
          typeof window ===
            "undefined"
        ) {
          return;
        }

        guardActiveRef.current =
          true;

        try {
          const current =
            window.history.state ||
            {};

          window.history.replaceState(
            {
              ...current,
              mgFireTvBase:
                true,
            },
            "",
            window.location.href
          );

          window.history.pushState(
            {
              mgFireTvGuard:
                true,
            },
            "",
            window.location.href
          );
        } catch {
          // Key interception still protects Back.
        }
      };

    const requestDefaultFocus =
      (
        delay = 80
      ) => {
        if (
          !settingsRef.current
            .autoFocus
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
              if (
                !activeRef.current
              ) {
                return;
              }

              const scope =
                navigationScope();

              const current =
                document.activeElement;

              if (
                current instanceof HTMLElement &&
                current !==
                  document.body &&
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
            delay
          );
      };

    const publishStatus =
      () => {
        dispatchRemoteStatus({
          active:
            activeRef.current,

          fireTv,

          settings:
            settingsRef.current,
        });
      };

    const syncMode = ({
      focus = false,
    } = {}) => {
      const settings =
        settingsRef.current;

      const shouldBeActive =
        fireTv ||
        settings.remoteMode ===
          "always" ||
        remoteSeenRef.current;

      const tvLayout =
        fireTv ||
        settings.remoteMode ===
          "always";

      activeRef.current =
        shouldBeActive;

      historyGuardEnabledRef.current =
        fireTv ||
        settings.remoteMode ===
          "always";

      applyRemoteClasses({
        active:
          shouldBeActive,

        tvLayout,

        focusStyle:
          settings.focusStyle,
      });

      if (
        shouldBeActive &&
        historyGuardEnabledRef.current
      ) {
        ensureHistoryGuard();
      }

      publishStatus();

      if (
        shouldBeActive &&
        focus
      ) {
        requestDefaultFocus(
          60
        );
      }
    };

    const activateFromRemote =
      () => {
        remoteSeenRef.current =
          true;

        syncMode();
      };

    syncMode({
      focus:
        fireTv ||
        settingsRef.current
          .remoteMode ===
          "always",
    });

    const refocusForNewOverlay =
      () => {
        if (
          !activeRef.current ||
          !settingsRef.current
            .autoFocus
        ) {
          return;
        }

        requestDefaultFocus(
          70
        );
      };

    const handleRemoteBack =
      () => {
        const scope =
          navigationScope();

        if (
          scope !==
          document.body
        ) {
          const close =
            remoteBackButton(
              scope
            );

          if (close) {
            close.click();
          } else {
            syntheticEscape();
          }

          return true;
        }

        return (
          onBack?.() !==
          false
        );
      };

    const onPopState =
      () => {
        if (
          !guardActiveRef.current ||
          !historyGuardEnabledRef.current
        ) {
          return;
        }

        handleRemoteBack();

        try {
          window.history.pushState(
            {
              mgFireTvGuard:
                true,
            },
            "",
            window.location.href
          );
        } catch {
          // Ignore history errors.
        }
      };

    const onSettingsChanged =
      (
        event
      ) => {
        settingsRef.current =
          normaliseRemoteSettings(
            event?.detail ||
              readRemoteSettings()
          );

        syncMode({
          focus: true,
        });
      };

    const onStorage =
      (
        event
      ) => {
        if (
          event.key !==
          TV_REMOTE_STORAGE_KEY
        ) {
          return;
        }

        settingsRef.current =
          readRemoteSettings();

        syncMode({
          focus: true,
        });
      };

    const onKeyDown =
      (
        event
      ) => {
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

        activateFromRemote();

        const settings =
          settingsRef.current;

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
            event.repeat
          ) {
            const now =
              Date.now();

            const previous =
              directionRepeatRef.current;

            if (
              previous.direction ===
                direction &&
              now -
                previous.at <
                70
            ) {
              event.preventDefault();
              event.stopImmediatePropagation();

              return;
            }

            directionRepeatRef.current = {
              direction,
              at: now,
            };
          } else {
            directionRepeatRef.current = {
              direction,
              at:
                Date.now(),
            };
          }

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
              target
                ?.isContentEditable
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
            tag === "input" &&
            type === "range" &&
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
            tag === "select" &&
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

          event.preventDefault();
          event.stopImmediatePropagation();

          const scope =
            navigationScope();

          if (
            scope !==
              document.body &&
            scope.querySelector(
              "video"
            )
          ) {
            showPlayerControls();
          }

          window.setTimeout(
            () => {
              const moved =
                moveFocus(
                  direction,
                  settings
                );

              if (
                !moved &&
                settings.scrollFallback
              ) {
                scrollForDirection(
                  direction
                );
              }
            },
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

          if (
            focused instanceof
            HTMLSelectElement
          ) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();

          if (
            focused instanceof HTMLElement &&
            focused !==
              document.body &&
            visible(
              focused,
              navigationScope()
            )
          ) {
            const label =
              String(
                focused.getAttribute(
                  "aria-label"
                ) ||
                  ""
              ).toLowerCase();

            if (
              label === "play" ||
              label === "pause"
            ) {
              const video =
                activeVideo();

              if (
                video?.dataset
                  ?.mgAutoplayMuted ===
                "true"
              ) {
                video.muted =
                  false;

                delete video.dataset
                  .mgAutoplayMuted;
              }
            }

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
          event.preventDefault();
          event.stopImmediatePropagation();

          if (
            isEditingTarget(
              target
            )
          ) {
            try {
              target.blur();
            } catch {
              // Ignore.
            }

            requestDefaultFocus(
              30
            );

            return;
          }

          handleRemoteBack();

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

          const media =
            activeMedia();

          if (!media) {
            return;
          }

          const restoreAutoplayAudio =
            () => {
              if (
                media instanceof
                  HTMLVideoElement &&
                media.dataset
                  ?.mgAutoplayMuted ===
                  "true"
              ) {
                media.muted =
                  false;

                delete media.dataset
                  .mgAutoplayMuted;
              }
            };

          if (
            mediaAction ===
            "playpause"
          ) {
            if (
              media.paused
            ) {
              restoreAutoplayAudio();

              media
                .play()
                .catch(
                  () => {}
                );
            } else {
              media.pause();
            }

            return;
          }

          if (
            mediaAction ===
            "play"
          ) {
            restoreAutoplayAudio();

            media
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
            media.pause();

            return;
          }

          const seekSeconds =
            Number(
              settings.seekSeconds ||
                10
            );

          if (
            mediaAction ===
            "rewind"
          ) {
            if (
              Number.isFinite(
                media.currentTime
              )
            ) {
              media.currentTime =
                Math.max(
                  0,
                  (
                    media.currentTime ||
                    0
                  ) -
                    seekSeconds
                );
            }

            if (
              media instanceof
              HTMLVideoElement
            ) {
              showPlayerControls();
            }

            return;
          }

          if (
            mediaAction ===
            "fastforward"
          ) {
            if (
              Number.isFinite(
                media.duration
              ) &&
              media.duration > 0
            ) {
              media.currentTime =
                Math.min(
                  media.duration,
                  (
                    media.currentTime ||
                    0
                  ) +
                    seekSeconds
                );
            }

            if (
              media instanceof
              HTMLVideoElement
            ) {
              showPlayerControls();
            }

            return;
          }

          if (
            mediaAction ===
            "previous"
          ) {
            if (
              Number.isFinite(
                media.currentTime
              )
            ) {
              media.currentTime =
                0;
            }

            if (
              media instanceof
              HTMLVideoElement
            ) {
              showPlayerControls();
            }
          }
        }
      };

    const observer =
      new MutationObserver(
        refocusForNewOverlay
      );

    window.addEventListener(
      "keydown",
      onKeyDown,
      true
    );

    window.addEventListener(
      "popstate",
      onPopState
    );

    window.addEventListener(
      "mg:remote-settings-changed",
      onSettingsChanged
    );

    window.addEventListener(
      "storage",
      onStorage
    );

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
      }
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
        true
      );

      window.removeEventListener(
        "popstate",
        onPopState
      );

      window.removeEventListener(
        "mg:remote-settings-changed",
        onSettingsChanged
      );

      window.removeEventListener(
        "storage",
        onStorage
      );

      observer.disconnect();

      if (
        timerRef.current
      ) {
        window.clearTimeout(
          timerRef.current
        );
      }

      activeRef.current =
        false;

      applyRemoteClasses({
        active: false,
        tvLayout: false,
        focusStyle:
          "strong",
      });

      publishStatus();
    };
  }, [onBack]);

  return (
    <style>
      {FIRE_TV_CSS}
    </style>
  );
}
