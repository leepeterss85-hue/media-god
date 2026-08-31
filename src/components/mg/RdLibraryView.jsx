import React, { useEffect, useState } from "react";
import { Play, RefreshCw, Loader2, HardDrive, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  downloaded: "Ready",
  downloading: "Downloading",
  magnet_conversion: "Converting",
  waiting_files_selection: "Selecting",
  waiting_selection: "Queued",
  magnet_error: "Error",
  files_error: "Error",
  queued: "Queued",
};

export default function RdLibraryView() {
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const player = usePlayer();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("realDebrid", { action: "torrents_list" });
      setTorrents(res.data?.torrents || []);
    } catch (e) {
      setError(e.message || "Could not load your Real-Debrid library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const play = (t) => {
    player.play({
      title: t.filename || "Real-Debrid stream",
      sources: [{ label: "Real-Debrid", type: "rd_torrent", src: t.id }],
    });
  };

  const fmt = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)}GB` : `${(b / 1e6).toFixed(0)}MB`);

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-white">RD Library</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>
      <p className="text-sm text-white/50 mb-6">
        {torrents.length} {torrents.length === 1 ? "torrent" : "torrents"} on your Real-Debrid account
      </p>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-mg-card rounded-lg animate-pulse" />
          ))}
        </div>
      ) : torrents.length === 0 ? (
        <div className="text-center py-20">
          <HardDrive className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">No torrents on your Real-Debrid account yet.</p>
          <p className="text-white/30 text-xs mt-1">
            Add a magnet from the player and it'll show up here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {torrents.map((t) => {
            const ready = t.ready;
            const status = STATUS_LABEL[t.status] || t.status;
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 bg-mg-card border border-white/10 rounded-lg p-3"
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-md flex items-center justify-center shrink-0",
                    ready ? "bg-mg-green/15 text-mg-green" : "bg-white/5 text-white/40"
                  )}
                >
                  <HardDrive className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{t.filename || "Untitled"}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                        ready ? "bg-mg-green/15 text-mg-green" : "bg-white/5 text-white/50"
                      )}
                    >
                      {status}
                    </span>
                    {t.bytes > 0 && <span className="text-[10px] text-white/40">{fmt(t.bytes)}</span>}
                    {!ready && t.progress > 0 && (
                      <span className="text-[10px] text-white/40">{Math.round(t.progress)}%</span>
                    )}
                  </div>
                  {!ready && t.progress > 0 && (
                    <div className="h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-mg-green" style={{ width: `${Math.min(100, t.progress)}%` }} />
                    </div>
                  )}
                </div>
                {ready && (
                  <button
                    onClick={() => play(t)}
                    className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-lg hover:bg-mg-green-dim shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" /> Play
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}