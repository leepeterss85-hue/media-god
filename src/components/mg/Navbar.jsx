import React from "react";
import { Shield, Film, Tv, Bookmark, Puzzle, Calendar, Settings, Power, MonitorPlay, HardDrive, Users, Home as HomeIcon, Search, Heart, Activity } from "lucide-react";
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

// Persistent left sidebar navigation. Always visible: an icon-only rail on
// mobile (w-16) that expands to a full labelled column on md+ (w-60). Stays
// pinned to the viewport while the main content scrolls.
export default function Navbar({ active, onSelect, onSearch }) {
  const linkClass = (id) =>
    cn(
      "flex items-center gap-3 rounded-md text-sm font-medium transition-colors w-full",
      active === id ? "bg-mg-green/15 text-mg-green" : "text-white/60 hover:text-white hover:bg-white/5"
    );

  const itemBtn = (item) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => onSelect(item.id)}
        title={item.label}
        className={cn(linkClass(item.id), "justify-center md:justify-start px-2 md:px-3 py-2")}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span className="hidden md:block truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="sticky top-0 h-screen shrink-0 bg-mg-surface border-r border-white/5 flex flex-col z-30 w-16 md:w-60">
      <div className="flex items-center gap-2 px-3 md:px-4 h-14 border-b border-white/5 shrink-0">
        <div className="w-8 h-8 rounded-lg border-2 border-mg-green flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-mg-green" />
        </div>
        <span className="font-bold text-white tracking-wide hidden md:block">MEDIA GOD</span>
      </div>

      <nav className="flex flex-col gap-1 p-2 md:p-3 flex-1 overflow-y-auto scrollbar-hide">
        {NAV.map(itemBtn)}
      </nav>

      <div className="flex flex-col gap-1 p-2 md:p-3 border-t border-white/5 shrink-0">
        <button
          onClick={onSearch}
          title="Search"
          className="flex items-center gap-3 justify-center md:justify-start px-2 md:px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/5"
        >
          <Search className="w-5 h-5 shrink-0" />
          <span className="hidden md:block">Search</span>
        </button>
        <button
          onClick={() => base44.auth.logout()}
          title="Sign out"
          className="flex items-center gap-3 justify-center md:justify-start px-2 md:px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/5"
        >
          <Power className="w-5 h-5 shrink-0" />
          <span className="hidden md:block">Sign out</span>
        </button>
      </div>
    </aside>
  );
}