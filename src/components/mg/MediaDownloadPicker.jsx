import React, { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { startDeviceDownload } from "@/components/mg/deviceMediaDownload";
import { discoverMediaDownload } from "@/components/mg/automaticMediaDownload";

export default function MediaDownloadPicker({
  title, year, tmdbId, imdbId, mediaType = "movie", season = null, episode = null,
  onClose, onFindSources,
}) {
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setMessage("");
    setFile(null);
    discoverMediaDownload({ title, year, tmdbId, imdbId, mediaType, season, episode }, {
      invoke: (name, payload) => base44.functions.invoke(name, payload),
      cancelled: () => cancelled,
      onProgress: value => { if (!cancelled) setProgress(value); },
    }).then(found => {
      if (cancelled) return;
      setFile(found);
      // Android accepts the handoff without a second click. Browsers may block
      // an asynchronous download, so keep a real user-gesture Save action.
      if (typeof window.MediaGodNative?.downloadFile === "function") {
        const method = startDeviceDownload(found);
        if (method === "unavailable") throw new Error("This device could not start the download. Tap Save to retry.");
        setMessage(`Download queued: ${found.filename}. Check your device's Downloads folder.`);
      } else {
        setMessage("Your file is ready. Tap Save to start your browser download.");
      }
    }).catch(reason => {
      if (!cancelled) setError(reason?.message || "Could not prepare a download.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [title, year, tmdbId, imdbId, mediaType, season, episode, refreshIndex]);

  const save = () => {
    if (!file) return;
    try {
      const method = startDeviceDownload(file);
      if (method === "unavailable") throw new Error("This device cannot start the download.");
      setError("");
      setMessage(method === "native" ? `Download queued: ${file.filename}.` : `Opened ${file.filename}. Check your browser's download prompt.`);
      setFile(null);
    } catch (reason) { setError(reason.message); }
  };

  return (
    <section data-mg-main-page-download-picker="true" role="region" aria-label={`Download ${title}`}
      className="mt-3 rounded-xl border border-mg-green/25 bg-black/45 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Download className="h-4 w-4 text-mg-green" /> Download {mediaType === "tv" ? `S${season} E${episode}` : title}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close downloads"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/70 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-xs text-white/60">Automatically finds a downloadable video, preferring English audio and ready files.</p>
      {loading && <p role="status" className="mt-4 flex items-center gap-2 text-xs text-white/70">
        <Loader2 className="h-4 w-4 animate-spin" />{progress}
      </p>}
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-red-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      {message && <p role="status" className="mt-3 break-words text-xs text-mg-green">{message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!loading && file && (!message.startsWith("Download queued:") || error) && (
          <button type="button" data-mg-main-page-save="true" onClick={save}
            className="min-h-11 rounded-lg bg-mg-green px-3 text-xs font-bold text-black">Save</button>
        )}
        {typeof onFindSources === "function" && <button type="button" onClick={onFindSources}
          className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10">Choose source manually</button>}
        {!loading && error && <button type="button" onClick={() => setRefreshIndex(value => value + 1)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>}
      </div>
    </section>
  );
}
