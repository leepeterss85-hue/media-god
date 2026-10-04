import { nativeFireTvSimulateTap } from "@/components/mg/nativeFireTvBridge";

/*
 * OnlyFlix is a full-screen, exclusive player. Do not make remote ownership
 * depend on document.activeElement: Android WebView can report the parent
 * toolbar (or another app control) as focused while the cross-origin iframe
 * is visibly active. Letting those keys fall through is what allows the
 * background source picker to steal Select and launch an unrelated stream.
 */
export const tapOnlyFlixForRemote = ({ mediaAction, selectKey, direction, repeat }) => {
  const player = document.querySelector('[data-mg-onlyflix-player="true"]');
  if (!player) return false;

  const iframe = player.querySelector('[data-mg-embed-iframe="true"]');
  if (!(iframe instanceof HTMLIFrameElement)) return false;

  const pointer = player.querySelector('[data-mg-embed-pointer="true"]');

  if (direction) {
    try {
      iframe.focus({ preventScroll: true });
    } catch {
      iframe.focus();
    }
    window.dispatchEvent(new CustomEvent("mg:onlyflix-pointer-move", { detail: direction }));
    return true;
  }

  const playKey = mediaAction === "play" || mediaAction === "playpause";
  if (!playKey && !selectKey) return false;

  // Consume the key even if the pointer is not ready. Never pass Select back
  // to the app's source list while OnlyFlix is the visible player.
  if (!pointer) return true;

  const rect = pointer.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return true;

  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const frameRect = iframe.getBoundingClientRect();
  const insideFrame =
    x >= frameRect.left &&
    x <= frameRect.right &&
    y >= frameRect.top &&
    y <= frameRect.bottom;

  // The green pointer must hit the OnlyFlix iframe itself. If layout/scale
  // drift puts it over Media God's controls, swallow Select rather than
  // accidentally activating a background source.
  if (!insideFrame) return true;
  if (typeof document.elementFromPoint === "function" && document.elementFromPoint(x, y) !== iframe) {
    return true;
  }

  if (repeat) return true;

  try {
    iframe.focus({ preventScroll: true });
  } catch {
    iframe.focus();
  }

  nativeFireTvSimulateTap(x, y);
  return true;
};