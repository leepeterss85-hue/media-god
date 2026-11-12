export function downloadProgress(item, previous, now = Date.now()) {
  const bytes = Math.max(0, Number(item.bytes) || 0);
  const total = Number(item.total);
  const elapsed = previous ? (now - previous.time) / 1000 : 0;
  const speed = item.status === "downloading" && elapsed > 0 && bytes >= previous?.bytes
    ? (bytes - previous.bytes) / elapsed : 0;
  return {
    percent: total > 0 ? Math.min(100, Math.floor(bytes / total * 100)) : null,
    eta: speed > 0 && total > bytes ? (total - bytes) / speed : null,
    speed,
    sample: { bytes, time: now },
  };
}
