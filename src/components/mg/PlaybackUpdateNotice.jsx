import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Sparkles,
  X,
} from "lucide-react";

const RELEASE_ID =
  "source-debrid-subtitles-v1";

const STORAGE_KEY =
  `mg:release-notice:${RELEASE_ID}`;

const CHANGES = [
  "New source sorting: Best, Cached, 4K, 1080p, Compatible or Smallest.",
  "Source choices keep showing useful quality, HDR, video, audio, cache and debrid-provider information when available.",
  "Multi-file torrent selection now works across AllDebrid, TorBox, Premiumize and Debrid-Link as well as Real-Debrid.",
  "You can switch to another video file from a supported debrid torrent without leaving the player.",
  "Subtitle choices are remembered per film or series, including whether subtitles were turned off.",
  "Forced and foreign-parts subtitles are selected more intelligently, while SDH captions can be preferred or kept behind cleaner dialogue subtitles.",
  "Subtitle timing can now be moved earlier or later in 0.5-second steps and reset instantly.",
  "Embedded, HLS and external/addon subtitles now share smarter language, forced and SDH selection.",
];

const alreadySeen = () => {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export default function PlaybackUpdateNotice({
  enabled = true,
}) {
  const [open, setOpen] =
    useState(false);

  const gotItRef =
    useRef(null);

  useEffect(() => {
    if (!enabled || alreadySeen()) {
      return undefined;
    }

    const timer =
      window.setTimeout(
        () => setOpen(true),
        650
      );

    return () =>
      window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const timer =
      window.setTimeout(
        () => {
          gotItRef.current?.focus?.();
        },
        80
      );

    return () =>
      window.clearTimeout(timer);
  }, [open]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        "1"
      );
    } catch {
      // The notice can still close if storage is unavailable.
    }

    setOpen(false);
  };

  if (!enabled || !open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mg-playback-update-title"
      className="fixed inset-0 z-[2147482000] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-5"
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-mg-green/35 bg-mg-surface shadow-2xl"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <button
          type="button"
          aria-label="Close playback update"
          title="Close"
          onClick={dismiss}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/70 outline-none hover:bg-black/70 hover:text-white focus:ring-4 focus:ring-mg-green/50"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="max-h-[84vh] overflow-y-auto px-5 pb-5 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
          <div className="pr-12">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-mg-green/25 bg-mg-green/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-mg-green">
              <Sparkles className="h-3.5 w-3.5" />
              New playback update
            </div>

            <h2
              id="mg-playback-update-title"
              className="text-2xl font-black text-white sm:text-3xl"
            >
              Better sources, debrid files and subtitles.
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/60 sm:text-base">
              Media God now gives you more control over source quality, debrid files and subtitle playback.
            </p>
          </div>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {CHANGES.map((change) => (
              <div
                key={change}
                className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-black/25 p-3"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mg-green" />
                <span className="text-xs leading-5 text-white/75 sm:text-sm">
                  {change}
                </span>
              </div>
            ))}
          </div>

          <button
            ref={gotItRef}
            type="button"
            onClick={dismiss}
            className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-mg-green px-5 py-3 text-sm font-black text-black outline-none transition hover:bg-mg-green-dim focus:ring-4 focus:ring-white/70 sm:text-base"
          >
            Got it — start watching
          </button>

          <p className="mt-2 text-center text-[10px] text-white/30 sm:text-xs">
            This message is shown once for this playback update.
          </p>
        </div>
      </div>
    </div>
  );
}
