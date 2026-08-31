import React from "react";
import { Shield, Film, Tv, Bookmark, Puzzle, Calendar, Settings, Crown, Power, Circle, MonitorPlay, X, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

const NAV = [
  { id: "movies", label: "Movies", icon: Film },
  { id: "tv", label: "TV Shows", icon: MonitorPlay },
  { id: "live", label: "Live TV", icon: Tv },
  { id: "watchlist", label: "Watchlist", icon: Bookmark },
  { id: "rdlib", label: "RD Library", icon: HardDrive },
  { id: "addons", label: "Addons", icon: Puzzle },
  { id: "roadmap", label: "Roadmap", icon: Calendar },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ active, onSelect, open, onClose }) {
  const handleSelect = (id) => {
    onSelect(id);
    onClose?.();
  };

  const content = (
    <>
      <div className="flex items-center gap-2 px-2 mb-6 justify-start">
        <div className="w-9 h-9 rounded-lg border-2 border-mg-green flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-mg-green" />
        </div>
        <span className="font-bold text-white tracking-wide">MEDIA GOD</span>
        <button onClick={onClose} className="ml-auto md:hidden text-white/60 hover:text-white" aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors justify-start",
                isActive
                  ? "bg-mg-green/10 text-mg-green border-l-2 border-mg-green"
                  : "text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/5 items-stretch">
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <Crown className="w-4 h-4 text-mg-green" />
          <span>PRO</span>
        </div>
        <button
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 justify-start"
        >
          <Power className="w-5 h-5" />
          <span className="text-sm">EXIT</span>
        </button>
        <div className="flex items-center gap-2 justify-start px-3">
          <Circle className="w-2.5 h-2.5 fill-mg-green text-mg-green animate-pulse" />
          <span className="text-xs font-semibold text-mg-green">LIVE</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: static sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 bg-mg-surface border-r border-white/5 flex-col py-4 px-3">
        {content}
      </aside>

      {/* Mobile: slide-out drawer */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <aside
          className={cn(
            "absolute left-0 top-0 bottom-0 w-64 max-w-[80vw] bg-mg-surface border-r border-white/5 flex flex-col py-4 px-3 transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {content}
        </aside>
      </div>
    </>
  );
}