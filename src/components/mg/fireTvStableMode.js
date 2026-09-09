const FIRE_TV_RE = /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const DIRECTION_KEYS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const keyDirection = (event) => {
  const key = String(event?.key || event?.code || "");
  const code = Number(event?.keyCode || event?.which || 0);

  if (DIRECTION_KEYS[key]) {
    return DIRECTION_KEYS[key];
  }

  if (code === 19 || code === 38) return "up";
  if (code === 20 || code === 40) return "down";
  if (code === 21 || code === 37) return "left";
  if (code === 22 || code === 39) return "right";

  return null;
};

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

  let node = element;

  while (node instanceof HTMLElement) {
    if (
      node.hidden ||
      node.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    const style = window.getComputedStyle(node);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity || 1) <= 0.03
    ) {
      return false;
    }

    node = node.parentElement;
  }

  return window.getComputedStyle(element).pointerEvents !== "none";
};

const mediaGodAppReady = () =>
  document.querySelector("#root main") instanceof HTMLElement;

const MAIN_FOCUSABLE = [
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

const firstMainFocusable = () => {
  const main = document.querySelector("#root main");

  if (!(main instanceof HTMLElement)) {
    return null;
  }

  return (
    Array.from(main.querySelectorAll(MAIN_FOCUSABLE)).find(visible) ||
    null
  );
};

const overlayOpen = () =>
  Array.from(
    document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], .fixed.inset-0'
    )
  ).some(visible);

const focusNow = (element) => {
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
    element.scrollIntoView();
  }

  return true;
};

const cardFor = (element) =>
  element instanceof HTMLElement
    ? element.closest(".mg-fire-tv-card, .mg-fire-tv-resume-card")
    : null;

const rowFor = (element) =>
  element instanceof HTMLElement
    ? element.closest('[data-mg-tv-row="true"]')
    : null;

const cardTarget = (card) => {
  if (!(card instanceof HTMLElement)) {
    return null;
  }

  if (card.matches('[role="button"]') && visible(card)) {
    return card;
  }

  return (
    Array.from(
      card.querySelectorAll(
        'button[aria-label^="Play "], button[aria-label^="Resume "], [role="button"]'
      )
    ).find(visible) || null
  );
};

const cardsInRow = (row) =>
  Array.from(
    row?.querySelectorAll?.(
      ".mg-fire-tv-card, .mg-fire-tv-resume-card"
    ) || []
  ).filter(visible);

const rows = () =>
  Array.from(
    document.querySelectorAll('[data-mg-tv-row="true"]')
  )
    .filter(visible)
    .sort(
      (a, b) =>
        a.getBoundingClientRect().top - b.getBoundingClientRect().top
    );

const sidebarButtons = () =>
  Array.from(
    document.querySelectorAll(
      ".mg-fire-tv-nav button:not([disabled])"
    )
  ).filter(visible);

const activeSidebarButton = () => {
  const buttons = sidebarButtons();

  return (
    buttons.find((button) =>
      String(button.className || "").includes("text-mg-green")
    ) ||
    buttons.find((button) => button.getAttribute("title") === "Home") ||
    buttons[0] ||
    null
  );
};

const heroButtons = () =>
  Array.from(
    document.querySelectorAll(
      '.mg-fire-tv-hero button:not([disabled])'
    )
  ).filter(visible);

const heroTarget = () => heroButtons()[0] || null;

const nearestCardByX = (targetRow, x) => {
  const cards = cardsInRow(targetRow);

  if (!cards.length) {
    return null;
  }

  let best = cards[0];
  let distance = Infinity;

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const centre = rect.left + rect.width / 2;
    const nextDistance = Math.abs(centre - x);

    if (nextDistance < distance) {
      best = card;
      distance = nextDistance;
    }
  }

  return cardTarget(best);
};

const firstUsefulCard = () => {
  const allRows = rows();
  const viewportHeight = window.innerHeight || 0;

  const row =
    allRows.find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < viewportHeight;
    }) || allRows[0];

  if (!row) {
    return null;
  }

  return cardTarget(cardsInRow(row)[0]);
};

const liveTvCardFor = (element) =>
  element instanceof HTMLElement
    ? element.closest('[data-mg-live-tv-channel="true"]')
    : null;

const liveTvCards = () =>
  Array.from(
    document.querySelectorAll('[data-mg-live-tv-channel="true"]')
  ).filter(visible);

const liveTvCardTarget = (card) => {
  if (!(card instanceof HTMLElement)) {
    return null;
  }

  return (
    Array.from(card.children).find(
      (item) =>
        item instanceof HTMLElement &&
        String(item.tagName || "").toLowerCase() === "button" &&
        visible(item)
    ) ||
    Array.from(card.querySelectorAll('button:not([disabled])')).find(visible) ||
    null
  );
};

