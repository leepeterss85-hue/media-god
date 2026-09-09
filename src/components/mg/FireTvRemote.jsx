import { useEffect, useRef } from "react";

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

  /*
   * A child can report opacity:1 even when a parent control layer is
   * opacity:0. Fire TV was therefore moving focus onto buttons that were
   * visually hidden. Walk the ancestor chain so only genuinely visible
   * controls participate in D-pad navigation.
   */
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

const nearestByX = (source, candidates) => {
  if (!(source instanceof HTMLElement) || !candidates.length) {
    return candidates[0] || null;
  }

  const sourceX = centre(source).x;

  return [...candidates].sort(
    (a, b) =>
      Math.abs(centre(a).x - sourceX) -
      Math.abs(centre(b).x - sourceX)
  )[0] || null;
};

const activeSidebarTarget = () => {
  const buttons = Array.from(
    document.querySelectorAll(
      '.mg-fire-tv-nav button:not([disabled])'
    )
  ).filter(visible);

  return (
    buttons.find((button) =>
      String(button.className || "").includes("text-mg-green")
    ) ||
    buttons[0] ||
    null
  );
};

const rowAwareTarget = (current, candidates, direction) => {
  if (!(current instanceof HTMLElement)) {
    return candidates[0] || null;
  }

  const usable = candidates.filter(
    (candidate) => candidate !== current && visible(candidate)
  );

  if (!usable.length) {
    return null;
  }

  const currentRect = current.getBoundingClientRect();
  const from = centre(current);
  const horizontalBand = Math.max(
    22,
    Math.min(64, currentRect.height * 0.7 + 12)
  );

  if (direction === "left" || direction === "right") {
    const horizontal = usable
      .map((candidate) => {
        const to = centre(candidate);
        const dx = to.x - from.x;
        const dy = Math.abs(to.y - from.y);

        if (direction === "left" && dx >= -2) return null;
        if (direction === "right" && dx <= 2) return null;
        if (dy > horizontalBand) return null;

        return {
          candidate,
          score: Math.abs(dx) + dy * 4,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);

    return horizontal[0]?.candidate || null;
  }

  const verticalThreshold = Math.max(
    10,
    Math.min(30, currentRect.height * 0.35)
  );
  const vertical = usable
    .map((candidate) => {
      const to = centre(candidate);
      const dx = Math.abs(to.x - from.x);
      const dy = to.y - from.y;

      if (direction === "up" && dy >= -verticalThreshold) return null;
      if (direction === "down" && dy <= verticalThreshold) return null;

      return {
        candidate,
        primary: Math.abs(dy),
        x: dx,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.primary - b.primary || a.x - b.x);

  if (!vertical.length) {
    return null;
  }

  /*
   * Move to the nearest visual row first, then choose the control in that
   * row whose horizontal position most closely matches the current control.
   * This prevents D-pad Down from skipping an entire row just because a
   * diagonally placed control happened to have a slightly better raw distance.
   */
  const nearestRowDistance = vertical[0].primary;
  const rowTolerance = Math.max(26, currentRect.height * 0.8);
  const nearestRow = vertical.filter(
    (entry) => entry.primary <= nearestRowDistance + rowTolerance
  );

  nearestRow.sort((a, b) => a.x - b.x || a.primary - b.primary);

  return nearestRow[0]?.candidate || vertical[0]?.candidate || null;
};

const tvShowsRemoteTarget = (current, direction) => {
  const view = document.querySelector(
    '[data-mg-tv-shows-view="true"]'
  );

  if (
    !(view instanceof HTMLElement) ||
    !visible(view) ||
    !(current instanceof HTMLElement) ||
    !view.contains(current)
  ) {
    return null;
  }

  const categoryRow = view.querySelector(
    '[data-mg-tv-category-row="true"]'
  );
  const categories = categoryRow instanceof HTMLElement
    ? focusables(categoryRow).filter(
        (item) => String(item.tagName || "").toLowerCase() === "button"
      )
    : [];
  const search = view.querySelector(
    '[data-mg-tv-search="true"] input'
  );
  const filterRow = view.querySelector(
    '[data-mg-tv-filter-row="true"]'
  );
  const filters = filterRow instanceof HTMLElement
    ? Array.from(filterRow.querySelectorAll("select")).filter(visible)
    : [];
  const cards = Array.from(
    view.querySelectorAll(
      '[data-mg-tv-show-card="true"] button[aria-label^="Open "]'
    )
  ).filter(visible);

  const categoryIndex = categories.indexOf(current);

  if (categoryIndex >= 0) {
    if (direction === "left") {
      return categories[categoryIndex - 1] || null;
    }

    if (direction === "right") {
      return categories[categoryIndex + 1] || current;
    }

    if (direction === "down") {
      return search instanceof HTMLElement && visible(search)
        ? search
        : filters[0] || cards[0] || current;
    }

    if (direction === "up") {
      return current;
    }
  }

  if (search instanceof HTMLElement && current === search) {
    if (direction === "up") {
      return (
        categories.find(
          (item) => item.getAttribute("aria-pressed") === "true"
        ) ||
        categories[0] ||
        current
      );
    }

    if (direction === "down") {
      return filters[0] || cards[0] || current;
    }

    return null;
  }

  const filterIndex = filters.indexOf(current);

  if (filterIndex >= 0) {
    if (direction === "left") {
      return filters[filterIndex - 1] || null;
    }

    if (direction === "right") {
      return filters[filterIndex + 1] || current;
    }

    if (direction === "up") {
      return search instanceof HTMLElement && visible(search)
        ? search
        : categories[0] || current;
    }

    if (direction === "down") {
      const firstRowTop = cards[0]?.getBoundingClientRect?.().top;
      const firstRow = Number.isFinite(firstRowTop)
        ? cards.filter(
            (card) =>
              Math.abs(card.getBoundingClientRect().top - firstRowTop) < 24
          )
        : cards;

      return nearestByX(current, firstRow) || current;
    }
  }

  if (cards.includes(current)) {
    const cardTarget = directionalTarget(current, cards, direction);

    if (cardTarget) {
      return cardTarget;
    }

    if (direction === "up") {
      return nearestByX(current, filters) ||
        (search instanceof HTMLElement && visible(search) ? search : current);
    }

    if (direction === "left") {
      return null;
    }

    return current;
  }

  return null;
};

const playerOpen = () => {
  if (typeof document === "undefined") {
    return false;
  }

  const player = document.querySelector(
    '[data-mg-player-root="true"]'
  );

  return player instanceof HTMLElement && visible(player);
};

const activeVideo = () => {
  const player = document.querySelector('[data-mg-player-root="true"]');
  const scope =
    player instanceof HTMLElement && visible(player)
      ? player
      : topOverlay();

  if (scope instanceof HTMLElement) {
    const media = Array.from(
      scope.querySelectorAll("video")
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
    if (typeof document === "undefined") {
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
    const activateTvMode = () => {
      if (!isFireTv()) return;
      document.documentElement.classList.add("mg-fire-tv-mode");
      document.body?.classList.add("mg-fire-tv-mode");
    };

    activateTvMode();

    const focusOverlay = () => {
      if (!isFireTv()) {
        return;
      }

      if (playerOpen()) {
        const scope = document.querySelector('[data-mg-player-root="true"]');

        if (!(scope instanceof HTMLElement)) {
          lastScopeRef.current = null;
          return;
        }

        const mediaControls = scope.querySelector(
          '[data-mg-player-controls="true"]'
        );
        const active = document.activeElement;

        /*
         * VideoPlayer can mount its transport controls a moment after the
         * outer Exit/source chrome. If Exit received focus first, move focus
         * to the real Play/Pause control as soon as the transport layer is
         * available so the TV remote starts from the media controls instead
         * of pinning the top box on screen.
         */
        if (lastScopeRef.current === scope) {
          /*
           * Do not steal focus back to Play/Pause when the viewer deliberately
           * moved to Source, Torrent file, subtitles, audio or another player
           * control. Only recover focus when it has genuinely escaped the
           * player or the previously focused control is no longer visible.
           */
          if (
            mediaControls instanceof HTMLElement &&
            (!(active instanceof HTMLElement) ||
              !scope.contains(active) ||
              !visible(active))
          ) {
            const transport =
              mediaControls.querySelector(
                'button[aria-label="Pause"], button[aria-label="Play"]'
              ) ||
              focusables(mediaControls)[0] ||
              null;

            window.setTimeout(() => {
              focusElement(transport);
            }, 30);
          }

          return;
        }

        lastScopeRef.current = scope;

        const preferred =
          scope.querySelector(
            '[data-mg-player-controls="true"] button[aria-label="Pause"], [data-mg-player-controls="true"] button[aria-label="Play"], select[aria-label="Choose playback source"], select[aria-label="Choose file"], button[data-mg-player-exit="true"], button[aria-label="Exit player"]'
          ) ||
          focusables(scope)[0] ||
          null;

        window.setTimeout(() => {
          focusElement(preferred);
        }, 40);

        return;
      }

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
          '[data-mg-search-dialog="true"] input[aria-label="Search"], button[data-mg-player-exit="true"], button[aria-label="Exit player"], button[aria-label="Back to main menu"], button[data-mg-detail-primary="true"], button[aria-label="Back"], button[aria-label="Close details"], button[aria-label="Close search"]'
        ) ||
        focusables(scope)[0] ||
        null;

      window.setTimeout(() => {
        focusElement(preferred);
      }, 30);
    };

    const onKeyDown = (event) => {
      if (!isFireTv()) {
        return;
      }

      const mediaAction = mediaActionFromEvent(event);

      if (mediaAction && runMediaAction(mediaAction)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        window.dispatchEvent(
          new CustomEvent("mg:player-reveal-controls")
        );

        return;
      }

      const player = document.querySelector('[data-mg-player-root="true"]');
      const overlay = topOverlay();
      const appMain = document.querySelector("#root main");
      const scope =
        player instanceof HTMLElement && visible(player)
          ? player
          : overlay instanceof HTMLElement
            ? overlay
            : appMain instanceof HTMLElement
              ? document.querySelector("#root")
              : null;

      if (!(scope instanceof HTMLElement)) {
        return;
      }

      /*
       * main.jsx owns Back before this handler sees it. When no overlay is
       * open, this provides generic spatial navigation for Settings, Addons,
       * Downloads and every other authenticated main-app control that the
       * deterministic row navigator deliberately does not own.
       */
      const direction = directionFromEvent(event);
      const selectKey = isSelectKey(event);

      /*
       * When playback chrome has auto-hidden, the first D-pad/OK press should
       * wake it rather than seek, change volume or jump to an invisible
       * control. MediaPlayerControls listens for this event and re-renders the
       * controls; then focus lands on Play/Pause in the same interaction.
       */
      if (
        player instanceof HTMLElement &&
        player.dataset.mgControlsVisible === "false" &&
        (direction || selectKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        window.dispatchEvent(
          new CustomEvent("mg:player-reveal-controls")
        );

        window.setTimeout(() => {
          const currentPlayer = document.querySelector(
            '[data-mg-player-root="true"]'
          );
          const preferred = currentPlayer?.querySelector(
            '[data-mg-player-controls="true"] button[aria-label="Pause"], [data-mg-player-controls="true"] button[aria-label="Play"]'
          );
          focusElement(preferred);
        }, 55);

        return;
      }

      const current =
        document.activeElement instanceof HTMLElement &&
        scope.contains(document.activeElement) &&
        visible(document.activeElement)
          ? document.activeElement
          : null;
      const currentTag = String(current?.tagName || "").toLowerCase();

      /*
       * OK opens native select choosers. Arrow keys stay available to Media
       * God's spatial navigator so a source/torrent selector never traps the
       * Fire Stick remote. For sliders, Left/Right still adjust the value
       * natively while Up/Down move to the next row of controls.
       */
      if (currentTag === "select" && selectKey) {
        return;
      }

      const currentType = String(current?.type || "").toLowerCase();
      const textEditable =
        (currentTag === "input" &&
          !["range", "button", "submit", "reset", "checkbox", "radio"].includes(
            currentType
          )) ||
        currentTag === "textarea" ||
        Boolean(current?.isContentEditable);

      /* Text entry must keep Left/Right for moving the caret on every page. */
      if (
        textEditable &&
        (direction === "left" || direction === "right")
      ) {
        return;
      }

      if (currentTag === "input" && currentType === "range") {
        if (selectKey || direction === "left" || direction === "right") {
          return;
        }
      }

      if (direction) {
        const tvShowsView = document.querySelector(
          '[data-mg-tv-shows-view="true"]'
        );
        const currentInsideTvShows =
          tvShowsView instanceof HTMLElement &&
          current instanceof HTMLElement &&
          tvShowsView.contains(current);

        /*
         * TV Shows has a deliberate television focus path:
         * categories -> search -> country/genre/year/language -> poster grid.
         * Left/Right inside the search field remain native so the caret can be
         * moved when the Fire TV keyboard/search box is in use.
         */
        if (
          currentInsideTvShows &&
          currentTag === "input" &&
          (direction === "left" || direction === "right")
        ) {
          return;
        }

        if (currentInsideTvShows) {
          const tvTarget = tvShowsRemoteTarget(current, direction);

          if (tvTarget && focusElement(tvTarget)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }
        }

        if (
          player instanceof HTMLElement &&
          (!(current instanceof HTMLElement) || !visible(current))
        ) {
          const preferred = player.querySelector(
            '[data-mg-player-controls="true"] button[aria-label="Pause"], [data-mg-player-controls="true"] button[aria-label="Play"]'
          );

          if (focusElement(preferred)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }
        }

        if (!(player instanceof HTMLElement)) {
          const structuredScope =
            overlay instanceof HTMLElement && visible(overlay)
              ? overlay
              : appMain instanceof HTMLElement &&
                  current instanceof HTMLElement &&
                  appMain.contains(current)
                ? appMain
                : scope;
          const structuredCandidates = focusables(structuredScope);
          const structuredTarget = rowAwareTarget(
            current,
            structuredCandidates,
            direction
          );

          if (structuredTarget && focusElement(structuredTarget)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }

          /*
           * At the left edge of a normal page, always return to the currently
           * selected sidebar item instead of allowing browser/WebView focus to
           * jump to an arbitrary off-row element. Dialogs stay self-contained.
           */
          if (
            direction === "left" &&
            !(overlay instanceof HTMLElement) &&
            appMain instanceof HTMLElement &&
            current instanceof HTMLElement &&
            appMain.contains(current)
          ) {
            const sidebar = activeSidebarTarget();

            if (sidebar && focusElement(sidebar)) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();
              return;
            }
          }

          /* Stay on the current edge control instead of letting Fire OS scroll
           * the whole page or pick an unpredictable native focus target. */
          if (current instanceof HTMLElement) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
          }

          return;
        }

        const mediaControls = player.querySelector(
          '[data-mg-player-controls="true"]'
        );
        const mediaCandidates =
          mediaControls instanceof HTMLElement
            ? focusables(mediaControls)
            : [];
        const allCandidates = focusables(scope);
        const candidates = [
          ...mediaCandidates,
          ...allCandidates.filter(
            (candidate) => !mediaCandidates.includes(candidate)
          ),
        ];

        const target = directionalTarget(
          current,
          candidates,
          direction
        );

        if (target && focusElement(target)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }

        return;
      }

      if (isSelectKey(event)) {
        const selected = document.activeElement;

        if (
          player instanceof HTMLElement &&
          (!(selected instanceof HTMLElement) ||
            !player.contains(selected) ||
            !visible(selected))
        ) {
          const preferred = player.querySelector(
            '[data-mg-player-controls="true"] button[aria-label="Pause"], [data-mg-player-controls="true"] button[aria-label="Play"]'
          );

          if (focusElement(preferred)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
          }

          return;
        }

        if (
          selected instanceof HTMLElement &&
          scope.contains(selected) &&
          visible(selected)
        ) {
          if (String(selected.tagName || "").toLowerCase() === "select") {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          selected.click();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mg:tv-remote-detected", activateTvMode);

    const observer = new MutationObserver(focusOverlay);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    focusOverlay();

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mg:tv-remote-detected", activateTvMode);
      observer.disconnect();
      document.documentElement.classList.remove("mg-fire-tv-mode");
      document.body?.classList.remove("mg-fire-tv-mode");
    };
  }, []);

  return null;
}
