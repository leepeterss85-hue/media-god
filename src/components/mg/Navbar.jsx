import React, {
  useEffect,
  useState,
} from "react";

import {
  Bookmark,
  CalendarDays,
  Film,
  Heart,
  Home as HomeIcon,
  LogOut,
  MonitorPlay,
  Power,
  Radio,
  Search,
  Settings,
  Shield,
  Tv,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import {
  exitNativeFireTvApp,
  nativeFireTvExitAvailable,
} from "@/components/mg/nativeFireTvBridge";
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
    id: "music",
    label: "Music",
    icon: Radio,
  },
  {
    id: "roadmap",
    label: "Release Dates",
    icon: CalendarDays,
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
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
];

const elementVisible = (element) => {
  if (
    typeof window === "undefined" ||
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
    rect.width < 2 ||
    rect.height < 2
  ) {
    return false;
  }

  const style =
    window.getComputedStyle(
      element
    );

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(
      style.opacity || 1
    ) > 0.02
  );
};

const contextSaysPlayerOpen = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const context = window.__MG_PLAYER_CONTEXT__;

  return Boolean(
    context &&
      (
        context.mediaType ||
        context.tmdbId ||
        context.imdbId ||
        context.title
      )
  );
};

const domSaysPlayerOpen = () => {
  if (typeof document === "undefined") {
    return false;
  }

  const explicitPlayer = document.querySelector(
    '[data-mg-player-root="true"]'
  );

  if (
    explicitPlayer instanceof HTMLElement &&
    elementVisible(explicitPlayer)
  ) {
    return true;
  }

  return Array.from(
    document.querySelectorAll(
      [
        'select[aria-label="Choose playback source"]',
        'select[aria-label="Choose source or quality while loading"]',
        'button[aria-label="No sound"]',
        'button[title="No sound"]',
        'button[aria-label="Back to main menu"]',
        '[data-mg-player-exit="true"]',
        '.fixed.inset-0 video',
      ].join(",")
    )
  ).some(elementVisible);
};

/*
 * Media God uses the same overlay convention in the browser, phones/tablets
 * and Fire TV: dialogs, aria-modal surfaces and fixed full-screen layers.
 * Whenever one of those is visible it owns the screen and the main navbar
 * must not remain beside or on top of it.
 */
const domSaysOverlayOpen = () => {
  if (typeof document === "undefined") {
    return false;
  }

  const selectors = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    '.fixed.inset-0',
    '[data-mg-detail-dialog="true"]',
    '[data-mg-search-dialog="true"]',
    '[data-mg-player-root="true"]',
    '[data-mg-overlay="true"]',
  ];

  return Array.from(
    document.querySelectorAll(
      selectors.join(",")
    )
  ).some((element) => {
    if (!elementVisible(element)) {
      return false;
    }

    /*
     * Do not let a future navbar-owned helper accidentally hide the navbar
     * itself. Everything else matching the shared overlay convention is a
     * genuine screen/modal and should take the whole viewport.
     */
    if (
      element.closest(
        ".mg-fire-tv-nav"
      )
    ) {
      return false;
    }

    return true;
  });
};

const navigationShouldHide = () =>
  contextSaysPlayerOpen() ||
  domSaysPlayerOpen() ||
  domSaysOverlayOpen();

/*
 * Keep the installed Media God version as the first settings card. The
 * Settings view already marks both the page and version card with stable data
 * attributes, so this stays safe even if the signed-in/account card changes.
 */
const moveSettingsVersionToTop = () => {
  if (typeof document === "undefined") {
    return;
  }

  const settingsView = document.querySelector(
    '[data-mg-settings-view="true"]'
  );

  if (!(settingsView instanceof HTMLElement)) {
    return;
  }

  const versionCard =
    settingsView.querySelector(
      '[data-mg-app-version="true"]'
    );

  if (!(versionCard instanceof HTMLElement)) {
    return;
  }

  const heading = Array.from(
    settingsView.children
  ).find(
    (child) =>
      child instanceof HTMLElement &&
      child.tagName === "H1"
  );

  if (!(heading instanceof HTMLElement)) {
    return;
  }

  if (heading.nextElementSibling === versionCard) {
    return;
  }

  settingsView.insertBefore(
    versionCard,
    heading.nextSibling
  );
};

