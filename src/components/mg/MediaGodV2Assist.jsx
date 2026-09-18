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

  const episodeNumber = Math.max(0, Number(context?.episode || 0));
  const hasNextEpisode = context?.nextEpisodeAvailable !== false;
  const hasRecapMarker = recapEnd != null && recapEnd > 0;
  const hasIntroMarker = introEnd != null && introEnd > 0;
  const hasCreditsMarker = creditsStart != null && creditsStart > 0;

  /*
   * Episode assist is phase-based. Exact chapter metadata always wins. When a
   * source has no markers we use deliberately short, non-overlapping fallback
   * windows instead of leaving recap/intro actions on screen for minutes.
   */
  const exactRecapWindow =
    isTv &&
    hasRecapMarker &&
    position >= Math.max(0, recapStart ?? 0) &&
    position < recapEnd;

  const fallbackRecapWindow =
    isTv &&
    !hasRecapMarker &&
    episodeNumber > 1 &&
    playing &&
    position >= 4 &&
    position <= 65 &&
    (!duration || remaining > 180);

  const canSkipRecap = exactRecapWindow || fallbackRecapWindow;

  const exactIntroWindow =
    isTv &&
    hasIntroMarker &&
    position >= Math.max(0, introStart ?? 0) &&
    position < introEnd;

  const fallbackIntroStart = hasRecapMarker
    ? Math.max(15, Math.min(180, Number(recapEnd || 0) + 2))
    : episodeNumber > 1
      ? 65
      : 15;

  const fallbackIntroWindow =
    isTv &&
    !hasIntroMarker &&
    playing &&
    !canSkipRecap &&
    position >= fallbackIntroStart &&
    position <= 210 &&
    (!duration || remaining > 120);

  const canSkipIntro =
    !canSkipRecap && (exactIntroWindow || fallbackIntroWindow);

  const exactCreditsWindow =
    isPlayableVod &&
    hasCreditsMarker &&
    duration > 0 &&
    position >= creditsStart &&
    position < duration - 0.5;

  const creditsWindow = useMemo(() => {
    if (!isPlayableVod || !duration || duration < 300) return false;
    if (exactCreditsWindow) return true;
    if (hasCreditsMarker) return false;

    const fallbackWindow = isTv
      ? Math.min(90, Math.max(45, duration * 0.04))
      : Math.min(180, Math.max(90, duration * 0.05));

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
   * "Next episode" is an end-of-episode action. Exact credits metadata may
   * reveal the phase earlier; without it we wait until the final minute.
   * A confirmed series finale suppresses the action entirely.
   */
  const nextEpisodeWindow =
    isTv &&
    hasNextEpisode &&
    duration >= 180 &&
    position >= 60 &&
    (
      exactCreditsWindow ||
      remaining <= 60
    );

  /*
   * Automatic next is intentionally later than the manual next action. Even
   * with an exact credits marker, do not start a countdown through several
   * minutes of credits or a possible post-credit scene.
   */
  const exactCreditsCountdownWindow =
    isTv &&
    hasNextEpisode &&
    exactCreditsWindow &&
    remaining <= 75;

  const autoNextCountdownWindow =
    isTv &&
    hasNextEpisode &&
    duration >= 180 &&
    position >= 60 &&
    (
      exactCreditsCountdownWindow ||
      remaining <= 20
    );

  const showNextAction =
    nextEpisodeWindow || autoNextCountdownWindow;

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

  if (!context || !isPlayableVod || !portalTarget) return null;

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
          Skip intro / titles
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

      {showNextAction && (
        <button
          type="button"
          onPointerDown={(event) => runAction(event, playNext)}
          onClick={(event) => runClickFallback(event, playNext)}
          onKeyDown={(event) => runKeyAction(event, playNext)}
          tabIndex={0}
          className={buttonClass}
          aria-label="Play next episode"
        >
          <SkipForward className="h-4 w-4" />
          {nextCountdownSeconds > 0 &&
          context?.autoNext &&
          !nextCountdownCancelled
            ? `Next ${nextEpisodeLabel} in ${nextCountdownSeconds}s`
            : `Play ${nextEpisodeLabel}`}
        </button>
      )}

      {nextCountdownSeconds > 0 &&
        context?.autoNext &&
        !nextCountdownCancelled && (
          <button
            type="button"
            onPointerDown={(event) => runAction(event, cancelAutoNextCountdown)}
            onClick={(event) => runClickFallback(event, cancelAutoNextCountdown)}
            onKeyDown={(event) => runKeyAction(event, cancelAutoNextCountdown)}
            tabIndex={0}
            className={buttonClass}
            aria-label="Keep watching current episode"
          >
            <X className="h-4 w-4" />
            Stay here
          </button>
        )}

    </div>
  );

  return createPortal(controls, portalTarget);
}
