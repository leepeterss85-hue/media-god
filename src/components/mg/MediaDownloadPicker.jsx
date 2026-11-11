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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [browserFile, setBrowserFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setBrowserFile(null);
    setMessage("Finding a suitable download…");
    // The microtask also prevents StrictMode's discarded effect from starting work.
    Promise.resolve().then(async () => {
      if (cancelled) return;
      try {
        const file = await discoverMediaDownload({ title, year, tmdbId, imdbId, mediaType, season, episode }, {
          invoke: (name, payload) => base44.functions.invoke(name, payload),
          isCancelled: () => cancelled,
          onProgress: value => { if (!cancelled) setMessage(value); },
        });
        if (cancelled) return;
        if (typeof window.MediaGodNative?.downloadFile !== "function") {
          // Browsers need a fresh user gesture after asynchronous discovery.
          setBrowserFile(file);
          setMessage(`Ready to save ${file.filename}.`);
          return;
        }
        const method = startDeviceDownload(file);
        if (method === "unavailable") throw new Error("This device could not queue the download. Please retry.");
        setMessage(`Queued ${file.filename}. Check Downloads for progress.`);
      } catch (reason) {
        if (!cancelled) { setMessage(""); setError(reason?.message || "The download could not be started."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [title, year, tmdbId, imdbId, mediaType, season, episode, refreshIndex]);

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
      <p className="mt-2 text-xs text-white/60">Automatically finds a matching video, prefers English, and tries another file if needed.</p>
      {message && <p role="status" className="mt-3 flex items-center gap-2 break-words text-xs text-mg-green">
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}{message}
      </p>}
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />{error}
      </p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {browserFile && <button type="button" data-mg-main-page-save="true"
          onClick={() => {
            try {
              const method = startDeviceDownload(browserFile);
              if (method === "unavailable") throw new Error("This device cannot start the download.");
              setBrowserFile(null);
              setMessage("Download requested. Check your browser's download prompt.");
            } catch (reason) { setError(reason.message); }
          }}
          className="min-h-11 rounded-lg bg-mg-green px-3 text-xs font-bold text-black">Save file</button>}
        {error && <button type="button" onClick={() => setRefreshIndex(value => value + 1)} disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" /> Retry automatic download
        </button>}
        {!loading && typeof onFindSources === "function" && <button type="button" onClick={onFindSources}
          className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10">Choose a source manually</button>}
      </div>
    </section>
  );
}
