import React from "react";
import { Shield, Film, Tv, Bookmark, Puzzle, Calendar, Settings, Crown, Power, Circle, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { id: "movies", label: "Movies", icon: Film },
  { id: "tv", label: "TV Shows", icon: MonitorPlay },
  { id: "live", label: "Live TV", icon: Tv },
  { id: "watchlist", label: "Watchlist", icon: Bookmark },
  { id: "addons", label: "Addons", icon: Puzzle },
  { id: "roadmap", label: "Roadmap", icon: Calendar },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ active, onSelect }) {
  return (
    <aside className="w-20 md:w-56 shrink-0 bg-mg-surface border-r border-white/5 flex flex-col items-center md:items-stretch py-4 px-2 md:px-3">
      <div className="flex items-center gap-2 px-2 mb-6 justify-center md:justify-start">
        <div className="w-9 h-9 rounded-lg border-2 border-mg-green flex items-center justify-center">
          <Shield className="w-5 h-5 text-mg-green" />
        </div>
        <span className="hidden md:block font-bold text-white tracking-wide">MEDIA GOD</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors justify-center md:justify-start",
                isActive
                  ? "bg-mg-green/10 text-mg-green border-l-2 border-mg-green"
                  : "text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/5 items-center md:items-stretch">
        <div className="hidden md:flex items-center gap-2 text-white/40 text-xs">
          <Crown className="w-4 h-4 text-mg-green" />
          <span>PRO</span>
        </div>
        <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 justify-center md:justify-start">
          <Power className="w-5 h-5" />
          <span className="hidden md:inline text-sm">EXIT</span>
        </button>
        <div className="flex items-center gap-2 justify-center md:justify-start px-3">
          <Circle className="w-2.5 h-2.5 fill-mg-green text-mg-green animate-pulse" />
          <span className="hidden md:inline text-xs font-semibold text-mg-green">LIVE</span>
        </div>
      </div>
    </aside>
  );
}