import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Smartphone, X } from "lucide-react";

import {
  nativeFireTvAppInfo,
  nativeFireTvSelfUpdateAvailable,
  openNativeFireTvExternalUrl,
  startNativeFireTvUpdate,
} from "@/components/mg/nativeFireTvBridge";

const SESSION_DISMISS_PREFIX = "mg:android-mobile-app-update-dismissed:";

const looksLikeAndroidMobile = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const root = document.documentElement;
  const body = document.body;
  const ua = String(navigator.userAgent || "");

  return (
    root?.classList?.contains("mg-android-mobile") ||
    body?.classList?.contains("mg-android-mobile") ||
    /MediaGodMobile|AndroidMobile/i.test(ua)
  );
};

export default function AndroidMobileAppUpdateNotice({ enabled = true }) {
  const [release, setRelease] = useState(null);
  const [nativeInfo, setNativeInfo] = useState(null);
  const [visible, setVisible] = useState(false);
  const [updateState, setUpdateState] = useState({
    status: "idle",
    message: "",
    progress: 0,
  });

  const checkForUpdate = useCallback(async () => {
    if (!enabled || !looksLikeAndroidMobile()) {
      setVisible(false);
      return;
    }

    try {
      const response = await fetch(`/android-mobile-update.json?t=${Date.now()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const nextRelease = await response.json();
      const latestCode = Number(nextRelease?.versionCode || 0);
      const appInfo = nativeFireTvAppInfo();
      const currentCode = Number(appInfo?.versionCode || 0);

      if (!latestCode || appInfo?.platform !== "android-mobile") {
        return;
      }

      const dismissKey = `${SESSION_DISMISS_PREFIX}${latestCode}`;
      if (window.sessionStorage?.getItem(dismissKey) === "1") {
        return;
      }

      setRelease(nextRelease);
      setNativeInfo(appInfo);
      setVisible(currentCode < latestCode);
    } catch {
      // Update checks must never interfere with the Media God UI.
    }
  }, [enabled]);

  useEffect(() => {
    checkForUpdate();

    const handleDetected = () => {
      window.setTimeout(checkForUpdate, 150);
    };

    window.addEventListener("mg:android-mobile-detected", handleDetected);

    return () => {
      window.removeEventListener("mg:android-mobile-detected", handleDetected);
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

    window.addEventListener("mg:android-mobile-update-status", handleUpdateStatus);

    return () => {
      window.removeEventListener(
        "mg:android-mobile-update-status",
        handleUpdateStatus
      );
    };
  }, []);

  const latestCode = Number(release?.versionCode || 0);

  const canSelfUpdate = useMemo(
    () =>
      Boolean(
        nativeInfo?.platform === "android-mobile" &&
          nativeInfo?.selfUpdateSupported &&
          nativeFireTvSelfUpdateAvailable() &&
          release?.apkUrl
      ),
    [nativeInfo, release]
  );

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
      // Session storage is optional in some WebViews.
    }

    setVisible(false);
  };

  const startUpdate = () => {
    if (!canSelfUpdate || updateBusy) {
      return;
    }

    setUpdateState({
      status: "starting",
      message: "Starting Media God Mobile update…",
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
          ? "Another Media God Mobile update is already running."
          : "The in-app updater could not start. You can open the GitHub download instead.",
      progress: 0,
    });
  };

  const openFallback = () => {
    const target = String(release?.apkUrl || release?.releaseUrl || "").trim();
    if (!target) {
      return;
    }

    if (!openNativeFireTvExternalUrl(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  if (!enabled || !visible || !release) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[10030] flex items-end justify-center bg-black/80 p-3 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Android mobile app update available"
      data-mg-android-mobile-update="true"
    >
      <div className="w-full max-w-lg rounded-3xl border border-cyan-400/35 bg-mg-surface p-5 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-400 text-black">
            <Smartphone className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
              Android phone & tablet update
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">
              Media God Mobile {release.versionName || "update"} available
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {canSelfUpdate
                ? "Media God Mobile can download this update itself. Android will ask you to approve installation before anything is replaced."
                : "Open the Android Mobile APK from GitHub to update this installation."}
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            disabled={updateBusy}
            className="rounded-lg p-2 text-white/60 outline-none hover:bg-white/10 hover:text-white focus:ring-2 focus:ring-cyan-300 disabled:opacity-30"
            aria-label="Later"
            title="Later"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {canSelfUpdate && (
          <div className="mt-5 rounded-2xl border border-cyan-400/30 bg-black/25 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              {updateBusy || updateState.status === "starting" ? (
                <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
              ) : (
                <Download className="h-5 w-5 text-cyan-300" />
              )}
              Update inside Media God Mobile
            </div>

            <p className="mt-2 text-sm leading-5 text-white/65">
              {updateState.message ||
                "Tap Update now. Media God Mobile will securely download the signed APK and hand it to Android's installer."}
            </p>

            {(updateState.status === "downloading" ||
              updateState.status === "downloaded") && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-cyan-300 transition-[width] duration-300"
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
              <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                {updateState.status === "permission"
                  ? "Android has opened the one-time “Install unknown apps” permission for Media God Mobile. Allow it, then return to Media God Mobile."
                  : "Installation permission is still disabled. Tap Allow installation to try again."}
              </p>
            )}

            {updateState.status === "error" && (
              <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs leading-5 text-red-100">
                {updateState.message}
              </p>
            )}

            <button
              type="button"
              onClick={startUpdate}
              disabled={updateBusy || updateState.status === "starting"}
              autoFocus
              className="mt-4 min-h-12 w-full rounded-2xl bg-cyan-300 px-5 py-3 font-bold text-black outline-none hover:brightness-110 focus:ring-4 focus:ring-cyan-300/40 disabled:cursor-wait disabled:opacity-60"
            >
              {updateBusy || updateState.status === "starting"
                ? "Updating…"
                : updateState.status === "permission_required"
                  ? "Allow installation"
                  : `Update now${release.versionName ? ` to ${release.versionName}` : ""}`}
            </button>
          </div>
        )}

        {!canSelfUpdate && (
          <button
            type="button"
            onClick={openFallback}
            className="mt-5 min-h-12 w-full rounded-2xl bg-cyan-300 px-5 py-3 font-bold text-black outline-none hover:brightness-110 focus:ring-4 focus:ring-cyan-300/40"
          >
            Open Android Mobile APK
          </button>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            disabled={updateBusy}
            className="min-h-11 rounded-xl border border-white/15 bg-black/25 px-5 py-2.5 font-semibold text-white outline-none hover:bg-white/5 focus:ring-4 focus:ring-cyan-300/30 disabled:opacity-30"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
