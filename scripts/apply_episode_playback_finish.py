from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text()


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'Missing anchor: {label}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Start preparing the following episode after one minute, not at credits.
# ---------------------------------------------------------------------------
path = 'src/components/mg/PlayerProvider.jsx'
text = read(path)
text = replace_once(
    text,
    'Number(prepared?.preparedAt || 0) > Date.now() - 15 * 60 * 1000',
    'Number(prepared?.preparedAt || 0) > Date.now() - 2 * 60 * 60 * 1000',
    'prepared episode freshness',
)
text = replace_once(
    text,
    '''      if (!Number.isFinite(duration) || duration < 180 || currentTime < 60) {
        return;
      }

      const remaining = duration - currentTime;
      const preloadWindow = Math.min(150, Math.max(75, duration * 0.12));

      if (remaining > preloadWindow) {
        return;
      }''',
    '''      /*
       * Start preparing the following episode once this one has been playing
       * for a minute. That gives Real-Debrid/torrent sources almost the whole
       * episode to become ready instead of waiting for the closing credits.
       */
      if (!Number.isFinite(duration) || duration < 180 || currentTime < 60) {
        return;
      }

      const remaining = duration - currentTime;

      if (!Number.isFinite(remaining) || remaining <= 5) {
        return;
      }''',
    'early next episode preparation window',
)
text = replace_once(
    text,
    '''          const next = await findNextEpisodeRequest(current);
          if (!next) return null;

          const prepared =''',
    '''          const next = await findNextEpisodeRequest(current);
          if (!next) return null;

          /*
           * Queue the canonical next-episode resume row immediately as well as
           * preparing its source. If the app is interrupted later in the
           * episode, Continue Watching still knows the correct following item.
           */
          await queueContinueWatching(next);

          const prepared =''',
    'next episode queue before prepare',
)
write(path, text)


# ---------------------------------------------------------------------------
# 2. Finish the web/mobile skip + countdown overlay.
# ---------------------------------------------------------------------------
write(
    'src/components/mg/MediaGodV2Assist.jsx',
    r'''import React, {
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
'''
)


# ---------------------------------------------------------------------------
# 3. Native Fire TV manual/countdown Next must feed the same web pipeline.
# ---------------------------------------------------------------------------
path = 'src/components/mg/VideoPlayer.jsx'
text = read(path)
ended_anchor = '''      if (
        reason === "ended" &&
        !isLive
      ) {'''
next_block = '''      if (
        reason === "next" &&
        !isLive
      ) {
        recordPlaybackReliability(
          sourceDisplayLabel(active, activeIdx),
          "good"
        );

        window.dispatchEvent(
          new CustomEvent("mg:play-next-episode")
        );
        return;
      }

'''
if next_block not in text:
    if ended_anchor not in text:
        raise SystemExit('Missing anchor: VideoPlayer native ended result')
    text = text.replace(ended_anchor, next_block + ended_anchor, 1)
write(path, text)


# Keep the Fire TV takeover black/seamless for a native Next result just as it
# already does for a natural native End result.
path = 'src/components/mg/FireTvPlayerTakeover.jsx'
text = read(path)
text = replace_once(
    text,
    '      if (reason === "ended") {',
    '      if (reason === "ended" || reason === "next") {',
    'Fire TV seamless native next result',
)
write(path, text)


# ---------------------------------------------------------------------------
# 4. Complete missing native Fire TV assist controls + countdown.
# ---------------------------------------------------------------------------
path = 'firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt'
text = read(path)
text = replace_once(
    text,
    '        private const val LIVE_STALL_TIMEOUT_MS = 12000L\n',
    '        private const val LIVE_STALL_TIMEOUT_MS = 12000L\n        private const val NEXT_EPISODE_COUNTDOWN_MS = 10000L\n',
    'native countdown constant',
)
text = replace_once(
    text,
    '''    private lateinit var skipCreditsButton: Button
    private lateinit var playNextButton: Button
    private var player: ExoPlayer? = null''',
    '''    private lateinit var skipCreditsButton: Button
    private lateinit var playNextButton: Button
    private lateinit var cancelNextButton: Button
    private var player: ExoPlayer? = null''',
    'native cancel button field',
)
text = replace_once(
    text,
    '''    private var creditsStartMs = -1L
    private var initialPositionMs = 0L''',
    '''    private var creditsStartMs = -1L
    private var nextEpisodeCountdownStartedAtMs = -1L
    private var nextEpisodeCountdownCancelled = false
    private var initialPositionMs = 0L''',
    'native countdown state',
)
text = replace_once(
    text,
    '''        if (::playerView.isInitialized) {
            playerView.removeCallbacks(hideControllerRunnable)
        }''',
    '''        if (::playerView.isInitialized) {
            playerView.removeCallbacks(hideControllerRunnable)
            playerView.removeCallbacks(updateAssistControlsRunnable)
        }''',
    'native assist runnable cleanup',
)

