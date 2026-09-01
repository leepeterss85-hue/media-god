import React, { useEffect, useState, useRef } from "react";
import { Activity, RefreshCw, Loader2, AlertCircle, Play, Trash2, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  downloading: "Downloading",
  magnet_conversion: "Converting",
  waiting_files_selection: "Selecting",
  waiting_selection: "Queued",
  queued: "Queued",
  downloaded: "Ready",
  magnet_error: "Error",
  files_error: "Error",
};

// A torrent counts as "active" if it's not yet ready and not in an error state.
const isActive = (t) => !t.ready && !(t.status || "").includes("error");

export default function DebridDashboard() {
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const player = usePlayer();
  const timerRef = useRef(null);

  const load = async () => {
    setError("");
    try {
      const res = await base44.functions.invoke("realDebrid", { action: "torrents_list" });
      setTorrents(res.data?.torrents || []);
    } catch (e) {
      setError(e.message || "Could not load your Real-Debrid downloads.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Auto-refresh while there are active (downloading) torrents, so progress
  // updates live without the user tapping Refresh.
  useEffect(() => {
    const active = torrents.filter(isActive);
    if (active.length === 0) return;
    timerRef.current = setTimeout(load, 5000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [torrents]);

  const active = torrents.filter(isActive);
  const ready = torrents.filter((t) => t.ready);
  const errored = torrents.filter((t) => (t.status || "").includes("error"));

  const play = (t) => {
    player.play({
      title: t.filename || "Real-Debrid stream",
      sources: [{ label: "Real-Debrid", type: "rd_torrent", src: t.id }],
    });
  };

  const remove = async (t) => {
    setBusy(true);
    try {
      await base44.functions.invoke("realDebrid", { action: "torrent_delete", torrent_id: t.id });
      setTorrents((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(e.message || "Could not delete torrent.");
    } finally {
      setBusy(false);
    }
  };

  const fmt = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)}GB` : `${(b / 1e6).toFixed(0)}MB`);

  const stats = [
    { label: "Downloading", value: active.length, color: "text-mg-green" },
    { label: "Ready", value: ready.length, color: "text-white" },
    { label: "Errors", value: errored.length, color: "text-red-400" },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-mg-green" />
          <h1 className="text-xl font-bold text-white">Active Downloads</h1>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>
      <p className="text-sm text-white/50 mb-4">
        Live progress for torrents on your Real-Debrid account
      </p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-mg-card border border-white/10 rounded-lg p-3">
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-[10px] text-white/40 uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-mg-card rounded-lg animate-pulse" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-10 h-10 text-mg-green/40 mx-auto mb-3" />
          <p className="text-white/60 text-sm font-medium">No active downloads</p>
          <p className="text-white/30 text-xs mt-1">
            Torrents you add from the player will show their progress here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((t) => {
            const status = STATUS_LABEL[t.status] || t.status;
            return (
              <div key={t.id} className="bg-mg-card border border-white/10 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-mg-green/15 text-mg-green flex items-center justify-center shrink-0">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{t.filename || "Untitled"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-mg-green/15 text-mg-green">
                        {status}
                      </span>
                      {t.bytes > 0 && <span className="text-[10px] text-white/40">{fmt(t.bytes)}</span>}
                      {t.progress > 0 && (
                        <span className="text-[10px] text-white/40">{Math.round(t.progress)}%</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(t)}
                    disabled={busy}
                    title="Cancel & remove"
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full mt-2.5 overflow-hidden">
                  <div
                    className="h-full bg-mg-green transition-all duration-500"
                    style={{ width: `${Math.min(100, t.progress || 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ready.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-white/70 mb-3">Recently Ready</h2>
          <div className="flex flex-col gap-2">
            {ready.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-mg-card border border-white/10 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 text-mg-green shrink-0" />
                <p className="text-sm text-white truncate flex-1 min-w-0">{t.filename || "Untitled"}</p>
                <button
                  onClick={() => play(t)}
                  className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-mg-green-dim shrink-0"
                >
                  <Play className="w-3 h-3 fill-black" /> Play
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}