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
  ] = useState(
    "home"
  );

  const [
    searchOpen,
    setSearchOpen,
  ] = useState(
    false
  );

  const [
    searchResult,
    setSearchResult,
  ] = useState(
    null
  );

  /*
   * Fire TV Back behaviour.
   *
   * Back closes player / modal /
   * season picker first.
   *
   * If the user is inside another
   * section it returns to Home.
   *
   * If already on Home we still
   * consume Back so it does not
   * navigate back to the Base44
   * login screen.
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

      {/*
       * TEMPORARY APK LIVE UPDATE TEST
       *
       * Publish this change in Base44.
       * DO NOT rebuild the APK.
       *
       * Force-close Media God on the
       * Fire Stick and reopen it.
       *
       * If this badge appears, the APK
       * is loading your latest hosted
       * Base44 application.
       */}
      <div className="fixed top-3 right-3 z-[9999] rounded-lg border border-white/20 bg-red-600 px-4 py-2 text-sm font-black text-white shadow-2xl pointer-events-none">
        REMOTE UPDATE TEST
      </div>

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
