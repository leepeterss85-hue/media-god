import { useEffect, useRef } from "react";

/*
 * Automatic playback-quality guard for the web <video> player.
 *
 * Once the video has genuinely advanced a few seconds it checks, using the
 * decoder's own counters, that the stream really has:
 *  - sound   (Chrome webkitAudioDecodedByteCount > 0 / Firefox mozHasAudio)
 *  - picture (videoWidth > 0 and at least one decoded frame)
 *  - English audio (when the file exposes tagged audio tracks)
 * Silence runs the existing audio repair (which moves on to the next source
 * if repair fails). No picture or no English track moves straight to the
 * next ranked source. Muting does not affect these counters.
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

const decoderReportsNoPicture = (video) => {
  if (!video.videoWidth || !video.videoHeight) return true;
  if (typeof video.webkitDecodedFrameCount === "number") {
    return video.webkitDecodedFrameCount === 0;
  }
  const quality = video.getVideoPlaybackQuality?.();
  return quality ? Number(quality.totalVideoFrames || 0) === 0 : false;
};

const ENGLISH_RE = /^(?:en|eng|english)(?:[-_].*)?$/i;

const audioIsKnownNonEnglish = (video) => {
  const list = video.audioTracks;
  if (!list || !list.length) return false;
  const languages = [];
  for (let i = 0; i < list.length; i += 1) {
    const lang = String(list[i]?.language || "").trim();
    if (lang && !/^(?:und|zxx|mul)$/i.test(lang)) languages.push(lang);
  }
  if (languages.length === 0) return false;
  return !languages.some((lang) => ENGLISH_RE.test(lang));
};

export function useSilentAudioGuard({ stageRef, enabled, streamKey, onSilent, onUnusable }) {
  const onSilentRef = useRef(onSilent);
  const onUnusableRef = useRef(onUnusable);
  onSilentRef.current = onSilent;
  onUnusableRef.current = onUnusable;
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

      const status = (message) =>
        window.dispatchEvent(
          new CustomEvent("mg:player-status", { detail: { message } })
        );

      if (decoderReportsNoPicture(video)) {
        handledRef.current = streamKey;
        status("No picture detected — trying the next source…");
        onUnusableRef.current?.("This source played without a picture.");
        return;
      }

      if (audioIsKnownNonEnglish(video)) {
        handledRef.current = streamKey;
        status("This source has no English audio — trying the next source…");
        onUnusableRef.current?.("This source has no English audio track.");
        return;
      }

      if (decoderReportsSilence(video)) {
        handledRef.current = streamKey;
        status(
          "No audio detected — this device can't decode the source's audio. Loading a compatible stream…"
        );
        onSilentRef.current?.();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [enabled, streamKey, stageRef]);
}