const firstLiveTvTarget = () =>
  liveTvCardTarget(liveTvCards()[0]);

const nearestExternalFocusable = (current, direction) => {
  const main = document.querySelector("#root main");

  if (!(main instanceof HTMLElement) || !(current instanceof HTMLElement)) {
    return null;
  }

  const currentRect = current.getBoundingClientRect();
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;

  let best = null;
  let bestScore = Infinity;

  for (const candidate of Array.from(main.querySelectorAll(MAIN_FOCUSABLE))) {
    if (
      !(candidate instanceof HTMLElement) ||
      candidate === current ||
      !visible(candidate) ||
      liveTvCardFor(candidate)
    ) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const dx = x - currentX;
    const dy = y - currentY;

    if (direction === "up" && dy >= -6) continue;
    if (direction === "down" && dy <= 6) continue;
    if (direction === "left" && dx >= -6) continue;
    if (direction === "right" && dx <= 6) continue;

    const primary =
      direction === "up" || direction === "down"
        ? Math.abs(dy)
        : Math.abs(dx);
    const cross =
      direction === "up" || direction === "down"
        ? Math.abs(dx)
        : Math.abs(dy);
    const score = primary + cross * 2.5;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
};

const moveLiveTvCard = (current, direction) => {
  const card = liveTvCardFor(current);

  if (!(card instanceof HTMLElement)) {
    return false;
  }

  const currentRect = card.getBoundingClientRect();
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;

  let best = null;
  let bestScore = Infinity;

  for (const candidate of liveTvCards()) {
    if (candidate === card) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const dx = x - currentX;
    const dy = y - currentY;

    if (direction === "left" && dx >= -6) continue;
    if (direction === "right" && dx <= 6) continue;
    if (direction === "up" && dy >= -6) continue;
    if (direction === "down" && dy <= 6) continue;

    const verticalOverlap =
      Math.min(currentRect.bottom, rect.bottom) -
        Math.max(currentRect.top, rect.top) >
      Math.min(currentRect.height, rect.height) * 0.35;
    const horizontalOverlap =
      Math.min(currentRect.right, rect.right) -
        Math.max(currentRect.left, rect.left) >
      Math.min(currentRect.width, rect.width) * 0.35;

    const primary =
      direction === "up" || direction === "down"
        ? Math.abs(dy)
        : Math.abs(dx);
    const cross =
      direction === "up" || direction === "down"
        ? Math.abs(dx)
        : Math.abs(dy);
    const aligned =
      direction === "up" || direction === "down"
        ? horizontalOverlap
        : verticalOverlap;
    const score = primary + cross * (aligned ? 0.18 : 3.2);

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (best) {
    return focusNow(liveTvCardTarget(best));
  }

  if (direction === "left") {
    return focusNow(activeSidebarButton());
  }

  if (direction === "up" || direction === "down") {
    return focusNow(nearestExternalFocusable(current, direction)) || true;
  }

  return true;
};

const moveSidebar = (current, direction) => {
  const aside = current?.closest?.(".mg-fire-tv-nav");

  if (!aside) {
    return false;
  }

  const buttons = sidebarButtons();
  const index = buttons.indexOf(current);

  if (direction === "right") {
    return focusNow(
      heroTarget() ||
      firstUsefulCard() ||
      firstLiveTvTarget() ||
      firstMainFocusable()
    );
  }

  if (index < 0) {
    return false;
  }

  if (direction === "up") {
    if (index > 0) {
      return focusNow(buttons[index - 1]);
    }

    return true;
  }

  if (direction === "down") {
    if (index < buttons.length - 1) {
      return focusNow(buttons[index + 1]);
    }

    return true;
  }

  if (direction === "left") {
    return true;
  }

  return false;
};

const moveHero = (current, direction) => {
  const hero = current?.closest?.(".mg-fire-tv-hero");

  if (!hero) {
    return false;
  }

  const buttons = heroButtons();
  const index = buttons.indexOf(current);

  if (index < 0) {
    return false;
  }

  if (direction === "left") {
    if (index > 0) {
      return focusNow(buttons[index - 1]);
    }

    return focusNow(activeSidebarButton());
  }

  if (direction === "right") {
    if (index < buttons.length - 1) {
      return focusNow(buttons[index + 1]);
    }

    return true;
  }

  if (direction === "down") {
    return focusNow(firstUsefulCard());
  }

  if (direction === "up") {
    return true;
  }

  return false;
};

const moveCard = (current, direction) => {
  const card = cardFor(current);
  const row = rowFor(current);

  if (!card || !row) {
    return false;
  }

  const rowCards = cardsInRow(row);
  const cardIndex = rowCards.indexOf(card);

  if (cardIndex < 0) {
    return false;
  }

  if (direction === "left") {
    if (cardIndex === 0) {
      return focusNow(activeSidebarButton());
    }

    return focusNow(cardTarget(rowCards[cardIndex - 1]));
  }

  if (direction === "right") {
    if (cardIndex < rowCards.length - 1) {
      return focusNow(cardTarget(rowCards[cardIndex + 1]));
    }

    return true;
  }

  const allRows = rows();
  const rowIndex = allRows.indexOf(row);
  const rect = card.getBoundingClientRect();
  const x = rect.left + rect.width / 2;

  if (direction === "up") {
    if (rowIndex > 0) {
      return focusNow(nearestCardByX(allRows[rowIndex - 1], x));
    }

    return focusNow(heroTarget() || activeSidebarButton());
  }

  if (direction === "down") {
    if (rowIndex >= 0 && rowIndex < allRows.length - 1) {
      return focusNow(nearestCardByX(allRows[rowIndex + 1], x));
    }

    return true;
  }

  return false;
};

const installViewportGuard = () => {
  let meta = document.querySelector('meta[name="viewport"]');

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "viewport");
    document.head.appendChild(meta);
  }

  /*
   * Fire TV has one logical Android display space: 960 x 540dp. A generic
   * mobile WebView wrapper can otherwise report its raw desktop-like surface
   * and trigger 3xl/4xl web breakpoints. Pinning the TV viewport to Amazon's
   * logical coordinates makes the catalogue deterministic at 1080p, 720p and
   * 480p output while the platform handles physical-pixel scaling.
   */
  const desired =
    "width=960, height=540, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";

  const restore = () => {
    if (meta.getAttribute("content") !== desired) {
      meta.setAttribute("content", desired);
    }

    document.documentElement.style.removeProperty("--mg-tv-design-width");
    document.documentElement.style.removeProperty("--mg-tv-fit-scale");
  };

  restore();

  const observer = new MutationObserver(restore);
  observer.observe(meta, {
    attributes: true,
    attributeFilter: ["content"],
  });

  window.setTimeout(restore, 80);
  window.setTimeout(restore, 220);
  window.setTimeout(restore, 500);
  window.setTimeout(restore, 1000);
};

