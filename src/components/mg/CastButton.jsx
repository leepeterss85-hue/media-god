import React, { useCallback, useEffect, useState } from "react";
import { Cast } from "lucide-react";
import { cn } from "@/lib/utils";

const CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
const DEFAULT_RECEIVER_ID = "CC1AD845";

const isCastableHttpUrl = (value) =>
  /^https?:\/\//i.test(String(value || "").trim());

const mediaContentType = (value, explicitType, source) => {
  const declared = String(
    explicitType ||
      source?.mimeType ||
      source?.contentType ||
      source?.mime_type ||
      ""
  ).trim().toLowerCase();
  const format = String(source?.format || source?.type || "").trim().toLowerCase();
  const explicit = declared || format;
  const url = String(value || "").toLowerCase().split(/[?#]/)[0];

  if (
    explicit.includes("mpegurl") ||
    explicit === "hls" ||
    explicit === "m3u8" ||
    explicit === "application/vnd.apple.mpegurl" ||
    url.endsWith(".m3u8")
  ) return "application/x-mpegURL";

  if (explicit.includes("dash") || explicit === "mpd" || url.endsWith(".mpd")) {
    return "application/dash+xml";
  }

  if (explicit === "mp4" || explicit === "m4v" || url.endsWith(".mp4") || url.endsWith(".m4v")) {
    return "video/mp4";
  }
  if (explicit === "webm" || url.endsWith(".webm")) return "video/webm";
  if (explicit === "mov" || url.endsWith(".mov")) return "video/quicktime";
  if (explicit === "mkv" || url.endsWith(".mkv")) return "video/x-matroska";
  if (explicit.startsWith("video/")) return explicit;

  // A direct VOD URL without a suffix is much more likely to be an MP4
  // response than an HLS playlist. Live TV endpoints commonly omit suffixes,
  // so use HLS for those only when the channel metadata says it is live.
  return source?.live === true ? "application/x-mpegURL" : "video/mp4";
};

let sdkPromise = null;

function loadCastSdk() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.cast?.framework) return Promise.resolve(true);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (!available) sdkPromise = null;
      resolve(available === true);
    };
    const timeout = window.setTimeout(() => finish(false), 8000);
    window.__onGCastApiAvailable = (available) => finish(available === true);

    let script = document.querySelector(`script[src^="${CAST_SDK_URL}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = CAST_SDK_URL;
      script.async = true;
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    } else {
      script.addEventListener("error", () => finish(false), { once: true });
      // The script may have loaded before this component mounted.
      if (window.cast?.framework) finish(true);
    }
  });
  return sdkPromise;
}

export default function CastButton({
  url,
  title,
  poster,
  contentType,
  source,
  videoRef,
}) {
  const [ready, setReady] = useState(false);
  const [casting, setCasting] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    let alive = true;
    let context = null;
    let onSessionState = null;

    loadCastSdk().then((available) => {
      if (!alive) return;
      if (!available) {
        setError("Cast is unavailable in this browser.");
        return;
      }

      try {
        context = window.cast.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: DEFAULT_RECEIVER_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });

        const syncSession = () => {
          if (!alive || !context) return;
          const session = context.getCurrentSession();
          setCasting(Boolean(session));
        };

        onSessionState = syncSession;
        context.addEventListener(
          window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          onSessionState
        );
        syncSession();
        setReady(true);
        setError("");
      } catch {
        setError("Cast failed to initialize.");
      }
    });

    return () => {
      alive = false;
      if (context && onSessionState) {
        try {
          context.removeEventListener(
            window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
            onSessionState
          );
        } catch {
          // Cast SDK teardown is best-effort.
        }
      }
    };
  }, []);

  const handleCast = useCallback(async () => {
    setShowFeedback(true);
    setError("");

    const targetUrl = String(url || "").trim();
    if (!targetUrl) {
      setError("Choose a video source before casting.");
      return;
    }
    if (
      source?.format === "external" ||
      source?.type === "provider" ||
      source?.browserPlayable === false
    ) {
      setError("This source is a web player, not a direct video stream, so it cannot be cast directly.");
      return;
    }
    if (
      source?.drm ||
      source?.requiresHeaders === true ||
      Object.keys(source?.headers || {}).length > 0
    ) {
      setError("This source requires DRM or custom headers that the standard Cast receiver cannot forward. Try a direct stream source.");
      return;
    }
    if (!isCastableHttpUrl(targetUrl)) {
      setError("This source cannot be sent directly to a Cast receiver. Choose a direct HTTP(S) video stream.");
      return;
    }

    if (!ready) {
      const remote = videoRef?.current?.remote;
      if (remote && typeof remote.prompt === "function") {
        try {
          await remote.prompt();
          if (remote.state === "connected" || remote.state === "connecting") {
            setCasting(true);
            return;
          }
        } catch (remoteError) {
          if (
            remoteError?.name === "NotFoundError" ||
            remoteError?.name === "NotSupportedError"
          ) {
            setError("No compatible casting receiver was found. Use a Chromecast-compatible device on the same Wi-Fi network.");
            return;
          }
        }
      }
      setError("Casting is unavailable here. Use a compatible Chromecast receiver and browser.");
      return;
    }

    const ctx = window.cast.framework.CastContext.getInstance();
    setConnecting(true);
    try {
      // Reuse an existing Cast session when changing sources. Opening the
      // receiver chooser again can interrupt playback and leave the receiver
      // on its idle/branding screen.
      let session = ctx.getCurrentSession();
      if (!session) {
        await ctx.requestSession();
        session = ctx.getCurrentSession();
      }
      if (!session) {
        setError("No active Cast session was created.");
        return;
      }

      const mimeType = mediaContentType(targetUrl, contentType, source);
      if (mimeType === "video/x-matroska") {
        setError("This source is MKV, which the standard Chromecast receiver may not play reliably. Choose an MP4 or HLS source.");
        return;
      }

      const mediaInfo = new window.chrome.cast.media.MediaInfo(targetUrl, mimeType);
      mediaInfo.streamType =
        source?.live === true
          ? window.chrome.cast.media.StreamType.LIVE
          : window.chrome.cast.media.StreamType.BUFFERED;
      mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = title || "Media God";
      if (poster && isCastableHttpUrl(poster)) {
        mediaInfo.metadata.images = [{ url: poster }];
      }

      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      await session.loadMedia(request);
      setCasting(true);
      setError("");
    } catch (castError) {
      if (castError?.code !== "cancel") {
        setCasting(Boolean(ctx.getCurrentSession()));
        setError("Could not start video casting. Check that the receiver supports this stream format and is on the same Wi-Fi network.");
      }
    } finally {
      setConnecting(false);
    }
  }, [url, title, poster, contentType, source, videoRef, ready]);

  const disabled = !url || connecting;
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={handleCast}
        disabled={disabled}
        aria-label={connecting ? "Connecting to Cast" : casting ? "Casting to TV" : "Cast video to TV"}
        title={error || (casting ? "Casting to TV — select Cast to load the selected source" : ready ? "Cast to a compatible receiver" : "Cast is unavailable until a compatible receiver/browser is detected")}
        className={cn(
          "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md shrink-0 transition-colors",
          casting ? "bg-mg-green text-black" : "bg-white/10 text-white hover:bg-white/20",
          disabled && "opacity-40 cursor-not-allowed hover:bg-white/10"
        )}
      >
        <Cast className="w-4 h-4" />
        <span className="hidden sm:inline">{connecting ? "Connecting…" : casting ? "Casting" : "Cast"}</span>
      </button>
      {showFeedback && error && (
        <div role="status" className="absolute right-0 top-full z-50 mt-2 w-[min(16rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] break-words rounded-lg border border-red-400/30 bg-black/95 p-2 text-left text-xs font-medium text-red-200 shadow-xl [overflow-wrap:anywhere]">
          {error}
        </div>
      )}
    </div>
  );
}
