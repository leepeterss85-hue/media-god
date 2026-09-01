import React, { useState } from "react";
import Navbar from "@/components/mg/Navbar";
import HomeDashboard from "@/components/mg/HomeDashboard";
import MoviesView from "@/components/mg/MoviesView";
import TvShowsView from "@/components/mg/TvShowsView";
import LiveTVView from "@/components/mg/LiveTVView";
import WatchlistView from "@/components/mg/WatchlistView";
import RdLibraryView from "@/components/mg/RdLibraryView";
import AddonsView from "@/components/mg/AddonsView";
import RoadmapView from "@/components/mg/RoadmapView";
import SettingsView from "@/components/mg/SettingsView";
import WatchPartyView from "@/components/mg/WatchPartyView";
import { PlayerProvider } from "@/components/mg/PlayerProvider";
import RdBanner from "@/components/mg/RdBanner";

export default function Home() {
  const [view, setView] = useState("home");

  return (
    <PlayerProvider>
      <div className="min-h-screen bg-mg-background text-white">
        <Navbar active={view} onSelect={setView} />
        <RdBanner onLinkSettings={() => setView("settings")} />
        {view === "home" && <HomeDashboard />}
        {view === "movies" && <MoviesView />}
        {view === "tv" && <TvShowsView />}
        {view === "live" && <LiveTVView />}
        {view === "watchlist" && <WatchlistView />}
        {view === "watchparty" && <WatchPartyView />}
        {view === "rdlib" && <RdLibraryView />}
        {view === "addons" && <AddonsView />}
        {view === "roadmap" && <RoadmapView />}
        {view === "settings" && <SettingsView />}
      </div>
    </PlayerProvider>
  );
}