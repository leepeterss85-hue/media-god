import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

const WEBTOR_SDK_URL =
  "https://cdn.jsdelivr.net/npm/@webtor/embed-sdk-js/dist/index.min.js";
const WEBTOR_SDK_FLAG = "data-webtor-sdk";

/**
 * Webtor.io cloud player.
 *
 * Webtor runs the torrent in the cloud and streams the video back via HLS,
 * so playback starts quickly without needing WebRTC peers. The embed SDK
 * is loaded once from CDN and creates the player inside a container div.
 */
export default function WebtorEmbedPlayer({
  magnet,
  title,
  onBack,
  backLabel = "Sources",
}) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!magnet) {
      setError("No magnet link provided.");
      return;
    }

    let cancelled = false;
    const playerId = "webtor-player-" + Math.random().toString(36).slice(2, 10);

    if (containerRef.current) {
      containerRef.current.id = playerId;
      containerRef.current.className = "webtor";
    }

    window.webtor = window.webtor || [];
    window.webtor.push({ id: playerId, magnet, lang: "en" });

    const ensureSdk = () =>
      new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[${WEBTOR_SDK_FLAG}]`);
        if (existing) {
          if (window.webtor?.push?.toString?.()?.includes("native code")) {
            resolve();
            return;
          }
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("SDK load failed")), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = WEBTOR_SDK_URL;
        script.charset = "utf-8";
        script.async = true;
        script.setAttribute(WEBTOR_SDK_FLAG, "true");
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Webtor.io SDK."));
        document.body.appendChild(script);
      });

    ensureSdk()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load Webtor.io player.");
      });

    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 12000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [magnet]);

  return (
    <div
      data-mg-player-root="true"
      data-mg-webtor-player="true"
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/95 p-2 text-white sm:p-3"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1600px] flex-col">
        <div
          data-mg-player-topbar="true"
          className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5"
        >
          <button
            type="button"
            data-mg-player-exit="true"
            onClick={onBack}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-mg-green"
            aria-label={"Back to Media God " + backLabel.toLowerCase()}
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
          <span className="hidden shrink-0 text-xs text-white/50 sm:block">Webtor.io</span>
        </div>

        <div
          data-mg-player-stage="true"
          className="relative aspect-video min-h-[34vh] w-full overflow-hidden rounded-xl border border-white/10 bg-black"
        >
          {error ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-red-400">
              {error}
            </div>
          ) : (
            <>
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-mg-green" />
                  <span className="text-sm text-white/60">Loading Webtor.io player…</span>
                </div>
              )}
              <div ref={containerRef} className="h-full w-full" />
            </>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5 text-xs text-white/60">
          <span>Webtor.io streams your magnet from the cloud. Use {backLabel} to return to Media God.</span>
          <a
            href="https://webtor.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/20 px-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green"
          >
            Open Webtor.io <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}