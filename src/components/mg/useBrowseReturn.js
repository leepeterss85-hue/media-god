import { useCallback, useEffect, useRef, useState } from "react";

// Capture before details can lock body scrolling; restore after its cleanup.
export default function useBrowseReturn() {
  const [selected, updateSelected] = useState(null);
  const snapshot = useRef(null);
  const frame = useRef(0);
  const setSelected = useCallback((item) => {
    cancelAnimationFrame(frame.current);
    if (item && !snapshot.current) {
      const focus = document.activeElement;
      const nodes = new Set([document.scrollingElement]);
      for (let node = focus; node; node = node.parentElement) nodes.add(node);
      document.querySelectorAll('[data-mg-library-view="true"], main').forEach(node => {
        for (let parent = node; parent; parent = parent.parentElement) nodes.add(parent);
      });
      snapshot.current = {
        focus,
        positions: [...nodes].filter(Boolean).map(node => [node, node.scrollLeft, node.scrollTop]),
      };
    }
    updateSelected(item);
  }, []);
  useEffect(() => {
    if (selected || !snapshot.current) return;
    const saved = snapshot.current;
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        snapshot.current = null;
        if (document.querySelector('[data-mg-player-stage="true"]')) return;
        // Do not take focus from another dialog or a newly opened player.
        const active = document.activeElement;
        if (active && active !== document.body && active !== saved.focus &&
            !active.closest('[data-mg-library-view="true"]')) return;
        if (saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
        saved.positions.forEach(([node, left, top]) => {
          if (node.isConnected) { node.scrollLeft = left; node.scrollTop = top; }
        });
      });
    });
    return () => cancelAnimationFrame(frame.current);
  }, [selected]);
  return [selected, setSelected];
}
