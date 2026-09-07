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

  return FIRE_TV_RE.test(String(navigator.userAgent || ""));
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
    Number(style.opacity || 1) > 0.03 &&
    style.pointerEvents !== "none"
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
      inline: "center",
      behavior: "auto",
    });
  } catch {
    element.scrollIntoView();
  }

  return true;
};

const cardFor = (element) =>
  element instanceof HTMLElement
    ? element.closest(".mg-fire-tv-card")
    : null;

const rowFor = (element) =>
  element instanceof HTMLElement
    ? element.closest('[data-mg-tv-row="true"]')
    : null;

const cardTarget = (card) => {
  if (!(card instanceof HTMLElement)) {
    return null;
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
  Array.from(row?.querySelectorAll?.(".mg-fire-tv-card") || []).filter(visible);

const rows = () =>
  Array.from(
    document.querySelectorAll('[data-mg-tv-row="true"]')
  )
    .filter(visible)
    .sort(
      (a, b) =>
        a.getBoundingClientRect().top - b.getBoundingClientRect().top
    );

const activeSidebarButton = () => {
  const buttons = Array.from(
    document.querySelectorAll("aside button")
  ).filter(visible);

  return (
    buttons.find((button) =>
      String(button.className || "").includes("text-mg-green")
    ) ||
    buttons.find((button) => button.getAttribute("title") === "Home") ||
    buttons[0] ||
    null
  );
};

const nearestCardIndexByX = (targetRow, x) => {
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
  const viewportHeight = window.innerHeight || 0;
  const allRows = rows();

  const row =
    allRows.find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < viewportHeight;
    }) || allRows[0];

  const card = cardsInRow(row)[0];
  return cardTarget(card);
};

const heroTarget = () =>
  Array.from(
    document.querySelectorAll(
      '.mg-fire-tv-hero button:not([disabled])'
    )
  ).find(visible) || null;

const moveSidebar = (current, direction) => {
  const aside = current?.closest?.("aside");

  if (!aside) {
    return false;
  }

  const buttons = Array.from(
    aside.querySelectorAll("button:not([disabled])")
  ).filter(visible);

  const index = buttons.indexOf(current);

  if (direction === "right") {
    return focusNow(firstUsefulCard() || heroTarget());
  }

  if (index < 0) {
    return false;
  }

  if (direction === "up" && index > 0) {
    return focusNow(buttons[index - 1]);
  }

  if (direction === "down" && index < buttons.length - 1) {
    return focusNow(buttons[index + 1]);
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
    if (cardIndex >= rowCards.length - 1) {
      return true;
    }

    return focusNow(cardTarget(rowCards[cardIndex + 1]));
  }

  const allRows = rows();
  const rowIndex = allRows.indexOf(row);
  const rect = card.getBoundingClientRect();
  const x = rect.left + rect.width / 2;

  if (direction === "up") {
    if (rowIndex > 0) {
      return focusNow(nearestCardIndexByX(allRows[rowIndex - 1], x));
    }

    return focusNow(heroTarget() || activeSidebarButton());
  }

  if (direction === "down" && rowIndex >= 0 && rowIndex < allRows.length - 1) {
    return focusNow(nearestCardIndexByX(allRows[rowIndex + 1], x));
  }

  return true;
};

const pageFocusable = () =>
  Array.from(
    document.querySelectorAll(
      'main button:not([disabled]), main a[href], main [role="button"]:not([aria-disabled="true"])'
    )
  ).filter((item) => {
    if (!visible(item)) return false;

    const label = String(item.getAttribute("aria-label") || "").toLowerCase();

    if (label === "scroll left" || label === "scroll right") {
      return false;
    }

    if (
      item.classList.contains("mg-hover-action") &&
      !label.startsWith("play ") &&
      !label.startsWith("resume ")
    ) {
      return false;
    }

    return true;
  });

const genericMove = (current, direction) => {
  if (!(current instanceof HTMLElement)) {
    return focusNow(activeSidebarButton() || firstUsefulCard() || heroTarget());
  }

  const from = current.getBoundingClientRect();
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;

  let best = null;
  let bestScore = Infinity;

  for (const candidate of pageFocusable()) {
    if (candidate === current) continue;

    const rect = candidate.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const dx = x - fromX;
    const dy = y - fromY;

    if (direction === "left" && dx >= -4) continue;
    if (direction === "right" && dx <= 4) continue;
    if (direction === "up" && dy >= -4) continue;
    if (direction === "down" && dy <= 4) continue;

    const horizontal = direction === "left" || direction === "right";
    const main = horizontal ? Math.abs(dx) : Math.abs(dy);
    const cross = horizontal ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 1.8;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return focusNow(best);
};

const installViewportGuard = () => {
  const desired =
    "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

  let meta = document.querySelector('meta[name="viewport"]');

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "viewport");
    document.head.appendChild(meta);
  }

  const restore = () => {
    if (meta.getAttribute("content") !== desired) {
      meta.setAttribute("content", desired);
    }
  };

  restore();

  const observer = new MutationObserver(restore);
  observer.observe(meta, {
    attributes: true,
    attributeFilter: ["content"],
  });

  window.setTimeout(restore, 220);
  window.setTimeout(restore, 500);
};

export const installFireTvStableMode = () => {
  if (!isFireTv() || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (window.__MG_FIRE_TV_STABLE_MODE__) {
    return;
  }

  window.__MG_FIRE_TV_STABLE_MODE__ = true;
  installViewportGuard();

  let lastMoveAt = 0;

  window.addEventListener(
    "keydown",
    (event) => {
      const direction = keyDirection(event);

      if (!direction || overlayOpen()) {
        return;
      }

      const tag = String(event?.target?.tagName || "").toLowerCase();
      const type = String(event?.target?.type || "").toLowerCase();

      if (
        tag === "textarea" ||
        event?.target?.isContentEditable ||
        (tag === "input" && type !== "range") ||
        tag === "select"
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const now = Date.now();

      if (now - lastMoveAt < 120) {
        return;
      }

      lastMoveAt = now;

      const current = document.activeElement;

      if (moveSidebar(current, direction)) {
        return;
      }

      if (moveCard(current, direction)) {
        return;
      }

      genericMove(current, direction);
    },
    true
  );
};
