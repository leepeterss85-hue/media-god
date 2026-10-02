import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Users, Gauge } from "lucide-react";

const WEBTORRENT_CDN_URL =
  "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
const WEBTORRENT_FLAG = "data-webtorrent-sdk";

const VIDEO_EXTENSIONS = /\.(mp4|webm|m4v|ogg|ogv|mov|mkv|avi)$/i;

/**
 * WebTorrent browser player.
 *
 * Streams the torrent directly in the browser via WebRTC. Only connects to
 * WebRTC-compatible peers (not traditional BitTorrent TCP/uTP), so it works
 * best for torrents that have WebTorrent-compatible seeders.
 */
export default function WebTorrentPlayer({
  magnet,
  title,
  onBack,
  backLabel = "Sources",
}) {
  const videoRef = useRef(null);
  const clientRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Loading WebTorrent…");
  const [peers, setPeers] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);

  useEffect(() => {
    if (!magnet) {
      setError("No magnet link provided.");
      return;
    }

    let cancelled = false;

    const startStreaming = () => {
      if (!window.WebTorrent) {
        setError("WebTorrent library failed to load.");
        return;
      }

      const client = new window.WebTorrent();
      clientRef.current = client;
      setStatus("Adding torrent to WebTorrent…");

      client.add(magnet, (torrent) => {
        if (cancelled) {
          try { client.destroy(); } catch {}
          return;
        }

        setStatus("Scanning torrent files…");

        const videoFile =
          torrent.files.find((file) => VIDEO_EXTENSIONS.test(file.name)) ||
          torrent.files.reduce(
            (largest, file) => (file.length > largest.length ? file : largest),
            torrent.files[0]
          );

        if (!videoFile) {
          setError("No playable video file found in this torrent.");
          return;
        }

        setStatus("Streaming: " + videoFile.name);
        setLoading(false);

        if (videoRef.current) {
          videoFile.renderTo(videoRef.current).catch((err) => {
            if (!cancelled) setError(err?.message || "Failed to render video.");
          });
        }

        torrent.on("download", () => {
          if (cancelled) return;
          setPeers(torrent.numPeers);
          setDownloadSpeed(Math.round(torrent.downloadSpeed / 1024));
        });

        torrent.on("noPeers", () => {
          if (!cancelled) {
            setStatus(
              "No WebRTC peers found yet. WebTorrent can only connect to WebRTC-compatible seeders."
            );
          }
        });
      });

      client.on("error", (err) => {
        if (!cancelled) setError(err?.message || "WebTorrent error.");
      });
    };

    const ensureLibrary = () =>
      new Promise((resolve, reject) => {
        if (window.WebTorrent) {
          resolve();
          return;
        }
        const existing = document.querySelector(`script[${WEBTORRENT_FLAG}]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Library load failed")), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = WEBTORRENT_CDN_URL;
        script.async = true;
        script.setAttribute(WEBTORRENT_FLAG, "true");
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load WebTorrent library."));
        document.body.appendChild(script);
      });

    ensureLibrary()
      .then(startStreaming)
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load WebTorrent.");
      });

    return () => {
      cancelled = true;
      if (clientRef.current) {
        try { clientRef.current.destroy(); } catch {}
        clientRef.current = null;
      }
    };
  }, [magnet]);

  return (
    <div
      data-mg-player-root="true"
      data-mg-webtorrent-player="true"
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/95 p-2 text-white sm:p-3"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1600px] flex-col">
        <div
          data-mg-player-topbar="true"
          className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5"
        >
          <button
            type="button"
            data-mg-player-exit="true"
            onClick={onBack}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-mg-green"
            aria-label={"Back to Media God " + backLabel.toLowerCase()}
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
          <span className="hidden shrink-0 text-xs text-white/50 sm:block">WebTorrent</span>
        </div>

        <div
          data-mg-player-stage="true"
          className="relative aspect-video min-h-[34vh] w-full overflow-hidden rounded-xl border border-white/10 bg-black"
        >
          {error ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-red-400">
              {error}
            </div>
          ) : (
            <>
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-mg-green" />
                  <span className="px-4 text-center text-sm text-white/60">{status}</span>
                </div>
              )}
              <video
                ref={videoRef}
                className="h-full w-full"
                controls
                autoPlay
                playsInline
              />
            </>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5 text-xs text-white/60">
          <span className="min-w-0 flex-1 truncate">{loading ? status : "Streaming via WebTorrent (WebRTC)"}</span>
          {!loading && !error && (
            <span className="flex shrink-0 items-center gap-3">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {peers} peers
              </span>
              <span className="flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" /> {downloadSpeed} KB/s
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}