import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clipboard,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { nativeFireTvAppInfo } from "@/components/mg/nativeFireTvBridge";
import {
  clearDiagnosticErrors,
  readDiagnosticErrors,
  sanitizeDiagnosticText,
} from "@/components/mg/diagnostics";
import { readUxPreferences } from "@/components/mg/uxPreferences";
import { cn } from "@/lib/utils";

const platformLabel = (info) => {
  if (!info) return "Hosted web";
  if (info.platform === "fire-tv") return "Fire TV / Fire Stick";
  if (info.platform === "android-mobile") return "Android phone / tablet";
  return String(info.platform || "Native app");
};

const yesNo = (value) => (value ? "Yes" : "No");

export default function DiagnosticsView() {
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [addonCount, setAddonCount] = useState(null);
  const [activeAddonCount, setActiveAddonCount] = useState(null);
  const [rdStatus, setRdStatus] = useState(null);
  const [signedIn, setSignedIn] = useState(null);
  const [errors, setErrors] = useState(readDiagnosticErrors);
  const [checkedAt, setCheckedAt] = useState("");

  const appInfo = useMemo(() => nativeFireTvAppInfo(), []);
  const ux = readUxPreferences();

  const refresh = useCallback(async () => {
    setLoading(true);

    const [addonsResult, rdResult, meResult] = await Promise.allSettled([
      base44.entities.Addon.list("-created_date", 200),
      base44.functions.invoke("realDebridAuth", { action: "status" }),
      base44.auth.me(),
    ]);

    if (addonsResult.status === "fulfilled") {
      const rows = Array.isArray(addonsResult.value) ? addonsResult.value : [];
      setAddonCount(rows.length);
      setActiveAddonCount(rows.filter((item) => item?.active !== false).length);
    } else {
      setAddonCount(null);
      setActiveAddonCount(null);
    }

    if (rdResult.status === "fulfilled") {
      const status = rdResult.value?.data || {};
      setRdStatus({
        connected: Boolean(status?.connected || status?.valid),
        message: sanitizeDiagnosticText(status?.error || ""),
      });
    } else {
      setRdStatus({ connected: false, message: "Status check unavailable" });
    }

    setSignedIn(meResult.status === "fulfilled" && Boolean(meResult.value));
    setErrors(readDiagnosticErrors());
    setCheckedAt(new Date().toISOString());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rows = [
    ["Platform", platformLabel(appInfo)],
    [
      "Installed version",
      appInfo
        ? `${appInfo.versionName || "Unknown"}${Number(appInfo.versionCode || 0) > 0 ? ` (code ${appInfo.versionCode})` : ""}`
        : "Hosted web",
    ],
    ["Signed in", signedIn == null ? "Checking…" : yesNo(signedIn)],
    [
      "Real-Debrid",
      rdStatus == null
        ? "Checking…"
        : rdStatus.connected
          ? "Connected"
          : "Not connected",
    ],
    [
      "Addons",
      addonCount == null
        ? "Unavailable"
        : `${activeAddonCount} active / ${addonCount} installed`,
    ],
    [
      "Network",
      typeof navigator === "undefined"
        ? "Unknown"
        : navigator.onLine
          ? "Online"
          : "Offline",
    ],
    [
      "Viewport",
      typeof window === "undefined"
        ? "Unknown"
        : `${window.innerWidth} × ${window.innerHeight}`,
    ],
    ["Text size", ux.textScale],
    ["High contrast", yesNo(ux.highContrast)],
    ["Reduced motion", yesNo(ux.reducedMotion)],
    ["Compact cards", yesNo(ux.compactCards)],
  ];

  const report = [
    "Media God diagnostics",
    `Generated: ${new Date().toISOString()}`,
    ...rows.map(([label, value]) => `${label}: ${sanitizeDiagnosticText(value)}`),
    `Recent errors: ${errors.length}`,
    ...errors.slice(0, 10).map(
      (item, index) =>
        `${index + 1}. [${sanitizeDiagnosticText(item.context)}] ${sanitizeDiagnosticText(item.message)}`
    ),
  ].join("\n");

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      data-mg-diagnostics-view="true"
      className="w-full max-w-5xl p-4 md:p-6 3xl:p-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-mg-green" />
            <h1 className="text-2xl font-black text-white">Diagnostics</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            Device, app and account-health information for troubleshooting.
            Private tokens, addon URLs, stream URLs and passwords are never included.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyReport}
            className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-mg-green px-4 py-2 text-sm font-bold text-black"
          >
            {copied ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Clipboard className="h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy report"}
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-mg-card p-4"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-white/35">
              {label}
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-white/80">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-mg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/5 p-4">
          <div>
            <h2 className="text-sm font-bold text-white">Recent non-sensitive errors</h2>
            <p className="mt-1 text-xs text-white/35">
              Stored locally on this device. URLs and credential-like values are redacted.
            </p>
          </div>
          {errors.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearDiagnosticErrors();
                setErrors([]);
              }}
              className="min-h-10 inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-xs font-semibold text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        {errors.length === 0 ? (
          <div className="flex items-center gap-2 p-5 text-sm text-white/45">
            <ShieldCheck className="h-4 w-4 text-mg-green" />
            No recent application errors recorded.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {errors.map((item, index) => (
              <div key={`${item.time}-${index}`} className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/30">
                  <span>{item.time}</span>
                  <span>•</span>
                  <span>{item.context}</span>
                </div>
                <p className="mt-1 break-words text-sm text-white/65">
                  {item.message}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-white/35">
        {typeof navigator !== "undefined" && navigator.onLine ? (
          <Wifi className="h-4 w-4 text-mg-green" />
        ) : (
          <WifiOff className="h-4 w-4 text-amber-300" />
        )}
        Last checked: {checkedAt || "Not yet"}
      </div>
    </section>
  );
}
