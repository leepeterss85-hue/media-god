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

const CAST_PLAYBACK_TIMEOUT_MS = 18000;

// LOAD success only means that the receiver accepted a request. Watch the
// receiver media state before claiming the selected video is casting.
const waitForCastPlayback = (session, targetUrl) => new Promise((resolve, reject) => {
  let settled = false;
  let interval = null;
  let timeout = null;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    if (interval !== null) window.clearInterval(interval);
    if (timeout !== null) window.clearTimeout(timeout);
    if (error) reject(error);
    else resolve(true);
  };
  const check = () => {
    const media = session?.getMediaSession?.();
    if (!media) return;
    const currentId = String(media.media?.contentId || "");
    // Ignore the previous video's player state while switching media.
    if (currentId && currentId !== targetUrl) return;
    if (media.playerState === "IDLE" && media.idleReason === "ERROR") {
      finish(new Error("CAST_MEDIA_ERROR"));
      return;
    }
    if (media.playerState === "PLAYING" || media.playerState === "PAUSED") {
      finish();
    }
  };
  interval = window.setInterval(check, 350);
  timeout = window.setTimeout(() => finish(new Error("CAST_PLAYBACK_TIMEOUT")), CAST_PLAYBACK_TIMEOUT_MS);
  check();
});

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
          // A connected receiver is not proof that a video has loaded.
          const media = session?.getMediaSession?.();
          setCasting(Boolean(media && ["PLAYING", "PAUSED"].includes(media.playerState)));
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
      // HTMLMediaElement.remote.prompt() is not a safe Cast sender in Android
      // WebView: it can connect the audio track without any video surface.
      setCasting(false);
      setError("This device has no Google Cast sender available. The old remote-playback fallback could send audio without video. Try Chrome with a Chromecast receiver; Android APK casting needs native Cast support.");
      return;
    }

    // Validate before opening a receiver session, so invalid formats do not
    // strand the TV on the receiver logo with an audio-only stream.
    const mimeType = mediaContentType(targetUrl, contentType, source);
    const filename = String(source?.filename || source?.name || "").trim();
    if (
      mimeType === "video/x-matroska" ||
      /\.(?:mkv|avi|wmv|flv)(?:$|[?#])/i.test(targetUrl) ||
      /\.(?:mkv|avi|wmv|flv)$/i.test(filename)
    ) {
      setCasting(false);
      setError("This video container is not compatible with the standard Chromecast receiver. Choose a direct MP4 (H.264) or HLS version; casting cannot convert MKV/AVI video.");
      return;
    }
    if (mimeType.startsWith("audio/") || /\.(?:mp3|m4a|aac)(?:$|[?#])/i.test(targetUrl)) {
      setCasting(false);
      setError("The selected source is audio-only. Choose a video source before casting.");
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
      const loadResult = await session.loadMedia(request);
      // The Web Sender Promise can resolve to an ErrorCode rather than throw.
      if (loadResult) throw new Error(String(loadResult));
      // LOAD success acknowledges the command, not video playback. Wait for
      // the receiver's real player state instead of showing a green Cast icon
      // while its logo remains on screen.
      await waitForCastPlayback(session, targetUrl);
      setCasting(true);
      setError("");
    } catch (castError) {
      setCasting(false);
      if (castError?.code !== "cancel") {
        setError(
          castError?.message === "CAST_MEDIA_ERROR"
            ? "The TV rejected this stream. Try a direct H.264 MP4 or HLS source; some formats play audio without video on Chromecast."
            : "The Cast receiver did not confirm video playback. Try a compatible MP4/HLS source; a receiver logo with audio only usually means an unsupported video format."
        );
      }
    } finally {
      setConnecting(false);
    }
  }, [url, title, poster, contentType, source, ready]);

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