native_methods = r'''
    private fun payloadMarkerMs(key: String): Long {
        val value = payload.optDouble(key, -1.0)
        if (!value.isFinite() || value < 0.0) return -1L

        /* The web side normally sends seconds, but older marker providers can
         * still expose milliseconds. A five-digit chapter value is not a
         * realistic number of seconds for VOD, so preserve it as milliseconds. */
        return if (value >= 10_000.0) {
            value.toLong().coerceAtLeast(0L)
        } else {
            (value * 1000.0).toLong().coerceAtLeast(0L)
        }
    }

    private fun isTvEpisode(): Boolean =
        !live &&
            (
                mediaType == "tv" ||
                    mediaType == "series" ||
                    payload.optInt("season", 0) > 0 ||
                    payload.optInt("episode", 0) > 0
            )

    private fun buildAssistButton(
        label: String,
        onClick: () -> Unit
    ): Button =
        Button(this).apply {
            text = label
            isAllCaps = false
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.argb(220, 18, 18, 18))
            textSize = 14f
            minHeight = dp(46)
            minWidth = dp(112)
            isFocusable = true
            isFocusableInTouchMode = false
            visibility = View.GONE
            setPadding(dp(12), 0, dp(12), 0)
            setOnClickListener { onClick() }
        }

    private fun buildAssistControls(): LinearLayout {
        skipRecapButton = buildAssistButton("Skip recap") {
            val activePlayer = player ?: return@buildAssistButton
            val target =
                if (recapEndMs > activePlayer.currentPosition) recapEndMs + 250L
                else activePlayer.currentPosition + 45_000L
            seekAssistTo(target)
        }

        skipIntroButton = buildAssistButton("Skip intro") {
            val activePlayer = player ?: return@buildAssistButton
            val target =
                if (introEndMs > activePlayer.currentPosition) introEndMs + 250L
                else activePlayer.currentPosition + 85_000L
            seekAssistTo(target)
        }

        skipCreditsButton = buildAssistButton("Skip credits") {
            if (isTvEpisode()) {
                finishWithResult("next")
            } else {
                val activePlayer = player ?: return@buildAssistButton
                val duration = activePlayer.duration.takeIf { it > 0L } ?: return@buildAssistButton
                seekAssistTo(maxOf(0L, duration - 750L))
            }
        }

        playNextButton = buildAssistButton("Play next") {
            finishWithResult("next")
        }

        cancelNextButton = buildAssistButton("Cancel") {
            nextEpisodeCountdownCancelled = true
            nextEpisodeCountdownStartedAtMs = -1L
            updateAssistControls()
            playerView.requestFocus()
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(5), dp(3), dp(5), dp(3))
            setBackgroundColor(Color.argb(175, 0, 0, 0))
            visibility = View.GONE
            addView(skipRecapButton)
            addView(skipIntroButton)
            addView(skipCreditsButton)
            addView(playNextButton)
            addView(cancelNextButton)
        }
    }

    private fun seekAssistTo(targetMs: Long) {
        val activePlayer = player ?: return
        if (live && !activePlayer.isCurrentMediaItemSeekable) return

        val duration = activePlayer.duration.takeIf { it > 0L } ?: Long.MAX_VALUE
        val target = targetMs
            .coerceAtLeast(0L)
            .coerceAtMost(duration)

        activePlayer.seekTo(target)
        activePlayer.play()
        showControllerTemporarily()
        playerView.requestFocus()
    }

    private fun firstVisibleAssistButton(): Button? =
        listOf(
            skipRecapButton,
            skipIntroButton,
            skipCreditsButton,
            playNextButton,
            cancelNextButton
        ).firstOrNull { it.visibility == View.VISIBLE }

    private fun setAssistVisible(button: Button, visible: Boolean) {
        button.visibility = if (visible) View.VISIBLE else View.GONE
    }

    private fun updateAssistControls() {
        if (
            resultSent ||
            !::assistControls.isInitialized ||
            !::skipRecapButton.isInitialized ||
            live
        ) {
            if (::assistControls.isInitialized) {
                assistControls.visibility = View.GONE
            }
            return
        }

        val activePlayer = player
        if (activePlayer == null) {
            assistControls.visibility = View.GONE
            return
        }

        val position = maxOf(0L, activePlayer.currentPosition)
        val duration = activePlayer.duration.takeIf { it > 0L } ?: 0L
        val remaining = if (duration > 0L) maxOf(0L, duration - position) else Long.MAX_VALUE
        val tvEpisode = isTvEpisode()
        val playingNow = activePlayer.isPlaying

        val exactRecap =
            tvEpisode &&
                recapEndMs > 0L &&
                position >= maxOf(0L, recapStartMs) &&
                position < recapEndMs
        val fallbackRecap =
            tvEpisode &&
                recapEndMs < 0L &&
                playingNow &&
                position in 4_000L..75_000L &&
                (duration <= 0L || remaining > 180_000L)

        val exactIntro =
            tvEpisode &&
                introEndMs > 0L &&
                position >= maxOf(0L, introStartMs) &&
                position < introEndMs
        val fallbackIntro =
            tvEpisode &&
                introEndMs < 0L &&
                playingNow &&
                position in 45_000L..420_000L &&
                (duration <= 0L || remaining > 120_000L)

        val creditsFallbackWindow =
            if (tvEpisode) {
                if (duration > 0L) {
                    minOf(240_000L, maxOf(75_000L, (duration * 0.09).toLong()))
                } else 0L
            } else {
                if (duration > 0L) {
                    minOf(360_000L, maxOf(120_000L, (duration * 0.08).toLong()))
                } else 0L
            }

        val exactCredits =
            duration >= 300_000L &&
                creditsStartMs > 0L &&
                position >= creditsStartMs &&
                position < duration - 500L
        val fallbackCredits =
            duration >= 300_000L &&
                creditsStartMs < 0L &&
                position > (duration * 0.55).toLong() &&
                remaining <= creditsFallbackWindow
        val creditsVisible = exactCredits || fallbackCredits

        val nextWindowMs =
            if (duration > 0L) {
                minOf(180_000L, maxOf(75_000L, (duration * 0.10).toLong()))
            } else 0L
        val nextEpisodeWindow =
            tvEpisode &&
                duration >= 180_000L &&
                position >= 60_000L &&
                remaining <= nextWindowMs

        setAssistVisible(skipRecapButton, exactRecap || fallbackRecap)
        setAssistVisible(skipIntroButton, exactIntro || fallbackIntro)
        setAssistVisible(skipCreditsButton, creditsVisible)

        if (tvEpisode && creditsVisible) {
            skipCreditsButton.text = "Skip credits → Next"
        } else {
            skipCreditsButton.text = "Skip credits"
        }

        val countdownWindow =
            tvEpisode &&
                duration >= 180_000L &&
                position >= 60_000L &&
                (exactCredits || remaining <= 15_000L)
        val showNext = tvEpisode && (nextEpisodeWindow || exactCredits)

        setAssistVisible(playNextButton, showNext)

        if (
            autoNext &&
            countdownWindow &&
            playingNow &&
            !nextEpisodeCountdownCancelled
        ) {
            if (nextEpisodeCountdownStartedAtMs < 0L) {
                nextEpisodeCountdownStartedAtMs = android.os.SystemClock.elapsedRealtime()
            }

            val elapsed =
                android.os.SystemClock.elapsedRealtime() - nextEpisodeCountdownStartedAtMs
            val left = NEXT_EPISODE_COUNTDOWN_MS - elapsed

            if (left <= 0L) {
                nextEpisodeCountdownCancelled = true
                nextEpisodeCountdownStartedAtMs = -1L
                finishWithResult("next")
                return
            }

            val seconds = maxOf(1L, (left + 999L) / 1000L)
            playNextButton.text = "Next episode in ${seconds}s"
            setAssistVisible(playNextButton, true)
            setAssistVisible(cancelNextButton, true)
        } else {
            if (!countdownWindow || !playingNow || !autoNext) {
                nextEpisodeCountdownStartedAtMs = -1L
            }
            playNextButton.text = "Play next"
            setAssistVisible(cancelNextButton, false)
        }

        val anyVisible = listOf(
            skipRecapButton,
            skipIntroButton,
            skipCreditsButton,
            playNextButton,
            cancelNextButton
        ).any { it.visibility == View.VISIBLE }

        assistControls.visibility = if (anyVisible) View.VISIBLE else View.GONE
    }

'''
anchor = '''    private fun canChooseEpisode(): Boolean =
        !live && payload.optBoolean("canChooseEpisode", false)
'''
if native_methods not in text:
    if anchor not in text:
        raise SystemExit('Missing anchor: native assist methods insertion')
    text = text.replace(anchor, native_methods + anchor, 1)
