/**
 * Some ElfHosted VOD addons issue direct stream URLs bound to the IP address
 * that requested them. A Base44/Railway-issued link won't necessarily play
 * from the viewer's phone or TV. Never *autoplay* these server-issued URLs.
 * The browser-side addon lookup remains available for the viewer's own network.
 *
 * This does not filter magnet/torrent metadata or independently resolved
 * Real-Debrid sources. It is for VOD, not Live TV.
 */
const clean = value => String(value ?? "").trim();

export const isElfHostedUrl = value => {
  try {
    const parsed = new URL(clean(value));
    return /^https?:$/.test(parsed.protocol) &&
      /(^|\.)elfhosted\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
};

export const isIpBoundHostedProvider = item => {
  if (!item) return false;
  const provider = [
    item.addon, item.provider, item.sourceName, item.source_name,
    item.providerName,
  ].map(clean).join(" ");
  return /\b(?:aiostreams?|aio\s*streams?|elf\s*hosted|mediafusion|media\s*fusion)\b/i.test(provider) ||
    isElfHostedUrl(item.src || item.url);
};

export const isServerIssuedIpBoundVod = item =>
  Boolean(item &&
    item.browserFallback !== true &&
    String(item.type || "").toLowerCase() === "url" &&
    isIpBoundHostedProvider(item));

export const excludeServerIssuedIpBoundVod = entries =>
  (Array.isArray(entries) ? entries : []).filter(item => !isServerIssuedIpBoundVod(item));
