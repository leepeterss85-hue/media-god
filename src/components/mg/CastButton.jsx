import React, { useEffect, useState } from "react";
import { Cast } from "lucide-react";
import { cn } from "@/lib/utils";

const CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
// Google's default media receiver — plays any streamable video URL on the TV
// without registering a custom Cast app.
const DEFAULT_RECEIVER_ID = "CC1AD845";

const mediaContentType = (value, explicitType) => {
  const explicit = String(explicitType || "").trim().toLowerCase();
  if (explicit.includes("mpegurl") || explicit === "hls" || explicit === "m3u8") return "application/x-mpegURL";
  if (explicit.includes("dash") || explicit === "mpd") return "application/dash+xml";
  if (explicit.startsWith("video/")) return explicit;
  const url = String(value || "").toLowerCase().split(/[?#]/)[0];
  if (url.endsWith(".m3u8")) return "application/x-mpegURL";
  if (url.endsWith(".mpd")) return "application/dash+xml";
  if (url.endsWith(".webm")) return "video/webm";
  if (url.endsWith(".mkv")) return "video/x-matroska";
  if (url.endsWith(".mov")) return "video/quicktime";
  if (url.endsWith(".mp4") || url.endsWith(".m4v")) return "video/mp4";
  return "video/mp4";
};

const isCastableHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

let sdkPromise = null;

function loadCastSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (window.cast && window.cast.framework) return resolve(true);
    window.__onGCastApiAvailable = (available) => resolve(available === true);
    if (!document.querySelector(`script[src^="${CAST_SDK_URL}"]`)) {
      const s = document.createElement("script");
      s.src = CAST_SDK_URL;
      s.async = true;
      document.head.appendChild(s);
    }
  });
  return sdkPromise;
}

export default function CastButton({ url, title, poster, contentType }) {
  const [ready, setReady] = useState(false);
  const [casting, setCasting] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

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
    if (!url) return;
    if (!ready) {
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
      const mediaInfo = new window.chrome.cast.media.MediaInfo(url, mediaContentType(url, contentType));
      mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = title || "Media God";
      if (poster) mediaInfo.metadata.images = [{ url: poster }];
      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      await session.loadMedia(request);
      setCasting(true);
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
        "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md shrink-0 transition-colors",
        casting ? "bg-mg-green text-black" : "bg-white/10 text-white hover:bg-white/20",
        disabled && "opacity-40 cursor-not-allowed hover:bg-white/10"
      )}
    >
      <Cast className="w-4 h-4" />
      <span className="hidden sm:inline">{connecting ? "Connecting…" : casting ? "Casting" : "Cast"}</span>
    </button>
  );
}