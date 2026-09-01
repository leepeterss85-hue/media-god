import React, { useEffect, useState, useCallback } from "react";
import { Play, RefreshCw, Loader2, HardDrive, AlertCircle, Filter } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { cn } from "@/lib/utils";

// Unified cloud-library view: lists torrents from every connected debrid
// service (Real-Debrid + AllDebrid + Premiumize + DebridLink) in one feed,
// with a service filter. Ready items play directly — RD via its dedicated
// resolver, the others via the shared debridServices resolve action played
// back as a plain URL source.

const RD = { id: "realdebrid", label: "Real-Debrid", tokenField: "rd_token" };
const EXTRA = [
  { id: "alldebrid", label: "AllDebrid", tokenField: "alldebrid_token" },
  { id: "premiumize", label: "Premiumize", tokenField: "premiumize_token" },
  { id: "debridlink", label: "DebridLink", tokenField: "debridlink_token" },
];

const fmt = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)}GB` : b > 1e6 ? `${(b / 1e6).toFixed(0)}MB` : `${b}B`);

export default function DebridLibrariesView() {
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const player = usePlayer();

  const load = useCallback(async () => {
    setLoading(true);
    setErrors({});
    let user;
    try {
      user = await base44.auth.me();
      setMe(user);
    } catch {
      setLoading(false);
      return;
    }

    const connected = [RD, ...EXTRA].filter((s) => user[s.tokenField]);
    if (connected.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Fetch every connected service's library in parallel.
    const results = await Promise.all(
      connected.map(async (s) => {
        try {
          const fn = s.id === "realdebrid" ? "realDebrid" : "debridServices";
          const payload = s.id === "realdebrid" ? { action: "torrents_list" } : { service: s.id, action: "torrents_list" };
          const res = await base44.functions.invoke(fn, payload);
          const ts = (res.data?.torrents || []).map((t) => ({ ...t, service: s.id, serviceLabel: s.label }));
          return { service: s.id, torrents: ts };
        } catch (e) {
          return { service: s.id, error: e.message || "Could not load library" };
        }
      })
    );

    const all = [];
    const errs = {};
    for (const r of results) {
      if (r.error) errs[r.service] = r.error;
      else all.push(...r.torrents);
    }
    // Most recently ready first, then by size.
    all.sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0) || (b.bytes || 0) - (a.bytes || 0));
    setItems(all);
    setErrors(errs);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const play = async (t) => {
    if (t.service === "realdebrid") {
      player.play({
        title: t.filename || "Real-Debrid stream",
        sources: [{ label: "Real-Debrid", type: "rd_torrent", src: t.id }],
      });
      return;
    }
    // Resolve a direct stream URL from the additional service, then play it.
    setBusyId(t.id);
    try {
      const res = await base44.functions.invoke("debridServices", {
        service: t.service,
        action: "resolve",
        torrent_id: t.id,
        folder_id: t.folder_id,
      });
      if (res.data?.error || !res.data?.stream_url) {
        throw new Error(res.data?.error || "Could not resolve stream");
      }
      player.play({
        title: t.filename || t.serviceLabel,
        noRd: true,
        sources: [{ label: t.serviceLabel, type: "url", src: res.data.stream_url }],
      });
    } catch (e) {
      setErrors((prev) => ({ ...prev, [t.id]: e.message }));
    } finally {
      setBusyId(null);
    }
  };

  const connected = me ? [RD, ...EXTRA].filter((s) => me[s.tokenField]).map((s) => s.id) : [];
  const visible = filter === "all" ? items : items.filter((t) => t.service === filter);
  const readyCount = visible.filter((t) => t.ready).length;

  const serviceBadge = (s) => {
    const map = {
      realdebrid: "bg-mg-green/15 text-mg-green",
      alldebrid: "bg-orange-500/15 text-orange-400",
      premiumize: "bg-indigo-500/15 text-indigo-300",
      debridlink: "bg-cyan-500/15 text-cyan-300",
    };
    return map[s] || "bg-white/10 text-white/60";
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-white">Debrid Libraries</h1>
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
        {items.length} items across {connected.length} connected {connected.length === 1 ? "service" : "services"} ·{" "}
        {readyCount} ready to play
      </p>

      {/* Service filter */}
      {connected.length > 1 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
          <Filter className="w-3.5 h-3.5 text-white/40 shrink-0" />
          {["all", ...connected].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors capitalize",
                filter === s ? "bg-mg-green text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
              )}
            >
              {s === "all" ? "All" : s === "realdebrid" ? "Real-Debrid" : s}
            </button>
          ))}
        </div>
      )}

      {Object.values(errors).filter(Boolean).length > 0 && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {Object.values(errors).filter(Boolean).join("; ")}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-mg-card rounded-lg animate-pulse" />
          ))}
        </div>
      ) : connected.length === 0 ? (
        <div className="text-center py-20">
          <HardDrive className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">No debrid services connected yet.</p>
          <p className="text-white/30 text-xs mt-1">Add a token in Settings to see your cloud library here.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <HardDrive className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Nothing in this library yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((t) => {
            const ready = t.ready;
            return (
              <div
                key={`${t.service}-${t.id}`}
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
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize", serviceBadge(t.service))}>
                      {t.serviceLabel || t.service}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                        ready ? "bg-mg-green/15 text-mg-green" : "bg-white/5 text-white/50"
                      )}
                    >
                      {t.status}
                    </span>
                    {t.bytes > 0 && <span className="text-[10px] text-white/40">{fmt(t.bytes)}</span>}
                    {!ready && t.progress > 0 && (
                      <span className="text-[10px] text-white/40">{Math.round(t.progress)}%</span>
                    )}
                  </div>
                  {errors[t.id] && <p className="text-[10px] text-red-400 mt-1 truncate">{errors[t.id]}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {ready && (
                    <button
                      onClick={() => play(t)}
                      disabled={busyId === t.id}
                      className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-lg hover:bg-mg-green-dim disabled:opacity-60"
                    >
                      {busyId === t.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-black" />
                      )}
                      Play
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}