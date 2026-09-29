import { useEffect, useRef } from "react";

/*
 * Automatic silent-audio detection for the web <video> player.
 *
 * Browsers silently drop audio they cannot decode (E-AC-3/AC-3/DTS/TrueHD in
 * Chrome/Edge/Firefox) and keep playing the picture. The decoder itself
 * reports this: Chrome exposes webkitAudioDecodedByteCount (stays 0) and
 * Firefox exposes mozHasAudio (false). Once the video has genuinely advanced a
 * few seconds with zero decoded audio, run the existing audio repair once for
 * that stream. Muting does not affect these counters, so a muted autoplay is
 * never mistaken for silence.
 */
const ADVANCE_SECONDS = 3;

const decoderReportsSilence = (video) => {
  if (typeof video.webkitAudioDecodedByteCount === "number") {
    return video.webkitAudioDecodedByteCount === 0;
  }
  if (typeof video.mozHasAudio === "boolean") {
    return video.mozHasAudio === false;
  }
  return false;
};

export function useSilentAudioGuard({ stageRef, enabled, streamKey, onSilent }) {
  const onSilentRef = useRef(onSilent);
  onSilentRef.current = onSilent;
  const handledRef = useRef("");

  useEffect(() => {
    if (!enabled || !streamKey || handledRef.current === streamKey) {
      return undefined;
    }

    let startTime = null;

    const timer = window.setInterval(() => {
      const video = stageRef.current?.querySelector("video");
      if (!(video instanceof HTMLVideoElement)) return;
      if (video.paused || video.ended || video.readyState < 3) return;

      const now = Number(video.currentTime || 0);
      if (startTime == null || now < startTime) {
        startTime = now;
        return;
      }
      if (now - startTime < ADVANCE_SECONDS) return;

      window.clearInterval(timer);
      if (!decoderReportsSilence(video)) return;

      handledRef.current = streamKey;
      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              "No audio detected — this device can't decode the source's audio. Loading a compatible stream…",
          },
        })
      );
      onSilentRef.current?.();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [enabled, streamKey, stageRef]);
}