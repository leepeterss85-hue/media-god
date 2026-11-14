import React, { useEffect, useRef, useState } from "react";
import { downloadProgress } from "./deviceDownloadProgress";
import { formatDebridBytes, formatDebridSpeed as speed } from "./debridLibraryUtils";

const bytes = value => formatDebridBytes(value) || "0 B";
const eta = seconds => seconds < 60 ? "<1 min" : `${Math.ceil(seconds / 60)} min`;
const labelForStatus = status => ({ downloading: "Downloading", queued: "Queued", paused: "Paused", complete: "Completed", failed: "Failed" })[status] || "Status unknown";

export default function DeviceDownloadsPanel() {
  const [snapshot, setSnapshot] = useState(null);
  const samples = useRef(new Map());
  const detailsRef = useRef(null);
  const initialDetailsOpenSet = useRef(false);
  // Opening history is a user preference within the current view. Polling
  // must not keep reopening it after someone collapses the list.
  useEffect(() => {
    if (!snapshot || initialDetailsOpenSet.current) return;
    initialDetailsOpenSet.current = true;
    if (detailsRef.current) {
      detailsRef.current.open = snapshot.items.some(item =>
        ["downloading", "queued", "paused"].includes(item.status));
    }
  }, [snapshot]);
  useEffect(() => {
    const bridge = window.MediaGodNative;
    if (typeof bridge?.getDownloadSnapshot !== "function") return undefined;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      if (!document.hidden) {
        try {
          const data = JSON.parse(bridge.getDownloadSnapshot());
          const next = new Map();
          const items = (Array.isArray(data.items) ? data.items : []).slice(0, 100).map(item => {
            const progress = downloadProgress(item, samples.current.get(item.id));
            next.set(item.id, progress.sample);
            return { ...item, ...progress };
          });
          samples.current = next;
          setSnapshot({ ...data, items });
        } catch {
          // Keep the last known history visible during a temporary bridge
          // problem rather than replacing completed downloads with an empty list.
          setSnapshot(previous => ({ ...(previous || { items: [] }), unavailable: true }));
        }
      }
      timer = setTimeout(refresh, 5000);
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("mg:download-started", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("mg:download-started", refresh);
    };
  }, []);
  if (!snapshot) return <p className="mb-4 text-sm text-white/50">Device download progress is available in your system download manager. Update the APK for in-app progress and storage.</p>;
  return <section className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
    <h2 className="font-semibold text-white">On this device</h2>
    <p className="mt-1 text-sm text-white/50">{snapshot.unavailable ? "Device status temporarily unavailable" : snapshot.availableBytes != null ? `${bytes(snapshot.availableBytes)} available storage` : "Available storage unknown"}</p>
    <details ref={detailsRef} className="mt-3">
      <summary className="cursor-pointer text-sm text-white/70">Downloads and history ({snapshot.items.length})</summary>
      <div className="max-h-80 overflow-y-auto">
        {snapshot.items.map(item => <div key={item.id} className="border-t border-white/10 py-3 text-sm">
          <p className="break-words text-white">{item.filename}</p>
          <p className="text-white/60">{labelForStatus(item.status)} · {bytes(item.bytes)}{item.total > 0 ? ` / ${bytes(item.total)}` : " · size unknown"}{item.speed > 0 ? ` · ${speed(item.speed)}` : ""}{item.eta != null ? ` · about ${eta(item.eta)} remaining` : ""}</p>
          {item.percent != null && <progress className="mt-2 h-2 w-full accent-green-500" value={item.percent} max="100" aria-label={`${item.filename}: ${item.percent}%`} />}
        </div>)}
        {!snapshot.items.length && <p className="py-2 text-sm text-white/50">New device downloads will appear here. Files already saved remain in your system Downloads folder.</p>}
      </div>
    </details>
  </section>;
}
