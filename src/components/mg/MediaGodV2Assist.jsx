import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPortal,
} from "react-dom";

import {
  FastForward,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";


const getPlayerRoot = () => {
  if (typeof document === "undefined") return null;

  const root = document.querySelector(
    '[data-mg-player-root="true"]'
  );

  return root instanceof HTMLElement && root.isConnected
    ? root
    : null;
};

const getVisibleVideo = () => {
  if (typeof document === "undefined") return null;

  const root = getPlayerRoot() || document;
  const videos = Array.from(root.querySelectorAll("video"));

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
  // Episode controls are enabled again, but only marker-backed recap/intro
  // actions are trusted. Natural `ended` events still own automatic next.
  const suppressEpisodeControls = false;
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
  const [portalTarget, setPortalTarget] = useState(() => getPlayerRoot());
  const lastDirectActionAtRef = useRef(0);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    let frame = 0;

    const refreshTarget = () => {
      frame = 0;
      const nextTarget = getPlayerRoot();
      setPortalTarget((current) =>
        current === nextTarget ? current : nextTarget
      );
    };

    const scheduleRefresh = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(refreshTarget);
    };

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("mg:player-context", scheduleRefresh);
    refreshTarget();

    return () => {
      observer.disconnect();
      window.removeEventListener("mg:player-context", scheduleRefresh);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

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

  const hasNextEpisode = context?.nextEpisodeAvailable !== false;
  const hasRecapMarker = recapEnd != null && recapEnd > 0;
  const hasIntroMarker = introEnd != null && introEnd > 0;
  const hasCreditsMarker = creditsStart != null && creditsStart > 0;

  /*
   * Never invent recap/intro timing from the episode clock. A wrong skip is
   * worse than no button, so these controls only appear when the playback
   * request carries an explicit marker for the current episode.
   */
  const exactRecapWindow =
    isTv &&
    hasRecapMarker &&
    position >= Math.max(0, recapStart ?? 0) &&
    position < recapEnd;

  const canSkipRecap = exactRecapWindow;

  const exactIntroWindow =
    isTv &&
    hasIntroMarker &&
    position >= Math.max(0, introStart ?? 0) &&
    position < introEnd;

  const canSkipIntro = !canSkipRecap && exactIntroWindow;

  const exactCreditsWindow =
    isPlayableVod &&
    hasCreditsMarker &&
    duration > 0 &&
    position >= creditsStart &&
    position < duration - 0.5;

  const creditsWindow = useMemo(() => {
    if (!isPlayableVod || !duration || duration < 300) return false;
    if (exactCreditsWindow) return true;
    if (hasCreditsMarker || isTv) return false;

    const fallbackWindow = Math.min(
      180,
      Math.max(90, duration * 0.05)
    );

    return (
      position > duration * 0.7 &&
      remaining <= fallbackWindow
    );
  }, [
    duration,
    exactCreditsWindow,
    hasCreditsMarker,
    isPlayableVod,
    isTv,
    position,
    remaining,
  ]);

  /*
   * "Next episode" can be offered once verified credits begin, or very near
   * the natural end when no credits marker exists. Automatic advancement is
   * deliberately left to the media `ended` event so post-credit scenes are
   * never cut short by a guessed countdown.
   */
  const nextEpisodeWindow =
    isTv &&
    hasNextEpisode &&
    duration >= 180 &&
    position >= 60 &&
    (
      exactCreditsWindow ||
      remaining <= 90
    );

  const autoNextCountdownWindow =
    isTv &&
    hasNextEpisode &&
    context?.autoNext &&
    duration >= 180 &&
    position >= 60 &&
    playing &&
    !nextCountdownCancelled &&
    (exactCreditsWindow || remaining <= 15);

  const showNextAction = nextEpisodeWindow;

  const canPlayPrevious =
    isTv &&
    Boolean(context?.tmdbId ?? context?.tmdb_id) &&
    Number(context?.episode ?? 0) > 0;

  useEffect(() => {
    setNextCountdownDeadline(0);
    setNextCountdownSeconds(0);
    setNextCountdownCancelled(false);
  }, [episodeKey]);

  useEffect(() => {
    if (
      suppressEpisodeControls ||
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

  if (!context || !isPlayableVod || !portalTarget ||
      (isTv && suppressEpisodeControls)) return null;

  const runAction = (event, action) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.nativeEvent?.stopImmediatePropagation?.();
    lastDirectActionAtRef.current = Date.now();
    action();
  };

  const runClickFallback = (event, action) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.nativeEvent?.stopImmediatePropagation?.();

    if (Date.now() - Number(lastDirectActionAtRef.current || 0) < 550) {
      return;
    }

    runAction(event, action);
  };

  const runKeyAction = (event, action) => {
    const key = String(event?.key || event?.code || "");
    if (!["Enter", "NumpadEnter", " ", "Spacebar", "Space"].includes(key)) {
      return;
    }
    runAction(event, action);
  };

  const skipRecap = () => {
    const exactTarget =
      recapEnd != null && recapEnd > position
        ? recapEnd + 0.25
        : null;

    const fallbackTarget = Math.min(75, Math.max(position + 30, 50));
    seekVisibleVideo(exactTarget ?? fallbackTarget);
  };

  const skipIntro = () => {
    const exactTarget =
      introEnd != null && introEnd > position
        ? introEnd + 0.25
        : null;

    const fallbackTarget = Math.min(210, Math.max(position + 60, 105));
    seekVisibleVideo(exactTarget ?? fallbackTarget);
  };

  const playNext = () => {
    if (typeof window === "undefined") return;
    setNextCountdownDeadline(0);
    setNextCountdownSeconds(0);
    setNextCountdownCancelled(true);
    window.dispatchEvent(new CustomEvent("mg:play-next-episode"));
  };

  const playPrevious = () => {
    if (typeof window === "undefined") return;
    const tmdbId = context?.tmdbId ?? context?.tmdb_id ?? null;
    const season = Number(context?.season ?? 0);
    const episode = Number(context?.episode ?? 0);

    if (!tmdbId || !season || !episode) return;

    if (episode > 1) {
      window.dispatchEvent(
        new CustomEvent("mg:play-specific-episode", {
          detail: {
            tmdbId,
            seasonNumber: season,
            episodeNumber: episode - 1,
          },
        })
      );
    }
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

  const nextSeason = Math.max(0, Number(context?.nextSeason || 0));
  const nextEpisode = Math.max(0, Number(context?.nextEpisode || 0));
  const nextEpisodeLabel =
    nextSeason > 0 && nextEpisode > 0
      ? `S${nextSeason} E${nextEpisode}`
      : "next episode";

  const buttonClass =
    "pointer-events-auto inline-flex min-h-12 min-w-[7.5rem] touch-manipulation items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/85 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition hover:border-mg-green/60 hover:text-mg-green focus:outline-none focus:ring-4 focus:ring-mg-green/70 active:scale-[0.98]";

  const nextEpisodeName = String(context?.nextEpisodeName || "").trim();
  const nextCard = (
    <div
      className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/15 bg-gradient-to-r from-black/90 to-black/75 p-3 shadow-2xl backdrop-blur-xl"
      data-mg-next-episode-card="true"
    >
      <div className="flex flex-col gap-1.5">
        {nextCountdownSeconds > 0 && context?.autoNext && !nextCountdownCancelled ? (
          <p className="text-[11px] font-bold uppercase tracking-wider text-mg-green">
            Next episode in {nextCountdownSeconds}s
          </p>
        ) : (
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
            Up next
          </p>
        )}
        <p className="text-sm font-bold text-white">
          {nextEpisodeLabel}
        </p>
        {nextEpisodeName && (
          <p className="max-w-[14rem] truncate text-xs text-white/60">
            {nextEpisodeName}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {nextCountdownSeconds > 0 && context?.autoNext && !nextCountdownCancelled && (
          <button
            type="button"
            onPointerDown={(event) => runAction(event, cancelAutoNextCountdown)}
            onClick={(event) => runClickFallback(event, cancelAutoNextCountdown)}
            onKeyDown={(event) => runKeyAction(event, cancelAutoNextCountdown)}
            tabIndex={0}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-mg-green/60"
            aria-label="Keep watching current episode"
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </button>
        )}
        <button
          type="button"
          onPointerDown={(event) => runAction(event, playNext)}
          onClick={(event) => runClickFallback(event, playNext)}
          onKeyDown={(event) => runKeyAction(event, playNext)}
          tabIndex={0}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-mg-green px-4 py-2 text-sm font-bold text-black transition hover:bg-mg-green-dim focus:outline-none focus:ring-2 focus:ring-mg-green/70 active:scale-[0.98]"
          aria-label="Play next episode"
        >
          <SkipForward className="h-4 w-4" />
          Play
        </button>
      </div>
    </div>
  );

  const controls = (
    <div
      className="pointer-events-auto absolute bottom-20 right-4 z-[120] flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-end gap-2"
      data-mg-episode-assist="true"
    >
      {canSkipRecap && (
        <button
          type="button"
          onPointerDown={(event) => runAction(event, skipRecap)}
          onClick={(event) => runClickFallback(event, skipRecap)}
          onKeyDown={(event) => runKeyAction(event, skipRecap)}
          tabIndex={0}
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
          onPointerDown={(event) => runAction(event, skipIntro)}
          onClick={(event) => runClickFallback(event, skipIntro)}
          onKeyDown={(event) => runKeyAction(event, skipIntro)}
          tabIndex={0}
          className={buttonClass}
          aria-label="Skip intro or opening titles"
        >
          <FastForward className="h-4 w-4" />
          Skip intro
        </button>
      )}

      {creditsWindow && !isTv && (
        <button
          type="button"
          onPointerDown={(event) => runAction(event, skipCredits)}
          onClick={(event) => runClickFallback(event, skipCredits)}
          onKeyDown={(event) => runKeyAction(event, skipCredits)}
          tabIndex={0}
          className={buttonClass}
          aria-label={isTv ? "Skip credits and play next episode" : "Skip credits"}
        >
          <SkipForward className="h-4 w-4" />
          {isTv ? "Skip credits → Next" : "Skip credits"}
        </button>
      )}

      {canPlayPrevious && Number(context?.episode ?? 0) > 1 && (
        <button
          type="button"
          onPointerDown={(event) => runAction(event, playPrevious)}
          onClick={(event) => runClickFallback(event, playPrevious)}
          onKeyDown={(event) => runKeyAction(event, playPrevious)}
          tabIndex={0}
          className="pointer-events-auto inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/85 px-3 py-2.5 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition hover:border-mg-green/60 hover:text-mg-green focus:outline-none focus:ring-4 focus:ring-mg-green/70 active:scale-[0.98]"
          aria-label="Play previous episode"
        >
          <SkipBack className="h-4 w-4" />
          Previous
        </button>
      )}

      {showNextAction && nextCard}
    </div>
  );

  return createPortal(controls, portalTarget);
}