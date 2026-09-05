import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Repeat2,
  SkipForward,
} from "lucide-react";

import { cn } from "@/lib/utils";

const getVisibleVideo = () => {
  if (
    typeof document ===
    "undefined"
  ) {
    return null;
  }

  const videos =
    Array.from(
      document.querySelectorAll(
        "video"
      )
    );

  return (
    videos.find(
      (video) => {
        const rect =
          video.getBoundingClientRect();

        const style =
          window.getComputedStyle(
            video
          );

        return (
          rect.width > 40 &&
          rect.height > 40 &&
          style.display !==
            "none" &&
          style.visibility !==
            "hidden"
        );
      }
    ) ||
    videos[0] ||
    null
  );
};

export default function MediaGodV2Assist() {
  const [
    context,
    setContext,
  ] = useState(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return null;
    }

    return (
      window.__MG_PLAYER_CONTEXT__ ||
      null
    );
  });

  const [
    position,
    setPosition,
  ] = useState(0);

  const [
    duration,
    setDuration,
  ] = useState(0);

  const [
    playing,
    setPlaying,
  ] = useState(false);

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return undefined;
    }

    const onContext = (
      event
    ) => {
      setContext(
        event?.detail ||
          null
      );

      setPosition(0);
      setDuration(0);
    };

    window.addEventListener(
      "mg:player-context",
      onContext
    );

    return () => {
      window.removeEventListener(
        "mg:player-context",
        onContext
      );
    };
  }, []);

  useEffect(() => {
    if (!context) {
      return undefined;
    }

    let cancelled =
      false;

    const sync = () => {
      if (cancelled) {
        return;
      }

      const video =
        getVisibleVideo();

      if (!video) {
        setPlaying(false);
        return;
      }

      setPosition(
        Number(
          video.currentTime ||
            0
        )
      );

      setDuration(
        Number(
          video.duration ||
            0
        )
      );

      setPlaying(
        !video.paused &&
          !video.ended
      );
    };

    sync();

    const timer =
      window.setInterval(
        sync,
        750
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        timer
      );
    };
  }, [context]);

  const isTv =
    context?.mediaType ===
    "tv";

  /*
   * This is deliberately a manual
   * Skip Intro helper.
   *
   * We do not currently have true
   * intro timestamps from TMDB/addons.
   *
   * It becomes available during the
   * opening portion of TV episodes and
   * skips forward 85 seconds.
   */
  const canSkipIntro =
    useMemo(
      () =>
        isTv &&
        playing &&
        position >= 15 &&
        position <= 420 &&
        (
          !duration ||
          position <
            duration - 90
        ),
      [
        isTv,
        playing,
        position,
        duration,
      ]
    );

  if (
    !context ||
    !isTv
  ) {
    return null;
  }

  const skipIntro = () => {
    const video =
      getVisibleVideo();

    if (!video) {
      return;
    }

    const next =
      (
        video.currentTime ||
        0
      ) + 85;

    if (
      video.duration
    ) {
      video.currentTime =
        Math.min(
          Math.max(
            0,
            video.duration -
              1
          ),
          next
        );
    } else {
      video.currentTime =
        next;
    }
  };

  const playNext = () => {
    window.dispatchEvent(
      new CustomEvent(
        "mg:play-next-episode"
      )
    );
  };

  const toggleAutoNext =
    () => {
      window.dispatchEvent(
        new CustomEvent(
          "mg:set-auto-next",
          {
            detail: {
              enabled:
                !context
                  ?.autoNext,
            },
          }
        )
      );
    };

  return (
    <div className="fixed left-3 top-3 z-[80] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 pointer-events-none">
      {canSkipIntro && (
        <button
          type="button"
          onClick={
            skipIntro
          }
          className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-black/80 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-sm hover:border-mg-green/50 hover:text-mg-green focus:outline-none focus:ring-2 focus:ring-mg-green"
          aria-label="Skip intro"
        >
          <SkipForward className="h-4 w-4" />

          Skip intro
        </button>
      )}

      <button
        type="button"
        onClick={
          playNext
        }
        className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-black/80 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-sm hover:border-mg-green/50 hover:text-mg-green focus:outline-none focus:ring-2 focus:ring-mg-green"
        aria-label="Play next episode"
      >
        <SkipForward className="h-4 w-4" />

        Next episode
      </button>

      <button
        type="button"
        onClick={
          toggleAutoNext
        }
        className={cn(
          "pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-xl backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-mg-green",

          context?.autoNext
            ? "border-mg-green/40 bg-mg-green/15 text-mg-green"
            : "border-white/15 bg-black/80 text-white/70 hover:text-white"
        )}
        aria-label="Toggle automatic next episode"
      >
        <Repeat2 className="h-4 w-4" />

        Auto next{" "}
        {context?.autoNext
          ? "On"
          : "Off"}
      </button>

      {context?.season !=
        null &&
        context?.episode !=
          null && (
          <span className="pointer-events-none rounded-lg border border-white/10 bg-black/70 px-2.5 py-2 text-[10px] font-semibold text-white/60 backdrop-blur-sm">
            S
            {String(
              context.season
            ).padStart(
              2,
              "0"
            )}{" "}
            E
            {String(
              context.episode
            ).padStart(
              2,
              "0"
            )}
          </span>
        )}
    </div>
  );
}
