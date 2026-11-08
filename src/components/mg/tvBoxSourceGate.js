// Android / Fire TV native decoders require media URLs, never HTML embed pages.
// Keep signed extensionless CDN URLs available: lack of an extension is NOT proof
// that a genuine direct video is a webpage.
const WEB_TYPES = new Set(["embed", "iframe", "web", "webpage", "provider", "external"]);
const DIRECT_MEDIA_RE = /\.(?:m3u8|mpd|mp4|mkv|webm|ts|m4v|mov|avi|mpg|mpeg|m2ts|flv|ogg)$/i;

const domainIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);

const providerForHost = (host) => {
  if (domainIs(host, "onlyflix.to") || domainIs(host, "share.cdnm.ink")) return "onlyflix";
  if (domainIs(host, "vidcore.org")) return "vidcore";
  if (["vidsrc.to", "vidsrc.xyz", "vidsrc.me", "vidsrc.net", "vidsrc.icu"].some((x) => domainIs(host, x))) return "vidsrc";
  if (["2embed.cc", "2embed.to", "2embed.org"].some((x) => domainIs(host, x))) return "twoembed";
  if (domainIs(host, "cinesrc.st")) return "cinesrc";
  if (domainIs(host, "multiembed.mov") || domainIs(host, "multiembed.com")) return "multiembed";
  return "other";
};

export const classifyTvBoxSource = (source = {}) => {
  const url = String(source.src || source.url || source.link || "").trim();
  const type = String(source.type || "").toLowerCase();
  const isWebType = WEB_TYPES.has(type);
  if (!/^https?:\/\//i.test(url)) {
    return { kind: isWebType ? "webpage" : "unknown", provider: "other" };
  }
  let parsed;
  try { parsed = new URL(url); } catch {
    return { kind: "unknown", provider: "other" };
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const provider = providerForHost(host);

  // Explicit webpage types are never passed to VLC. Retain the domain's
  // identity so a typed iframe for OnlyFlix/VidSrc can open the right tab.
  if (isWebType) return { kind: "webpage", provider };

  // Provider watch/embed pages should not be considered direct media just
  // because an addon incorrectly calls them `type: "url"`.
  if (provider !== "other") {
    // A genuine CDN media extension can still be handed to native playback.
    if (DIRECT_MEDIA_RE.test(path)) return { kind: "media", provider: "" };
    return { kind: "webpage", provider };
  }

  // Generic embed pages / PHP players are HTML. A /player/ URL containing an
  // actual .m3u8 or .mp4 remains a media URL (signed URL queries are allowed).
  const htmlPath = /\.(?:html?|php|aspx?)$/i.test(path) ||
    /\/(?:embed|embedtv|iframe|player|watch)(?:\/|$)/i.test(path) ||
    /\/e\/[a-z0-9_-]+(?:\/|$)/i.test(path);
  if (htmlPath && !DIRECT_MEDIA_RE.test(path)) {
    return { kind: "webpage", provider: "other" };
  }

  return { kind: "media", provider: "" };
};
