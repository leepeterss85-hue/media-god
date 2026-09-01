import React, { useEffect, useState, useRef } from "react";
import { X, Link as LinkIcon, Zap, Loader2, RefreshCw, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// Paste a magnet, pick any connected debrid service, and Media God sends it
// to that service to cache, polls until ready, then plays the resolved
// stream. Real-Debrid uses its dedicated resolver; AllDebrid / Premiumize /
// DebridLink use the shared debridServices function.

const SERVICE_META = {
  realdebrid: { label: "Real-Debrid", fn: "realDebrid", color: "bg-mg-green/15 text-mg-green" },
  alldebrid: { label: "AllDebrid", fn: "debridServices", color: "bg-orange-500/15 text-orange-400" },
  premiumize: { label: "Premiumize", fn: "debridServices", color: "bg-indigo-500/15 text-indigo-300" },
  debridlink: { label: "DebridLink", fn: "debridServices", color: "bg-cyan-500/15 text-cyan-300" },
};

export default function MagnetSendDialog({ open, onClose, connected = [] }) {
  const [magnet, setMagnet] = useState("");
  const [service, setService] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | polling | ready | error
  const [progress, setProgress] = useState(0);
  const [stream, setStream] = useState(null);
  const [torrentId, setTorrentId] = useState(null);
  const [folderId, setFolderId] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef(null);
  const player = usePlayer();
  const { toast } = useToast();

  useEffect(() => {
    if (open && connected.length > 0 && !service) setService(connected[0]);
  }, [open, connected, service]);

  useEffect(() => {
    if (!open) {
      setMagnet("");
      setState("idle");
      setProgress(0);
      setStream(null);
      setTorrentId(null);
      setFolderId("");
      setError("");
      if (pollRef.current) clearTimeout(pollRef.current);
    }
  }, [open]);

  if (!open) return null;

  const meta = SERVICE_META[service];

  const send = async () => {
    if (!magnet.trim().startsWith("magnet:")) {
      setError("Paste a valid magnet link (starts with magnet:?xt=…)");
      return;
    }
    if (!service || !meta) {
      setError("Pick a debrid service first.");
      return;
    }
    setState("sending");
    setError("");
    setStream(null);
    setProgress(0);
    try {
      const payload =
        service === "realdebrid"
          ? { action: "add_magnet", magnet: magnet.trim() }
          : { service, action: "magnet_add", magnet: magnet.trim() };
      const res = await base44.functions.invoke(meta.fn, payload);
      const data = res.data || {};
      // Real-Debrid may return ready immediately with a stream_url.
      if (data.status === "ready" && data.stream_url) {
        setStream({ url: data.stream_url, filename: data.filename || "" });
        setState("ready");
        return;
      }
      if (data.error) throw new Error(data.error);
      const id = data.torrent_id;
      if (!id) throw new Error("Service did not return a torrent id");
      setTorrentId(String(id));
      setFolderId(data.folder_id || "");
      setState("polling");
      poll(0);
    } catch (e) {
      setError(e.message || "Could not send magnet.");
      setState("error");
    }
  };

  const poll = (attempt) => {
    if (attempt > 60) {
      setError("Still downloading — try again later from the Libraries page.");
      setState("error");
      return;
    }
    pollRef.current = setTimeout(async () => {
      try {
        const payload =
          service === "realdebrid"
            ? { action: "torrent_info", torrent_id: torrentId }
            : { service, action: "torrent_info", torrent_id: torrentId, folder_id: folderId };
        const res = await base44.functions.invoke(meta.fn, payload);
        const data = res.data || {};
        if (data.status === "ready" && data.stream_url) {
          setStream({ url: data.stream_url, filename: data.filename || "" });
          setProgress(100);
          setState("ready");
          return;
        }
        if (data.error) throw new Error(data.error);
        if (typeof data.progress === "number") setProgress(data.progress);
        poll(attempt + 1);
      } catch (e) {
        setError(e.message || "Polling failed.");
        setState("error");
      }
    }, 5000);
  };

  const play = () => {
    if (!stream?.url) return;
    player.play({
      title: stream.filename || "Magnet stream",
      noRd: true,
      sources: [{ label: meta.label, type: "url", src: stream.url }],
    });
    toast({ title: "Playing via " + meta.label });
    onClose();
  };

  const retry = () => {
    if (!torrentId) return;
    setState("polling");
    setError("");
    poll(0);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-mg-surface w-full max-w-lg rounded-2xl border border-white/10 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-mg-green" /> Send Magnet
          </h2>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-white/50 text-xs mb-3">
          Paste a magnet link and pick a connected debrid service. Media God caches it on your account and plays it the moment it's ready.
        </p>

        {/* Service picker */}
        <div className="flex flex-wrap gap-2 mb-3">
          {connected.length === 0 && (
            <p className="text-white/40 text-xs">No debrid services connected. Add a token in Settings first.</p>
          )}
          {connected.map((s) => {
            const m = SERVICE_META[s];
            if (!m) return null;
            return (
              <button
                key={s}
                onClick={() => setService(s)}
                disabled={state === "sending" || state === "polling"}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-60",
                  service === s ? "bg-mg-green text-black" : cn("bg-white/5 text-white/70 hover:bg-white/10", m.color)
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Magnet input */}
        <textarea
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          placeholder="magnet:?xt=urn:btih:…"
          rows={3}
          disabled={state === "sending" || state === "polling"}
          className="w-full bg-mg-card border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 font-mono outline-none focus:border-mg-green/60 resize-none"
        />

        {/* Status */}
        {state === "polling" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-mg-green" />
            <span>Caching on {meta?.label}… {progress > 0 ? `${Math.round(progress)}%` : ""}</span>
          </div>
        )}
        {state === "ready" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-mg-green font-semibold">
            <Check className="w-3.5 h-3.5" /> Ready to play{stream?.filename ? ` · ${stream.filename}` : ""}
          </div>
        )}
        {error && (
          <p className="mt-3 text-xs text-red-400 break-words">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          {state === "ready" ? (
            <button
              onClick={play}
              className="flex-1 flex items-center justify-center gap-1.5 bg-mg-green text-black font-semibold text-sm py-2.5 rounded-lg hover:bg-mg-green-dim"
            >
              <Zap className="w-4 h-4 fill-black" /> Play now
            </button>
          ) : state === "error" && torrentId ? (
            <button
              onClick={retry}
              className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm py-2.5 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" /> Check again
            </button>
          ) : (
            <button
              onClick={send}
              disabled={state === "sending" || state === "polling" || !magnet.trim() || connected.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 bg-mg-green text-black font-semibold text-sm py-2.5 rounded-lg hover:bg-mg-green-dim disabled:opacity-50"
            >
              {state === "sending" || state === "polling" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {state === "sending" ? "Sending…" : state === "polling" ? "Caching…" : "Cache & play"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}