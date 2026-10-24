// Resolve the outer frame only. Cross-origin provider content stays untouched.
export function syncEmbeddedFramePixels(stage) {
  const frame = stage?.querySelector('[data-mg-embed-iframe="true"]');
  if (!frame) return false;
  const { width, height } = stage.getBoundingClientRect();
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return false;
  const pixels = { width: Math.floor(width), height: Math.floor(height) };
  for (const [dimension, value] of Object.entries(pixels)) {
    // Inline important deliberately wins the legacy Fire TV 100% rules.
    const css = `${value}px`;
    if (frame.style.getPropertyValue(dimension) !== css) {
      frame.style.setProperty(dimension, css, "important");
      frame.setAttribute(dimension, String(value));
    }
  }
  return true;
}
