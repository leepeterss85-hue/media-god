import { useEffect, useRef } from "react";
import { isSourceWebUndecodable } from "@/components/mg/mediaCompatibility";

/*
 * Proactive codec guard for the web player.
 *
 * Before the web <video> element attempts a source whose codec it definitely
 * cannot decode, this hook acts so the viewer never sits on a black screen:
 *
 *   - On a device with a native player (Fire TV / Android app), it routes the
 *     stream straight to the native Media3 player instead of attempting web
 *     playback that would only fail.
 *   - On a pure web browser, it marks the source failed and switches to the
 *     next device-decodable source, with a status message explaining the skip.
 *
 * It only fires when no Real-Debrid audio/video rescue was applied: a rescue
 * may have re-encoded the stream to a browser-friendly codec even though the
 * release label still names an exotic one, so second-guessing it would skip a
 * playable stream. Manual source choices are respected on web (the reactive
 * watchdog still handles their failures); native routing still applies to a
 * manual choice because native can play it.
 */
export function useProactiveCodecGuard({
  active,
  activeIdx,
  activeUrl,
  rdOverride,
  isDirectFile,
  isLive,
  isYoutube,
  isProvider,
  useNativePlayback,
  nativeFireTvPlayer,
  rdResolving,
  rdPolling,
  rdTorrentId,
  rdPreparation,
  manualSourceLockActive,
  markSourceFailed,
  findNextPlayableSource,
  switchToSource,
  setForceNativePlayback,
  setNativeFallbackUrl,
  setRdError,
  sourceDisplayLabel,
}) {
  const guardedRef = useRef("");

  useEffect(() => {
    if (
      isLive ||
      isYoutube ||
      isProvider ||
      useNativePlayback ||
      rdResolving ||
      rdPolling ||
      rdTorrentId ||
      rdPreparation ||
      (!rdOverride?.src && !isDirectFile)
    ) {
      return;
    }

    if (rdOverride?.audioRescue?.used === true || rdOverride?.videoRescue) {
      return;
    }

    const candidate = rdOverride
      ? {
          ...active,
          src: rdOverride.src || activeUrl,
          url: rdOverride.src || activeUrl,
          label: rdOverride.label || active?.label,
        }
      : active;

    const label = sourceDisplayLabel(candidate, activeIdx);

    if (!isSourceWebUndecodable(candidate, label)) {
      return;
    }

    const guardKey = `${activeIdx}|${rdOverride?.src || activeUrl}`;
    if (guardedRef.current === guardKey) {
      return;
    }
    guardedRef.current = guardKey;

    if (nativeFireTvPlayer) {
      setNativeFallbackUrl("");
      setForceNativePlayback(true);
      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              "This codec isn't supported in the web player — opening the native player instead.",
          },
        })
      );
      return;
    }

    // Real-Debrid-backed files can be repaired in place (compatible transcode)
    // by the silent-audio guard, so don't throw away an otherwise good release.
    if (
      manualSourceLockActive() ||
      rdOverride ||
      active?.viaRealDebrid ||
      active?.debridCached === true ||
      active?.infoHash ||
      active?.info_hash
    ) {
      return;
    }

    markSourceFailed(activeIdx);

    const nextIndex = findNextPlayableSource(activeIdx, { allowCaching: false });

    if (nextIndex >= 0) {
      switchToSource(nextIndex, {
        preservePosition: true,
        statusMessage:
          "Skipped a source with an unsupported codec — trying another source…",
      });
      return;
    }

    setRdError(
      "This source uses a video or audio codec your device cannot decode in the web player. Choose another source or use a native player."
    );
  }, [
    active,
    activeIdx,
    activeUrl,
    rdOverride,
    isDirectFile,
    isLive,
    isYoutube,
    isProvider,
    useNativePlayback,
    nativeFireTvPlayer,
    rdResolving,
    rdPolling,
    rdTorrentId,
    rdPreparation,
  ]);
}