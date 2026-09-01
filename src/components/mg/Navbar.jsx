import React, { useState } from "react";
import { Shield, Film, Tv, Bookmark, Puzzle, Calendar, Settings, Power, MonitorPlay, HardDrive, Users, Home as HomeIcon, Menu, X, Search, Heart, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

const NAV = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "movies", label: "Movies", icon: Film },
  { id: "tv", label: "TV Shows", icon: MonitorPlay },
  { id: "live", label: "Live TV", icon: Tv },
  { id: "watchlist", label: "Watchlist", icon: Bookmark },
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "watchparty", label: "Watch Party", icon: Users },
  { id: "rdlib", label: "RD Library", icon: HardDrive },
  { id: "downloads", label: "Downloads", icon: Activity },
  { id: "addons", label: "Addons", icon: Puzzle },
  { id: "roadmap", label: "Roadmap", icon: Calendar },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Navbar({ active, onSelect, onSearch }) {
  const [open, setOpen] = useState(false);
  const select = (id) => { onSelect(id); setOpen(false); };

  const linkClass = (id) =>
    cn(
      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
      active === id ? "bg-mg-green/15 text-mg-green" : "text-white/60 hover:text-white hover:bg-white/5"
    );

  return (
    <header className="sticky top-0 z-30 bg-mg-background/90 backdrop-blur border-b border-white/5">
      <div className="flex items-center gap-2 px-4 h-14">
        <button onClick={() => setOpen(true)} className="md:hidden flex items-center justify-center w-9 h-9 -ml-1 rounded-lg text-white hover:bg-white/5" aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mr-3 shrink-0">
          <div className="w-8 h-8 rounded-lg border-2 border-mg-green flex items-center justify-center">
            <Shield className="w-4 h-4 text-mg-green" />
          </div>
          <span className="font-bold text-white tracking-wide hidden sm:block">MEDIA GOD</span>
        </div>
        <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => select(item.id)} className={linkClass(item.id)}>
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button onClick={onSearch} className="flex items-center justify-center w-9 h-9 rounded-lg text-white/70 hover:text-white hover:bg-white/5" aria-label="Search">
            <Search className="w-5 h-5" />
          </button>
          <button onClick={() => base44.auth.logout()} className="flex items-center justify-center w-9 h-9 rounded-lg text-white/70 hover:text-white hover:bg-white/5" aria-label="Sign out">
            <Power className="w-5 h-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 max-w-[80vw] bg-mg-surface border-r border-white/5 flex flex-col py-4 px-3">
            <div className="flex items-center gap-2 px-1 mb-4">
              <div className="w-8 h-8 rounded-lg border-2 border-mg-green flex items-center justify-center">
                <Shield className="w-4 h-4 text-mg-green" />
              </div>
              <span className="font-bold text-white">MEDIA GOD</span>
              <button onClick={() => setOpen(false)} className="ml-auto text-white/60 hover:text-white" aria-label="Close menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 flex-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} onClick={() => select(item.id)} className={linkClass(item.id)}>
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </header>
  );
}