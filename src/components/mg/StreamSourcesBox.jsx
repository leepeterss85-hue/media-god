import React, { useEffect, useState } from "react";
import { Zap, Play, Tv, ExternalLink, Link as LinkIcon, Globe, Radio } from "lucide-react";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export default function StreamSourcesBox({ title, poster, trailerUrl, providers, loading, rdYear }) {
  const player = usePlayer();
  const [liveMatches, setLiveMatches] = useState(null);
  const [scrapedStreams, setScrapedStreams] = useState([]);
  const [scraping, setScraping] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLiveMatches(null);
    findChannelsByTitle(title).then((m) => {
      if (!cancelled) setLiveMatches(m);
    });

    // Query active installed addons and scrapers dynamically
    setScraping(true);
    base44.entities.Addon.list("-created_date", 100)
      .then(async (addons) => {
        const activeAddons = (addons || []).filter(a => a.active && a.url);
        let collected = [];

        for (const addon of activeAddons) {
          try {
            // Attempt manifest query or direct scraper endpoint matching
            const targetUrl = addon.url.replace('/manifest.json', `/stream/movie/${encodeURIComponent(title)}.json`);
            const res = await fetch(targetUrl);
            const data = await res.json();
            if (data && data.streams) {
              collected = [...collected, ...data.streams.map(s => ({
                id: Math.random().toString(36).substring(7),
                kind: "addon-stream",
                label: s.title ? s.title.split('\n')[0] : "Stream Source",
                note: s.name || addon.name,
                url: s.url || s.infoHash,
              }))];
            }
          } catch (e) {
            // Skip offline or incompatible manifest endpoints silently
          }
        }

        if (!cancelled) {
          setScrapedStreams(collected.slice(0, 5));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setScraping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [title]);

  const sources = [];
  sources.push({ id: "rd", kind: "rd", label: "Real-Debrid", note: "Cached stream or your magnet" });

  scrapedStreams.forEach((s) => {
    sources.push(s);
  });

  sources.push({ id: "paste", kind: "paste", label: "Paste Magnet", note: "Your own magnet via Real-Debrid" });
  if (trailerUrl) sources.push({ id: "trailer", kind: "trailer", label: "Trailer", note: "YouTube" });

  (liveMatches || []).forEach((c, i) => {
    sources.push({
      id: "live-" + i,
      kind: "live",
      label: c.name,
      note: "Live • " + (c.group || "Free-to-air"),
      logo: c.logo,
      channel: c,
    });
  });

  sources.push({ id: "archive", kind: "archive", label: "Free Archive", note: "Public-domain on Internet Archive" });

  (providers || []).forEach((p) => {
    sources.push({ id: "prov-" + p.name, kind: "provider", label: p.name, note: p.tier || "Stream", logo: p.logo, link: p.link });
  });

  const playSource = (s) => {
    if (s.kind === "provider") {
      window.open(s.link, "_blank", "noopener,noreferrer");
      return;
    }
    if (s.kind === "archive") {
      window.open(`https://archive.org/search?query=${encodeURIComponent(title)}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (s.kind === "addon-stream") {
      player.play({
        title,
        poster,
        noRd: true,
        sources: [{ label: s.label, type: "url", src: s.url }],
      });
      return;
    }
    if (s.kind === "trailer") {
      player.play({ title, poster, noRd: true, sources: [{ label: "Trailer", type: "youtube", src: trailerUrl }] });
      return;
    }
    if (s.kind === "live") {
      player.play({
        title: s.channel.name,
        poster: s.channel.logo,
        noRd: true,
        sources: [{ label: "LIVE", type: "live", src: s.channel.url, live: true }],
      });
      return;
    }
    if (s.kind === "paste") {
      player.play({
        title,
        poster,
        rdTitle: title,
        rdYear,
        sources: [{ label: "Real-Debrid", type: "rd", src: "", skipAutoResolve: true }],
      });
      return;
    }
    if (s.kind === "rd") {
      player.play({
        title,
        poster,
        rdTitle: title,
        rdYear,
        sources: [{ label: "Real-Debrid", type: "rd", src: "" }],
      });
    }
  };

  const iconFor = (kind) => {
    if (kind === "rd") return <Zap className="w-4 h-4 text-mg-green" />;
    if (kind === "addon-stream") return <Globe className="w-4 h-4 text-cyan-400" />;
    if (kind === "paste") return <LinkIcon className="w-4 h-4 text-mg-green" />;
    if (kind === "trailer") return <Play className="w-4 h-4 text-white/70" />;
    if (kind === "live") return <Radio className="w-4 h-4 text-red-400" />;
    if (kind === "archive") return <Globe className="w-4 h-4 text-white/70" />;
    return <Tv className="w-4 h-4 text-white/70" />;
  };

  const rowClass = (kind) =>
    cn(
      "flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md transition-colors border",
      kind === "rd"
        ? "bg-mg-green/10 hover:bg-mg-green/20 border-mg-green/30"
        : kind === "addon-stream"
        ? "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30"
        : kind === "live"
        ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30"
        : "bg-white/5 hover:bg-white/10 border-transparent"
    );

  const labelClass = (kind) =>
    cn("block text-sm font-medium truncate", kind === "rd" || kind === "addon-stream" || kind === "live" ? "text-mg-green" : "text-white");

  return (
    <div className="mt-4 bg-mg-card border border-white/10 rounded-lg p-3">
      <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-mg-green" /> Stream Sources
      </h3>
      {loading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sources.map((s) => (
            <button key={s.id} onClick={() => playSource(s)} className={rowClass(s.kind)}>
              <span className="w-8 h-8 rounded-md bg-black/30 flex items-center justify-center shrink-0 overflow-hidden">
                {s.logo ? (
                  <img src={s.logo} alt={s.label} className="w-full h-full object-contain" />
                ) : (
                  iconFor(s.kind)
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={labelClass(s.kind)}>{s.label}</span>
                <span className="block text-[10px] text-white/40 truncate">{s.note}</span>
              </span>
              {s.kind === "provider" || s.kind === "archive" ? (
                <ExternalLink className="w-3.5 h-3.5 text-white/40 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 text-white/40 shrink-0" />
              )}
            </button>
          ))}
          {scraping && (
            <p className="text-[10px] text-white/30 px-1 pt-1">Scraping online sources…</p>
          )}
          {liveMatches === null && (
            <p className="text-[10px] text-white/30 px-1 pt-1">Checking live channels…</p>
          )}
        </div>
      )}
    </div>
  );
}
