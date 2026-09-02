import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  X, Check, Link as LinkIcon, Loader2, Zap, Film, Maximize, AlertCircle, FileVideo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";
import PlayerControls from "@/components/mg/PlayerControls";
import MoviPlayer from "@/components/mg/MoviPlayer";

const contentKey = (s) =>
  `${s.title || "media"}|${s.year || ""}|${s.season || ""}|${s.episode || ""}`;

const HEVC_RE = /x265|h265|hevc|hev1|hvc1|10-?bit|hi10|hdr10|dolby.?vision/i;
const isHevcName = (s) => HEVC_RE.test((s || "").toLowerCase());

export default function VideoPlayer({ source, onClose }) {
  const sources = (source?.sources && source.sources.length > 0)
    ? source.sources
    : [{
        label: source?.label || (source?.type === "live" ? "LIVE" : "Default Stream"),
        type: source?.type || "url",
        src: source?.url || source?.src,
        live: source?.type === "live",
      }];

  const [activeIdx, setActiveIdx] = useState(0);
  const [rdOverride, setRdOverride] = useState(null);
  const [rdFiles, setRdFiles] = useState([]);
  const [rdTorrentId, setRdTorrentId] = useState(null);
  const [rdStatus, setRdStatus] = useState("");
  const [rdError, setRdError] = useState("");
  const [pastedMagnet, setPastedMagnet] = useState("");
  const [videoFailed, setVideoFailed] = useState(false);
  const [nativeFailed, setNativeFailed] = useState(false);

  const videoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const pollRef = useRef(null);
  const progressRef = useRef(0);
  const durationRef = useRef(0);
  const restoredRef = useRef(false);

  const active = sources[activeIdx] || sources[0];
  const isLive = source.type === "live" || active?.live;
  const isRd = active?.type === "rd" || active?.type === "torrent";
  const playUrl = rdOverride?.src || (isRd ? "" : (active?.type === "url" ? active.src : source?.url || ""));
  const isYoutube = active?.type === "youtube" || playUrl.includes("youtube.com") || playUrl.includes("youtu.be");
  const hevcDetected = isHevcName(rdOverride?.filename) || isHevcName(active?.label) || isHevcName(active?.filename);
  const useMovi = !isLive && !isYoutube && playUrl.length > 0 && (hevcDetected || nativeFailed);

  const goFullscreen = useCallback(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    try {
      if (stage?.requestFullscreen) stage.requestFullscreen().catch(() => {});
      else if (video?.requestFullscreen) video.requestFullscreen().catch(() => {});
      else if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch {}
  }, []);

  const invokeRd = async (payload) => {
    const res = await base44.functions.invoke("realDebrid", payload);
    return res?.data || res;
  };

  const applyRdResult = (data) => {
    if (!data || data.error) { setRdStatus("error"); setRdError(data?.error || "Unknown Real-Debrid error"); return false; }
    setRdTorrentId(data.torrent_id ? String(data.torrent_id) : null);
    if (data.files) setRdFiles(data.files);
    if (data.stream_url) {
      setRdOverride({ src: data.stream_url, filename: data.filename || "" });
      setRdStatus("ready");
      return true;
    }
    setRdStatus("preparing");
    return false;
  };

  const pollTorrent = useCallback((torrentId) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const data = await invokeRd({
          action: "torrent_info",
          torrent_id: torrentId,
          title: source.title,
          year: source.year,
          season: source.season,
          episode: source.episode,
        });
        if (data?.stream_url) {
          applyRdResult(data);
          return;
        }
        if (data?.error) { setRdStatus("error"); setRdError(data.error); return; }
        if (attempts >= 48) { setRdStatus("not_cached"); return; }
        pollRef.current = setTimeout(tick, 5000);
      } catch (e) {
        setRdStatus("error"); setRdError(e.message || "Polling failed");
      }
    };
    pollRef.current = setTimeout(tick, 5000);
  }, [source, invokeRd]);

  const resolveRdSource = useCallback(async (src) => {
    setRdStatus("resolving"); setRdError(""); setRdFiles([]); setRdOverride(null);
    try {
      const found = await invokeRd({
        action: "find_cached",
        title: source.title,
        year: source.year,
        season: source.season,
        episode: source.episode,
      });
      if (found?.status === "ready" && found?.stream_url) { applyRdResult(found); return; }
      if (found?.status === "preparing" && found?.torrent_id) {
        applyRdResult(found);
        pollTorrent(String(found.torrent_id));
        return;
      }
      const torrentMagnets = sources
        .filter((x) => x?.type === "torrent" && x?.src && x.src.startsWith("magnet:"))
        .map((x) => x.src)
        .slice(0, 15);
      
      let magnets = torrentMagnets.length > 0 ? torrentMagnets : (src?.src && src.src.startsWith("magnet:") ? [src.src] : []);
      
      if (magnets.length === 0 && source.title) {
        const seed = `${source.title}|${source.year || ""}`;
        let h = 0;
        for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
        const hex = (Math.abs(h).toString(16).padStart(8, "0") + "0".repeat(32)).slice(0, 40);
        const dn = encodeURIComponent(`${source.title}${source.year ? ` (${source.year})` : ""}`);
        magnets = [`magnet:?xt=urn:btih:${hex}&dn=${dn}`];
      }

      if (magnets.length > 0) {
        const data = await invokeRd({
          action: "resolve_first_cached",
          magnets,
          title: source.title,
          year: source.year,
          season: source.season,
          episode: source.episode,
        });
        if (data?.status === "not_cached") {
          const addRes = await invokeRd({
            action: "add_magnet",
            magnet: magnets[0],
            title: source.title,
            year: source.year,
            season: source.season,
            episode: source.episode,
          });
          if (applyRdResult(addRes)) return;
          if (addRes?.torrent_id) {
            pollTorrent(String(addRes.torrent_id));
            return;
          }
        }
        if (applyRdResult(data)) return;
        if (data?.torrent_id) pollTorrent(String(data.torrent_id));
        return;
      }
      setRdStatus(found?.status === "not_cached" ? "not_cached" : "not_found");
    } catch (e) {
      setRdStatus("error"); setRdError(e.message || "Resolution failed");
    }
  }, [source, pollTorrent, sources, invokeRd, applyRdResult]);

  useEffect(() => {
    setRdOverride(null); setRdError(""); setRdFiles([]); setRdTorrentId(null); setRdStatus("");
    setVideoFailed(false); setNativeFailed(false);
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    if (isRd) resolveRdSource(active);
  }, [activeIdx, isRd, active, resolveRdSource]);

  const submitMagnet = async () => {
    const magnet = pastedMagnet.trim();
    if (!magnet.startsWith("magnet:")) { setRdError("Paste a valid magnet: URI"); setRdStatus("error"); return; }
    setRdStatus("resolving"); setRdError("");
    try {
      const data = await invokeRd({
        action: "add_magnet",
        magnet,
        title: source.title,
        year: source.year,
        season: source.season,
        episode: source.episode,
      });
      if (applyRdResult(data)) return;
      if (data?.torrent_id) pollTorrent(String(data.torrent_id));
    } catch (e) {
      setRdStatus("error"); setRdError(e.message || "Submission failed");
    }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    progressRef.current = v.currentTime || 0;
    durationRef.current = v.duration || 0;
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playUrl) return;
    v.muted = false;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    const t = setTimeout(() => goFullscreen(), 400);
    return () => clearTimeout(t);
  }, [playUrl, goFullscreen]);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  if (!source) return null;

  const showPasteBox = isRd && (rdStatus === "not_found" || rdStatus === "not_cached" || rdStatus === "error");
  const resolving = isRd && (rdStatus === "resolving" || rdStatus === "preparing");

  return (
    <div ref={stageRef} className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center select-none overflow-hidden">
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-30 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button onClick={onClose} className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-white font-bold text-base line-clamp-1">{source.title || "Now Playing"}</h2>
            {source.year && <p className="text-white/60 text-xs">{source.year}{source.season ? ` · S${source.season}${source.episode ? `E${source.episode}` : ""}` : ""}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          {playUrl && !isYoutube && !isLive && <CastButton mediaUrl={playUrl} title={source.title} poster={source.poster} />}
          <button onClick={goFullscreen} className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors" title="Fullscreen">
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="w-full h-full flex items-center justify-center relative bg-black">
        {isLive ? (
          <LiveVideo ref={liveVideoRef} src={playUrl} controls={false} />
        ) : isYoutube ? (
          <div className="w-full h-full flex items-center justify-center p-8">
            <iframe
              src={playUrl.includes("embed") ? playUrl : playUrl.replace("watch?v=", "embed/")}
              className="w-full max-w-5xl aspect-video rounded-lg border border-white/10"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : playUrl ? (
          useMovi ? (
            <>
              <MoviPlayer ref={videoRef} src={playUrl} autoPlay controls={false} onTimeUpdate={onTimeUpdate} onError={() => setVideoFailed(true)} className="w-full h-full" />
              <PlayerControls videoRef={videoRef} stageRef={stageRef} isLive={isLive} onFullscreen={goFullscreen} />
              {videoFailed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center bg-black/70">
                  <AlertCircle className="w-10 h-10 text-mg-green" />
                  <p className="text-sm font-semibold">This HEVC/x265 stream can&apos;t be decoded</p>
                  <p className="text-xs text-white/60 max-w-sm">Your browser doesn&apos;t support WebCodecs HEVC decoding. Try another source from the dropdown.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <video ref={videoRef} src={playUrl} autoPlay playsInline className="w-full h-full object-contain" onTimeUpdate={onTimeUpdate} onError={() => { setVideoFailed(true); setNativeFailed(true); }} />
              <PlayerControls videoRef={videoRef} stageRef={stageRef} isLive={isLive} onFullscreen={goFullscreen} />
              {videoFailed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center bg-black/70">
                  <AlertCircle className="w-10 h-10 text-mg-green" />
                  <p className="text-sm font-semibold">Retrying with the software decoder…</p>
                  <p className="text-xs text-white/60 max-w-sm">This stream can&apos;t play natively, so we&apos;re switching to the in-browser HEVC decoder.</p>
                </div>
              )}
            </>
          )
        ) : resolving ? (
          <div className="flex flex-col items-center gap-4 text-white/80">
            <Loader2 className="w-12 h-12 animate-spin text-mg-green" />
            <p className="text-sm">{rdStatus === "preparing" ? "Preparing your stream on Real-Debrid…" : "Resolving Real-Debrid stream…"}</p>
          </div>
        ) : showPasteBox ? (
          <div className="w-full max-w-xl px-6 flex flex-col gap-4 text-white">
            <div className="flex items-center gap-2 text-mg-green">
              <Zap className="w-5 h-5" />
              <h3 className="font-bold text-lg">Stream Not Immediately Cached</h3>
            </div>
            <p className="text-sm text-white/70">
              Real-Debrid couldn&apos;t find an instantly cached version for this title. Paste a magnet link below or pick another source from the selector above.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="magnet:?xt=urn:btih:..."
                value={pastedMagnet}
                onChange={(e) => setPastedMagnet(e.target.value)}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
              />
              <button
                onClick={submitMagnet}
                className="bg-mg-green hover:bg-mg-green/80 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                <LinkIcon className="w-4 h-4" />
                Resolve
              </button>
            </div>
            {rdError && <p className="text-xs text-red-400">{rdError}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
