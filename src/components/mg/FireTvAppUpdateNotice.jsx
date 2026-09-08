import React, { useCallback, useEffect, useState } from "react";
import { Download, Tv, X } from "lucide-react";

import { nativeFireTvAppInfo } from "@/components/mg/nativeFireTvBridge";

const SESSION_DISMISS_PREFIX = "mg:fire-tv-app-update-dismissed:";
const DEFAULT_DOWNLOADER_ADDRESS = "tinyurl.com/2aofccoa";

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

  if (!enabled || !visible || !release) {
    return null;
  }

  const latestCode = Number(release.versionCode || 0);
  const migration = !nativeInfo;
  const downloaderAddress = String(
    release.downloaderAddress || DEFAULT_DOWNLOADER_ADDRESS
  ).trim();

  const dismiss = () => {
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
              {migration
                ? "Install the dedicated Media God Fire TV app"
                : `Media God Fire TV ${release.versionName || "update"} available`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {migration
                ? "Silk does not support this APK download, so the first Fire TV install uses Downloader instead. This is a one-time move from the older Wix/Base44 app to the dedicated TV app."
                : "A newer Fire TV build is available. Use Downloader to install the update."}
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-2 text-white/60 outline-none hover:bg-white/10 hover:text-white focus:ring-2 focus:ring-mg-green"
            aria-label="Later"
            title="Later"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-mg-green/30 bg-black/25 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Download className="h-5 w-5 text-mg-green" />
            Install with Downloader
          </div>

          <ol className="mt-3 space-y-2 text-sm leading-5 text-white/75">
            <li><span className="font-bold text-white">1.</span> Press Home and open the <span className="font-semibold text-white">Downloader</span> app.</li>
            <li><span className="font-bold text-white">2.</span> Enter this address:</li>
          </ol>

          <div
            className="my-3 rounded-xl border-2 border-mg-green bg-black px-4 py-3 text-center font-mono text-lg font-bold tracking-wide text-mg-green"
            aria-label={`Downloader address ${downloaderAddress}`}
          >
            {downloaderAddress}
          </div>

          <ol start="3" className="space-y-2 text-sm leading-5 text-white/75">
            <li><span className="font-bold text-white">3.</span> Select <span className="font-semibold text-white">Go</span>. Downloader will fetch the Media God APK.</li>
            <li><span className="font-bold text-white">4.</span> Choose <span className="font-semibold text-white">Install</span> when Fire OS asks.</li>
            {migration && (
              <li><span className="font-bold text-white">5.</span> Open <span className="font-semibold text-white">Media God Fire TV</span>. It installs alongside the old app the first time.</li>
            )}
          </ol>

          <p className="mt-3 text-xs leading-5 text-white/50">
            If Downloader is not installed, search for “Downloader” in the Amazon Appstore first. If Fire OS asks for permission, allow Downloader to install unknown apps.
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            autoFocus
            className="min-h-12 rounded-xl border border-white/15 bg-black/25 px-5 py-3 font-semibold text-white outline-none hover:bg-white/5 focus:ring-4 focus:ring-mg-green/40"
          >
            Later
          </button>
        </div>

        <p className="mt-4 text-xs text-white/45">
          No Silk browser download is used. The APK remains hosted from Media God’s permanent Fire TV release.
        </p>
      </div>
    </div>
  );
}
