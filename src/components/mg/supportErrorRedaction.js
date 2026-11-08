/**
 * Preserve useful error details without exporting URLs, credentials or
 * identifiable paths in a copyable Media God support report.
 *
 * The raw error object, stack, headers and provider URLs are never retained.
 */
export const MAX_SUPPORT_ERROR_LENGTH = 200;

export function redactSupportErrorMessage(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  // Short, single-line diagnostics only, never full provider request dumps.
  let text = value.slice(0, 2500).replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim();

  text = text
    // Remove web URLs (including signed CDN links), magnet and local URIs.
    .replace(/\b(?:https?|wss?|rtmps?|file|content):\/\/[^\s<>"'\x60]+/gi, "[link redacted]")
    .replace(/\bmagnet:\?[^\s<>"'\x60]+/gi, "[link redacted]")
    .replace(/\bwww\.[^\s<>"'\x60]+/gi, "[link redacted]")
    // Accounts, addresses and local file paths.
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, "[IP redacted]")
    .replace(/\b[A-Z]:\\(?:[^\s\\]+\\)*[^\s\\]+/gi, "[path redacted]")
    .replace(/(?:\/(?:storage|sdcard|data|home|Users|private|mnt|var|tmp)\/)[^\s"'\x60]+/gi, "[path redacted]")
    // Common Authorization variants and key=value / JSON-style secrets.
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;}"']+/gi, "[credential redacted]")
    .replace(/\b(?:rd[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|password|passwd|secret|session[_-]?(?:id|token)?|cookie|signed[_-]?key)\s*["']?\s*[:=]\s*["']?(?:[^\s,;}"']+)/gi, "[credential redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g, "[token redacted]")
    // Signed IDs and other long opaque blobs are never included.
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[identifier redacted]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[identifier redacted]")
    .replace(/\b(?:\+?\d[\d .()-]{10,}\d)\b/g, "[number redacted]");

  return text.slice(0, MAX_SUPPORT_ERROR_LENGTH).trim();
}
