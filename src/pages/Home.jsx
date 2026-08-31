import React, { useState } from "react";
import Sidebar from "@/components/mg/Sidebar";
import MoviesView from "@/components/mg/MoviesView";
import TvShowsView from "@/components/mg/TvShowsView";
import LiveTVView from "@/components/mg/LiveTVView";
import WatchlistView from "@/components/mg/WatchlistView";
import AddonsView from "@/components/mg/AddonsView";
import RoadmapView from "@/components/mg/RoadmapView";
import SettingsView from "@/components/mg/SettingsView";
import { PlayerProvider } from "@/components/mg/PlayerProvider";

export default function Home() {
  const [view, setView] = useState("movies");

  return (
    <PlayerProvider>
    <div className="flex h-screen bg-mg-background text-white overflow-hidden">
      <Sidebar active={view} onSelect={setView} />
      <main className="flex-1 overflow-y-auto">
        {view === "movies" && <MoviesView />}
        {view === "tv" && <TvShowsView />}
        {view === "live" && <LiveTVView />}
        {view === "watchlist" && <WatchlistView />}
        {view === "addons" && <AddonsView />}
        {view === "roadmap" && <RoadmapView />}
        {view === "settings" && <SettingsView />}
      </main>
    </div>
    </PlayerProvider>
  );
}