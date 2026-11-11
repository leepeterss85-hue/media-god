import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Download, Loader2, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { startDeviceDownload } from "@/components/mg/deviceMediaDownload";
import {
  discoverDownloadChoices, formatDownloadSize, resolveDownloadChoice,
  sortDownloadChoices, MAX_DOWNLOAD_CHOICES,
} from "@/components/mg/downloadSourceChoices";

const selectClass = "min-h-10 rounded-lg border border-white/15 bg-mg-card px-3 py-2 text-xs text-white focus:outline-none focus:border-mg-green";

const matchesQuality = (option, filter) => {
  if (filter === "all") return true;
  if (filter === "4k") return option.resolution >= 2160;
  if (filter === "1080") return option.resolution >= 1080 && option.resolution < 2160;
  if (filter === "720") return option.resolution >= 720 && option.resolution < 1080;
  if (filter === "sd") return option.resolution > 0 && option.resolution < 720;
  if (filter === "unknown") return !option.resolution;
  return true;
};

export default function MediaDownloadPicker({
  title, year, tmdbId, imdbId, mediaType = "movie", season = null, episode = null,
  onClose, onFindSources,
}) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [sortOrder, setSortOrder] = useState("recommended");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [showCount, setShowCount] = useState(12);
  const [resolvingId, setResolvingId] = useState("");
  const [queuedIds, setQueuedIds] = useState([]);
  const [queuedUrls, setQueuedUrls] = useState([]);
  const [prepared, setPrepared] = useState(null);
  const cancelledRef = useRef(false);

  const context = useMemo(() => ({
    title, year, tmdbId, imdbId, mediaType, season, episode,
  }), [title, year, tmdbId, imdbId, mediaType, season, episode]);

  useEffect(() => {
    let cancelled = false;
    cancelledRef.current = false;
    setLoading(true);
    setError("");
    setMessage("");
    setProgress("");
    setOptions([]);
    setPrepared(null);
    setShowCount(12);

    discoverDownloadChoices(context, {
      invoke: (name, payload) => base44.functions.invoke(name, payload),
      maxChoices: MAX_DOWNLOAD_CHOICES,
      cancelled: () => cancelled,
      onProgress: value => { if (!cancelled) setProgress(value); },
    }).then(found => {
      if (!cancelled) setOptions(found);
    }).catch(reason => {
      if (!cancelled) setError(reason?.message || "Could not find download files.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; cancelledRef.current = true; };
  }, [context, refreshIndex]);

  const filtered = useMemo(() =>
    sortDownloadChoices(options.filter(item => matchesQuality(item, qualityFilter)), sortOrder),
    [options, sortOrder, qualityFilter]
  );
  const visible = filtered.slice(0, showCount);
  const recommended = sortDownloadChoices(options)[0] || null;

  const requestDownload = async option => {
    if (!option || loading || resolvingId || queuedIds.includes(option.id)) return;
    setResolvingId(option.id);
    setError("");
    setPrepared(null);
    setProgress("Checking the selected file…");
    try {
      const file = await resolveDownloadChoice(option, context, {
        invoke: (name, payload) => base44.functions.invoke(name, payload),
        cancelled: () => cancelledRef.current,
        onProgress: value => { if (!cancelledRef.current) setProgress(value); },
      });
      if (cancelledRef.current) return;
      if (queuedUrls.includes(file.url)) {
        setMessage("That exact file is already queued. Choose another size or quality if you want a different copy.");
        return;
      }
      // The native Android DownloadManager can accept a resolved file now.
      // Browsers need a second, user-initiated Save tap to preserve the
      // browser's download permission after asynchronous source resolution.
      if (typeof window.MediaGodNative?.downloadFile === "function") {
        const method = startDeviceDownload(file);
        if (method === "unavailable") throw new Error("This device could not queue the selected file.");
        setQueuedIds(current => [...new Set([...current, option.id])]);
        setQueuedUrls(current => [...new Set([...current, file.url])]);
        setMessage("Download queued: " + file.filename + ". You can select more files.");
      } else {
        setPrepared({ optionId: option.id, file });
        setMessage(file.filename + " is ready. Tap Save below to start the browser download.");
      }
    } catch (reason) {
      if (!cancelledRef.current) setError(reason?.message || "This download source could not be prepared.");
    } finally {
      if (!cancelledRef.current) {
        setResolvingId("");
        setProgress("");
      }
    }
  };

  const save = () => {
    if (!prepared?.file) return;
    try {
      const file = prepared.file;
      if (queuedUrls.includes(file.url)) {
        setPrepared(null);
        return;
      }
      const method = startDeviceDownload(file);
      if (method === "unavailable") throw new Error("Your browser could not start this download.");
      setQueuedIds(current => [...new Set([...current, prepared.optionId])]);
      setQueuedUrls(current => [...new Set([...current, file.url])]);
      setMessage("Opened " + file.filename + ". Check your browser download prompt.");
      setPrepared(null);
      setError("");
    } catch (reason) { setError(reason?.message || "Could not save the selected file."); }
  };

  return (
    <section data-mg-main-page-download-picker="true" role="region" aria-label={"Download " + title}
      className="mt-3 rounded-xl border border-mg-green/25 bg-black/45 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Download className="h-4 w-4 text-mg-green" />
          Download {mediaType === "tv" ? "S" + season + " E" + episode : title}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close downloads"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/70 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-xs text-white/60">
        Browse up to {MAX_DOWNLOAD_CHOICES} source options and choose your own video quality and file size.
        Ready files are identified; other sources are checked when you select Download.
        File sizes are estimates or source-reported values, not guaranteed sizes.
      </p>

      {loading && <p role="status" className="mt-4 flex items-center gap-2 text-xs text-white/70">
        <Loader2 className="h-4 w-4 animate-spin" /> {progress || "Finding download choices…"}
      </p>}
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
      </p>}
      {message && <p role="status" className="mt-3 break-words text-xs text-mg-green">{message}</p>}

      {options.length > 0 && (
        <div data-mg-download-options="true" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-xs font-semibold text-white/80">
              {options.length} source option{options.length === 1 ? "" : "s"} · {queuedIds.length} queued
            </p>
            <button type="button" data-mg-download-recommended="true"
              onClick={() => { void requestDownload(recommended); }}
              disabled={Boolean(resolvingId) || loading || !recommended || queuedIds.includes(recommended.id)}
              className="min-h-10 rounded-lg bg-mg-green px-3 py-2 text-xs font-bold text-black disabled:opacity-40">
              Download recommended
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs text-white/70">
              <span>Quality</span>
              <select aria-label="Filter download quality" data-mg-download-quality-filter="true"
                value={qualityFilter} onChange={event => { setQualityFilter(event.target.value); setShowCount(12); }}
                className={selectClass + " flex-1"}>
                <option value="all">All qualities</option>
                <option value="4k">4K and above</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="sd">SD</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-white/70">
              <span>Sort</span>
              <select aria-label="Sort downloads" data-mg-download-sort="true"
                value={sortOrder} onChange={event => setSortOrder(event.target.value)}
                className={selectClass + " flex-1"}>
                <option value="recommended">Recommended · English first</option>
                <option value="quality">Highest quality first</option>
                <option value="smallest">Smallest file first</option>
                <option value="largest">Largest file first</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            {visible.map((option, index) => (
              <div key={option.id} className="flex items-start gap-2 rounded-lg border border-white/10 p-2">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-xs font-semibold text-white/90">{index + 1}. {option.filename}</p>
                  <p className="mt-1 text-[11px] text-white/60">
                    {option.quality} · {formatDownloadSize(option.sizeBytes)}
                    {option.sizeIsTorrentTotal ? " (torrent total)" : ""}
                    {" · "}{option.language} · {option.release}
                  </p>
                  <p className="mt-1 text-[11px] text-white/45">
                    {option.ready ? "Ready in Real-Debrid" :
                      option.cached ? "Reported cached · verify on selection" :
                      "Source found · verify on selection"}
                  </p>
                </div>
                {queuedIds.includes(option.id) ? (
                  <span className="shrink-0 px-1 py-2 text-xs text-mg-green">Queued</span>
                ) : (
                  <button type="button" data-mg-save-alternative="true"
                    disabled={Boolean(resolvingId) || loading}
                    onClick={() => { void requestDownload(option); }}
                    className="min-h-10 shrink-0 rounded-lg bg-mg-green px-3 text-xs font-bold text-black disabled:opacity-40">
                    {resolvingId === option.id ? "Checking…" : "Download"}
                  </button>
                )}
              </div>
            ))}
            {!filtered.length && <p className="text-xs text-white/60">
              No sources match this quality. Try All qualities or another sorting option.
            </p>}
          </div>
          {showCount < filtered.length && (
            <button type="button" data-mg-download-show-more="true"
              onClick={() => setShowCount(current => current + 12)}
              className="min-h-11 w-full rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/85 hover:bg-white/10">
              Show more download sources ({filtered.length - showCount} remaining)
            </button>
          )}
        </div>
      )}

      {resolvingId && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-white/70">
        <Loader2 className="h-4 w-4 animate-spin" /> {progress || "Preparing selected file…"}
      </p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {prepared?.file && (
          <button type="button" data-mg-main-page-save="true" onClick={save}
            className="min-h-11 rounded-lg bg-mg-green px-3 text-xs font-bold text-black">
            Save selected file
          </button>
        )}
        {typeof onFindSources === "function" && (
          <button type="button" onClick={onFindSources}
            className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10">
            Choose source manually
          </button>
        )}
        {!loading && (
          <button type="button" onClick={() => setRefreshIndex(value => value + 1)}
            disabled={Boolean(resolvingId)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh sources
          </button>
        )}
      </div>
    </section>
  );
}
