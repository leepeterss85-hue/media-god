import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FastForward,
  Repeat2,
  SkipForward,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

const getVisibleVideo = () => {
  if (typeof document === "undefined") return null;

  const videos = Array.from(document.querySelectorAll("video"));

  return (
    videos.find((video) => {
      const rect = video.getBoundingClientRect();
      const style = window.getComputedStyle(video);

      return (
        rect.width > 40 &&
        rect.height > 40 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    }) ||
    videos[0] ||
    null
  );
};

const markerSeconds = (value, duration = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;

  /*
   * Some addons expose chapter markers in milliseconds while others use
   * seconds. Values that are implausibly larger than the known media duration
   * are treated as milliseconds so the same UI can consume either form.
   */
  if (
    number >= 10_000 &&
    (!duration || number > duration * 4)
  ) {
    return number / 1000;
  }

  return number;
};

const seekVisibleVideo = (seconds) => {
  const target = Math.max(0, Number(seconds || 0));
  const video = getVisibleVideo();

  if (video) {
    try {
      const duration = Number(video.duration || 0);
      video.currentTime =
        duration > 0
          ? Math.min(target, Math.max(0, duration - 0.5))
          : target;
      void video.play?.().catch?.(() => {});
    } catch {
      // The shared player-seek event below is the fallback.
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("mg:player-seek-to", {
        detail: { seconds: target },
      })
    );
  }
};

export default function MediaGodV2Assist() {
  const [context, setContext] = useState(() => {
    if (typeof window === "undefined") return null;
    return window.__MG_PLAYER_CONTEXT__ || null;
  });
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [nextCountdownDeadline, setNextCountdownDeadline] = useState(0);
  const [nextCountdownSeconds, setNextCountdownSeconds] = useState(0);
  const [nextCountdownCancelled, setNextCountdownCancelled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onContext = (event) => {
      setContext(event?.detail || null);
      setPosition(0);
      setDuration(0);
      setPlaying(false);
    };

    const onPosition = (event) => {
      const detail = event?.detail || {};
      const nextPosition = Number(detail.currentTime || 0);
      const nextDuration = Number(detail.duration || 0);

      if (Number.isFinite(nextPosition)) {
        setPosition(Math.max(0, nextPosition));
      }
      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setDuration(nextDuration);
      }
      setPlaying(true);
    };

    window.addEventListener("mg:player-context", onContext);
    window.addEventListener("mg:playback-position", onPosition);

    return () => {
      window.removeEventListener("mg:player-context", onContext);
      window.removeEventListener("mg:playback-position", onPosition);
    };
  }, []);

  useEffect(() => {
    if (!context) return undefined;

    let cancelled = false;

    const sync = () => {
      if (cancelled) return;

      const video = getVisibleVideo();
      if (!video) return;

      const nextPosition = Number(video.currentTime || 0);
      const nextDuration = Number(video.duration || 0);

      if (Number.isFinite(nextPosition)) {
        setPosition(Math.max(0, nextPosition));
      }
      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setDuration(nextDuration);
      }

      setPlaying(!video.paused && !video.ended);
    };

    sync();
    const timer = window.setInterval(sync, 750);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [context]);

  const isTv = context?.mediaType === "tv";
  const isMovie = context?.mediaType === "movie";
  const isPlayableVod = isTv || isMovie;
  const episodeKey = [
    context?.tmdbId ?? context?.tmdb_id ?? "",
    context?.season ?? "",
    context?.episode ?? "",
  ].join(":");

  const recapStart = markerSeconds(context?.recapStart, duration);
  const recapEnd = markerSeconds(context?.recapEnd, duration);
  const introStart = markerSeconds(context?.introStart, duration);
  const introEnd = markerSeconds(context?.introEnd, duration);
  const creditsStart = markerSeconds(context?.creditsStart, duration);

  const remaining =
    duration > 0
      ? Math.max(0, duration - position)
      : Number.POSITIVE_INFINITY;

  const exactRecapWindow =
    isTv &&
    recapEnd != null &&
    recapEnd > 0 &&
    position >= Math.max(0, recapStart ?? 0) &&
    position < recapEnd;

  const fallbackRecapWindow =
    isTv &&
    recapEnd == null &&
    playing &&
    position >= 4 &&
    position <= 75 &&
    (!duration || remaining > 180);

  const canSkipRecap = exactRecapWindow || fallbackRecapWindow;

  const exactIntroWindow =
    isTv &&
    introEnd != null &&
    introEnd > 0 &&
    position >= Math.max(0, introStart ?? 0) &&
    position < introEnd;

  const fallbackIntroWindow =
    isTv &&
    introEnd == null &&
    playing &&
    position >= 45 &&
    position <= 420 &&
    (!duration || remaining > 120);

  const canSkipIntro = exactIntroWindow || fallbackIntroWindow;

  const creditsWindow = useMemo(() => {
    if (!isPlayableVod || !duration || duration < 300) return false;

    if (creditsStart != null && creditsStart > 0) {
      return position >= creditsStart && position < duration - 0.5;
    }

    const fallbackWindow = isTv
      ? Math.min(240, Math.max(75, duration * 0.09))
      : Math.min(360, Math.max(120, duration * 0.08));

    return (
      position > duration * 0.55 &&
      remaining <= fallbackWindow
    );
  }, [creditsStart, duration, isPlayableVod, isTv, position, remaining]);

  const nextEpisodeWindow =
    isTv &&
    duration >= 180 &&
    position >= 60 &&
    remaining <= Math.min(180, Math.max(75, duration * 0.1));

  /*
   * The broad nextEpisodeWindow is deliberately only an invitation to skip.
   * Automatic countdown is more conservative: exact credits metadata can
   * start it immediately, otherwise we wait until the final 15 seconds. This
   * prevents a heuristic credits guess from jumping several minutes early.
   */
  const exactCreditsCountdownWindow =
    isTv &&
    creditsStart != null &&
    creditsStart > 0 &&
    position >= creditsStart &&
    duration > 0 &&
    position < duration - 0.5;

  const autoNextCountdownWindow =
    isTv &&
    duration >= 180 &&
    position >= 60 &&
    (
      exactCreditsCountdownWindow ||
      remaining <= 15
    );

  const showNextAction =
    isTv &&
    (nextEpisodeWindow || exactCreditsCountdownWindow);

  useEffect(() => {
    setNextCountdownDeadline(0);
    setNextCountdownSeconds(0);
    setNextCountdownCancelled(false);
  }, [episodeKey]);

  useEffect(() => {
    if (
      !isTv ||
      !context?.autoNext ||
      !autoNextCountdownWindow ||
      !playing ||
      nextCountdownCancelled
    ) {
      if (
        nextCountdownDeadline &&
        (!autoNextCountdownWindow || !playing || !context?.autoNext)
      ) {
        setNextCountdownDeadline(0);
        setNextCountdownSeconds(0);
      }
      return undefined;
    }

    let deadline = Number(nextCountdownDeadline || 0);

    if (!deadline) {
      deadline = Date.now() + 10_000;
      setNextCountdownDeadline(deadline);
      setNextCountdownSeconds(10);
    }

    const tick = () => {
      const milliseconds = deadline - Date.now();

      if (milliseconds <= 0) {
        setNextCountdownDeadline(0);
        setNextCountdownSeconds(0);
        setNextCountdownCancelled(true);
        window.dispatchEvent(new CustomEvent("mg:play-next-episode"));
        return false;
      }

      setNextCountdownSeconds(
        Math.max(1, Math.ceil(milliseconds / 1000))
      );
      return true;
    };

    tick();
    const timer = window.setInterval(() => {
      if (!tick()) {
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [
    autoNextCountdownWindow,
    context?.autoNext,
    episodeKey,
    isTv,
    nextCountdownCancelled,
    nextCountdownDeadline,
    playing,
  ]);

  if (!context || !isPlayableVod) return null;

  const skipRecap = () => {
    const exactTarget =
      recapEnd != null && recapEnd > position
        ? recapEnd + 0.25
        : null;

    seekVisibleVideo(exactTarget ?? position + 45);
  };

  const skipIntro = () => {
    const exactTarget =
      introEnd != null && introEnd > position
        ? introEnd + 0.25
        : null;

    seekVisibleVideo(exactTarget ?? position + 85);
  };

  const playNext = () => {
    if (typeof window === "undefined") return;
    setNextCountdownDeadline(0);
    setNextCountdownSeconds(0);
    setNextCountdownCancelled(true);
    window.dispatchEvent(new CustomEvent("mg:play-next-episode"));
  };

  const cancelAutoNextCountdown = () => {
    setNextCountdownDeadline(0);
    setNextCountdownSeconds(0);
    setNextCountdownCancelled(true);
  };

  const skipCredits = () => {
    if (isTv) {
      playNext();
      return;
    }

    if (duration > 0) {
      seekVisibleVideo(Math.max(0, duration - 0.75));
    }
  };

  const toggleAutoNext = () => {
    if (typeof window === "undefined") return;

    const enabled = !context?.autoNext;

    if (!enabled) {
      cancelAutoNextCountdown();
    } else {
      setNextCountdownCancelled(false);
    }

    window.dispatchEvent(
      new CustomEvent("mg:set-auto-next", {
        detail: { enabled },
      })
    );
  };

  const buttonClass =
    "pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-black/80 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-sm hover:border-mg-green/50 hover:text-mg-green focus:outline-none focus:ring-2 focus:ring-mg-green";

  return (
    <div className="fixed left-3 top-3 z-[80] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 pointer-events-none">
      {canSkipRecap && (
        <button
          type="button"
          onClick={skipRecap}
          className={buttonClass}
          aria-label="Skip recap"
        >
          <FastForward className="h-4 w-4" />
          Skip recap
        </button>
      )}

      {canSkipIntro && (
        <button
          type="button"
          onClick={skipIntro}
          className={buttonClass}
          aria-label="Skip intro or opening titles"
        >
          <FastForward className="h-4 w-4" />
          Skip intro / titles
        </button>
      )}

      {creditsWindow && (
        <button
          type="button"
          onClick={skipCredits}
          className={buttonClass}
          aria-label={isTv ? "Skip credits and play next episode" : "Skip credits"}
        >
          <SkipForward className="h-4 w-4" />
          {isTv ? "Skip credits → Next" : "Skip credits"}
        </button>
      )}

      {showNextAction && (
        <button
          type="button"
          onClick={playNext}
          className={buttonClass}
          aria-label="Play next episode"
        >
          <SkipForward className="h-4 w-4" />
          {nextCountdownSeconds > 0 &&
          context?.autoNext &&
          !nextCountdownCancelled
            ? `Next episode in ${nextCountdownSeconds}s`
            : "Play next"}
        </button>
      )}

      {nextCountdownSeconds > 0 &&
        context?.autoNext &&
        !nextCountdownCancelled && (
          <button
            type="button"
            onClick={cancelAutoNextCountdown}
            className={buttonClass}
            aria-label="Cancel automatic next episode"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        )}

      {isTv && (
        <button
          type="button"
          onClick={toggleAutoNext}
          className={cn(
            "pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-xl backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-mg-green",
            context?.autoNext
              ? "border-mg-green/40 bg-mg-green/15 text-mg-green"
              : "border-white/15 bg-black/80 text-white/70 hover:text-white"
          )}
          aria-label="Toggle automatic next episode"
        >
          <Repeat2 className="h-4 w-4" />
          Auto next {context?.autoNext ? "On" : "Off"}
        </button>
      )}

      {isTv && context?.season != null && context?.episode != null && (
        <span className="pointer-events-none rounded-lg border border-white/10 bg-black/70 px-2.5 py-2 text-[10px] font-semibold text-white/60 backdrop-blur-sm">
          S{String(context.season).padStart(2, "0")} E{String(context.episode).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}
