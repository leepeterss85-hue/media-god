const path = require("node:path");
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} = require("electron");

const MEDIA_GOD_URL = "https://mysterious-media-vault-pro.base44.app/";

let mainWindow = null;
let wasMaximizedBeforeFullscreen = true;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

const sendFullscreenState = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(
    "mg:windows-fullscreen-state",
    mainWindow.isFullScreen()
  );
};

const setNativeFullscreen = (value) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  const shouldFullscreen = Boolean(value);

  if (shouldFullscreen) {
    if (!mainWindow.isFullScreen()) {
      wasMaximizedBeforeFullscreen = mainWindow.isMaximized();
    }

    /*
     * This is deliberately native Windows fullscreen, not CSS fullscreen.
     * setFullScreen() makes the Electron window cover the Windows work area,
     * while always-on-top keeps the taskbar behind the player even on systems
     * where Explorer briefly tries to raise it over a newly-fullscreen window.
     */
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.setFullScreen(true);
    mainWindow.focus();
  } else {
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(false);

    if (wasMaximizedBeforeFullscreen) {
      mainWindow.maximize();
    }
  }

  setTimeout(sendFullscreenState, 80);
  return true;
};

const toggleNativeFullscreen = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  return setNativeFullscreen(!mainWindow.isFullScreen());
};

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#000000",
    title: "Media God",
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  mainWindow.removeMenu();

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on("enter-full-screen", sendFullscreenState);
  mainWindow.on("leave-full-screen", sendFullscreenState);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  /*
   * If Media God's existing web player succeeds with requestFullscreen(),
   * mirror that state onto the actual Windows window. That is the part that
   * makes the taskbar disappear, which browser/CSS-only fullscreen cannot
   * guarantee inside a wrapper.
   */
  mainWindow.webContents.on("enter-html-full-screen", () => {
    setNativeFullscreen(true);
  });

  mainWindow.webContents.on("leave-html-full-screen", () => {
    setNativeFullscreen(false);
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!input || input.type !== "keyDown") {
      return;
    }

    if (input.key === "F11") {
      event.preventDefault();
      toggleNativeFullscreen();
      return;
    }

    if (input.key === "Escape" && mainWindow?.isFullScreen()) {
      event.preventDefault();
      setNativeFullscreen(false);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      const appOrigin = new URL(MEDIA_GOD_URL).origin;

      if (target.origin === appOrigin) {
        return { action: "allow" };
      }
    } catch {
      // Invalid/non-web URLs are denied below.
    }

    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.loadURL(MEDIA_GOD_URL);
};

ipcMain.handle("mg:windows-set-fullscreen", (_event, value) =>
  setNativeFullscreen(Boolean(value))
);

ipcMain.handle("mg:windows-toggle-fullscreen", () =>
  toggleNativeFullscreen()
);

ipcMain.handle("mg:windows-get-fullscreen", () =>
  Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen())
);

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
