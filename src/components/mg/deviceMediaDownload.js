/** Safe, user-initiated downloading of a resolved file (never an embed page). */
const videoFilename = /\.(mp4|mkv|avi|mov|webm|m4v|ts)$/i;

export const safeDownloadName = (name) => {
  const raw = String(name || "").split(/[\\/]/).pop().replace(/[^\w. ()\[\]-]/g, "_").replace(/^\.+/, "").slice(0, 140);
  return videoFilename.test(raw) ? raw : "";
};

export const downloadableMedia = (response, suggestedFilename) => {
  const filename = safeDownloadName(response?.filename || suggestedFilename);
  if (!filename) return null;
  const urls = [response?.fallback_stream_url, response?.stream_url];
  for (const candidate of urls) {
    try {
      const url = new URL(String(candidate || ""));
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
          /^(?:localhost|.*\.local|.*\.localhost)$/i.test(url.hostname) ||
          /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname) ||
          /\.(?:m3u8|mpd|html?|php)$/i.test(url.pathname)) continue;
      return { url: url.toString(), filename };
    } catch { /* invalid source */ }
  }
  return null;
};

export const startDeviceDownload = ({ url, filename }) => {
  if (typeof window === "undefined" || typeof document === "undefined") return "unavailable";
  if (typeof window.MediaGodNative?.downloadFile === "function") {
    const accepted = window.MediaGodNative.downloadFile(JSON.stringify({ url, filename }));
    if (accepted === false) return "unavailable";
    return "native";
  }
  // Browsers can honour content-disposition / download URLs, but a remote
  // server may not permit force-downloading a cross-origin file.
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return "browser";
};
