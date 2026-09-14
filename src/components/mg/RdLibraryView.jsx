import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import {
  DEBRID_STATUS_LABEL as STATUS_LABEL,
  debridAddedTime as addedTime,
  debridBucket as bucketFor,
  debridProgress,
  formatDebridBytes as formatBytes,
  formatDebridDate as formatDate,
  formatDebridEta as formatEta,
  formatDebridSpeed as formatSpeed,
  isDebridActive as isActive,
  isDebridError as isError,
  isDebridReady as isReady,
  isDebridRetryableError as isRetryableError,
  normaliseDebridStatus as normaliseStatus,
} from "@/components/mg/debridLibraryUtils";
import { cn } from "@/lib/utils";

export default function RdLibraryView() {
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [clearingErrors, setClearingErrors] = useState(false);
  const [clearingReady, setClearingReady] = useState(false);
  const [retryingErrors, setRetryingErrors] = useState(false);
  const [tab, setTab] = useState("ready");
  const [query, setQuery] = useState("");
  const timerRef = useRef(null);
  const player = usePlayer();

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");

    try {
      const response = await base44.functions.invoke("realDebrid", {
        action: "torrents_list",
      });
      setTorrents(Array.isArray(response?.data?.torrents) ? response.data.torrents : []);
    } catch (loadError) {
      setError(loadError?.message || "Could not load your Real-Debrid library.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const ready = useMemo(() => torrents.filter(isReady), [torrents]);
  const active = useMemo(() => torrents.filter(isActive), [torrents]);
  const errored = useMemo(() => torrents.filter(isError), [torrents]);
  const retryableErrors = useMemo(
    () => errored.filter(isRetryableError),
    [errored]
  );

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (active.length === 0) return undefined;

    timerRef.current = window.setTimeout(() => {
      load({ silent: true });
    }, 5000);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [active.length, torrents]);

  const visible = useMemo(() => {
    const wanted = query.trim().toLowerCase();

    return torrents
      .filter((torrent) => {
        if (tab !== "all" && bucketFor(torrent) !== tab) return false;
        if (!wanted) return true;

        return `${torrent?.filename || ""} ${torrent?.status || ""}`
          .toLowerCase()
          .includes(wanted);
      })
      .sort((a, b) => addedTime(b) - addedTime(a));
  }, [query, tab, torrents]);

  const play = (torrent) => {
    const torrentId = String(torrent?.id || "").trim();

    if (!torrentId) {
      setError("This Real-Debrid item is missing its torrent ID.");
      return;
    }

    player.play({
      title: torrent?.filename || "Real-Debrid stream",
      hasRd: true,
      hasDebrid: true,
      skipAddonLookup: true,
      skipRdLookup: true,
      sources: [
        {
          label: torrent?.filename || "Real-Debrid Library",
          type: "rd_torrent",
          src: torrentId,
          rdTorrentId: torrentId,
          viaRealDebrid: true,
          debridProvider: "realdebrid",
          debridCached: true,
        },
      ],
    });
  };

  const remove = async (torrent) => {
    const torrentId = String(torrent?.id || "").trim();
    if (!torrentId || busyId) return;

    setBusyId(torrentId);
    setError("");

    try {
      await base44.functions.invoke("realDebrid", {
        action: "torrent_delete",
        torrent_id: torrentId,
      });
      setTorrents((current) =>
        current.filter((item) => String(item?.id || "") !== torrentId)
      );
    } catch (removeError) {
      setError(removeError?.message || "Could not remove that Real-Debrid item.");
    } finally {
      setBusyId("");
    }
  };

  const retryFailed = async (torrent) => {
    const torrentId = String(torrent?.id || "").trim();
    if (!torrentId || busyId || !isRetryableError(torrent)) return;

    setBusyId(torrentId);
    setError("");

    try {
      const response = await base44.functions.invoke("realDebrid", {
        action: "retry_torrent",
        torrent_id: torrentId,
      });
      const data = response?.data ?? response ?? {};

      if (data?.restarted !== true || data?.error) {
        throw new Error(data?.error || "Real-Debrid could not restart this torrent.");
      }

      setTab("active");
      await load({ silent: true });
    } catch (retryError) {
      setError(retryError?.message || "Could not retry that Real-Debrid item.");
      await load({ silent: true });
    } finally {
      setBusyId("");
    }
  };

  const retryAllErrors = async () => {
    if (retryingErrors || retryableErrors.length === 0 || busyId) return;

    setRetryingErrors(true);
    setError("");

    let restarted = 0;
    let failed = 0;

    for (const torrent of retryableErrors) {
      const torrentId = String(torrent?.id || "").trim();
      if (!torrentId) continue;

      try {
        const response = await base44.functions.invoke("realDebrid", {
          action: "retry_torrent",
          torrent_id: torrentId,
        });
        const data = response?.data ?? response ?? {};
        if (data?.restarted === true && !data?.error) restarted += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }

    await load({ silent: true });
    if (restarted > 0) setTab("active");
    if (failed > 0) {
      setError(
        `${restarted} failed item${restarted === 1 ? " was" : "s were"} restarted; ${failed} could not be retried.`
      );
    }
    setRetryingErrors(false);
  };

  const clearReady = async () => {
    if (clearingReady || ready.length === 0 || busyId) return;

    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        `Remove ${ready.length} completed Real-Debrid item${ready.length === 1 ? "" : "s"} from your library?`
      );

    if (!confirmed) return;

    setClearingReady(true);
    setError("");

    for (const torrent of ready) {
      const torrentId = String(torrent?.id || "").trim();
      if (!torrentId) continue;

      try {
        await base44.functions.invoke("realDebrid", {
          action: "torrent_delete",
          torrent_id: torrentId,
        });
      } catch {
        // Continue removing the remaining completed items.
      }
    }

    await load({ silent: true });
    setClearingReady(false);
  };

  const clearErrors = async () => {
    if (clearingErrors || errored.length === 0) return;

    setClearingErrors(true);
    setError("");

    for (const torrent of errored) {
      const torrentId = String(torrent?.id || "").trim();
      if (!torrentId) continue;

      try {
        await base44.functions.invoke("realDebrid", {
          action: "torrent_delete",
          torrent_id: torrentId,
        });
      } catch {
        // Keep clearing the remaining stale errors.
      }
    }

    await load({ silent: true });
    setClearingErrors(false);
  };

  const tabs = [
    { id: "ready", label: "Ready", count: ready.length, icon: CheckCircle2 },
    { id: "active", label: "Active", count: active.length, icon: Activity },
    { id: "errors", label: "Errors", count: errored.length, icon: XCircle },
    { id: "all", label: "All", count: torrents.length, icon: HardDrive },
  ];

  return (
    <div data-mg-rd-library-view="true" className="p-4 md:p-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-mg-green" />
            <h1 className="text-xl font-bold text-white">RD Library</h1>
          </div>
          <p className="mt-1 text-sm text-white/50">
            Browse completed Real-Debrid items, current transfers and account errors.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {ready.length > 0 && (
            <button
              type="button"
              onClick={clearReady}
              disabled={clearingReady || clearingErrors || retryingErrors || Boolean(busyId)}
              className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              {clearingReady ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Clear completed ({ready.length})
            </button>
          )}

          {retryableErrors.length > 0 && (
            <button
              type="button"
              onClick={retryAllErrors}
              disabled={retryingErrors || clearingErrors || clearingReady || Boolean(busyId)}
              className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-mg-green/25 bg-mg-green/10 px-3 py-2 text-xs font-semibold text-mg-green hover:bg-mg-green/15 disabled:opacity-50"
            >
              {retryingErrors ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Retry errors ({retryableErrors.length})
            </button>
          )}

          {errored.length > 0 && (
            <button
              type="button"
              onClick={clearErrors}
              disabled={clearingErrors || clearingReady || retryingErrors || Boolean(busyId)}
              className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/15 disabled:opacity-50"
            >
              {clearingErrors ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Clear errors ({errored.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-4">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition",
                tab === item.id
                  ? "border-mg-green/50 bg-mg-green/10"
                  : "border-white/10 bg-mg-card hover:bg-white/5"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-xl font-bold", item.id === "errors" ? "text-red-300" : "text-white") }>
                  {item.count}
                </p>
                <Icon className={cn("w-4 h-4", item.id === "ready" ? "text-mg-green" : item.id === "errors" ? "text-red-300" : "text-white/40")} />
              </div>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">
                {item.label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your Real-Debrid library…"
          className="min-h-11 w-full rounded-lg border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green/50"
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 bg-mg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-mg-card/60 py-16 text-center">
          <HardDrive className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/50 text-sm">
            {query.trim()
              ? "No library items match your search."
              : tab === "ready"
                ? "No completed Real-Debrid items yet."
                : tab === "active"
                  ? "No active transfers."
                  : tab === "errors"
                    ? "No Real-Debrid errors."
                    : "Your Real-Debrid library is empty."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((torrent) => {
            const readyNow = isReady(torrent);
            const errorNow = isError(torrent);
            const progress = debridProgress(torrent);
            const status = STATUS_LABEL[normaliseStatus(torrent)] || torrent?.status || "Pending";
            const size = formatBytes(torrent?.bytes);
            const added = formatDate(torrent?.added);
            const speed = formatSpeed(torrent?.speed);
            const eta = formatEta(torrent);
            const itemBusy = String(torrent?.id || "") === busyId;
            const canRetry = isRetryableError(torrent);

            return (
              <div
                key={torrent.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-mg-card p-3 sm:p-4"
              >
                <div
                  className={cn(
                    "w-11 h-11 rounded-lg flex items-center justify-center shrink-0",
                    readyNow
                      ? "bg-mg-green/15 text-mg-green"
                      : errorNow
                        ? "bg-red-500/10 text-red-300"
                        : "bg-white/5 text-white/40"
                  )}
                >
                  {readyNow ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : errorNow ? (
                    <XCircle className="w-5 h-5" />
                  ) : (
                    <Activity className="w-5 h-5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {torrent.filename || "Untitled"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                        readyNow
                          ? "bg-mg-green/15 text-mg-green"
                          : errorNow
                            ? "bg-red-500/10 text-red-300"
                            : "bg-white/5 text-white/50"
                      )}
                    >
                      {status}
                    </span>
                    {size && <span className="text-[10px] text-white/40">{size}</span>}
                    {added && <span className="text-[10px] text-white/35">Added {added}</span>}
                    {!readyNow && !errorNow && progress > 0 && (
                      <span className="text-[10px] text-white/40">{Math.round(progress)}%</span>
                    )}
                    {!readyNow && !errorNow && speed && (
                      <span className="text-[10px] text-white/40">{speed}</span>
                    )}
                    {!readyNow && !errorNow && eta && (
                      <span className="text-[10px] text-white/40">ETA {eta}</span>
                    )}
                  </div>

                  {!readyNow && !errorNow && (
                    <div className="h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-mg-green transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {readyNow && (
                    <button
                      type="button"
                      onClick={() => play(torrent)}
                      className="min-h-10 flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-lg hover:bg-mg-green-dim"
                    >
                      <Play className="w-3.5 h-3.5 fill-black" />
                      Play
                    </button>
                  )}

                  {errorNow && canRetry && (
                    <button
                      type="button"
                      onClick={() => retryFailed(torrent)}
                      disabled={Boolean(busyId) || clearingErrors || clearingReady || retryingErrors}
                      className="min-h-10 flex items-center gap-1.5 rounded-lg border border-mg-green/25 bg-mg-green/10 px-3 py-2 text-xs font-semibold text-mg-green hover:bg-mg-green/15 disabled:opacity-40"
                    >
                      {itemBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Retry
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => remove(torrent)}
                    disabled={Boolean(busyId) || clearingErrors || clearingReady || retryingErrors}
                    title="Remove from Real-Debrid"
                    aria-label="Remove from Real-Debrid"
                    className="flex items-center justify-center w-10 h-10 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    {itemBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
