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
