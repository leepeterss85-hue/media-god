// TV-box native decoders require media URLs, not HTML embed/player pages.
// Do not reject extensionless signed video URLs or legitimate HLS/DASH files.
export const classifyTvBoxSource = (source = {}) => {
  const url = String(source.src || source.url || source.link || "").trim();
  const type = String(source.type || "").toLowerCase();
  if (["embed", "iframe", "web", "webpage", "provider", "external"].includes(type)) {
    return { kind: "webpage", provider: "other" };
  }
  if (!/^https?:\/\//i.test(url)) return { kind: "unknown", provider: "" };
  let host = "";
  let pathname = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return { kind: "unknown", provider: "" };
  }
  if (host === "onlyflix.to" || host.endsWith(".onlyflix.to") ||
      host === "share.cdnm.ink" || host.endsWith(".share.cdnm.ink")) {
    return { kind: "webpage", provider: "onlyflix" };
  }
  if (host === "vidcore.org" || host.endsWith(".vidcore.org")) {
    return { kind: "webpage", provider: "vidcore" };
  }
  // Embed-player endpoints are webpages even when an addon incorrectly
  // advertises type=url. Never send those URLs to native LibVLC.
  const embedHosts = /(?:^|\.)(?:vidsrc\.(?:to|xyz|me|net)|2embed\.(?:cc|to|org)|multiembed\.(?:mov|com)|embed\.su|vidsrc\.icu)$/i;
  if (embedHosts.test(host) || /\.(?:html?|php)$/i.test(pathname) ||
      /\/(?:embed|iframe|player)(?:\/|$)/i.test(pathname)) {
    // Video delivery endpoints sometimes use /player/ in their URL. Explicit
    // media extensions take precedence to avoid rejecting a real HLS stream.
    if (!/\.(?:m3u8|mpd|mp4|mkv|webm|ts|m4v)$/i.test(pathname)) {
      return { kind: "webpage", provider: "other" };
    }
  }
  return { kind: "media", provider: "" };
};
