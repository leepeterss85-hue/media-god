import React, { useEffect, useRef, useState } from "react";
import { X, Copy, Check, ExternalLink, Link, Download, Tv, Loader2, Zap, RefreshCw, Film, Maximize } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";

const currentFilePath = (files) => (files?.find((f) => f.selected) || files?.[0] || {}).path || "";

export default function VideoPlayer({ source, onClose }) {
  const sources = source.sources || [
    {
      label: source.label || (source.type === "live" ? "LIVE" : "Stream"),
      type: source.type,
      src: source.src,
      live: source.type === "live",
    },
  ];
  const [activeIdx, setActiveIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [rdResolving, setRdResolving] = useState(false);
  const [rdPolling, setRdPolling] = useState(false);
  const [rdError, setRdError] = useState("");
  const [rdOverride, setRdOverride] = useState(null);
  const [rdFiles, setRdFiles] = useState([]);
  const [rdTorrentId, setRdTorrentId] = useState(null);
  const [fileSwitching, setFileSwitching] = useState(false);
  const [pastedMagnet, setPastedMagnet] = useState("");
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const pollRef = useRef(null);

  // Request fullscreen on the video stage. Must be called from a user gesture
  // (a tap/click) — the browser blocks fullscreen requests that aren't. iOS
  // Safari only supports fullscreen on the <video> element itself via
  // webkitEnterFullscreen; other browsers fullscreen the stage container so
  // the controls and file list stay visible.
  const goFullscreen = () => {
    const video = videoRef.current;
    const stage = stageRef.current;
    try {
      if (video && video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      } else if (stage?.requestFullscreen) {
        stage.requestFullscreen().catch(() => {});
      } else if (video?.requestFullscreen) {
        video.requestFullscreen().catch(() => {});
      }
    } catch {}
  };

  const active = sources[activeIdx] || sources[0];
  const isLive = source.type === "live" || active?.live;

  useEffect(() => {
    setRdOverride(null);
    setRdError("");
    setRdFiles([]);
    setRdTorrentId(null);
  }, [activeIdx]);

  // Auto-resolve the default Real-Debrid source on open. With a magnet
  // attached, check RD's cache. Without one, search the user's own RD
  // library for an already-cached copy of this title and play that. If
  // neither yields a stream, stay on the RD source and show the paste box.
  useEffect(() => {
    if (active?.type !== "rd") return;
    let cancelled = false;
    setRdResolving(true);
    setRdError("");
    const run = async () => {
      if (active.src) {
        try {
          const res = await base44.functions.invoke("realDebrid", { action: "resolve_best", magnet: active.src });
          if (cancelled) return;
          const data = res.data || {};
          if (data.status === "ready" && data.stream_url) {
            setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
            setRdFiles(data.files || []);
            return;
          }
          if (data.error) setRdError(data.error);
        } catch (e) {
          if (!cancelled) setRdError(e.message || "Real-Debrid request failed");
        }
      }
      // No magnet / not cached → look for this title in the user's RD library.
      try {
        const fc = await base44.functions.invoke("realDebrid", {
          action: "find_cached",
          title: source.rdTitle || source.title,
          ...(source.rdYear != null ? { year: source.rdYear } : {}),
          ...(source.rdSeason != null ? { season: source.rdSeason } : {}),
          ...(source.rdEpisode != null ? { episode: source.rdEpisode } : {}),
        });
        if (cancelled) return;
        const d = fc.data || {};
        // Ready library match → play instantly, no poll wait.
        if (d.status === "ready" && d.stream_url) {
          setRdOverride({ src: d.stream_url, label: "Real-Debrid Stream", file: currentFilePath(d.files) });
          setRdFiles(d.files || []);
        } else if (d.torrent_id) {
          setRdTorrentId(d.torrent_id); // auto-poll resolves + plays
        }
        // not_found → paste box shows (rdOverride stays null)
      } catch {}
    };
    run().finally(() => {
      if (!cancelled) setRdResolving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeIdx, active?.type, active?.src, source.title]);

  // Resolve a torrent already on the user's Real-Debrid account (from the
  // RD Library) by its torrent id.
  useEffect(() => {
    if (active?.type !== "rd_torrent") return;
    let cancelled = false;
    setRdResolving(true);
    setRdError("");
    setRdOverride(null);
    setRdFiles([]);
    base44.functions
      .invoke("realDebrid", { action: "torrent_info", torrent_id: active.src })
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        if (data.status === "ready" && data.stream_url) {
          setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
          setRdFiles(data.files || []);
        } else if (data.status === "preparing") {
          setRdTorrentId(data.torrent_id || active.src);
        } else if (data.error) {
          setRdError(data.error);
        }
      })
      .catch((e) => {
        if (!cancelled) setRdError(e.message || "Real-Debrid request failed");
      })
      .finally(() => {
        if (!cancelled) setRdResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeIdx, active?.type, active?.src]);

  // Auto-poll a torrent that Real-Debrid is still downloading, until it's
  // ready to play — no manual "Check again" needed.
  useEffect(() => {
    if (!rdTorrentId || rdOverride) return;
    let cancelled = false;
    setRdPolling(true);
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await base44.functions.invoke("realDebrid", {
          action: "torrent_info",
          torrent_id: rdTorrentId,
          ...(source.rdSeason != null ? { season: source.rdSeason } : {}),
          ...(source.rdEpisode != null ? { episode: source.rdEpisode } : {}),
        });
        const data = res.data || {};
        if (cancelled) return;
        if (data.status === "ready" && data.stream_url) {
          setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
          setRdFiles(data.files || []);
          setRdPolling(false);
          return;
        }
        if (data.error) {
          setRdError(data.error);
          setRdPolling(false);
          return;
        }
      } catch (e) {
        if (!cancelled) setRdError(e.message || "Real-Debrid poll failed");
        setRdPolling(false);
        return;
      }
      if (attempts < 24) {
        pollRef.current = setTimeout(tick, 5000);
      } else {
        setRdPolling(false);
        setRdError("Real-Debrid is still downloading. Tap Check again later.");
      }
    };
    pollRef.current = setTimeout(tick, 5000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [rdTorrentId, rdOverride]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Explicitly start playback when a stream becomes active — autoPlay alone is
  // unreliable, but play() after the user's click gesture always works.
  useEffect(() => {
    if ((active?.type === "file" || rdOverride) && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
  }, [active, rdOverride]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  const openLink = (href) => window.open(href, "_blank", "noopener,noreferrer");

  const resolvePasted = async () => {
    if (!pastedMagnet.trim().startsWith("magnet:")) {
      setRdError("Paste a valid magnet link (starts with magnet:?xt=…)");
      return;
    }
    setRdResolving(true);
    setRdError("");
    setRdOverride(null);
    setRdFiles([]);
    setRdTorrentId(null);
    try {
      const res = await base44.functions.invoke("realDebrid", {
        action: "add_magnet",
        magnet: pastedMagnet.trim(),
      });
      const data = res.data || {};
      if (data.status === "ready" && data.stream_url) {
        setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
        setRdFiles(data.files || []);
      } else if (data.status === "preparing") {
        setRdTorrentId(data.torrent_id);
        // auto-poll effect takes over
      } else {
        setRdError(data.error || "Real-Debrid could not resolve this magnet.");
      }
    } catch (e) {
      setRdError(e.message || "Real-Debrid request failed");
    } finally {
      setRdResolving(false);
    }
  };

  const retryPasted = async () => {
    if (!rdTorrentId) return;
    setRdResolving(true);
    setRdError("");
    try {
      const res = await base44.functions.invoke("realDebrid", {
        action: "torrent_info",
        torrent_id: rdTorrentId,
        ...(source.rdSeason != null ? { season: source.rdSeason } : {}),
        ...(source.rdEpisode != null ? { episode: source.rdEpisode } : {}),
      });
      const data = res.data || {};
      if (data.status === "ready" && data.stream_url) {
        setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
        setRdFiles(data.files || []);
      } else if (data.status === "preparing") {
        setRdError("Still downloading on Real-Debrid — try again shortly.");
      } else {
        setRdError(data.error || "Real-Debrid could not resolve this torrent.");
      }
    } catch (e) {
      setRdError(e.message || "Real-Debrid request failed");
    } finally {
      setRdResolving(false);
    }
  };

  // Switch to a different file within a resolved multi-file torrent.
  const pickFile = async (file) => {
    if (rdOverride?.file === file.path) return;
    setFileSwitching(true);
    setRdError("");
    try {
      const res = await base44.functions.invoke("realDebrid", {
        action: "unrestrict_file",
        link: file.link,
      });
      const data = res.data || {};
      if (data.stream_url) {
        setRdOverride({ src: data.stream_url, label: file.path, file: file.path });
      } else {
        setRdError(data.error || "Could not unrestrict this file.");
      }
    } catch (e) {
      setRdError(e.message || "Real-Debrid request failed");
    } finally {
      setFileSwitching(false);
    }
  };

  const resolveRd = async () => {
    setRdResolving(true);
    setRdError("");
    try {
      const res = await base44.functions.invoke("realDebrid", {
        action: "add_magnet",
        magnet: active.src,
      });
      const data = res.data || {};
      if (data.error) {
        setRdError(data.error);
      } else if (data.status === "ready" && data.stream_url) {
        setRdOverride({ src: data.stream_url, label: "Real-Debrid Stream", file: currentFilePath(data.files) });
        setRdFiles(data.files || []);
      } else if (data.status === "preparing") {
        setRdTorrentId(data.torrent_id);
      } else {
        setRdError("Real-Debrid could not resolve this magnet.");
      }
    } catch (e) {
      setRdError(e.message || "Real-Debrid request failed");
    } finally {
      setRdResolving(false);
    }
  };

  const isP2P = active?.type === "magnet" || active?.type === "torrent";
  const busy = rdResolving || rdPolling;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isLive && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </span>
            )}
            <h3 className="text-white font-semibold text-sm truncate">{source.title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(active?.type === "file" || rdOverride) && (
              <>
                <button
                  onClick={goFullscreen}
                  className="text-white/60 hover:text-white"
                  aria-label="Fullscreen"
                >
                  <Maximize className="w-5 h-5" />
                </button>
                <CastButton
                  url={rdOverride?.src || active.src}
                  title={source.title}
                  poster={source.poster}
                />
              </>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={stageRef} className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
          {rdOverride ? (
            <video
              ref={videoRef}
              src={rdOverride.src}
              poster={source.poster}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          ) : active?.type === "youtube" && (
            <iframe
              src={active.src}
              title={source.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
          {active?.type === "file" && (
            <video
              ref={videoRef}
              src={active.src}
              poster={source.poster}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          )}
          {(active?.type === "rd" || active?.type === "rd_torrent") && !rdOverride && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-mg-green/15 border border-mg-green/40 flex items-center justify-center">
                {busy ? (
                  <Loader2 className="w-6 h-6 text-mg-green animate-spin" />
                ) : (
                  <Zap className="w-6 h-6 text-mg-green" />
                )}
              </div>
              <p className="text-white font-semibold text-sm">
                {rdResolving ? "Resolving via Real-Debrid…" : rdPolling ? "Downloading on Real-Debrid…" : "Real-Debrid"}
              </p>
              <p className="text-white/40 text-xs max-w-sm">
                {rdResolving
                  ? "Checking Real-Debrid cache for an instant stream…"
                  : rdPolling
                  ? "Auto-checking until your file is ready to play…"
                  : "No cached stream for this title. Paste a real magnet link to stream it through your Real-Debrid account."}
              </p>
              {!busy && (
                <div className="flex flex-col gap-2 w-full max-w-md mt-1">
                  <input
                    value={pastedMagnet}
                    onChange={(e) => setPastedMagnet(e.target.value)}
                    placeholder="magnet:?xt=urn:btih:…"
                    className="w-full bg-black/40 border border-white/15 rounded-md px-3 py-2 text-xs text-white placeholder-white/30 font-mono outline-none focus:border-mg-green/60"
                  />
                  <button
                    onClick={resolvePasted}
                    disabled={rdResolving || !pastedMagnet.trim()}
                    className="flex items-center justify-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green-dim disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" /> Stream via Real-Debrid
                  </button>
                  {rdTorrentId && (
                    <button
                      onClick={retryPasted}
                      className="flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs px-3 py-2 rounded-md"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Check again
                    </button>
                  )}
                </div>
              )}
              {rdError && (
                <p className="text-red-400 text-xs mt-1 max-w-md break-words">{rdError}</p>
              )}
            </div>
          )}
          {isP2P && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-mg-green/15 border border-mg-green/40 flex items-center justify-center">
                {active.type === "magnet" ? (
                  <Link className="w-6 h-6 text-mg-green" />
                ) : (
                  <Download className="w-6 h-6 text-mg-green" />
                )}
              </div>
              <p className="text-white font-semibold text-sm">
                {active.type === "magnet" ? "Magnet Link" : "Torrent File"}
              </p>
              <p className="text-white/40 text-xs break-all max-w-md font-mono">{active.src}</p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => copy(active.src)}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-md"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-mg-green" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => openLink(active.src)}
                  className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green-dim"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </button>
                {active.type === "magnet" && (
                  <button
                    onClick={resolveRd}
                    disabled={rdResolving}
                    className="flex items-center gap-1.5 bg-mg-green/20 border border-mg-green/50 text-mg-green font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green/30 disabled:opacity-60"
                  >
                    {rdResolving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    {rdResolving ? "Resolving…" : "Stream via Real-Debrid"}
                  </button>
                )}
              </div>
              {rdResolving && (
                <p className="text-mg-green text-xs mt-1">Contacting Real-Debrid…</p>
              )}
              {rdError && (
                <p className="text-red-400 text-xs mt-1 max-w-md break-words">{rdError}</p>
              )}
              <p className="text-white/30 text-[10px] mt-1">
                Opens in your torrent client — or stream instantly with Real-Debrid
              </p>
            </div>
          )}
          {active?.type === "provider" && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              {active.logo ? (
                <img src={active.logo} alt={active.label} className="w-14 h-14 rounded-md object-contain bg-white/5 p-1" />
              ) : (
                <div className="w-14 h-14 rounded-md bg-mg-green/15 border border-mg-green/40 flex items-center justify-center">
                  <Tv className="w-7 h-7 text-mg-green" />
                </div>
              )}
              <p className="text-white font-semibold text-sm">Watch on {active.label}</p>
              <p className="text-white/40 text-xs">Legal streaming provider</p>
              <button
                onClick={() => openLink(active.src)}
                className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green-dim"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </button>
            </div>
          )}
        </div>

        {rdOverride && rdFiles.length > 1 && (
          <div className="mt-3 bg-mg-card border border-white/10 rounded-lg p-2 max-h-44 overflow-y-auto">
            <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide px-1 pb-1 flex items-center gap-1">
              <Film className="w-3 h-3" /> Files
            </p>
            <div className="flex flex-col gap-0.5">
              {rdFiles.map((f) => {
                const isCurrent = rdOverride.file === f.path;
                return (
                  <button
                    key={f.id}
                    onClick={() => pickFile(f)}
                    disabled={fileSwitching}
                    className={cn(
                      "flex items-center gap-2 text-left px-2 py-1.5 rounded text-xs transition-colors",
                      isCurrent ? "bg-mg-green/15 text-mg-green" : "text-white/70 hover:bg-white/5",
                      fileSwitching && "opacity-60"
                    )}
                  >
                    <Film className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate flex-1">{f.path}</span>
                    <span className="text-white/30 shrink-0">
                      {f.bytes > 1e9 ? `${(f.bytes / 1e9).toFixed(1)}GB` : `${(f.bytes / 1e6).toFixed(0)}MB`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sources.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {sources.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors",
                  i === activeIdx
                    ? "bg-mg-green text-black"
                    : "bg-mg-card text-white/70 hover:text-white"
                )}
              >
                {(s.type === "rd" || s.type === "rd_torrent") && <Zap className="w-3 h-3" />}
                {s.type === "magnet" && <Link className="w-3 h-3" />}
                {s.type === "torrent" && <Download className="w-3 h-3" />}
                {s.type === "provider" && <Tv className="w-3 h-3" />}
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}