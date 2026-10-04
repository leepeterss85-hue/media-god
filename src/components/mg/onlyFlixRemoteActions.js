import { nativeFireTvSimulateTap } from "@/components/mg/nativeFireTvBridge";

export const tapOnlyFlixForRemote = ({ mediaAction, selectKey, direction, repeat }) => {
  const iframe = document.querySelector(
    '[data-mg-onlyflix-player="true"] [data-mg-embed-iframe="true"]'
  );
  if (!(iframe instanceof HTMLIFrameElement)) return false;
  const pointer = iframe.parentElement?.querySelector('[data-mg-embed-pointer="true"]');
  if (!pointer) return false;
  const stageFocused = document.activeElement === iframe;
  if (direction && stageFocused) {
    window.dispatchEvent(new CustomEvent("mg:onlyflix-pointer-move", { detail: direction }));
    return true;
  }
  const playKey = mediaAction === "play" || mediaAction === "playpause";
  if (!playKey && !(selectKey && stageFocused)) return false;
  const rect = pointer.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  if (repeat) return true;
  return nativeFireTvSimulateTap(rect.left + rect.width / 2, rect.top + rect.height / 2);
};