import React, { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, CalendarDays, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { detectStreamingRegion } from "@/components/mg/streamingRegion";
import { releaseAlertItems, formatReleaseDate } from "@/components/mg/releaseDiscovery";
import { resolveCatalogMediaType } from "@/components/mg/catalogMediaIdentity";

const PREF_KEY = "mg:release-alerts:v1";
const SEEN_KEY = "mg:release-alerts-seen:v1";
const CACHE_MS = 6 * 60 * 60 * 1000;
const batchesCache = new Map();
const DEFAULT = { enabled: false, cinema: true, digital: true, tv: true, episode: true, browser: false };

const readPrefs = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREF_KEY) || "null");
    return saved ? { ...DEFAULT, ...saved } : DEFAULT;
  } catch {
    return DEFAULT;
  }
};
const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const uniqueIds = (items) => {
  const found = new Map();
  for (const item of items || []) {
    const id = String(item?.tmdb_id || item?.tmdbId || "");
    if (!/^\d+$/.test(id)) continue;
    const type = resolveCatalogMediaType(item) === "tv" ? "tv" : "movie";
    found.set(`${type}:${id}`, { tmdb_id: id, media_type: type });
  }
  return [...found.values()];
};
const getReleaseRows = async (items, region) => {
  const requested = uniqueIds(items);
  const results = [];
  for (let i = 0; i < requested.length; i += 24) {
    const chunk = requested.slice(i, i + 24);
    const key = region + ":" + chunk.map((v) => v.media_type + ":" + v.tmdb_id).join("|");
    const cached = batchesCache.get(key);
    if (cached && cached.expires > Date.now()) {
      results.push(...(await cached.promise));
      continue;
    }
    const promise = base44.functions.invoke("getTmdbMovies", {
      release_alerts: chunk,
      media_type: "movie",
      region,
    }).then((response) => {
      const payload = response?.data ?? response ?? {};
      return Array.isArray(payload.alerts) ? payload.alerts : [];
    });
    const entry = { expires: Date.now() + CACHE_MS, promise };
    batchesCache.set(key, entry);
    try {
      results.push(...(await promise));
    } catch (error) {
      batchesCache.delete(key);
      throw error;
    }
    while (batchesCache.size > 30) batchesCache.delete(batchesCache.keys().next().value);
  }
  return results;
};

export default function WatchlistReleaseAlerts({ items = [], onOpen }) {
  const [prefs, setPrefs] = useState(readPrefs);
  const [records, setRecords] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const today = dateKey();
  const activeRegion = detectStreamingRegion();
  const idsKey = useMemo(() => uniqueIds(items).map((v) => v.media_type + ":" + v.tmdb_id).join("|"), [items]);

  const update = (changes) => {
    const next = { ...prefs, ...changes };
    setPrefs(next);
    try { window.localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* optional */ }
  };

  useEffect(() => {
    if (!prefs.enabled || !idsKey) {
      setRecords([]);
      return undefined;
    }
    let alive = true;
    setBusy(true);
    setError("");
    getReleaseRows(items, activeRegion)
      .then((results) => { if (alive) setRecords(results); })
      .catch(() => { if (alive) setError("Release information is temporarily unavailable."); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [idsKey, prefs.enabled, activeRegion, reload]);

  const visibleAlerts = useMemo(
    () => releaseAlertItems(records, today, prefs),
    [records, today, prefs]
  );

  useEffect(() => {
    if (!prefs.enabled || !prefs.browser || !visibleAlerts.length ||
        typeof window === "undefined" || !("Notification" in window) ||
        window.Notification.permission !== "granted" ||
        document.visibilityState === "hidden") return;
    try {
      const seen = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]");
      const ids = new Set(Array.isArray(seen) ? seen : []);
      // Browser notifications are for NEW events on an open, opted-in app.
      // Never send 21 days of backlog as notifications on first enable.
      const newAlerts = visibleAlerts.filter((item) => item.date === today && !ids.has(item.key)).slice(0, 3);
      for (const alert of newAlerts) {
        new window.Notification(alert.title, {
          body: `${alert.label} · ${formatReleaseDate(alert.date)} · Released worldwide`,
          tag: `mg-release-${alert.key}`,
          silent: true,
        });
        ids.add(alert.key);
      }
      if (newAlerts.length) window.localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-250)));
    } catch {
      // WebViews and Fire TV builds may not support browser notifications.
    }
  }, [prefs.enabled, prefs.browser, visibleAlerts, today]);

  const enableBrowser = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const permission = await window.Notification.requestPermission();
      update({ browser: permission === "granted" });
    } catch {
      update({ browser: false });
    }
  };

  return (
    <section data-mg-watchlist-release-alerts="true" className="mb-5 rounded-xl border border-white/10 bg-mg-card/65 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Bell className="h-4 w-4 text-mg-green" /> Release alerts
          </h2>
          <p className="mt-1 text-xs text-white/50">
            Cinema, digital releases, TV premieres and new episodes worldwide.
            In-app checks run when you open your Watchlist; no notifications while the app is closed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => update({ enabled: !prefs.enabled })}
          aria-pressed={prefs.enabled}
          className="min-h-10 rounded-lg border border-mg-green/30 bg-mg-green/10 px-3 py-2 text-xs font-semibold text-mg-green"
        >
          {prefs.enabled ? "Turn alerts off" : "Turn alerts on"}
        </button>
      </div>

      {prefs.enabled && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs text-white/70">
            {[
              ["cinema", "Cinema releases"], ["digital", "Digital releases"],
              ["tv", "TV premieres"], ["episode", "New episodes"],
            ].map(([key, label]) => (
              <label key={key} className="inline-flex min-h-9 items-center gap-1.5">
                <input type="checkbox" checked={prefs[key] !== false}
                  onChange={(event) => update({ [key]: event.target.checked })}
                  className="accent-green-500" />
                {label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
            <button type="button" onClick={() => setReload((v) => v + 1)} disabled={busy}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/15 px-3 disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" /> Check releases
            </button>
            {!prefs.browser && typeof window !== "undefined" && "Notification" in window && (
              <button type="button" onClick={enableBrowser}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/15 px-3">
                <Bell className="h-3.5 w-3.5" /> Enable browser notifications
              </button>
            )}
            {prefs.browser && <span><BellOff className="mr-1 inline h-3 w-3" /> Browser notifications enabled for today's releases</span>}
            <span>Regional provider availability still varies.</span>
          </div>
          {busy && <p className="text-xs text-white/45">Checking saved titles…</p>}
          {error && <p role="status" className="text-xs text-amber-200">{error}</p>}
          {!busy && !error && visibleAlerts.length === 0 && (
            <p className="text-xs text-white/50">No new release alerts from the last 21 days for these saved titles.</p>
          )}
          {visibleAlerts.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleAlerts.map((alert) => (
                <button key={alert.key} type="button"
                  onClick={() => onOpen?.({
                    tmdb_id: alert.tmdbId, id: alert.tmdbId,
                    title: alert.title, media_type: alert.media_type,
                  })}
                  className="min-h-14 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left hover:border-mg-green/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green">
                  <span className="block truncate text-xs font-semibold text-white">{alert.title}</span>
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-mg-green">
                    <CalendarDays className="h-3 w-3" />
                    {alert.label} · {formatReleaseDate(alert.date)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
