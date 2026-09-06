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
import MediaGodV2Assist from "@/components/mg/MediaGodV2Assist";
import RdBanner from "@/components/mg/RdBanner";

import {
  PlayerProvider,
} from "@/components/mg/PlayerProvider";

/*
 * Everything that can call usePlayer()
 * MUST live below this component.
 */
function MediaGodApp() {
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

  const handleRemoteBack =
    useCallback(
      () => {
        /*
         * If a TMDB/search details
         * window is open, close that
         * before navigating Home.
         */
        if (
          searchResult
        ) {
          setSearchResult(
            null
          );

          return true;
        }

        if (
          searchOpen
        ) {
          setSearchOpen(
            false
          );

          return true;
        }

        /*
         * Fire TV Back from any
         * section returns to Home.
         */
        if (
          view !==
          "home"
        ) {
          setView(
            "home"
          );

          return true;
        }

        /*
         * Consume Back on Home.
         *
         * This prevents the Fire Stick
         * WebView falling backwards into
         * Base44/browser/login history.
         */
        return true;
      },
      [
        view,
        searchOpen,
        searchResult,
      ]
    );

  const renderView =
    () => {
      switch (
        view
      ) {
        case "movies":
          return (
            <MoviesView />
          );

        case "tv":
          return (
            <TvShowsView />
          );

        case "live":
          return (
            <LiveTVView />
          );

        case "watchlist":
          return (
            <WatchlistView />
          );

        case "favorites":
          return (
            <FavoritesView />
          );

        case "watchparty":
          return (
            <WatchPartyView />
          );

        case "rdlib":
          return (
            <RdLibraryView />
          );

        case "downloads":
          return (
            <DebridDashboard />
          );

        case "addons":
          return (
            <AddonsView />
          );

        case "roadmap":
          return (
            <RoadmapView />
          );

        case "settings":
          return (
            <SettingsView />
          );

        case "home":
        default:
          return (
            <HomeDashboard />
          );
      }
    };

  return (
    <>
      <FireTvRemote
        onBack={
          handleRemoteBack
        }
      />

      <MediaGodV2Assist />

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

          {renderView()}

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
                  ?.media_type ||
                searchResult
                  ?.mediaType ||
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
    </>
  );
}

/*
 * IMPORTANT:
 *
 * There is exactly ONE PlayerProvider
 * above the whole Media God interface.
 *
 * MediaCard
 * DetailModal
 * EpisodeSelector
 * StreamSourcesBox
 * ContinueWatching
 * Movies
 * TV
 * Search
 *
 * can all safely call usePlayer().
 */
export default function Home() {
  return (
    <PlayerProvider>
      <MediaGodApp />
    </PlayerProvider>
  );
}
