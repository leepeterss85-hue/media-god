import React, {
  Component,
  useCallback,
  useState,
} from "react";

import { ArrowLeft } from "lucide-react";

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
import PlayerQrRemote from "@/components/mg/PlayerQrRemote";
import {
  PlayerProvider,
  usePlayer,
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

const elementVisible =
  (
    element
  ) => {
    if (
      !(
        element instanceof
        HTMLElement
      )
    ) {
      return false;
    }

    const rect =
      element.getBoundingClientRect();

    if (
      rect.width <
        2 ||
      rect.height <
        2
    ) {
      return false;
    }

    const style =
      window.getComputedStyle(
        element
      );

    return (
      style.display !==
        "none" &&
      style.visibility !==
        "hidden" &&
      Number(
        style.opacity ||
          1
      ) >
        0.02
    );
  };

/*
 * Finds the close/back control belonging to the current
 * full-screen overlay.
 *
 * This means the global Back button can close:
 * - player
 * - detail screen
 * - search
 * - episode selector
 * - fullscreen player
 * - other modal overlays
 */
const findOverlayBackTarget =
  () => {
    const selectors = [
      'button[aria-label="Exit fullscreen"]',

      'button[aria-label="Close season and episode picker"]',

      'button[aria-label="Close details"]',

      'button[aria-label="Close search"]',

      'button[aria-label="Close"]',

      'button[title="Close"]',

      'button[aria-label^="Close "]',
    ];

    for (
      const selector of
      selectors
    ) {
      const buttons =
        Array.from(
          document.querySelectorAll(
            selector
          )
        ).filter(
          (
            button
          ) =>
            !button.hasAttribute(
              "data-mg-global-back"
            ) &&
            elementVisible(
              button
            )
        );

      if (
        buttons.length
      ) {
        /*
         * The latest rendered modal/player is normally
         * the last matching element in the DOM.
         */
        return buttons[
          buttons.length -
            1
        ];
      }
    }

    return null;
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
  const {
    isOpen:
      playerOpen,
  } = usePlayer();

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
   * One back routine for the entire application.
   */
  const goBack =
    useCallback(
      () => {
        /*
         * First close whichever modal/player/selector
         * is currently sitting on top.
         */
        const overlayTarget =
          findOverlayBackTarget();

        if (
          overlayTarget
        ) {
          overlayTarget.click();

          return true;
        }

        /*
         * Detail screen.
         */
        if (
          searchResult
        ) {
          setSearchResult(
            null
          );

          return true;
        }

        /*
         * Search.
         */
        if (
          searchOpen
        ) {
          setSearchOpen(
            false
          );

          return true;
        }

        /*
         * Normal application pages return Home.
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
         * Never allow browser history/login navigation
         * to steal Back from the Media God Home screen.
         */
        return true;
      },
      [
        searchOpen,
        searchResult,
        view,
      ]
    );

  const handleRemoteBack =
    useCallback(
      () =>
        goBack(),
      [
        goBack,
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

  /*
   * The physical Back button is shown everywhere except
   * the plain Home screen.
   *
   * Modal/player detection is DOM based because VideoPlayer
   * lives inside PlayerProvider rather than Home state.
   */
  const showPageBack =
    !playerOpen &&
    (
      view !== "home" ||
      searchOpen ||
      Boolean(
        searchResult
      )
    );

  return (
    <>
      <FireTvRemote
        onBack={
          handleRemoteBack
        }
      />

      <MediaGodV2Assist />

      <PlayerQrRemote
        showIdle={view === "home"}
      />

      {showPageBack && (
        <button
          type="button"
          data-mg-global-back="true"
          onClick={
            goBack
          }
          className="
            fixed
            left-3
            top-3
            z-[9999]
            flex
            min-h-11
            items-center
            gap-2
            rounded-full
            border
            border-white/15
            bg-black/80
            px-3
            py-2
            text-sm
            font-semibold
            text-white
            shadow-xl
            backdrop-blur-md
            transition
            hover:bg-black
            hover:border-mg-green/60
            focus:outline-none
            focus:ring-4
            focus:ring-mg-green/50
            3xl:left-5
            3xl:top-5
            3xl:min-h-14
            3xl:px-5
            3xl:text-lg
          "
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5 3xl:w-6 3xl:h-6" />

          <span>
            Back
          </span>
        </button>
      )}

      <div className="min-h-screen w-full overflow-x-hidden bg-mg-background text-white flex">
        {!playerOpen && (
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
        )}

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
