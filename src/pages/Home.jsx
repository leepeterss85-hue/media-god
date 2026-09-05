import React, {
  useCallback,
  useState,
} from "react";

import Navbar from "@/components/mg/Navbar";
import HomeDashboard from "@/components/mg/HomeDashboard";
import MoviesView from "@/components/mg/MoviesView";
import TvShowsView from "@/components/mg/TvShowsView";
import LiveTVView from "@/components/mg/LiveTVView";
import WatchlistView from "@/components/mg/WatchlistView";
import RdLibraryView from "@/components/mg/RdLibraryView";
import DebridDashboard from "@/components/mg/DebridDashboard";
import AddonsView from "@/components/mg/AddonsView";
import RoadmapView from "@/components/mg/RoadmapView";
import SettingsView from "@/components/mg/SettingsView";
import WatchPartyView from "@/components/mg/WatchPartyView";
import FavoritesView from "@/components/mg/FavoritesView";
import SearchDialog from "@/components/mg/SearchDialog";
import DetailModal from "@/components/mg/DetailModal";
import FireTvRemote from "@/components/mg/FireTvRemote";
import {
  PlayerProvider,
} from "@/components/mg/PlayerProvider";
import RdBanner from "@/components/mg/RdBanner";

export default function Home() {
  const [
    view,
    setView,
  ] =
    useState(
      "home"
    );

  const [
    searchOpen,
    setSearchOpen,
  ] =
    useState(
      false
    );

  const [
    searchResult,
    setSearchResult,
  ] =
    useState(
      null
    );

  /*
   * Fire TV Back behaviour:
   *
   * The global remote controller closes
   * the player/modal/picker first.
   *
   * If no overlay is open, Back returns
   * to Home.
   *
   * If already on Home, we still consume
   * Back so Fire TV/Silk does not navigate
   * backwards into the Base44 login page.
   */
  const handleRemoteBack =
    useCallback(
      () => {
        if (
          view !==
          "home"
        ) {
          setView(
            "home"
          );

          return true;
        }

        return true;
      },
      [
        view,
      ]
    );

  return (
    <PlayerProvider>
      <FireTvRemote
        onBack={
          handleRemoteBack
        }
      />

      <div className="min-h-screen w-full overflow-x-hidden bg-mg-background text-white flex">
        <Navbar
          active={
            view
          }
          onSelect={
            setView
          }
          onSearch={() =>
            setSearchOpen(
              true
            )
          }
        />

        <main className="flex-1 min-w-0 w-full flex flex-col overflow-x-hidden">
          <RdBanner
            onLinkSettings={() =>
              setView(
                "settings"
              )
            }
          />

          {view ===
            "home" && (
            <HomeDashboard />
          )}

          {view ===
            "movies" && (
            <MoviesView />
          )}

          {view ===
            "tv" && (
            <TvShowsView />
          )}

          {view ===
            "live" && (
            <LiveTVView />
          )}

          {view ===
            "watchlist" && (
            <WatchlistView />
          )}

          {view ===
            "favorites" && (
            <FavoritesView />
          )}

          {view ===
            "watchparty" && (
            <WatchPartyView />
          )}

          {view ===
            "rdlib" && (
            <RdLibraryView />
          )}

          {view ===
            "downloads" && (
            <DebridDashboard />
          )}

          {view ===
            "addons" && (
            <AddonsView />
          )}

          {view ===
            "roadmap" && (
            <RoadmapView />
          )}

          {view ===
            "settings" && (
            <SettingsView />
          )}

          <SearchDialog
            open={
              searchOpen
            }
            onOpenChange={
              setSearchOpen
            }
            onSelect={
              setSearchResult
            }
          />

          {searchResult && (
            <DetailModal
              item={
                searchResult
              }
              mediaType={
                searchResult
                  .media_type ||
                "movie"
              }
              onClose={() =>
                setSearchResult(
                  null
                )
              }
            />
          )}
        </main>
      </div>
    </PlayerProvider>
  );
}