export const installFireTvStableMode = () => {
  if (
    !isFireTv() ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return;
  }

  if (window.__MG_FIRE_TV_STABLE_MODE__) {
    return;
  }

  window.__MG_FIRE_TV_STABLE_MODE__ = true;

  document.documentElement.classList.add("mg-fire-tv");
  document.body?.classList.add("mg-fire-tv");
  document.documentElement.classList.add("mg-fire-tv-stable");
  document.body?.classList.add("mg-fire-tv-stable");

  installViewportGuard();

  let lastMoveAt = 0;

  window.addEventListener(
    "keydown",
    (event) => {
      const direction = keyDirection(event);

      if (!direction) {
        return;
      }

      /*
       * Never take over the Base44 login/auth page. The custom TV navigator
       * only becomes active after the real Media God sidebar is mounted.
       */
      if (!mediaGodAppReady()) {
        return;
      }

      /* Player, details, episode picker and popup navigation stay with the
       * existing FireTvRemote component, which understands those overlays. */
      if (overlayOpen()) {
        return;
      }

      const target = event.target;
      const tag = String(target?.tagName || "").toLowerCase();
      const type = String(target?.type || "").toLowerCase();

      /* Keep left/right native inside editable controls and sliders. */
      if (
        (tag === "input" && type !== "range") ||
        tag === "textarea" ||
        target?.isContentEditable
      ) {
        if (direction === "left" || direction === "right") {
          return;
        }
      }

      if (tag === "select" || (tag === "input" && type === "range")) {
        return;
      }

      const current = document.activeElement;

      const controlled =
        current instanceof HTMLElement &&
        (current.closest(".mg-fire-tv-nav") ||
          current.closest(".mg-fire-tv-hero") ||
          liveTvCardFor(current) ||
          cardFor(current));

      /*
       * On Settings/Addons/Downloads/etc. let the original remote navigator
       * handle focus. The stable controller only owns the TV surfaces where
       * deterministic row movement is useful.
       */
      if (!controlled) {
        if (
          !(current instanceof HTMLElement) ||
          current === document.body
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          focusNow(activeSidebarButton() || heroTarget() || firstUsefulCard());
        }

        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const now = Date.now();

      /* Allow holding the D-pad to repeat, but throttle it enough that one
       * tap cannot skip multiple cards. */
      if (now - lastMoveAt < 115) {
        return;
      }

      lastMoveAt = now;

      if (moveSidebar(current, direction)) {
        return;
      }

      if (moveHero(current, direction)) {
        return;
      }

      if (moveLiveTvCard(current, direction)) {
        return;
      }

      moveCard(current, direction);
    },
    true
  );
};
