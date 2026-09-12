import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Tv, X } from "lucide-react";

import {
  nativeFireTvAppInfo,
  nativeFireTvSelfUpdateAvailable,
  startNativeFireTvUpdate,
} from "@/components/mg/nativeFireTvBridge";

const SESSION_DISMISS_PREFIX = "mg:fire-tv-app-update-dismissed:";
const DEFAULT_DOWNLOADER_CODE = "4372217";

const looksLikeFireTv = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const root = document.documentElement;
  const body = document.body;
  const ua = String(navigator.userAgent || "");
  const platform = String(navigator.platform || "");

  return (
    root?.classList?.contains("mg-fire-tv") ||
    root?.classList?.contains("mg-tv-remote") ||
    body?.classList?.contains("mg-fire-tv") ||
    body?.classList?.contains("mg-tv-remote") ||
    /(?:\bAFT[A-Z0-9]*\b|Fire\s*TV|AmazonWebAppPlatform|MediaGodFireTV)/i.test(
      `${ua} ${platform}`
    )
  );
};

export default function FireTvAppUpdateNotice({ enabled = true }) {
  const [release, setRelease] = useState(null);
  const [nativeInfo, setNativeInfo] = useState(null);
  const [visible, setVisible] = useState(false);
  const [updateState, setUpdateState] = useState({
    status: "idle",
    message: "",
    progress: 0,
  });

  const checkForUpdate = useCallback(async () => {
    if (!enabled || !looksLikeFireTv()) {
      setVisible(false);
      return;
    }

    try {
      const response = await fetch(`/firetv-update.json?t=${Date.now()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const nextRelease = await response.json();
      const latestCode = Number(nextRelease?.versionCode || 0);
      const appInfo = nativeFireTvAppInfo();
      const currentCode = Number(appInfo?.versionCode || 0);

      if (!latestCode) {
        return;
      }

      const dismissKey = `${SESSION_DISMISS_PREFIX}${latestCode}`;
      if (window.sessionStorage?.getItem(dismissKey) === "1") {
        return;
      }

      const needsUpdate = !appInfo || currentCode < latestCode;

      setRelease(nextRelease);
      setNativeInfo(appInfo);
      setVisible(needsUpdate);
    } catch {
      // Update checks must never interfere with the main Media God UI.
    }
  }, [enabled]);

  useEffect(() => {
    checkForUpdate();

    const handleDetected = () => {
      window.setTimeout(checkForUpdate, 150);
    };

    window.addEventListener("mg:tv-remote-detected", handleDetected);

    return () => {
      window.removeEventListener("mg:tv-remote-detected", handleDetected);
    };
  }, [checkForUpdate]);

  useEffect(() => {
    const handleUpdateStatus = (event) => {
      const detail = event?.detail || {};

      setUpdateState({
        status: String(detail?.status || "idle"),
        message: String(detail?.message || ""),
        progress: Math.max(0, Math.min(100, Number(detail?.progress || 0))),
      });
    };

    window.addEventListener("mg:fire-tv-update-status", handleUpdateStatus);

    return () => {
      window.removeEventListener(
        "mg:fire-tv-update-status",
        handleUpdateStatus
      );
    };
  }, []);

  const latestCode = Number(release?.versionCode || 0);
  const migration = !nativeInfo;
  const downloaderCode = String(
    release?.downloaderCode || DEFAULT_DOWNLOADER_CODE
  ).trim();

  const canSelfUpdate = useMemo(
    () =>
      Boolean(
        nativeInfo?.selfUpdateSupported &&
          nativeFireTvSelfUpdateAvailable() &&
          release?.apkUrl
      ),
    [nativeInfo, release]
  );

  const signatureMigration =
    updateState.status === "signature_migration" ||
    /signing identity does not match/i.test(updateState.message);

  const showDownloaderMigration = !canSelfUpdate || signatureMigration;

  const updateBusy = [
    "downloading",
    "downloaded",
    "permission",
    "installer",
  ].includes(updateState.status);

  const dismiss = () => {
    if (updateBusy) {
      return;
    }

    try {
      window.sessionStorage?.setItem(
        `${SESSION_DISMISS_PREFIX}${latestCode}`,
        "1"
      );
    } catch {
      // Session storage is optional in some older WebViews.
    }

    setVisible(false);
  };

  const startUpdate = () => {
    if (!canSelfUpdate || updateBusy) {
      return;
    }

    setUpdateState({
      status: "starting",
      message: "Starting Media God update…",
      progress: 0,
    });

    const result = startNativeFireTvUpdate({
      url: release?.apkUrl,
      versionName: release?.versionName,
    });

    if (result === "started") {
      return;
    }

    setUpdateState({
      status: "error",
      message:
        result === "busy"
          ? "Another Media God update is already running."
          : "The in-app updater could not start. Use the Downloader fallback below.",
      progress: 0,
    });
  };

  if (!enabled || !visible || !release) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/85 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Fire TV app update available"
      data-mg-fire-tv-update="true"
    >
      <div className="w-full max-w-xl rounded-2xl border border-mg-green/40 bg-mg-surface p-5 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-mg-green text-black">
            <Tv className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-mg-green">
              Fire TV update
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">
              {signatureMigration
                ? "One-time Fire TV signing migration required"
                : migration
                  ? "Install the dedicated Media God Fire TV app"
                  : `Media God Fire TV ${release.versionName || "update"} available`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {signatureMigration
                ? "This Fire TV has an older Media God APK signed with the previous development key. Fire OS cannot replace it with the permanent signed release, so this device needs one clean reinstall."
                : migration
                  ? "This is the one-time move into the dedicated Media God Fire TV app."
                  : canSelfUpdate
                    ? "Media God can download this update itself. Fire OS will ask you to approve installation before anything is replaced."
                    : "This installed build does not yet contain the self-updater. Use Downloader once; later signed releases can update from inside the app."}
            </p>
          </div>

          <button
            type="button"
            data-mg-overlay-back="true"
            onClick={dismiss}
            disabled={updateBusy}
            className="rounded-lg p-2 text-white/60 outline-none hover:bg-white/10 hover:text-white focus:ring-2 focus:ring-mg-green disabled:opacity-30"
            aria-label="Later"
            title="Later"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {canSelfUpdate && !signatureMigration && (
          <div className="mt-5 rounded-xl border border-mg-green/35 bg-black/25 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              {updateBusy || updateState.status === "starting" ? (
                <Loader2 className="h-5 w-5 animate-spin text-mg-green" />
              ) : (
                <Download className="h-5 w-5 text-mg-green" />
              )}
              Update inside Media God
            </div>

            <p className="mt-2 text-sm leading-5 text-white/65">
              {updateState.message ||
                "Press Update now. Media God will download the APK and hand it to the Fire OS installer."}
            </p>

            {(updateState.status === "downloading" ||
              updateState.status === "downloaded") && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-mg-green transition-[width] duration-300"
                    style={{ width: `${updateState.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-white/50">
                  {Math.round(updateState.progress)}%
                </p>
              </div>
            )}

            {(updateState.status === "permission" ||
              updateState.status === "permission_required") && (
              <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                {updateState.status === "permission"
                  ? "Fire OS has opened the one-time “Install unknown apps” permission for Media God. Allow it, then return to Media God and the installer will continue automatically."
                  : "Installation permission was not enabled. You can retry the permission screen now or choose Later."}
              </p>
            )}

            {updateState.status === "error" && (
              <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs leading-5 text-red-100">
                {updateState.message}
              </p>
            )}

            <button
              type="button"
              onClick={startUpdate}
              disabled={updateBusy || updateState.status === "starting"}
              autoFocus
              className="mt-4 min-h-12 w-full rounded-xl bg-mg-green px-5 py-3 font-bold text-black outline-none hover:brightness-110 focus:ring-4 focus:ring-mg-green/40 disabled:cursor-wait disabled:opacity-60"
            >
              {updateBusy || updateState.status === "starting"
                ? "Updating…"
                : updateState.status === "permission_required"
                  ? "Allow installation"
                  : `Update now${release.versionName ? ` to ${release.versionName}` : ""}`}
            </button>
          </div>
        )}

        {showDownloaderMigration && (
          <div className="mt-5 rounded-xl border border-mg-green/30 bg-black/25 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Download className="h-5 w-5 text-mg-green" />
              {signatureMigration
                ? "One-time clean reinstall"
                : "One-time Downloader install"}
            </div>

            {signatureMigration ? (
              <ol className="mt-3 space-y-2 text-sm leading-5 text-white/75">
                <li>
                  <span className="font-bold text-white">1.</span> On Fire TV, open Settings → Applications → Manage Installed Applications → Media God Fire TV and choose Uninstall.
                </li>
                <li>
                  <span className="font-bold text-white">2.</span> Open Downloader and enter the code below.
                </li>
                <li>
                  <span className="font-bold text-white">3.</span> Install Media God Fire TV {release.versionName || "the latest version"} and sign in again if Fire TV asks you to.
                </li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-sm leading-5 text-white/75">
                <li>
                  <span className="font-bold text-white">1.</span> Open the Downloader app on Fire TV.
                </li>
                <li>
                  <span className="font-bold text-white">2.</span> Enter this code:
                </li>
              </ol>
            )}

            <div
              className="my-3 rounded-xl border-2 border-mg-green bg-black px-4 py-4 text-center font-mono text-3xl sm:text-4xl font-black tracking-[0.18em] text-mg-green"
              aria-label={`Downloader code ${downloaderCode}`}
            >
              {downloaderCode}
            </div>

            <p className="text-xs leading-5 text-white/50">
              {signatureMigration
                ? "This is required only once because Android/Fire OS will not install an APK over an existing app when the signing keys differ. Uninstalling clears local Fire TV app data, so you may need to sign in again. After this clean install, future Media God Fire TV updates can use Update now normally."
                : "Install this signed version once. Future Media God Fire TV updates can then use the in-app Update now button."}
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            data-mg-overlay-back="true"
            onClick={dismiss}
            disabled={updateBusy}
            className="min-h-12 rounded-xl border border-white/15 bg-black/25 px-5 py-3 font-semibold text-white outline-none hover:bg-white/5 focus:ring-4 focus:ring-mg-green/40 disabled:opacity-30"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
