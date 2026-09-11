const {
  contextBridge,
  ipcRenderer,
} = require("electron");

let nativeFullscreen = false;

const setFullscreen = async (value) => {
  nativeFullscreen = Boolean(value);
  return ipcRenderer.invoke(
    "mg:windows-set-fullscreen",
    nativeFullscreen
  );
};

const toggleFullscreen = async () => {
  const result = await ipcRenderer.invoke(
    "mg:windows-toggle-fullscreen"
  );

  nativeFullscreen = await ipcRenderer.invoke(
    "mg:windows-get-fullscreen"
  );

  return result;
};

contextBridge.exposeInMainWorld(
  "MediaGodDesktop",
  Object.freeze({
    isAvailable: () => true,
    platform: "windows",
    setFullscreen,
    toggleFullscreen,
    isFullscreen: () =>
      ipcRenderer.invoke("mg:windows-get-fullscreen"),
  })
);

ipcRenderer.on(
  "mg:windows-fullscreen-state",
  (_event, value) => {
    nativeFullscreen = Boolean(value);

    try {
      window.dispatchEvent(
        new CustomEvent(
          "mg:windows-fullscreen-state",
          {
            detail: {
              fullscreen: nativeFullscreen,
            },
          }
        )
      );
    } catch {
      // The renderer may be navigating between Base44 pages.
    }
  }
);

const isTypingTarget = (target) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  Boolean(target?.isContentEditable);

const visiblePlayer = () => {
  const root = document.querySelector(
    '[data-mg-player-root="true"]'
  );

  if (!(root instanceof HTMLElement)) {
    return null;
  }

  const rect = root.getBoundingClientRect();
  const style = window.getComputedStyle(root);

  if (
    rect.width < 100 ||
    rect.height < 100 ||
    style.display === "none" ||
    style.visibility === "hidden"
  ) {
    return null;
  }

  return root;
};

const fullscreenButtonIntent = (target) => {
  if (!(target instanceof Element)) {
    return null;
  }

  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement)) {
    return null;
  }

  const text = [
    button.getAttribute("aria-label"),
    button.getAttribute("title"),
    button.textContent,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!/full\s*screen/i.test(text)) {
    return null;
  }

  if (/exit|leave|close/i.test(text)) {
    return false;
  }

  return true;
};

window.addEventListener(
  "DOMContentLoaded",
  () => {
    document.documentElement.classList.add(
      "mg-windows-desktop",
      "mg-native-windows"
    );

    document.body?.classList.add(
      "mg-windows-desktop",
      "mg-native-windows"
    );

    /*
     * Capture the player's own fullscreen button before React handles the
     * click. Even if Chromium refuses HTML requestFullscreen(), the native
     * window still enters real Windows fullscreen and covers the taskbar.
     */
    document.addEventListener(
      "pointerdown",
      (event) => {
        const intent = fullscreenButtonIntent(event.target);

        if (intent === null) {
          return;
        }

        setFullscreen(intent);
      },
      true
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.defaultPrevented ||
          isTypingTarget(event.target) ||
          !visiblePlayer()
        ) {
          return;
        }

        if (event.key === "f" || event.key === "F") {
          setFullscreen(!nativeFullscreen);
        }
      },
      true
    );

    document.addEventListener(
      "dblclick",
      (event) => {
        const player = visiblePlayer();

        if (
          !player ||
          !(event.target instanceof Node) ||
          !player.contains(event.target)
        ) {
          return;
        }

        setFullscreen(!nativeFullscreen);
      },
      true
    );

    ipcRenderer
      .invoke("mg:windows-get-fullscreen")
      .then((value) => {
        nativeFullscreen = Boolean(value);
      })
      .catch(() => {});
  },
  { once: true }
);
