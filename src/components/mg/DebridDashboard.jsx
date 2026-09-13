import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  downloading: "Downloading",
  magnet_conversion: "Converting",
  waiting_files_selection: "Selecting files",
  waiting_selection: "Queued",
  queued: "Queued",
  downloaded: "Ready",
  magnet_error: "Magnet error",
  files_error: "Files error",
  virus: "Blocked",
  dead: "Unavailable",
};

const normaliseStatus = (torrent) =>
  String(torrent?.status || "").trim().toLowerCase();

const isReady = (torrent) =>
  torrent?.ready === true || normaliseStatus(torrent) === "downloaded";

const isError = (torrent) =>
  /error|dead|virus|invalid/i.test(normaliseStatus(torrent));

const isActive = (torrent) => !isReady(torrent) && !isError(torrent);

const progressFor = (torrent) => {
  const value = Number(torrent?.progress || 0);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
};

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
};

const downloadBucket = (torrent) => {
  if (isReady(torrent)) return "ready";
  if (isError(torrent)) return "errors";
  return "active";
};

export default function DebridDashboard() {
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [clearingErrors, setClearingErrors] = useState(false);
  const [tab, setTab] = useState("active");
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
      setError(loadError?.message || "Could not load your Real-Debrid downloads.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const active = useMemo(() => torrents.filter(isActive), [torrents]);
  const ready = useMemo(() => torrents.filter(isReady), [torrents]);
  const errored = useMemo(() => torrents.filter(isError), [torrents]);

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
          label: torrent?.filename || "Real-Debrid Download",
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
      setTorrents((current) => current.filter((item) => String(item?.id) !== torrentId));
    } catch (removeError) {
      setError(removeError?.message || "Could not remove that Real-Debrid item.");
    } finally {
      setBusyId("");
    }
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
        // Continue clearing the rest even if one stale record resists deletion.
      }
    }

    await load({ silent: true });
    setClearingErrors(false);
  };

  const visible = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();

    return torrents.filter((torrent) => {
      const bucket = downloadBucket(torrent);
      if (tab !== "all" && bucket !== tab) return false;
      if (!normalisedQuery) return true;

      return `${torrent?.filename || ""} ${torrent?.status || ""}`
        .toLowerCase()
        .includes(normalisedQuery);
    });
  }, [torrents, query, tab]);

  const stats = [
    {
      id: "active",
      label: "Active",
      value: active.length,
      icon: Activity,
      className: "text-mg-green",
    },
    {
      id: "ready",
      label: "Ready",
      value: ready.length,
      icon: CheckCircle2,
      className: "text-white",
    },
    {
      id: "errors",
      label: "Errors",
      value: errored.length,
      icon: XCircle,
      className: "text-red-400",
    },
  ];

  return (
    <div data-mg-downloads-view="true" className="p-4 md:p-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-mg-green" />
            <h1 className="text-xl font-bold text-white">Downloads</h1>
          </div>
          <p className="mt-1 text-sm text-white/50">
            Track Real-Debrid transfers, play completed items and clear failed jobs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {errored.length > 0 && (
            <button
              type="button"
              onClick={clearErrors}
              disabled={clearingErrors || Boolean(busyId)}
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
            className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-50"
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

      <div className="grid grid-cols-3 gap-2 mb-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.id}
              type="button"
              onClick={() => setTab(stat.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition",
                tab === stat.id
                  ? "border-mg-green/50 bg-mg-green/10"
                  : "border-white/10 bg-mg-card hover:bg-white/5"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-2xl font-bold", stat.className)}>{stat.value}</p>
                <Icon className={cn("w-4 h-4", stat.className)} />
              </div>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">
                {stat.label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search downloads…"
            className="min-h-11 w-full rounded-lg border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green/50"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {[
            ["active", "Active"],
            ["ready", "Ready"],
            ["errors", "Errors"],
            ["all", "All"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "min-h-11 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition",
                tab === id
                  ? "bg-mg-green text-black"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
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
            <div key={index} className="h-20 rounded-lg bg-mg-card animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-mg-card/60 px-4 py-16 text-center">
          {tab === "active" ? (
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-mg-green/40" />
          ) : (
            <Clock3 className="mx-auto mb-3 h-10 w-10 text-white/20" />
          )}
          <p className="text-sm font-medium text-white/60">
            {query.trim()
              ? "No downloads match your search."
              : tab === "active"
                ? "No active downloads."
                : tab === "ready"
                  ? "No completed downloads yet."
                  : tab === "errors"
                    ? "No failed downloads."
                    : "No Real-Debrid downloads found."}
          </p>
          {tab === "active" && !query.trim() && (
            <p className="mt-1 text-xs text-white/30">
              Torrents started from the player will appear here automatically.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((torrent) => {
            const readyNow = isReady(torrent);
            const errorNow = isError(torrent);
            const progress = progressFor(torrent);
            const status = STATUS_LABEL[normaliseStatus(torrent)] || torrent?.status || "Pending";
            const size = formatBytes(torrent?.bytes);
            const removing = String(torrent?.id || "") === busyId;

            return (
              <div
                key={torrent.id}
                className="rounded-xl border border-white/10 bg-mg-card p-3 sm:p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                      readyNow
                        ? "bg-mg-green/15 text-mg-green"
                        : errorNow
                          ? "bg-red-500/10 text-red-300"
                          : "bg-white/5 text-white/50"
                    )}
                  >
                    {readyNow ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : errorNow ? (
                      <XCircle className="h-5 w-5" />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {torrent?.filename || "Untitled download"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          readyNow
                            ? "bg-mg-green/15 text-mg-green"
                            : errorNow
                              ? "bg-red-500/10 text-red-300"
                              : "bg-white/5 text-white/55"
                        )}
                      >
                        {status}
                      </span>
                      {size && <span className="text-[10px] text-white/40">{size}</span>}
                      {!readyNow && !errorNow && (
                        <span className="text-[10px] text-white/40">{Math.round(progress)}%</span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {readyNow && (
                      <button
                        type="button"
                        onClick={() => play(torrent)}
                        className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-mg-green px-3 py-2 text-xs font-semibold text-black hover:bg-mg-green-dim"
                      >
                        <Play className="h-3.5 w-3.5 fill-black" />
                        Play
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => remove(torrent)}
                      disabled={Boolean(busyId) || clearingErrors}
                      title={readyNow ? "Remove from Real-Debrid" : "Cancel and remove"}
                      aria-label={readyNow ? "Remove completed download" : "Cancel and remove download"}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-white/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                    >
                      {removing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {!readyNow && !errorNow && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full bg-mg-green transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
