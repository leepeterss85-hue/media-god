import React, { useEffect, useState } from "react";
import { Play, X, History } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { Image } from "@/components/ui/image";

const fmtTime = (s) => {
  if (!s || s < 1 || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}:${String(m % 60).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
};

export default function ContinueWatchingRow() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();

  const load = () => {
    base44.entities.ContinueWatching.list("-updated_date", 20)
      .then((r) => setItems(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const unsub = base44.entities.ContinueWatching.subscribe(() => load());
    return unsub;
  }, []);

  const remove = async (id, e) => {
    e?.stopPropagation();
    try { await base44.entities.ContinueWatching.delete(id); } catch {}
  };

  const resume = (it) => {
    if (it.source_type === "rd") {
      // Real-Debrid stream URLs expire, so re-resolve from the user's RD
      // library and seek to the saved position once the stream loads.
      player.play({
        title: it.title,
        poster: it.poster_url,
        rdTitle: it.title,
        rdYear: it.year,
        startTime: it.progress,
        noRd: true,
        sources: [{ label: "Real-Debrid", type: "rd", src: "" }],
      });
      return;
    }
    player.play({
      title: it.title,
      poster: it.poster_url,
      rdYear: it.year,
      startTime: it.progress,
      noRd: true,
      sources: [{ label: "Resume", type: "file", src: it.video_url }],
    });
  };

  if (loading || items.length === 0) return null;

  return (
    <section className="px-4 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-mg-green" />
        <h2 className="text-white font-semibold text-sm">Continue Watching</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((it) => {
          const pct = it.duration > 0 ? Math.min(100, (it.progress / it.duration) * 100) : 0;
          return (
            <div key={it.id} onClick={() => resume(it)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') resume(it); }} className="group relative w-32 sm:w-36 shrink-0 text-left cursor-pointer">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-mg-card border border-white/10">
                <Image src={it.poster_url} fittingType="fill" className="w-full h-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-80" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-9 h-9 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-4 h-4 fill-black" />
                  </div>
                </div>
                <button
                  onClick={(e) => remove(it.id, e)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
                  aria-label="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div className="h-full bg-mg-green" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="mt-1.5 text-white font-semibold text-xs truncate">{it.title}</div>
              <div className="text-white/40 text-[10px]">{fmtTime(it.progress)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}