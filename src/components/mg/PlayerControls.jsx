import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Volume2, VolumeX, Volume1, Maximize, Minimize,
  PictureInPicture2, RotateCcw, RotateCw, Loader2, Gauge, SkipBack, SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const fmt = (s) => {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// Custom overlay controls + touch gestures for the player's <video> stage.
// Reads state from the video element via the passed ref and drives it back,
// so it works for any video (RD stream, direct file, or HLS live).
export default function PlayerControls({ videoRef, stageRef, isLive, onFullscreen }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fs, setFs] = useState(false);
  const [skipFlash, setSkipFlash] = useState(null);
  const [seekPreview, setSeekPreview] = useState(null);

  const hideTimer = useRef(null);
  const scrubRef = useRef(false);
  const trackRef = useRef(null);
  const lastTouchRef = useRef(0);
  const gestureRef = useRef({ startX: 0, startY: 0, startT: 0, seeking: false, startCurrent: 0, lastTap: 0 });

  const sync = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setPlaying(!v.paused && !v.ended);
    setCurrent(v.currentTime || 0);
    setDuration(v.duration || 0);
    setVolume(v.volume);
    setMuted(v.muted);
    setRate(v.playbackRate);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
  }, [videoRef]);

  // Attach listeners to whichever video element we're given.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => { if (!scrubRef.current) setCurrent(v.currentTime || 0); };
    const onDur = () => setDuration(v.duration || 0);
    const onVol = () => { setVolume(v.volume); setMuted(v.muted); };
    const onRate = () => setRate(v.playbackRate);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onProgress = () => { if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)); };
    const onEnded = () => setPlaying(false);
    v.addEventListener("play", onPlay); v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime); v.addEventListener("durationchange", onDur);
    v.addEventListener("volumechange", onVol); v.addEventListener("ratechange", onRate);
    v.addEventListener("waiting", onWaiting); v.addEventListener("playing", onPlaying);
    v.addEventListener("canplay", onPlaying); v.addEventListener("progress", onProgress);
    v.addEventListener("ended", onEnded);
    sync();
    return () => {
      v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime); v.removeEventListener("durationchange", onDur);
      v.removeEventListener("volumechange", onVol); v.removeEventListener("ratechange", onRate);
      v.removeEventListener("waiting", onWaiting); v.removeEventListener("playing", onPlaying);
      v.removeEventListener("canplay", onPlaying); v.removeEventListener("progress", onProgress);
      v.removeEventListener("ended", onEnded);
    };
  }, [videoRef, sync]);

  useEffect(() => {
    const onFsChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const showControls = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setVisible(false);
    }, 3000);
  }, [videoRef]);

  useEffect(() => {
    showControls();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [playing, showControls]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };
  const seekTo = (t) => {
    const v = videoRef.current; if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, t));
    setCurrent(v.currentTime);
  };
  const skip = (d) => {
    const v = videoRef.current; if (!v) return;
    seekTo((v.currentTime || 0) + d);
    setSkipFlash({ dir: d > 0 ? "fwd" : "back", key: Date.now() });
    setTimeout(() => setSkipFlash((s) => (s && s.key === skipFlash?.key ? null : s)), 600);
  };
  const setVol = (val) => {
    const v = videoRef.current; if (!v) return;
    v.volume = val; if (val > 0 && v.muted) v.muted = false;
  };
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return; v.muted = !v.muted;
  };
  const setSpeed = (r) => {
    const v = videoRef.current; if (!v) return; v.playbackRate = r; setShowSpeed(false);
  };
  const togglePip = async () => {
    const v = videoRef.current; if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch {}
  };

  // Seek bar pointer scrubbing.
  const pctFromEvent = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const onTrackDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubRef.current = true;
    const p = pctFromEvent(e.clientX);
    setSeekPreview({ pct: p, time: p * (duration || 0) });
    seekTo(p * (duration || 0));
  };
  const onTrackMove = (e) => {
    if (!scrubRef.current) return;
    const p = pctFromEvent(e.clientX);
    setSeekPreview({ pct: p, time: p * (duration || 0) });
    seekTo(p * (duration || 0));
  };
  const onTrackUp = (e) => {
    scrubRef.current = false;
    setSeekPreview(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  // Touch gestures: single tap toggles controls, double tap skips ±10s,
  // horizontal drag seeks.
  const onTouchStart = (e) => {
    const t = e.touches[0];
    gestureRef.current = {
      startX: t.clientX, startY: t.clientY, startT: Date.now(),
      seeking: false, startCurrent: videoRef.current?.currentTime || 0,
      lastTap: gestureRef.current.lastTap || 0,
    };
  };
  const onTouchMove = (e) => {
    const g = gestureRef.current;
    const t = e.touches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;
    if (!g.seeking && Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) g.seeking = true;
    if (g.seeking && duration) {
      const pct = Math.max(0, Math.min(1, g.startCurrent / duration + dx / 240));
      setSeekPreview({ pct, time: pct * duration });
    }
  };
  const onTouchEnd = () => {
    const g = gestureRef.current;
    const dt = Date.now() - g.startT;
    lastTouchRef.current = Date.now();
    if (g.seeking) {
      if (seekPreview) seekTo(seekPreview.time);
      setSeekPreview(null);
      g.seeking = false; g.lastTap = 0;
      return;
    }
    if (dt < 300) {
      const now = Date.now();
      if (now - g.lastTap < 300) {
        const stage = stageRef.current?.getBoundingClientRect();
        const side = stage ? (g.startX - stage.left) / stage.width : 0.5;
        skip(side < 0.5 ? -10 : 10);
        g.lastTap = 0;
      } else {
        g.lastTap = now;
        setTimeout(() => {
          if (gestureRef.current.lastTap === now) {
            setVisible((v) => !v);
            gestureRef.current.lastTap = 0;
          }
        }, 280);
      }
    }
  };

  const onClick = () => {
    if (Date.now() - lastTouchRef.current < 500) return; // ignore synthetic click from touch
    togglePlay();
  };
  const onDoubleClick = () => {
    if (Date.now() - lastTouchRef.current < 500) return;
    onFullscreen?.();
  };

  const playedPct = duration ? (current / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div className="absolute inset-0 z-10 select-none" style={{ touchAction: "none" }}>
      <div className={cn("absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent pointer-events-none transition-opacity duration-300", visible ? "opacity-100" : "opacity-0")} />
      <div className={cn("absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 to-transparent pointer-events-none transition-opacity duration-300", visible ? "opacity-100" : "opacity-0")} />

      <div
        className="absolute inset-0"
        onMouseMove={showControls}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      <AnimatePresence>
        {skipFlash && (
          <motion.div
            key={skipFlash.key}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={cn("absolute top-1/2 -translate-y-1/2 flex items-center gap-1 px-4 py-2 rounded-full bg-black/60 border border-white/20", skipFlash.dir === "fwd" ? "right-10" : "left-10")}
          >
            {skipFlash.dir === "fwd" ? <RotateCw className="w-5 h-5 text-mg-green" /> : <RotateCcw className="w-5 h-5 text-mg-green" />}
            <span className="text-mg-green text-sm font-semibold">10s</span>
          </motion.div>
        )}
      </AnimatePresence>

      {seekPreview && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black/80 text-white text-xs font-mono pointer-events-none">
          {fmt(seekPreview.time)}
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {buffering ? (
          <Loader2 className="w-12 h-12 text-white/90 animate-spin" />
        ) : !playing && (
          <button onClick={togglePlay} className="pointer-events-auto w-16 h-16 rounded-full bg-black/50 border border-white/30 flex items-center justify-center hover:bg-black/70 hover:scale-105 transition">
            <Play className="w-7 h-7 text-white ml-1" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 bottom-0 px-3 pb-2 pt-8 z-20"
            onMouseMove={showControls}
          >
            {!isLive && (
              <div
                ref={trackRef}
                className="group relative h-4 flex items-center cursor-pointer"
                onPointerDown={onTrackDown}
                onPointerMove={onTrackMove}
                onPointerUp={onTrackUp}
              >
                <div className="relative w-full h-1 group-hover:h-1.5 transition-all rounded-full bg-white/25">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${bufferedPct}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-mg-green" style={{ width: `${playedPct}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3 rounded-full bg-mg-green opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${playedPct}%` }} />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mt-1 text-white">
              <button onClick={togglePlay} className="p-1.5 hover:text-mg-green transition">{playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</button>
              {!isLive && (
                <>
                  <button onClick={() => skip(-10)} className="p-1.5 hover:text-mg-green transition" title="Back 10s"><SkipBack className="w-5 h-5" /></button>
                  <button onClick={() => skip(10)} className="p-1.5 hover:text-mg-green transition" title="Forward 10s"><SkipForward className="w-5 h-5" /></button>
                </>
              )}
              {isLive && <span className="flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}

              <div className="flex items-center gap-1">
                <button onClick={toggleMute} className="p-1.5 hover:text-mg-green transition">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : volume < 0.5 ? <Volume1 className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => setVol(parseFloat(e.target.value))}
                  className="w-14 h-1 accent-mg-green cursor-pointer"
                />
              </div>

              {!isLive && <span className="text-xs font-mono text-white/90">{fmt(current)} / {fmt(duration)}</span>}
              <div className="flex-1" />

              <div className="relative">
                <button onClick={() => setShowSpeed((s) => !s)} className="flex items-center gap-1 px-2 py-1.5 hover:text-mg-green transition text-xs font-semibold">
                  <Gauge className="w-4 h-4" /> {rate}x
                </button>
                <AnimatePresence>
                  {showSpeed && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                      className="absolute bottom-9 right-0 bg-black/90 border border-white/15 rounded-md py-1 min-w-20"
                    >
                      {SPEEDS.map((r) => (
                        <button key={r} onClick={() => setSpeed(r)} className={cn("block w-full text-left px-3 py-1 text-xs hover:bg-white/10", r === rate ? "text-mg-green" : "text-white/80")}>{r}x</button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button onClick={togglePip} className="p-1.5 hover:text-mg-green transition" title="Picture in Picture"><PictureInPicture2 className="w-5 h-5" /></button>
              <button onClick={onFullscreen} className="p-1.5 hover:text-mg-green transition" title="Fullscreen">{fs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}