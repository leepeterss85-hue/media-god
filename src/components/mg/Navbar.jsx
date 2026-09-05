import React from "react";
import {
  Shield,
  Film,
  Tv,
  Bookmark,
  Puzzle,
  Calendar,
  Settings,
  Power,
  MonitorPlay,
  HardDrive,
  Users,
  Home as HomeIcon,
  Search,
  Heart,
  Activity,
} from "lucide-react";

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
  const linkClass = (id) =>
    cn(
      "flex items-center gap-3 3xl:gap-4 rounded-md text-sm 3xl:text-base 4xl:text-lg font-medium transition-colors w-full min-h-11 3xl:min-h-12",
      active === id
        ? "bg-mg-green/15 text-mg-green"
        : "text-white/60 hover:text-white hover:bg-white/5"
    );

  const itemBtn = (item) => {
    const Icon = item.icon;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
        title={item.label}
        className={cn(
          linkClass(item.id),
          "justify-center md:justify-start px-2 md:px-3 3xl:px-4 py-2"
        )}
      >
        <Icon className="w-5 h-5 3xl:w-6 3xl:h-6 4xl:w-7 4xl:h-7 shrink-0" />
        <span className="hidden md:block truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="sticky top-0 h-screen shrink-0 bg-mg-surface border-r border-white/5 flex flex-col z-30 w-14 sm:w-16 md:w-60 3xl:w-72 4xl:w-80">
      <div className="flex items-center justify-center md:justify-start gap-2 3xl:gap-3 px-2 md:px-4 3xl:px-5 h-14 3xl:h-16 4xl:h-20 border-b border-white/5 shrink-0">
        <div className="w-8 h-8 3xl:w-10 3xl:h-10 4xl:w-12 4xl:h-12 rounded-lg border-2 border-mg-green flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 text-mg-green" />
        </div>

        <span className="font-bold text-white tracking-wide hidden md:block 3xl:text-lg 4xl:text-xl">
          MEDIA GOD
        </span>
      </div>

      <div className="p-2 md:p-3 3xl:p-4 border-b border-white/5 shrink-0">
        <button
          type="button"
          onClick={onSearch}
          title="Search"
          className="flex items-center gap-3 3xl:gap-4 justify-center md:justify-start w-full min-h-11 3xl:min-h-12 px-2 md:px-3 3xl:px-4 py-2.5 rounded-md text-sm 3xl:text-base 4xl:text-lg font-medium bg-white/5 text-white/80 hover:text-mg-green hover:bg-mg-green/10 border border-white/5 hover:border-mg-green/20 transition-colors"
        >
          <Search className="w-5 h-5 3xl:w-6 3xl:h-6 4xl:w-7 4xl:h-7 shrink-0" />
          <span className="hidden md:block">Search</span>
        </button>
      </div>

      <nav className="flex flex-col gap-1 3xl:gap-1.5 p-2 md:p-3 3xl:p-4 flex-1 overflow-y-auto scrollbar-hide">
        {NAV.map(itemBtn)}
      </nav>

      <div className="flex flex-col gap-1 p-2 md:p-3 3xl:p-4 border-t border-white/5 shrink-0 mg-safe-bottom">
        <button
          type="button"
          onClick={() => base44.auth.logout()}
          title="Sign out"
          className="flex items-center gap-3 3xl:gap-4 justify-center md:justify-start w-full min-h-11 3xl:min-h-12 px-2 md:px-3 3xl:px-4 py-2 rounded-md text-sm 3xl:text-base 4xl:text-lg font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Power className="w-5 h-5 3xl:w-6 3xl:h-6 4xl:w-7 4xl:h-7 shrink-0" />
          <span className="hidden md:block">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