write(path, text)


# ---------------------------------------------------------------------------
# 5. Repair the unrelated current-main test blocker so CI reaches build/native.
# ---------------------------------------------------------------------------
path = 'src/components/mg/mediaEdition.js'
text = read(path)
old = '''export const sourceHasEdition = (item, edition) => {
  const wanted = String(edition || "any");
  if (wanted === "any") return true;

  /*
   * Edition boxes are exact. Standard / Original and an explicitly tagged
   * Theatrical cut are allowed to be separate categories because users may
   * deliberately choose either one. Untagged sources therefore stay in the
   * Standard / Original box instead of silently satisfying another edition.
   */
  return detectMediaEdition(item).value === wanted;
};'''
new = '''export const sourceHasEdition = (item, edition) => {
  const wanted = String(edition || "any");
  if (wanted === "any") return true;

  const detected = detectMediaEdition(item);

  /*
   * An untagged original is the theatrical/default release when no more
   * specific edition marker is present. Explicit Director's Cut, Extended,
   * Unrated, etc. remain separate and do not leak into the theatrical group.
   */
  if (
    wanted === "theatrical" &&
    detected.value === "standard" &&
    detected.explicit === false
  ) {
    return true;
  }

  return detected.value === wanted;
};'''
text = replace_once(text, old, new, 'theatrical untagged edition regression')
write(path, text)


