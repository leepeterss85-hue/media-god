import React, { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Tv, X } from "lucide-react";

import {
  nativeFireTvAppInfo,
  openNativeFireTvExternalUrl,
} from "@/components/mg/nativeFireTvBridge";

const SESSION_DISMISS_PREFIX = "mg:fire-tv-app-update-dismissed:";

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

const openInBrowser = (url) => {
  const target = String(url || "").trim();

  if (!/^https?:\/\//i.test(target)) {
    return false;
  }

  if (openNativeFireTvExternalUrl(target)) {
    return true;
  }

  try {
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (opened) return true;
  } catch {
    // Fall through to a normal navigation below.
  }

  try {
    window.location.assign(target);
    return true;
  } catch {
    return false;
  }
};

export default function FireTvAppUpdateNotice({ enabled = true }) {
  const [release, setRelease] = useState(null);
  const [nativeInfo, setNativeInfo] = useState(null);
  const [visible, setVisible] = useState(false);
  const [opening, setOpening] = useState(false);

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

      if (!latestCode || !/^https?:\/\//i.test(String(nextRelease?.apkUrl || ""))) {
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

  const install = () => {
    setOpening(true);
    const opened = openInBrowser(release.apkUrl);

    if (!opened) {
      setOpening(false);
      return;
    }

    window.setTimeout(() => setOpening(false), 1200);
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
                ? "Dedicated Media God Fire TV app available"
                : `Media God Fire TV ${release.versionName || "update"} available`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {migration
                ? "This older Wix/Base44 APK cannot be replaced in place because it has a different Android signing key. The new Fire TV version will install alongside it the first time, then becomes the Fire Stick version to use."
                : release.message ||
                  "A newer Fire TV build is ready. Download it and Android will open the normal install/update screen."}
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

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={install}
            disabled={opening}
            autoFocus
            className="flex min-h-12 items-center gap-2 rounded-xl bg-mg-green px-5 py-3 font-bold text-black outline-none transition disabled:opacity-60 focus:ring-4 focus:ring-mg-green/40"
          >
            {opening ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}
            {migration ? "Install Fire TV version" : "Download update"}
          </button>

          <button
            type="button"
            onClick={dismiss}
            className="min-h-12 rounded-xl border border-white/15 bg-black/25 px-5 py-3 font-semibold text-white outline-none hover:bg-white/5 focus:ring-2 focus:ring-mg-green"
          >
            Later
          </button>
        </div>

        <p className="mt-4 text-xs text-white/45">
          Android/Fire OS will always ask you to confirm an APK installation. Media God does not bypass that security screen.
        </p>
      </div>
    </div>
  );
}
