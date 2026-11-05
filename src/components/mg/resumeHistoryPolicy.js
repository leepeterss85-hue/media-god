/**
 * A saved playhead wins over an old embed/OnlyFlix bookmark.
 * Embedded providers do not reliably accept a seek-to-position instruction,
 * while Media God's native/source player does.
 *
 * Some historic rows hold a 5-second placeholder with no measured duration:
 * that is a source-selection marker, not proof of watched playback.
 */
export function hasSeekableHistoryPosition(row) {
  const progress = Number(row?.progress ?? 0);
  const duration = Number(row?.duration ?? 0);
  if (!Number.isFinite(progress) || progress < 5) return false;
  // Never use a completed history marker to trigger a replay seek.
  if (Number.isFinite(duration) && duration > 0 && progress / duration >= 0.92) {
    return false;
  }
  return (Number.isFinite(duration) && duration > 0) || progress > 5;
}
