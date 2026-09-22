import React, {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
} from "react";

import { ArrowLeft } from "lucide-react";

import Navbar from "@/components/mg/Navbar";
import HomeDashboard from "@/components/mg/HomeDashboard";
import MoviesView from "@/components/mg/MoviesView";
import TvShowsView from "@/components/mg/TvShowsView";
import LiveTVView from "@/components/mg/LiveTVView";
import SearchDialog from "@/components/mg/SearchDialog";
import DetailModal from "@/components/mg/DetailModal";
import FireTvRemote from "@/components/mg/FireTvRemote";
import MediaGodV2Assist from "@/components/mg/MediaGodV2Assist";
import PlayerQrRemote from "@/components/mg/PlayerQrRemote";
import {
  usePlayer,
} from "@/components/mg/PlayerProvider.jsx";
import RdBanner from "@/components/mg/RdBanner";
import PlaybackUpdateNotice from "@/components/mg/PlaybackUpdateNotice";
import FireTvAppUpdateNotice from "@/components/mg/FireTvAppUpdateNotice";
import AndroidMobileAppUpdateNotice from "@/components/mg/AndroidMobileAppUpdateNotice";
import PageErrorBoundary from "@/components/mg/PageErrorBoundary";
import OnboardingTour from "@/components/mg/OnboardingTour";
import {
  installGlobalDiagnosticsCapture,
  recordDiagnosticError,
  sanitizeDiagnosticText,
} from "@/components/mg/diagnostics";
import {
  applyUxPreferences,
  readUxPreferences,
  UX_PREFERENCES_EVENT,
} from "@/components/mg/uxPreferences";

const WatchlistView = lazy(() => import("@/components/mg/WatchlistView"));
const RdLibraryView = lazy(() => import("@/components/mg/RdLibraryView"));
const DebridDashboard = lazy(() => import("@/components/mg/DebridDashboard"));
const AddonsView = lazy(() => import("@/components/mg/AddonsView"));
const SourcesView = lazy(() => import("@/components/mg/SourcesView"));
const RoadmapView = lazy(() => import("@/components/mg/RoadmapView"));
const UpdatesView = lazy(() => import("@/components/mg/UpdatesView"));
const SettingsView = lazy(() => import("@/components/mg/SettingsView"));
const SettingsTools = lazy(() => import("@/components/mg/SettingsTools"));
const WatchPartyView = lazy(() => import("@/components/mg/WatchPartyView"));
const FavoritesView = lazy(() => import("@/components/mg/FavoritesView"));
const DiagnosticsView = lazy(() => import("@/components/mg/DiagnosticsView"));
const DataBackupView = lazy(() => import("@/components/mg/DataBackupView"));


const ViewLoadingFallback = ({ label }) => (
  <div className="flex min-h-[32vh] w-full items-center justify-center p-6 text-white">
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-mg-card px-5 py-4 shadow-xl">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-mg-green" />
      <span className="text-sm font-semibold text-white/80">Loading {label}…</span>
    </div>
  </div>
);

const SafeDeferredView = ({ resetKey, label, onHome, children }) => (
  <PageErrorBoundary resetKey={resetKey} label={label} onHome={onHome}>
    <Suspense fallback={<ViewLoadingFallback label={label} />}>
      {children}
    </Suspense>
  </PageErrorBoundary>
);

