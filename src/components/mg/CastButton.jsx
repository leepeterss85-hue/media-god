import React, { useEffect, useState } from "react";
import { Cast } from "lucide-react";
import { cn } from "@/lib/utils";

const CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
// Google's default media receiver — plays any streamable video URL on the TV
// without registering a custom Cast app.
const DEFAULT_RECEIVER_ID = "CC1AD845";

const mediaContentType = (value, explicitType, source) => {
  // Prefer the stream's declared MIME type, then its format label, then the
  // URL extension. Live playlist URLs often include query strings or tokens.
  const declared = String(
    explicitType ||
      source?.mimeType ||
      source?.contentType ||
      source?.mime_type ||
      ""
  ).trim().toLowerCase();
  const format = String(source?.format || source?.type || "").trim().toLowerCase();
  const explicit = declared || format;
  if (
    explicit.includes("mpegurl") ||
    explicit === "hls" ||
    explicit === "m3u8" ||
    explicit === "application/vnd.apple.mpegurl"
  ) return "application/x-mpegURL";
  if (explicit.includes("dash") || explicit === "mpd") return "application/dash+xml";
  if (explicit.startsWith("video/")) return explicit;
  const url = String(value || "").toLowerCase().split(/[?#]/)[0];
  if (url.endsWith(".m3u8")) return "application/x-mpegURL";
  if (url.endsWith(".mpd")) return "application/dash+xml";
  if (url.endsWith(".webm")) return "video/webm";
  if (url.endsWith(".mov")) return "video/quicktime";
  if (url.endsWith(".mp4") || url.endsWith(".m4v")) return "video/mp4";
  // The default Cast receiver does not reliably support MKV. Avoid labelling
  // unknown live endpoints as MKV; extensionless IPTV streams are usually HLS.
  return "application/x-mpegURL";
};

const isCastableHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

let sdkPromise = null;

function loadCastSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (window.cast && window.cast.framework) {
      resolve(true);
      return;
    }

    let settled = false;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!available) sdkPromise = null;
      resolve(available === true);
    };
    const timeout = setTimeout(() => finish(false), 8000);
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
    }
  });
  return sdkPromise;
}

export default function CastButton({ url, title, poster, contentType, source, videoRef }) {
  const [ready, setReady] = useState(false);
  const [casting, setCasting] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCastSdk().then((available) => {
      if (!alive) return;
      if (!available) {
        setError("Cast not supported in this browser");
        return;
      }
      try {
        const ctx = window.cast.framework.CastContext.getInstance();
        ctx.setOptions({
          receiverApplicationId: DEFAULT_RECEIVER_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        setReady(true);
      } catch {
        setError("Cast failed to initialize");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleCast = async () => {
    setShowFeedback(true);
    if (!url) return;
    if (source?.format === "external" || source?.type === "provider" || source?.browserPlayable === false) {
      setError("This source is a web player rather than a direct video stream, so it cannot be cast directly.");
      return;
    }
    if (source?.drm || source?.requiresHeaders === true || Object.keys(source?.headers || {}).length > 0) {
      setError("This source needs DRM or custom request headers that the standard Cast receiver cannot forward. Try another direct stream source.");
      return;
    }
    if (!ready) {
      const remote = videoRef?.current?.remote;
      if (remote && typeof remote.prompt === "function") {
        try {
          await remote.prompt();
          if (remote.state === "connected" || remote.state === "connecting") {
            setCasting(true);
            setError("");
            return;
          }
        } catch (remoteError) {
          if (remoteError?.name === "NotFoundError" || remoteError?.name === "NotSupportedError") {
            setError("No compatible casting receiver was found. Use a Chromecast-compatible device on the same Wi-Fi network.");
            return;
          }
        }
      }
      setError(error || "Casting is unavailable here. Use a compatible Chromecast receiver and browser.");
      return;
    }
    if (!isCastableHttpUrl(url)) {
      setError("This source cannot be sent directly to a Cast receiver. Choose a direct HTTP(S) stream instead.");
      return;
    }
    setError("");
    setConnecting(true);
    const ctx = window.cast.framework.CastContext.getInstance();
    try {
      await ctx.requestSession();
      const session = ctx.getCurrentSession();
      if (!session) return;
      const mediaInfo = new window.chrome.cast.media.MediaInfo(
        url,
        mediaContentType(url, contentType, source)
      );
      mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = title || "Media God";
      if (poster) mediaInfo.metadata.images = [{ url: poster }];
      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      await session.loadMedia(request);
      setCasting(true);
      setError("");
    } catch (e) {
      if (e?.code !== "cancel") setError("Could not start casting. Make sure a compatible Chromecast receiver is available on the same network.");
    } finally {
      setConnecting(false);
    }
  };

  const disabled = !url || connecting;
  return (
    <button
      onClick={handleCast}
      disabled={disabled}
      title={error || (casting ? "Casting to TV" : ready ? "Cast to a compatible receiver" : "Casting is unavailable until a compatible receiver/browser is detected")}
      className={cn(
        "relative flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md shrink-0 transition-colors",
        casting ? "bg-mg-green text-black" : "bg-white/10 text-white hover:bg-white/20",
        disabled && "opacity-40 cursor-not-allowed hover:bg-white/10"
      )}
    >
      <Cast className="w-4 h-4" />
      <span className="hidden sm:inline">{connecting ? "Connecting…" : casting ? "Casting" : "Cast"}</span>
      {showFeedback && error && <span role="status" className="absolute right-0 top-full z-50 mt-2 w-[min(16rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] break-words rounded-lg border border-red-400/30 bg-black/95 p-2 text-left text-xs font-medium text-red-200 shadow-xl [overflow-wrap:anywhere]">{error}</span>}
    </button>
  );
}