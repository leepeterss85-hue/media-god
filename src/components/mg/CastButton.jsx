import React, { useEffect, useState } from "react";
import { Cast } from "lucide-react";
import { cn } from "@/lib/utils";

const CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
// Google's default media receiver — plays any streamable video URL on the TV
// without registering a custom Cast app.
const DEFAULT_RECEIVER_ID = "CC1AD845";

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

export default function CastButton({ url, title, poster }) {
  const [ready, setReady] = useState(false);
  const [casting, setCasting] = useState(false);
  const [error, setError] = useState("");

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
    if (!ready || !url) return;
    const ctx = window.cast.framework.CastContext.getInstance();
    try {
      await ctx.requestSession();
      const session = ctx.getCurrentSession();
      if (!session) return;
      const mediaInfo = new window.chrome.cast.media.MediaInfo(url, "video/mp4");
      mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = title || "Media God";
      if (poster) mediaInfo.metadata.images = [{ url: poster }];
      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      await session.loadMedia(request);
      setCasting(true);
    } catch (e) {
      if (e?.code !== "cancel") setError("Could not start casting");
    }
  };

  const disabled = !ready || !url;
  return (
    <button
      onClick={handleCast}
      disabled={disabled}
      title={error || (casting ? "Casting to TV" : "Cast to TV")}
      className={cn(
        "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md shrink-0 transition-colors",
        casting ? "bg-mg-green text-black" : "bg-white/10 text-white hover:bg-white/20",
        disabled && "opacity-40 cursor-not-allowed hover:bg-white/10"
      )}
    >
      <Cast className="w-4 h-4" />
      <span className="hidden sm:inline">{casting ? "Casting" : "Cast"}</span>
    </button>
  );
}