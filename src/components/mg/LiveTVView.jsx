import React, { useEffect, useMemo, useState } from "react";
import { Search, Wifi, Users, ChevronLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { usePlayer, DEMO_VIDEO } from "@/components/mg/PlayerProvider";

const TABS = ["TV", "Rest of World", "Free Streams"];
const SORTS = ["Default", "Viewers", "A-Z", "Quality", "Region"];

export default function LiveTVView() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("TV");
  const [subtab, setSubtab] = useState("UK Television");
  const [sort, setSort] = useState("Default");
  const [query, setQuery] = useState("");
  const player = usePlayer();

  useEffect(() => {
    base44.entities.Channel.list("-created_date", 200)
      .then(setChannels)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = [...channels];
    if (tab === "TV") list = list.filter((c) => c.region === "UK");
    else if (tab === "Rest of World") list = list.filter((c) => c.region === "World");
    else list = list.filter((c) => c.region === "Free");

    if (query) list = list.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

    if (sort === "Viewers") list.sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
    else if (sort === "A-Z") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "Quality") list.sort((a, b) => (a.quality || "").localeCompare(b.quality || ""));
    return list;
  }, [channels, tab, query, sort]);

  const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : `${n}`);

  const playChannel = (c) => {
    player.play({ type: "live", src: DEMO_VIDEO, title: c.name });
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <button className="text-white/50 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                tab === t ? "bg-mg-green text-black" : "text-white/70 hover:text-white"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {["UK Television", "Rest of World (13473)"].map((s) => (
          <button
            key={s}
            onClick={() => setSubtab(s)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors",
              subtab === s ? "bg-mg-green text-black" : "bg-mg-card text-white/70 hover:text-white"
            )}
          >
            {s}
          </button>
        ))}
      </div>

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
        <div className="flex gap-1 overflow-x-auto">
          {SORTS.map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap",
                sort === s ? "bg-mg-green text-black" : "bg-mg-card text-white/60 hover:text-white"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-white/40 mb-4">
        GLOBAL • {filtered.length.toLocaleString()} channels
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-24 bg-mg-card rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => playChannel(c)}
              className="text-left bg-mg-card border border-white/10 rounded-lg p-3 flex flex-col justify-between min-h-[96px] hover:border-mg-green/60 hover:bg-mg-surface transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <span className="text-xs text-white/40">#{c.number}</span>
                <Wifi className="w-4 h-4 text-mg-green" />
              </div>
              <div className="text-white font-semibold text-sm truncate">{c.name}</div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold border border-yellow-600/60 text-yellow-500 px-1.5 py-0.5 rounded">
                  {c.quality}
                </span>
                <span className="flex items-center gap-1 text-xs text-white/50">
                  <Users className="w-3 h-3" />
                  {fmt(c.viewers || 0)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}