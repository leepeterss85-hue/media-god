import React, { useEffect, useMemo, useState } from "react";
import { Search, Wifi, Tv, Loader2 } from "lucide-react";
import { usePlayer } from "@/components/mg/PlayerProvider";

// Free-to-air IPTV channels from the public Free-TV/IPTV playlist
// (https://github.com/Free-TV/IPTV). All channels are publicly available
// legal broadcasts. The M3U is fetched and parsed client-side.
const PLAYLIST_URL = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

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

export default function FreeTvChannels() {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const player = usePlayer();

  useEffect(() => {
    let cancelled = false;
    fetch(PLAYLIST_URL)
      .then((r) => r.text())
      .then((txt) => {
        if (cancelled) return;
        setAll(parseM3U(txt));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "Could not load playlist");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const set = new Set(all.map((c) => c.group));
    return ["All", ...Array.from(set).sort()];
  }, [all]);

  const filtered = useMemo(() => {
    let list = all;
    if (group !== "All") list = list.filter((c) => c.group === group);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [all, group, query]);

  const shown = filtered.slice(0, 200);

  const play = (c) => {
    player.play({
      title: c.name,
      poster: c.logo,
      sources: [{ label: "LIVE", type: "live", src: c.url, live: true }],
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-6 h-6 text-mg-green animate-spin" />
        <p className="text-white/50 text-sm">Loading free-to-air channels…</p>
      </div>
    );
  }
  if (error) {
    return <p className="text-red-400 text-sm py-10 text-center">{error}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels..."
            className="w-full bg-mg-card border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
          />
        </div>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="bg-mg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-mg-green max-w-[180px]"
        >
          {groups.map((g) => (
            <option key={g} value={g} className="bg-mg-card">
              {g}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-white/40 mb-4">
        FREE-TO-AIR • {filtered.length.toLocaleString()} channels
        {filtered.length > 200 && " • showing first 200 — refine your search"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((c, i) => (
          <button
            key={(c.url || c.name) + i}
            onClick={() => play(c)}
            className="text-left bg-mg-card border border-white/10 rounded-lg p-3 flex items-center gap-3 min-h-[64px] hover:border-mg-green/60 hover:bg-mg-surface transition-colors"
          >
            <div className="w-12 h-12 rounded bg-black/30 flex items-center justify-center overflow-hidden shrink-0">
              {c.logo ? (
                <img src={c.logo} alt="" className="w-full h-full object-contain" />
              ) : (
                <Tv className="w-5 h-5 text-white/30" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-semibold text-sm truncate">{c.name}</div>
              <div className="text-white/40 text-xs truncate">{c.group}</div>
            </div>
            <Wifi className="w-4 h-4 text-mg-green shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}