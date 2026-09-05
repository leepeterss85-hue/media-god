import React, {
  useEffect,
  useState,
} from "react";

import {
  Loader2,
  Settings,
  X,
  Zap,
} from "lucide-react";

import { base44 } from "@/api/base44Client";

export default function RdBanner({
  onLinkSettings,
}) {
  const [
    hasRd,
    setHasRd,
  ] = useState(null);

  const [
    dismissed,
    setDismissed,
  ] = useState(false);

  useEffect(() => {
    let mounted = true;

    const check =
      async () => {
        try {
          const response =
            await base44.functions.invoke(
              "realDebridAuth",
              {
                action:
                  "status",
              }
            );

          if (
            mounted
          ) {
            setHasRd(
              Boolean(
                response
                  ?.data
                  ?.connected ||
                  response
                    ?.data
                    ?.valid
              )
            );
          }
        } catch {
          /*
           * Backwards-compatible
           * fallback for an existing
           * manually saved RD token.
           */
          try {
            const user =
              await base44.auth.me();

            if (
              mounted
            ) {
              setHasRd(
                Boolean(
                  user?.rd_token
                )
              );
            }
          } catch {
            if (
              mounted
            ) {
              setHasRd(
                false
              );
            }
          }
        }
      };

    check();

    return () => {
      mounted = false;
    };
  }, []);

  if (
    hasRd === null
  ) {
    return (
      <div className="flex items-center gap-2 bg-mg-green/5 border-b border-mg-green/15 px-3 md:px-4 3xl:px-6 py-2 text-xs 3xl:text-sm text-white/45">
        <Loader2 className="w-3.5 h-3.5 3xl:w-4 3xl:h-4 animate-spin shrink-0" />

        Checking Real-Debrid
        connection…
      </div>
    );
  }

  if (
    hasRd ||
    dismissed
  ) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 3xl:gap-3 bg-mg-green/10 border-b border-mg-green/30 px-3 md:px-4 3xl:px-6 py-2 3xl:py-3 text-xs 3xl:text-sm">
      <Zap className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green shrink-0" />

      <p className="text-white/80 flex-1 min-w-0">
        Connect your own{" "}
        <span className="text-mg-green font-semibold">
          Real-Debrid
        </span>{" "}
        account for one-click
        playback.
      </p>

      <button
        type="button"
        onClick={
          onLinkSettings
        }
        className="min-h-9 3xl:min-h-10 flex items-center gap-1.5 bg-mg-green text-black font-semibold px-2.5 3xl:px-3 py-1 rounded-md whitespace-nowrap"
      >
        <Settings className="w-3.5 h-3.5 3xl:w-4 3xl:h-4" />

        <span className="hidden min-[390px]:inline">
          Connect
        </span>
      </button>

      <button
        type="button"
        onClick={() =>
          setDismissed(
            true
          )
        }
        className="w-9 h-9 3xl:w-10 3xl:h-10 flex items-center justify-center text-white/50 hover:text-white shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 3xl:w-5 3xl:h-5" />
      </button>
    </div>
  );
}
