import { useEffect, useRef } from "react";

/*
 * Browser playback evidence is deliberately conservative. Some Android
 * WebViews expose zero/unknown audio byte counters or incomplete track labels
 * while sound is audible. Never abandon a playing source on those hints.
 * Decoder errors have their own recovery path; this guard handles only
 * repeatedly confirmed missing picture while VOD time is advancing.
 */
const ADVANCE_SECONDS = 8;
const REQUIRED_PICTURE_CHECKS = 2;

export function useSilentAudioGuard({ stageRef, enabled, streamKey, onUnusable }) {
  const onUnusableRef = useRef(onUnusable);
  onUnusableRef.current = onUnusable;
  const handledRef = useRef("");

  useEffect(() => {
    if (!enabled || !streamKey || handledRef.current === streamKey) {
      return undefined;
    }

    let startTime = null;
    let lastTime = null;
    let missingPictureChecks = 0;

    const timer = window.setInterval(() => {
      const video = stageRef.current?.querySelector("video");
      if (!(video instanceof HTMLVideoElement)) return;
      if (video.paused || video.ended || video.readyState < 3) return;

      const now = Number(video.currentTime || 0);
      if (startTime == null || now < startTime) {
        startTime = now;
        lastTime = now;
        missingPictureChecks = 0;
        return;
      }
      // A stalled playhead isn't evidence of an audio or picture defect.
      if (now <= lastTime) return;
      lastTime = now;
      if (now - startTime < ADVANCE_SECONDS) return;

      // Video dimensions and decoded frames are independent of audio codecs.
      // An unsupported frame counter is *unknown*, not proof of a black screen.
      const missingDimensions = video.videoWidth === 0 && video.videoHeight === 0;
      const quality = video.getVideoPlaybackQuality?.();
      const confirmedNoFrames = !quality || Number(quality.totalVideoFrames || 0) === 0;
      if (!missingDimensions || !confirmedNoFrames) {
        window.clearInterval(timer);
        return;
      }
      missingPictureChecks += 1;
      if (missingPictureChecks < REQUIRED_PICTURE_CHECKS) return;

      window.clearInterval(timer);
      handledRef.current = streamKey;
      window.dispatchEvent(new CustomEvent("mg:player-status", {
        detail: { message: "Video is advancing without a picture — checking another source…" },
      }));
      onUnusableRef.current?.("No picture was decoded for this source.");
    }, 1000);

    return () => window.clearInterval(timer);
  }, [enabled, streamKey, stageRef]);
}
