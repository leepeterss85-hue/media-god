import React, { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { downloadableMedia, startDeviceDownload } from "@/components/mg/deviceMediaDownload";
import { readyMediaDownloads } from "@/components/mg/readyMediaDownloads";

/**
 * Detail/episode action: save only a matching, already-ready Real-Debrid file.
 * It never downloads third-party iframe pages or invents playable URLs.
 */
export default function MediaDownloadPicker({
  title, year, mediaType = "movie", season = null, episode = null,
  onClose, onFindSources,
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setMessage("");
    base44.functions.invoke("realDebrid", { action: "torrents_list" })
      .then((response) => {
        if (cancelled) return;
        const value = response?.data ?? response ?? {};
        if (value?.status === "failed") {
          throw new Error(value.error || "Real-Debrid did not return your files.");
        }
        setItems(readyMediaDownloads(value.torrents, { title, year, mediaType, season, episode }));
      })
      .catch((reason) => {
        if (!cancelled) {
          setItems([]);
          setError(reason?.message || "Could not check your Real-Debrid downloads.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [title, year, mediaType, season, episode, refreshIndex]);

  const save = async (torrent) => {
    const torrentId = String(torrent?.id || "").trim();
    if (!torrentId || busyId) return;
    setBusyId(torrentId);
    setError("");
    setMessage("");
    try {
      const response = await base44.functions.invoke("realDebrid", {
        action: "torrent_info", torrent_id: torrentId,
      });
      const result = response?.data ?? response ?? {};
      if (result.status !== "ready") throw new Error("That file isn't ready to download yet.");
      const file = downloadableMedia(result, torrent.filename);
      if (!file) throw new Error("No downloadable video file is available for this item.");
      const method = startDeviceDownload(file);
      if (method === "unavailable") throw new Error("This device cannot start the download.");
      setMessage(method === "native"
        ? `Started downloading ${file.filename}. Check your device's Downloads folder.`
        : `Opened ${file.filename} for download. Check your browser's download prompt.`);
    } catch (reason) {
      setError(reason?.message || "The download could not be started.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section data-mg-main-page-download-picker="true" role="region"
      aria-label={`Download ${title}`}
      className="mt-3 rounded-xl border border-mg-green/25 bg-black/45 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Download className="h-4 w-4 text-mg-green" />
          Download {mediaType === "tv" ? `S${season} E${episode}` : title}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close downloads"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/70 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-xs text-white/60">
        Choose a matching completed Real-Debrid video to save to your device.
        Web-player embeds aren't downloadable files.
      </p>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking ready files…
        </p>
      ) : items.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((torrent) => (
            <div key={torrent.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5">
              <span className="min-w-0 flex-1 break-words text-xs text-white/85">{torrent.filename || "Ready video file"}</span>
              <button type="button" data-mg-main-page-save="true"
                disabled={Boolean(busyId)}
                onClick={() => { void save(torrent); }}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-mg-green px-3 text-xs font-bold text-black disabled:opacity-50">
                {busyId === String(torrent.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Save
              </button>
            </div>
          ))}
        </div>
      ) : !error ? (
        <p className="mt-3 text-xs text-amber-100/90">
          No matching completed file was found. Use Sources to find a file first,
          or check its progress in Downloads.
        </p>
      ) : null}
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />{error}
      </p>}
      {message && <p role="status" className="mt-3 text-xs text-mg-green">{message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {typeof onFindSources === "function" && (
          <button type="button" onClick={onFindSources}
            className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10">
            Find sources
          </button>
        )}
        <button type="button" onClick={() => setRefreshIndex((value) => value + 1)}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
    </section>
  );
}
