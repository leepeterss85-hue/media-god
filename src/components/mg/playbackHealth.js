export const updateVodProgress = (previous, video, currentTime, now = Date.now()) => {
  if (previous.video !== video) {
    return { video, time: currentTime, advancedAt: 0 };
  }

  if (currentTime > previous.time + 0.1) {
    return { video, time: currentTime, advancedAt: now };
  }

  if (currentTime < previous.time - 0.1) {
    return { video, time: currentTime, advancedAt: 0 };
  }

  return previous;
};

export const isAdvancingVodPlayback = (video, progress, now = Date.now()) =>
  Boolean(
    video &&
      progress.video === video &&
      !video.paused &&
      !video.ended &&
      Number(video.currentTime || 0) > 0.25 &&
      progress.advancedAt > 0 &&
      now - progress.advancedAt < 4000
  );
