import React, { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MediaCard from "@/components/mg/MediaCard";

export default function MediaRow({ title, items, onOpen, onWatchlist, watched }) {
  const ref = useRef(null);
  const scroll = (dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  if (!items || items.length === 0) return null;
  return (
    <section className="px-4 sm:px-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold text-base sm:text-lg">{title}</h2>
        <div className="hidden sm:flex gap-1">
          <button onClick={() => scroll(-1)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70" aria-label="Scroll left">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => scroll(1)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70" aria-label="Scroll right">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div ref={ref} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((it) => (
          <MediaCard key={it.id} item={it} onOpen={onOpen} onWatchlist={onWatchlist} watched={watched?.[it.id]} />
        ))}
      </div>
    </section>
  );
}