/**
 * Shared helpers for magnet-based streaming providers (Webtor.io, WebTorrent).
 */

/** Normalise a user-supplied magnet link or bare info-hash into a full magnet URI. */
export const magnetFromInput = (value) => {
  const raw = String(value || "").trim();
  if (/^magnet:\?/i.test(raw)) return raw;
  if (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(raw)) {
    return `magnet:?xt=urn:btih:${raw.toLowerCase()}`;
  }
  return "";
};

/** Extract the info-hash from a magnet URI for display. */
export const magnetInfoHash = (magnet) => {
  const match = String(magnet || "").match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i);
  return match ? match[1] : "";
};