export default function Navbar({
  active,
  onSelect,
  onSearch,
}) {
  const [navigationBlocked, setNavigationBlocked] =
    useState(navigationShouldHide);
  const canExitApp = nativeFireTvExitAvailable();

  useEffect(() => {
    let syncFrame = 0;

    const syncFromEverything = () => {
      moveSettingsVersionToTop();

      setNavigationBlocked(
        navigationShouldHide()
      );
    };

    const scheduleSync = () => {
      if (syncFrame) {
        return;
      }

      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        syncFromEverything();
      });
    };

    const setPlayerMarker = (open) => {
      if (open) {
        document.body?.classList.add(
          "mg-fire-tv-player-open"
        );
        document.documentElement.classList.add(
          "mg-fire-tv-player-open"
        );
      } else {
        document.body?.classList.remove(
          "mg-fire-tv-player-open"
        );
        document.documentElement.classList.remove(
          "mg-fire-tv-player-open"
        );
      }
    };

    const onPlayerContext = (event) => {
      const detail = event?.detail || {};

      const open = Boolean(
        detail.mediaType ||
          detail.tmdbId ||
          detail.imdbId ||
          detail.title
      );

      setPlayerMarker(open);
      scheduleSync();
    };

    const onPlayerVisibility = (event) => {
      setPlayerMarker(
        Boolean(
          event?.detail?.open
        )
      );

      scheduleSync();
    };

    window.addEventListener(
      "mg:player-context",
      onPlayerContext
    );

    window.addEventListener(
      "mg:player-visibility",
      onPlayerVisibility
    );

    const observer = new MutationObserver(
      scheduleSync
    );

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "aria-hidden",
        "aria-modal",
      ],
    });

    /*
     * Events and the DOM observer are the primary signals. The slower
     * watchdog catches WebView transitions that change layout/visibility
     * without changing child nodes.
     */
    const watchdog = window.setInterval(
      () => {
        if (document.visibilityState !== "hidden") {
          scheduleSync();
        }
      },
      750
    );

    scheduleSync();

    return () => {
      window.removeEventListener(
        "mg:player-context",
        onPlayerContext
      );

      window.removeEventListener(
        "mg:player-visibility",
        onPlayerVisibility
      );

      observer.disconnect();
      window.clearInterval(watchdog);

      if (syncFrame) {
        window.cancelAnimationFrame(syncFrame);
      }
    };
  }, []);

  const linkClass = (id) =>
    cn(
      "flex min-h-11 w-full items-center gap-3 rounded-md text-sm font-medium transition-colors",

      active === id
        ? "bg-mg-green/15 text-mg-green"
        : "text-white/60 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white"
    );

  /*
   * Players, details, search, season/episode/source selection and every other
   * visible full-screen/modal surface own the viewport. Removing the navbar
   * from the React output prevents it from covering those controls on Fire TV
   * and keeps the same behaviour on phones, tablets and computers.
   */
  if (navigationBlocked) {
    return null;
  }

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

        {canExitApp && (
          <button
            type="button"
            onClick={exitNativeFireTvApp}
            title="Exit app"
            aria-label="Exit app"
            className="flex min-h-11 items-center justify-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white md:justify-start md:px-3"
          >
            <Power className="h-5 w-5 shrink-0" />

            <span className="hidden md:block">
              Exit app
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            base44.auth.logout()
          }
          title="Sign out"
          className="flex min-h-11 items-center justify-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white md:justify-start md:px-3"
        >
          <LogOut className="h-5 w-5 shrink-0" />

          <span className="hidden md:block">
            Sign out
          </span>
        </button>
      </div>
    </aside>
  );
}
