import React, {
  useEffect,
  useRef,
} from "react";

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
  if (
    typeof navigator ===
    "undefined"
  ) {
    return false;
  }

  return (
    FIRE_TV_RE.test(
      String(
        navigator.userAgent ||
          ""
      )
    ) ||
    document.documentElement.classList.contains(
      "mg-fire-tv"
    ) ||
    document.body.classList.contains(
      "mg-fire-tv"
    )
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
        (
          item
        ) =>
          visible(
            item
          )
      );

    if (!close) {
      return null;
    }

    return (
      close.closest(
        ".absolute.inset-0"
      ) ||
      close.closest(
        ".fixed.inset-0"
      ) ||
      close.closest(
        '[role="dialog"]'
      ) ||
      close.parentElement
    );
  };

const fullscreenScope =
  () => {
    const element =
      document.querySelector(
        '[data-mg-fullscreen="true"]'
      );

    return (
      element instanceof
        HTMLElement &&
      visible(
        element
      )
    )
      ? element
      : null;
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
        (
          item
        ) =>
          visible(
            item
          )
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
      visible(
        picker
      )
    ) {
      return picker;
    }

    const fullscreen =
      fullscreenScope();

    if (fullscreen) {
      return fullscreen;
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
          visible(
            item
          ) &&
          !item.hasAttribute(
            "data-mg-global-back"
          )
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

const scopeForElement =
  (
    element
  ) => {
    if (
      !(
        element instanceof
        HTMLElement
      )
    ) {
      return document.body;
    }

    const scope =
      navigationScope();

    if (
      scope instanceof
        HTMLElement &&
      scope.contains(
        element
      )
    ) {
      return scope;
    }

    return document.body;
  };

const focusables = (
  scope
) => {
  if (
    !(
      scope instanceof
      HTMLElement
    )
  ) {
    return [];
  }

  return Array.from(
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
};

const normaliseText =
  (
    value
  ) =>
    String(
      value ||
        ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .slice(
        0,
        180
      );

const captureScroll =
  (
    element
  ) => {
    const ancestors =
      [];

    let node =
      element?.parentElement ||
      null;

    while (
      node &&
      node instanceof
        HTMLElement &&
      node !==
        document.body
    ) {
      if (
        node.scrollWidth >
          node.clientWidth +
            2 ||
        node.scrollHeight >
          node.clientHeight +
            2
      ) {
        ancestors.push({
          element:
            node,

          left:
            node.scrollLeft,

          top:
            node.scrollTop,
        });
      }

      node =
        node.parentElement;
    }

    return {
      ancestors,

      windowX:
        window.scrollX ||
        0,

      windowY:
        window.scrollY ||
        0,
    };
  };

const snapshotFocus =
  (
    element,
    scope
  ) => {
    if (
      !(
        element instanceof
        HTMLElement
      ) ||
      !(
        scope instanceof
        HTMLElement
      )
    ) {
      return null;
    }

    const items =
      focusables(
        scope
      );

    return {
      element,

      ariaLabel:
        normaliseText(
          element.getAttribute(
            "aria-label"
          )
        ),

      title:
        normaliseText(
          element.getAttribute(
            "title"
          )
        ),

      text:
        normaliseText(
          element.textContent
        ),

      tag:
        String(
          element.tagName ||
            ""
        ).toLowerCase(),

      index:
        items.indexOf(
          element
        ),

      scroll:
        captureScroll(
          element
        ),
    };
  };

const resolveSnapshot =
  (
    snapshot,
    scope
  ) => {
    if (
      !snapshot ||
      !(
        scope instanceof
        HTMLElement
      )
    ) {
      return null;
    }

    if (
      snapshot.element instanceof
        HTMLElement &&
      snapshot.element.isConnected &&
      scope.contains(
        snapshot.element
      ) &&
      visible(
        snapshot.element,
        scope
      )
    ) {
      return snapshot.element;
    }

    const items =
      focusables(
        scope
      );

    if (
      snapshot.ariaLabel
    ) {
      const byLabel =
        items.find(
          (
            item
          ) =>
            normaliseText(
              item.getAttribute(
                "aria-label"
              )
            ) ===
            snapshot.ariaLabel
        );

      if (byLabel) {
        return byLabel;
      }
    }

    if (
      snapshot.title
    ) {
      const byTitle =
        items.find(
          (
            item
          ) =>
            normaliseText(
              item.getAttribute(
                "title"
              )
            ) ===
            snapshot.title
        );

      if (byTitle) {
        return byTitle;
      }
    }

    if (
      snapshot.text
    ) {
      const byText =
        items.find(
          (
            item
          ) =>
            String(
              item.tagName ||
                ""
            ).toLowerCase() ===
              snapshot.tag &&
            normaliseText(
              item.textContent
            ) ===
              snapshot.text
        );

      if (byText) {
        return byText;
      }
    }

    if (
      snapshot.index >=
        0 &&
      snapshot.index <
        items.length
    ) {
      return items[
        snapshot.index
      ];
    }

    return null;
  };

const restoreScroll =
  (
    scroll
  ) => {
    if (!scroll) {
      return;
    }

    for (
      const saved of
      scroll.ancestors ||
      []
    ) {
      if (
        saved.element instanceof
          HTMLElement &&
        saved.element.isConnected
      ) {
        saved.element.scrollLeft =
          saved.left;

        saved.element.scrollTop =
          saved.top;
      }
    }

    try {
      window.scrollTo(
        scroll.windowX ||
          0,
        scroll.windowY ||
          0
      );
    } catch {
      // Ignore WebView scroll failures.
    }
  };

const restoreSnapshot =
  (
    snapshot,
    scope
  ) => {
    const target =
      resolveSnapshot(
        snapshot,
        scope
      );

    if (!target) {
      return false;
    }

    restoreScroll(
      snapshot.scroll
    );

    try {
      target.focus({
        preventScroll:
          true,
      });
    } catch {
      target.focus();
    }

    restoreScroll(
      snapshot.scroll
    );

    window.setTimeout(
      () =>
        restoreScroll(
          snapshot.scroll
        ),
      40
    );

    return true;
  };

export default function FireTvFocusMemory() {
  const stateRef =
    useRef({
      currentScope:
        null,

      snapshots:
        new Map(),

      timer:
        null,
    });

  useEffect(() => {
    if (
      !isFireTv()
    ) {
      return undefined;
    }

    const state =
      stateRef.current;

    state.currentScope =
      navigationScope();

    const remember =
      (
        element,
        forcedScope =
          null
      ) => {
        if (
          !(
            element instanceof
            HTMLElement
          )
        ) {
          return;
        }

        const scope =
          forcedScope ||
          scopeForElement(
            element
          );

        if (
          !(
            scope instanceof
            HTMLElement
          ) ||
          !scope.contains(
            element
          ) ||
          !visible(
            element,
            scope
          )
        ) {
          return;
        }

        const snapshot =
          snapshotFocus(
            element,
            scope
          );

        if (snapshot) {
          state.snapshots.set(
            scope,
            snapshot
          );
        }
      };

    const onFocusIn =
      (
        event
      ) => {
        remember(
          event.target
        );
      };

    const inspectScopeChange =
      () => {
        if (
          state.timer
        ) {
          window.clearTimeout(
            state.timer
          );
        }

        state.timer =
          window.setTimeout(
            () => {
              const previous =
                state.currentScope ||
                document.body;

              const active =
                document.activeElement;

              if (
                active instanceof
                  HTMLElement &&
                previous instanceof
                  HTMLElement &&
                previous.contains(
                  active
                ) &&
                visible(
                  active,
                  previous
                )
              ) {
                remember(
                  active,
                  previous
                );
              }

              const next =
                navigationScope();

              if (
                next ===
                previous
              ) {
                return;
              }

              state.currentScope =
                next;

              const saved =
                state.snapshots.get(
                  next
                );

              if (!saved) {
                return;
              }

              window.setTimeout(
                () => {
                  if (
                    navigationScope() !==
                    next
                  ) {
                    return;
                  }

                  restoreSnapshot(
                    saved,
                    next
                  );
                },
                120
              );
            },
            45
          );
      };

    document.addEventListener(
      "focusin",
      onFocusIn,
      true
    );

    const observer =
      new MutationObserver(
        inspectScopeChange
      );

    observer.observe(
      document.body,
      {
        childList:
          true,

        subtree:
          true,

        attributes:
          true,

        attributeFilter: [
          "class",
          "style",
          "aria-hidden",
          "data-state",
          "data-mg-fullscreen",
        ],
      }
    );

    const initial =
      document.activeElement;

    if (
      initial instanceof
        HTMLElement &&
      initial !==
        document.body
    ) {
      remember(
        initial
      );
    }

    return () => {
      document.removeEventListener(
        "focusin",
        onFocusIn,
        true
      );

      observer.disconnect();

      if (
        state.timer
      ) {
        window.clearTimeout(
          state.timer
        );
      }

      state.snapshots.clear();
      state.currentScope =
        null;
    };
  }, []);

  return null;
}
