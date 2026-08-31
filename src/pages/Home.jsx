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
import TopBar from "@/components/mg/TopBar";

const TITLES = {
  movies: "Movies",
  tv: "TV Shows",
  live: "Live TV",
  watchlist: "Watchlist",
  addons: "Addons",
  roadmap: "Roadmap",
  settings: "Settings",
};

export default function Home() {
  const [view, setView] = useState("movies");
  const [history, setHistory] = useState([]);

  const selectView = (v) => {
    setHistory((h) => [...h, view]);
    setView(v);
  };
  const goBack = () => {
    if (history.length === 0) {
      setView("movies");
      return;
    }
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setView(prev);
  };

  return (
    <PlayerProvider>
    <div className="flex h-screen bg-mg-background text-white overflow-hidden">
      <Sidebar active={view} onSelect={selectView} />
      <main className="flex-1 overflow-y-auto">
        <TopBar title={TITLES[view]} onBack={goBack} canGoBack={history.length > 0} />
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