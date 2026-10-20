// Keep seeks within playable media and contain detached/unsupported media errors.
export function safeSeek(video, requestedTime) {
  if (!video || !Number.isFinite(requestedTime)) return false;
  try {
    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0) return false;
    let target = Math.max(0, Math.min(requestedTime, Math.max(0, duration - 1)));
    const ranges = video.seekable;
    if (ranges?.length) {
      let closest = null;
      for (let i = 0; i < ranges.length; i += 1) {
        const start = ranges.start(i);
        const end = Math.max(start, ranges.end(i) - 0.1);
        const candidate = Math.max(start, Math.min(target, end));
        if (closest === null || Math.abs(candidate - target) < Math.abs(closest - target)) closest = candidate;
      }
      target = closest;
    }
    video.currentTime = target;
    return true;
  } catch {
    return false;
  }
}