const SETTINGS_TOOL_VIEWS = new Set([
  "watchparty",
  "rdlib",
  "downloads",
  "remote",
  "sources",
  "updates",
  "diagnostics",
  "backup",
]);

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
    type === "movie" ||
    type === "film"
  ) {
    return "movie";
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

const revealEpisodeSelector = () => {
  if (typeof document === "undefined") {
    return false;
  }

  const target =
    document.getElementById(
      "mg-episode-selector"
    );

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  const focusTarget =
    target.querySelector(
      'select[aria-label="Choose season"], button'
    );

  window.setTimeout(
    () => focusTarget?.focus?.(),
    80
  );

  return true;
};

const revealEpisodeSelectorWhenReady = (
  attempt = 0
) => {
  if (revealEpisodeSelector()) {
    return;
  }

  if (
    typeof window === "undefined" ||
    attempt >= 32
  ) {
    return;
  }

  window.setTimeout(
    () =>
      revealEpisodeSelectorWhenReady(
        attempt + 1
      ),
    125
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

      'button[data-mg-player-exit="true"]',

      'button[aria-label="Exit player"]',

      'button[aria-label="Back to main menu"]',

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
    recordDiagnosticError(error, "details");

    console.error(
      "Media God detail screen error:",
      sanitizeDiagnosticText(error?.message || error),
      sanitizeDiagnosticText(info?.componentStack || "")
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

  useEffect(() => {
    applyUxPreferences(readUxPreferences());

    const onUxChanged = (event) =>
      applyUxPreferences(event?.detail || readUxPreferences());

    window.addEventListener(UX_PREFERENCES_EVENT, onUxChanged);
    const removeDiagnosticsCapture = installGlobalDiagnosticsCapture();

    return () => {
      window.removeEventListener(UX_PREFERENCES_EVENT, onUxChanged);
      removeDiagnosticsCapture();
    };
  }, []);

  const [
    view,
    setView,
  ] = useState(
    "home"
  );

  const [
    tvProviderRequest,
    setTvProviderRequest,
  ] = useState({
    service: null,
    key: 0,
  });

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

  const [
    liveSearchRequest,
    setLiveSearchRequest,
  ] = useState({
    query: "",
    key: 0,
  });

  useEffect(() => {
    const onReturnToEpisodeSelector = (
      event
    ) => {
      const detail =
        event?.detail ||
        {};

      if (
        String(
          detail?.mediaType ||
            ""
        ).toLowerCase() !==
        "tv"
      ) {
        return;
      }

      /*
       * If the show details were already underneath the player, restore that
       * exact selector. This is the normal path when playback started from the
       * show's episode list.
       */
      if (
        revealEpisodeSelector()
      ) {
        return;
      }

      /*
       * Continue Watching, Search and remote playback can start an episode
       * without a details modal underneath it. Re-create the TV detail screen
       * from the playback identity, then focus its episode selector as soon as
       * TMDB seasons finish loading.
       */
      const item =
        normaliseSearchSelection({
          id:
            detail?.tmdbId ??
            null,
          tmdb_id:
            detail?.tmdbId ??
            null,
          tmdbId:
            detail?.tmdbId ??
            null,
          title:
            detail?.title ||
            "TV Show",
          year:
            detail?.year ||
            "",
          poster_url:
            detail?.poster ||
            "",
          media_type:
            "tv",
          mediaType:
            "tv",
        });

      if (!item) {
        return;
      }

      setSearchOpen(false);
      setSearchResult(item);

      window.requestAnimationFrame(
        () =>
          revealEpisodeSelectorWhenReady()
      );
    };

    window.addEventListener(
      "mg:return-to-episode-selector",
      onReturnToEpisodeSelector
    );

    return () => {
      window.removeEventListener(
        "mg:return-to-episode-selector",
        onReturnToEpisodeSelector
      );
    };
  }, []);

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
          overlayTarget instanceof HTMLElement
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
         * Utility pages opened from Settings return to Settings.
         */
        if (
          SETTINGS_TOOL_VIEWS.has(
            view
          )
        ) {
          setView(
            "settings"
          );

          return true;
        }

        /*
         * A streaming-service catalogue first returns to the normal TV page.
         */
        if (
          view === "tv" &&
          tvProviderRequest?.service
        ) {
          setTvProviderRequest((current) => ({
            service: null,
            key: Number(current?.key || 0) + 1,
          }));

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
        tvProviderRequest,
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
        if (
          rawItem?.media_type === "live" ||
          rawItem?.mediaType === "live"
        ) {
          const channelName = String(
            rawItem?.title ||
              rawItem?.name ||
              ""
          ).trim();

          if (!channelName) {
            console.error(
              "Media God received an invalid live TV search result:",
              sanitizeDiagnosticText(
                JSON.stringify({
                  media_type: rawItem?.media_type || rawItem?.mediaType || "",
                  title: rawItem?.title || rawItem?.name || "",
                  id: rawItem?.id || rawItem?.tvg_id || "",
                })
              )
            );

            return;
          }

          setSearchOpen(
            false
          );
          setSearchResult(
            null
          );
          setLiveSearchRequest((current) => ({
            query: channelName,
            key: Number(current?.key || 0) + 1,
          }));
          setView(
            "live"
          );

          return;
        }

        const item =
          normaliseSearchSelection(
            rawItem
          );

        if (
          !item
        ) {
          console.error(
            "Media God received an invalid search result:",
            sanitizeDiagnosticText(
              JSON.stringify({
                media_type: rawItem?.media_type || rawItem?.mediaType || "",
                title: rawItem?.title || rawItem?.name || "",
                id: rawItem?.id || rawItem?.tmdb_id || rawItem?.tmdbId || "",
              })
            )
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

  const openSettingsTool = useCallback((nextView) => {
    setSearchOpen(false);
    setSearchResult(null);
    setLiveSearchRequest((current) => ({
      query: "",
      key: Number(current?.key || 0) + 1,
    }));
    setView(nextView);
  }, []);

  const openTvStreamingService = useCallback((service) => {
    if (!service?.providerIds?.length) return;
    setSearchOpen(false);
    setSearchResult(null);
    setTvProviderRequest((current) => ({
      service,
      key: Number(current?.key || 0) + 1,
    }));
    setView("tv");
  }, []);

  const handleTvProviderChange = useCallback((service) => {
    setTvProviderRequest((current) => ({
      service: service || null,
      key: Number(current?.key || 0) + 1,
    }));
  }, []);

  return (
    <>
      <OnboardingTour />

      <FireTvRemote />

      <MediaGodV2Assist />

      <FireTvAppUpdateNotice
        enabled={!playerOpen}
      />

      <AndroidMobileAppUpdateNotice
        enabled={!playerOpen}
      />

      <PlaybackUpdateNotice
        enabled={!playerOpen}
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

              setLiveSearchRequest((current) => ({
                query: "",
                key: Number(current?.key || 0) + 1,
              }));

              if (nextView === "tv") {
                setTvProviderRequest((current) => ({
                  service: null,
                  key: Number(current?.key || 0) + 1,
                }));
              }

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

          <PlayerQrRemote
            showIdle={view === "remote"}
          />

          {view ===
            "home" && (
            <PageErrorBoundary
              resetKey="home"
              label="Home"
              onHome={() => setView("home")}
            >
              <HomeDashboard onOpenTvService={openTvStreamingService} />
            </PageErrorBoundary>
          )}

          {view ===
            "movies" && (
            <SafeDeferredView resetKey={view} label="Movies" onHome={() => setView("home")}>
              <MoviesView />
            </SafeDeferredView>
          )}

          {view ===
            "tv" && (
            <SafeDeferredView resetKey={view} label="TV Shows" onHome={() => setView("home")}>
              <TvShowsView
                initialProvider={tvProviderRequest.service}
                providerRequestKey={tvProviderRequest.key}
                onProviderChange={handleTvProviderChange}
              />
            </SafeDeferredView>
          )}

          {view ===
            "live" && (
            <LiveTVView
              initialQuery={
                liveSearchRequest.query
              }
              initialQuickFilter={
                liveSearchRequest.query
                  ? ""
                  : "All"
              }
              searchRequestKey={
                liveSearchRequest.key
              }
            />
          )}

          {view ===
            "music" && (
            <LiveTVView
              initialQuickFilter="Radio"
            />
          )}

          {view ===
            "watchlist" && (
            <SafeDeferredView resetKey={view} label="Watchlist" onHome={() => setView("home")}>
              <WatchlistView />
            </SafeDeferredView>
          )}

          {view ===
            "favorites" && (
            <SafeDeferredView resetKey={view} label="Favorites" onHome={() => setView("home")}>
              <FavoritesView />
            </SafeDeferredView>
          )}

          {view ===
            "watchparty" && (
            <SafeDeferredView resetKey={view} label="Watch Party" onHome={() => setView("home")}>
              <WatchPartyView />
            </SafeDeferredView>
          )}

          {view ===
            "rdlib" && (
            <SafeDeferredView resetKey={view} label="RD Library" onHome={() => setView("home")}>
              <RdLibraryView />
            </SafeDeferredView>
          )}

          {view ===
            "downloads" && (
            <SafeDeferredView resetKey={view} label="Downloads" onHome={() => setView("home")}>
              <DebridDashboard />
            </SafeDeferredView>
          )}

          {view ===
            "addons" && (
            <SafeDeferredView resetKey={view} label="Addons" onHome={() => setView("home")}>
              <AddonsView />
            </SafeDeferredView>
          )}

          {view ===
            "sources" && (
            <SafeDeferredView resetKey={view} label="Sources" onHome={() => setView("home")}>
              <SourcesView />
            </SafeDeferredView>
          )}

          {view ===
            "roadmap" && (
            <SafeDeferredView resetKey={view} label="Release Dates" onHome={() => setView("home")}>
              <RoadmapView onBack={goBack} />
            </SafeDeferredView>
          )}

          {view ===
            "updates" && (
            <SafeDeferredView resetKey={view} label="Updates" onHome={() => setView("home")}>
              <UpdatesView />
            </SafeDeferredView>
          )}

          {view ===
            "diagnostics" && (
            <SafeDeferredView resetKey={view} label="Diagnostics" onHome={() => setView("home")}>
              <DiagnosticsView />
            </SafeDeferredView>
          )}

          {view ===
            "backup" && (
            <SafeDeferredView resetKey={view} label="Backup & Restore" onHome={() => setView("home")}>
              <DataBackupView />
            </SafeDeferredView>
          )}

          {view ===
            "settings" && (
            <SafeDeferredView resetKey={view} label="Settings" onHome={() => setView("home")}>
              <div className="w-full">
                <div className="w-full max-w-4xl 3xl:max-w-5xl 4xl:max-w-6xl px-4 pt-4 md:px-6 md:pt-6 3xl:px-8 3xl:pt-8 4xl:px-10 4xl:pt-10">
                  <SettingsTools onSelect={openSettingsTool} />
                </div>
                <SettingsView />
              </div>
            </SafeDeferredView>
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
  return <MediaGodApp />;
}
