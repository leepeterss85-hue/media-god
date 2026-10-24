import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Download, Loader2, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { downloadableMedia, startDeviceDownload } from "@/components/mg/deviceMediaDownload";
import {
  candidatesForSeasonEpisode,
  fileMatchesSeasonEpisode,
  readySeasonTorrentCandidates,
  seasonEpisodeNumbers,
} from "@/components/mg/seasonMediaDownloads";

/**
 * Only save already-ready Real-Debrid files, never embeds or guessed sources.
 * Queued means a request was handed to Android's DownloadManager, not that
 * the bytes are on disk. Browser bulk downloading is intentionally disabled
 * (async multiple downloads can be blocked by browser gesture restrictions).
 */
export default function SeasonDownloadPicker({ title, year, season, episodes, onClose }) {
  const numbers = seasonEpisodeNumbers(episodes);
  const [loading, setLoading] = useState(true);
  const [torrents, setTorrents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ checked: 0, queued: [], missing: [], errors: [] });
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const cancelRef = useRef(false);
  // Do not enqueue the same episode twice if the user clicks Retry.
  const queuedEpisodesRef = useRef(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; cancelRef.current = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    cancelRef.current = false;
    setLoading(true);
    setError("");
    setTorrents([]);
    setProgress({ checked: 0, queued: [], missing: [], errors: [] });
    base44.functions.invoke("realDebrid", { action: "torrents_list" })
      .then((response) => {
        if (cancelled) return;
        const result = response?.data ?? response ?? {};
        if (result?.status === "failed" || result?.error) {
          throw new Error(result.error || "Unable to check completed downloads.");
        }
        setTorrents(readySeasonTorrentCandidates(result.torrents, { title, season }));
      })
      .catch((reason) => { if (!cancelled) setError(reason?.message || "Unable to load completed files."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; cancelRef.current = true; };
  }, [title, season, refresh]);

  const hasNativeDownload = typeof window !== "undefined" &&
    typeof window.MediaGodNative?.downloadFile === "function";

  const startSeason = async () => {
    if (busy || loading || !hasNativeDownload || !numbers.length) return;
    cancelRef.current = false;
    setBusy(true);
    setError("");
    const queued = [...queuedEpisodesRef.current], missing = [], errors = [];
    const seenFiles = new Set();
    let checked = 0;
    try {
      for (const episode of numbers) {
        if (cancelRef.current) break;
        if (queuedEpisodesRef.current.has(episode)) {
          checked += 1;
          if (isMountedRef.current) setProgress({ checked, queued: [...queued], missing: [...missing], errors: [...errors] });
          continue;
        }
        const candidates = candidatesForSeasonEpisode(torrents, season, episode);
        let saved = false;
        let couldNotQueue = false;
        for (const torrent of candidates.slice(0, 10)) {
          if (cancelRef.current) break;
          try {
            const response = await base44.functions.invoke("realDebrid", {
              action: "torrent_info",
              torrent_id: String(torrent.id),
              title,
              year,
              season: Number(season),
              episode,
            });
            if (cancelRef.current) break;
            const result = response?.data ?? response ?? {};
            if (result.status !== "ready") continue;
            // Never assume that a season pack resolved the right episode.
            if (!fileMatchesSeasonEpisode(result.filename, season, episode)) continue;
            const file = downloadableMedia(result, result.filename);
            if (!file) continue;
            if (seenFiles.has(file.url)) continue;
            const method = startDeviceDownload(file);
            if (method !== "native") {
              couldNotQueue = true;
              break;
            }
            seenFiles.add(file.url);
            queued.push(episode);
            queuedEpisodesRef.current.add(episode);
            saved = true;
            break;
          } catch {
            // A failed source does not prevent trying another ready file.
          }
        }
        if (!saved) (couldNotQueue ? errors : missing).push(episode);
        checked += 1;
        if (isMountedRef.current) {
          setProgress({ checked, queued: [...queued], missing: [...missing], errors: [...errors] });
        }
      }
    } finally {
      if (isMountedRef.current) {
        setBusy(false);
        if (cancelRef.current) {
          setError("Stopped requesting further downloads. Previously queued files continue in Downloads.");
        }
      }
    }
  };

  return (
    <section data-mg-season-download-picker="true" role="region"
      aria-label={"Download season " + season + " of " + title}
      className="mb-3 rounded-xl border border-mg-green/25 bg-black/45 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-white">
          <Download className="h-4 w-4 text-mg-green" />
          Download {title} · Season {season}
        </h4>
        <button type="button" onClick={() => { cancelRef.current = true; onClose(); }}
          aria-label="Close season downloads"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white/70 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-xs text-white/65">
        Save {numbers.length} listed episodes as separate offline files. Only completed Real-Debrid sources are considered; missing episodes are skipped. Previously saved files are not detected automatically.
      </p>
      {loading ? (
        <p className="mt-3 flex gap-2 items-center text-xs text-white/70"><Loader2 className="h-4 w-4 animate-spin" /> Checking ready season files…</p>
      ) : (
        <p className="mt-3 text-xs text-white/70">
          {torrents.length} ready source{torrents.length === 1 ? "" : "s"} found for this season.
          {torrents.length ? " Season packs are checked against the exact file for each episode." : " No completed season files found yet."}
        </p>
      )}
      {!hasNativeDownload && (
        <p className="mt-3 text-xs text-amber-200">
          One-click season download requires the Media God Android or Fire Stick app. In a browser, use the individual episode Download buttons.
        </p>
      )}
      {busy && <p role="status" className="mt-3 text-xs text-mg-green">
        Checking episode {Math.min(progress.checked + 1, numbers.length)} of {numbers.length}…
      </p>}
      {progress.checked > 0 && (
        <div className="mt-3 space-y-1 text-xs text-white/75" role="status">
          <p>{progress.checked} of {numbers.length} checked · {progress.queued.length} queued · {progress.missing.length} unavailable · {progress.errors.length} failed.</p>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-mg-green" style={{ width: String(Math.round(100 * progress.checked / numbers.length)) + "%" }} />
          </div>
          {progress.missing.length > 0 && <p>Not available: {progress.missing.map(n => "E" + n).join(", ")}</p>}
          {!busy && progress.queued.length > 0 && <p>Download Manager will continue saving queued episodes. Check Downloads for actual completion and sufficient storage.</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-amber-300">
        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
      </p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-mg-season-download-start="true"
          disabled={loading || busy || !hasNativeDownload || !torrents.length || !numbers.length}
          onClick={() => { void startSeason(); }}
          className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-mg-green px-4 text-xs font-bold text-black disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-white">
          <Download className="h-4 w-4" />
          {progress.checked ? "Retry unavailable episodes" : "Queue season downloads"}
        </button>
        {busy ? (
          <button type="button" onClick={() => { cancelRef.current = true; }}
            className="min-h-11 rounded-lg border border-white/15 px-3 text-xs text-white/85">
            Stop adding downloads
          </button>
        ) : (
          <button type="button" onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
            className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 text-xs text-white/85 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Refresh ready files
          </button>
        )}
      </div>
    </section>
  );
}
