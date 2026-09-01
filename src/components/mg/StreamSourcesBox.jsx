import React from "react";
import { Zap, Play, Tv, ExternalLink } from "lucide-react";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { cn } from "@/lib/utils";

// A box that surfaces every available stream source for a title as a
// clickable row — Real-Debrid, the YouTube trailer, and each legal watch
// provider — so the user can pick exactly how to watch from the detail
// modal instead of only from inside the player.
export default function StreamSourcesBox({ title, poster, trailerUrl, providers, loading, rdYear }) {
  const player = usePlayer();

  const sources = [];
  // Real-Debrid is always offered first for on-demand content; the player
  // resolves it (cached library match or paste-a-magnet box).
  sources.push({ id: "rd", kind: "rd", label: "Real-Debrid", note: "Cached stream or your magnet" });
  if (trailerUrl) {
    sources.push({ id: "trailer", kind: "trailer", label: "Trailer", note: "YouTube" });
  }
  (providers || []).forEach((p) => {
    sources.push({ id: "prov-" + p.name, kind: "provider", label: p.name, note: p.tier || "Stream", logo: p.logo, link: p.link });
  });

  const playSource = (s) => {
    if (s.kind === "provider") {
      window.open(s.link, "_blank", "noopener,noreferrer");
      return;
    }
    if (s.kind === "trailer") {
      player.play({
        title,
        poster,
        noRd: true,
        sources: [{ label: "Trailer", type: "youtube", src: trailerUrl }],
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
    if (kind === "trailer") return <Play className="w-4 h-4 text-white/70" />;
    return <Tv className="w-4 h-4 text-white/70" />;
  };

  return (
    <div className="mt-4 bg-mg-card border border-white/10 rounded-lg p-3">
      <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-mg-green" /> Stream Sources
      </h3>
      {loading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() => playSource(s)}
              className={cn(
                "flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md transition-colors",
                s.kind === "rd"
                  ? "bg-mg-green/10 hover:bg-mg-green/20 border border-mg-green/30"
                  : "bg-white/5 hover:bg-white/10 border border-transparent"
              )}
            >
              <span className="w-8 h-8 rounded-md bg-black/30 flex items-center justify-center shrink-0 overflow-hidden">
                {s.logo ? (
                  <img src={s.logo} alt={s.label} className="w-full h-full object-contain" />
                ) : (
                  iconFor(s.kind)
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium truncate", s.kind === "rd" ? "text-mg-green" : "text-white")}>
                  {s.label}
                </span>
                <span className="block text-[10px] text-white/40 truncate">{s.note}</span>
              </span>
              {s.kind === "provider" ? (
                <ExternalLink className="w-3.5 h-3.5 text-white/40 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 text-white/40 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}