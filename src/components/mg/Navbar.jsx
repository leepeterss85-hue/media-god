import React from "react";

import {
  Activity,
  Bookmark,
  Calendar,
  Film,
  HardDrive,
  Heart,
  Home as HomeIcon,
  MonitorPlay,
  Power,
  Puzzle,
  Search,
  Settings,
  Shield,
  Tv,
  Users,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const NAV = [
  {
    id: "home",
    label: "Home",
    icon: HomeIcon,
  },
  {
    id: "movies",
    label: "Movies",
    icon: Film,
  },
  {
    id: "tv",
    label: "TV Shows",
    icon: MonitorPlay,
  },
  {
    id: "live",
    label: "Live TV",
    icon: Tv,
  },
  {
    id: "watchlist",
    label: "Watchlist",
    icon: Bookmark,
  },
  {
    id: "favorites",
    label: "Favorites",
    icon: Heart,
  },
  {
    id: "watchparty",
    label: "Watch Party",
    icon: Users,
  },
  {
    id: "rdlib",
    label: "RD Library",
    icon: HardDrive,
  },
  {
    id: "downloads",
    label: "Downloads",
    icon: Activity,
  },
  {
    id: "addons",
    label: "Addons",
    icon: Puzzle,
  },
  {
    id: "roadmap",
    label: "Roadmap",
    icon: Calendar,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
];

export default function Navbar({
  active,
  onSelect,
  onSearch,
}) {
  const linkClass = (id) =>
    cn(
      "flex min-h-11 w-full items-center gap-3 rounded-md text-sm font-medium transition-colors",

      active === id
        ? "bg-mg-green/15 text-mg-green"
        : "text-white/60 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white"
    );

  return (
    <aside className="mg-fire-tv-nav sticky top-0 z-30 flex h-screen w-16 shrink-0 flex-col border-r border-white/5 bg-mg-surface md:w-60">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/5 px-3 md:px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-mg-green">
          <Shield className="h-4 w-4 text-mg-green" />
        </div>

        <span className="hidden font-bold tracking-wide text-white md:block">
          MEDIA GOD
        </span>
      </div>

      <nav className="scrollbar-hide flex flex-1 flex-col gap-1 overflow-y-auto p-2 md:p-3">
        {NAV.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onSelect(
                  item.id
                )
              }
              title={item.label}
              className={cn(
                linkClass(
                  item.id
                ),
                "justify-center px-2 py-2 md:justify-start md:px-3"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />

              <span className="hidden truncate md:block">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex shrink-0 flex-col gap-1 border-t border-white/5 p-2 md:p-3">
        <button
          type="button"
          onClick={onSearch}
          title="Search"
          className="flex min-h-11 items-center justify-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white md:justify-start md:px-3"
        >
          <Search className="h-5 w-5 shrink-0" />

          <span className="hidden md:block">
            Search
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            base44.auth.logout()
          }
          title="Sign out"
          className="flex min-h-11 items-center justify-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white md:justify-start md:px-3"
        >
          <Power className="h-5 w-5 shrink-0" />

          <span className="hidden md:block">
            Sign out
          </span>
        </button>
      </div>
    </aside>
  );
}
