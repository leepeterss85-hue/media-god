// Shared fetch + parse of the public Free-TV/IPTV playlist, cached for the
// session so the detail modal's "Live TV" source match doesn't refetch the
// whole M3U on every open.
const PLAYLIST_URL = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

let cache = null;
let promise = null;

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith("#EXTINF")) {
      const comma = t.indexOf(",");
      const name = comma >= 0 ? t.slice(comma + 1).trim() : "";
      const logo = (t.match(/tvg-logo="([^"]*)"/) || [])[1] || "";
      const group = (t.match(/group-title="([^"]*)"/) || [])[1] || "Other";
      cur = { name: name || "Unknown", logo, group, url: "" };
    } else if (!t.startsWith("#")) {
      if (cur) {
        cur.url = t;
        if (cur.url) out.push(cur);
        cur = null;
      }
    }
  }
  return out;
}

export function getFreeTvChannels() {
  if (cache) return Promise.resolve(cache);
  if (!promise) {
    promise = fetch(PLAYLIST_URL)
      .then((r) => r.text())
      .then((txt) => {
        cache = parseM3U(txt);
        return cache;
      })
      .catch(() => {
        cache = [];
        return cache;
      });
  }
  return promise;
}

// Find free-to-air channels whose name matches the title (either direction),
// guarded for length so short titles don't false-match.
export function findChannelsByTitle(title) {
  const t = (title || "").toLowerCase().trim();
  if (!t || t.length < 3) return Promise.resolve([]);
  return getFreeTvChannels().then((all) =>
    all
      .filter((c) => {
        const n = (c.name || "").toLowerCase();
        return (n.length >= 4 && n.includes(t)) || (t.length >= 4 && t.includes(n));
      })
      .slice(0, 3)
  );
}