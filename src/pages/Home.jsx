import React, {
  Component,
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
import {
  PlayerProvider,
} from "@/components/mg/PlayerProvider";
import RdBanner from "@/components/mg/RdBanner";

const normaliseMediaType = (
  item
) => {
  const type =
    String(
      item?.media_type ||
        item?.mediaType ||
        item?.type ||
        ""
    ).toLowerCase();

  if (
    type === "tv" ||
    type === "series" ||
    type === "show"
  ) {
    return "tv";
  }

  if (
    item?.first_air_date ||
    item?.firstAirDate ||
    (
      item?.name &&
      !item?.title
    )
  ) {
    return "tv";
  }

  return "movie";
};

const normaliseSearchSelection =
  (
    value
  ) => {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return null;
    }

    const id =
      value.id ??
      value.tmdb_id ??
      value.tmdbId ??
      null;

    if (
      id == null ||
      id === ""
    ) {
      return null;
    }

    const mediaType =
      normaliseMediaType(
        value
      );

    const title =
      String(
        value.title ||
          value.name ||
          value.original_title ||
          value.original_name ||
          "Untitled"
      ).trim();

    const date =
      String(
        value.release_date ||
          value.first_air_date ||
          ""
      );

    const year =
      String(
        value.year ||
          (
            /^\d{4}/.test(
              date
            )
              ? date.slice(
                  0,
                  4
                )
              : ""
          )
      );

    return {
      ...value,

      id,

      tmdb_id:
        value.tmdb_id ??
        id,

      tmdbId:
        value.tmdbId ??
        id,

      title,

      name:
        value.name ||
        title,

      year,

      media_type:
        mediaType,

      mediaType,

      poster_url:
        value.poster_url ||
        value.posterUrl ||
        "",

      description:
        value.description ||
        value.overview ||
        "",
    };
  };

class DetailErrorBoundary
  extends Component {
  constructor(
    props
  ) {
    super(
      props
    );

    this.state = {
      hasError:
        false,

      message:
        "",
    };
  }

  static getDerivedStateFromError(
    error
  ) {
    return {
      hasError:
        true,

      message:
        error?.message ||
        "The details screen could not be opened.",
    };
  }

  componentDidCatch(
    error,
    info
  ) {
    console.error(
      "Media God detail screen error:",
      error,
      info
    );
  }

  componentDidUpdate(
    prevProps
  ) {
    if (
      prevProps.resetKey !==
        this.props.resetKey &&
      this.state.hasError
    ) {
      this.setState({
        hasError:
          false,

        message:
          "",
      });
    }
  }

  render() {
    if (
      !this.state.hasError
    ) {
      return this.props
        .children;
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Details error"
        className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-lg rounded-xl border border-red-500/30 bg-mg-surface p-5 text-white shadow-2xl">
          <h2 className="text-lg font-bold">
            Could not open this title
          </h2>

          <p className="mt-2 text-sm text-white/60">
            Media God stopped the details screen from crashing the whole app.
          </p>

          <p className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-red-300 break-words">
            {
              this.state
                .message
            }
          </p>

          <button
            type="button"
            onClick={
              this.props
                .onClose
            }
            className="mt-4 min-h-11 rounded-lg bg-mg-green px-4 py-2 text-sm font-semibold text-black"
          >
            Back to Media God
          </button>
        </div>
      </div>
    );
  }
}

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
        searchOpen,
        searchResult,
        view,
      ]
    );

  const openSearch =
    useCallback(
      () => {
        setSearchResult(
          null
        );

        setSearchOpen(
          true
        );
      },
      []
    );

  const handleSearchSelect =
    useCallback(
      (
        rawItem
      ) => {
        const item =
          normaliseSearchSelection(
            rawItem
          );

        if (
          !item
        ) {
          console.error(
            "Media God received an invalid search result:",
            rawItem
          );

          return;
        }

        /*
         * Close SearchDialog completely before mounting DetailModal.
         *
         * This is important on Android / Fire TV WebView because two
         * full-screen overlays fighting for focus/layout can produce
         * broken transitions.
         */
        setSearchOpen(
          false
        );

        window.setTimeout(
          () => {
            setSearchResult(
              item
            );
          },
          0
        );
      },
      []
    );

  const closeDetails =
    useCallback(
      () => {
        setSearchResult(
          null
        );
      },
      []
    );

  const detailResetKey =
    searchResult
      ? `${searchResult.media_type}:${searchResult.id}`
      : "none";

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
          onSelect={(
            nextView
          ) => {
            setSearchOpen(
              false
            );

            setSearchResult(
              null
            );

            setView(
              nextView
            );
          }}
          onSearch={
            openSearch
          }
        />

        <main className="flex-1 min-w-0 w-full flex flex-col overflow-x-hidden">
          <RdBanner
            onLinkSettings={() => {
              setSearchOpen(
                false
              );

              setSearchResult(
                null
              );

              setView(
                "settings"
              );
            }}
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
        </main>
      </div>

      <SearchDialog
        open={
          searchOpen
        }
        onOpenChange={
          setSearchOpen
        }
        onSelect={
          handleSearchSelect
        }
      />

      {searchResult && (
        <DetailErrorBoundary
          resetKey={
            detailResetKey
          }
          onClose={
            closeDetails
          }
        >
          <DetailModal
            item={
              searchResult
            }
            mediaType={
              searchResult
                .media_type
            }
            onClose={
              closeDetails
            }
          />
        </DetailErrorBoundary>
      )}
    </>
  );
}

export default function Home() {
  return (
    <PlayerProvider>
      <MediaGodApp />
    </PlayerProvider>
  );
}
