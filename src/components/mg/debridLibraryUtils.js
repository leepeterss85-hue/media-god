export const DEBRID_STATUS_LABEL = {
  downloading: "Downloading",
  magnet_conversion: "Converting",
  waiting_files_selection: "Selecting files",
  waiting_selection: "Queued",
  queued: "Queued",
  downloaded: "Ready",
  magnet_error: "Magnet error",
  files_error: "Files error",
  virus: "Blocked",
  dead: "Unavailable",
};

export const normaliseDebridStatus = (torrent) =>
  String(torrent?.status || "").trim().toLowerCase();

export const isDebridReady = (torrent) =>
  torrent?.ready === true || normaliseDebridStatus(torrent) === "downloaded";

export const isDebridError = (torrent) =>
  /error|dead|virus|invalid/i.test(normaliseDebridStatus(torrent));

export const isDebridRetryableError = (torrent) => {
  const status = normaliseDebridStatus(torrent);
  if (!isDebridError(torrent)) return false;
  if (/virus|blocked|invalid/i.test(status)) return false;
  return /error|dead/i.test(status);
};

export const isDebridActive = (torrent) =>
  !isDebridReady(torrent) && !isDebridError(torrent);

export const debridBucket = (torrent) => {
  if (isDebridReady(torrent)) return "ready";
  if (isDebridError(torrent)) return "errors";
  return "active";
};

export const debridProgress = (torrent) => {
  const value = Number(torrent?.progress || 0);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
};

export const formatDebridBytes = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
};

export const formatDebridSpeed = (value) => {
  const bytesPerSecond = Number(value || 0);
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
  if (bytesPerSecond >= 1e6) return `${(bytesPerSecond / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1e3) return `${(bytesPerSecond / 1e3).toFixed(0)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
};

export const formatDebridEta = (torrent) => {
  const totalBytes = Number(torrent?.bytes || 0);
  const speed = Number(torrent?.speed || 0);
  const progress = debridProgress(torrent);

  if (
    !Number.isFinite(totalBytes) ||
    totalBytes <= 0 ||
    !Number.isFinite(speed) ||
    speed <= 0 ||
    progress <= 0 ||
    progress >= 100
  ) {
    return "";
  }

  const remainingBytes = totalBytes * (1 - progress / 100);
  const seconds = Math.ceil(remainingBytes / speed);

  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `<1 min`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;
  return leftoverMinutes > 0 ? `${hours}h ${leftoverMinutes}m` : `${hours}h`;
};

export const debridAddedTime = (torrent) => {
  const value = new Date(torrent?.added || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

export const formatDebridDate = (value, locale) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
};
