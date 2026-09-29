import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Picture-in-Picture and on-device subtitle translation for the media player.
 * Extracted from MediaPlayerControls so that file stays under the line limit.
 */
export default function usePlayerExtras({
  videoRef,
  subtitleTracks,
  selectedSubtitle,
  trackPreferencesRef,
  revealControls,
}) {
  const [pipActive, setPipActive] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateStatus, setTranslateStatus] = useState("");
  const translatedTracksRef = useRef(new Set());

  const getVideo = () => videoRef?.current || null;

  useEffect(() => {
    const video = getVideo();
    if (!video) return undefined;

    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);

    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);

    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [videoRef]);

  const togglePip = async () => {
    const video = getVideo();
    if (!video) return;

    revealControls?.();

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (
        document.pictureInPictureEnabled &&
        typeof video.requestPictureInPicture === "function"
      ) {
        await video.requestPictureInPicture();
      }
    } catch {
      // PiP can be blocked by browser policy or an unsupported stream.
    }
  };

  const flashStatus = (message, delay = 2500) => {
    setTranslateStatus(message);
    window.setTimeout(() => setTranslateStatus(""), delay);
  };

  const translateSubtitles = async () => {
    const video = getVideo();
    if (!video?.textTracks || translating) return;

    const activeIndex = subtitleTracks.findIndex(
      (track) => track.index === selectedSubtitle
    );
    const track =
      activeIndex >= 0 && video.textTracks[activeIndex]
        ? video.textTracks[activeIndex]
        : null;

    if (!track) {
      flashStatus("Pick a subtitle track first");
      return;
    }

    const targetLanguage = String(
      trackPreferencesRef?.current?.subtitleLanguage || "en"
    );
    const cacheKey = `${activeIndex}:${targetLanguage}`;
    if (translatedTracksRef.current.has(cacheKey)) {
      flashStatus("Already translated", 2000);
      return;
    }

    const cues = Array.from(track.cues || []);
    if (cues.length === 0) {
      flashStatus("No cues to translate");
      return;
    }

    setTranslating(true);
    flashStatus("Translating…", 0);

    try {
      const response = await base44.functions.invoke("translateSubtitles", {
        cues: cues.map((cue) => String(cue.text || "")),
        targetLanguage,
      });

      const translated = Array.isArray(response?.data?.translated)
        ? response.data.translated
        : [];

      if (translated.length === 0) {
        flashStatus("Translation failed");
      } else {
        cues.forEach((cue, index) => {
          if (index < translated.length) {
            try {
              cue.text = String(translated[index] || "");
            } catch {
              // Some WebViews expose read-only cue text.
            }
          }
        });
        translatedTracksRef.current.add(cacheKey);
        flashStatus("Translated", 3000);
      }
    } catch {
      flashStatus("Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  return {
    pipActive,
    togglePip,
    translating,
    translateStatus,
    translateSubtitles,
  };
}