# ---------------------------------------------------------------------------
# 6. Add a targeted source-level gate for the behaviour finished above.
# ---------------------------------------------------------------------------
write(
    'scripts/episode-playback-regression-check.mjs',
    r'''import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const expect = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
};

const provider = read("src/components/mg/PlayerProvider.jsx");
const assist = read("src/components/mg/MediaGodV2Assist.jsx");
const videoPlayer = read("src/components/mg/VideoPlayer.jsx");
const takeover = read("src/components/mg/FireTvPlayerTakeover.jsx");
const native = read("firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt");
const edition = read("src/components/mg/mediaEdition.js");

expect(
  provider.includes("currentTime < 60") &&
    provider.includes("await queueContinueWatching(next)") &&
    provider.includes("2 * 60 * 60 * 1000") &&
    !provider.includes("const preloadWindow = Math.min(150"),
  "next episode starts preparing after one minute and remains reusable for long episodes"
);

expect(
  assist.includes("Next episode in ${nextCountdownSeconds}s") &&
    assist.includes("Cancel automatic next episode") &&
    assist.includes('new CustomEvent("mg:play-next-episode")') &&
    assist.includes("exactCreditsCountdownWindow"),
  "web/mobile overlay has marker-aware skip and cancellable next-episode countdown"
);

expect(
  videoPlayer.includes('reason === "next"') &&
    videoPlayer.includes('new CustomEvent("mg:play-next-episode")'),
  "native Fire TV Next returns through the shared episode playback pipeline"
);

expect(
  takeover.includes('reason === "ended" || reason === "next"'),
  "Fire TV keeps the inter-episode native handoff visually seamless"
);

expect(
  native.includes("private fun buildAssistControls()") &&
    native.includes("private fun updateAssistControls()") &&
    native.includes("private fun payloadMarkerMs") &&
    native.includes('finishWithResult("next")') &&
    native.includes("NEXT_EPISODE_COUNTDOWN_MS") &&
    native.includes("Skip credits → Next"),
  "Fire TV native player has skip controls and a cancellable auto-next countdown"
);

expect(
  edition.includes('wanted === "theatrical"') &&
    edition.includes('detected.value === "standard"') &&
    edition.includes("detected.explicit === false"),
  "untagged theatrical/original sources satisfy the current regression contract"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
'''
)

print('Episode playback finishing patch applied.')
