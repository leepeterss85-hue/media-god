import { access, readFile } from "node:fs/promises";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFile(`${root}/${path}`, "utf8");

const expect = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const [
  home,
  navbar,
  search,
  details,
  watchlist,
  favorites,
  roadmap,
  settings,
  settingsTools,
  updates,
  diagnostics,
  backup,
  onboarding,
  css,
] = await Promise.all([
  read("src/pages/Home.jsx"),
  read("src/components/mg/Navbar.jsx"),
  read("src/components/mg/SearchDialog.jsx"),
  read("src/components/mg/DetailModal.jsx"),
  read("src/components/mg/WatchlistView.jsx"),
  read("src/components/mg/FavoritesView.jsx"),
  read("src/components/mg/RoadmapView.jsx"),
  read("src/components/mg/SettingsView.jsx"),
  read("src/components/mg/SettingsTools.jsx"),
  read("src/components/mg/UpdatesView.jsx"),
  read("src/components/mg/DiagnosticsView.jsx"),
  read("src/components/mg/DataBackupView.jsx"),
  read("src/components/mg/OnboardingTour.jsx"),
  read("src/index.css"),
]);

expect(home.includes("<HomeDashboard"), "Home dashboard route is missing");
expect(home.includes("<SearchDialog"), "Search overlay is missing");
expect(home.includes("<WatchlistView"), "Watchlist view is missing");
expect(home.includes("<FavoritesView"), "Favorites view is missing");
expect(home.includes("<RoadmapView"), "Release Dates view is missing");
expect(home.includes("<SettingsView"), "Settings view is missing");
expect(home.includes("<UpdatesView"), "Updates view is missing");
expect(home.includes("<DiagnosticsView"), "Diagnostics view is missing");
expect(home.includes("<DataBackupView"), "Backup & Restore view is missing");
expect(home.includes("<OnboardingTour"), "Getting Started tour is missing");

expect(
  navbar.includes('id: "home"') &&
    navbar.includes('id: "movies"') &&
    navbar.includes('id: "tv"') &&
    navbar.includes('id: "roadmap"') &&
    navbar.includes('id: "watchlist"') &&
    navbar.includes('id: "favorites"') &&
    navbar.includes('id: "settings"'),
  "Primary catalogue navigation is incomplete"
);

expect(
  search.includes("RECENT_SEARCHES_KEY") &&
    search.includes("mediaFilter") &&
    search.includes("yearFilter") &&
    search.includes("SEARCH_CACHE_TTL_MS"),
  "Search resilience/filtering smoke check failed"
);

expect(
  details.includes("data-mg-detail-dialog") &&
    details.includes("certification") &&
    details.includes("release_date") &&
    details.includes("tagline"),
  "Detail-screen metadata smoke check failed"
);

for (const [source, name] of [
  [watchlist, "Watchlist"],
  [favorites, "Favorites"],
]) {
  expect(source.includes("editMode"), `${name} edit mode is missing`);
  expect(source.includes("selectedIds"), `${name} multi-select is missing`);
  expect(source.includes("removeSelected"), `${name} bulk removal is missing`);
  expect(source.includes('loading="lazy"'), `${name} lazy poster loading is missing`);
}

expect(
  roadmap.includes("dateWindow") &&
    roadmap.includes('value="7"') &&
    roadmap.includes('value="30"') &&
    roadmap.includes("filtered.length"),
  "Release Dates search/window smoke check failed"
);

expect(
  settings.includes("Appearance & Accessibility") &&
    settings.includes("Home screen") &&
    settings.includes("Help & Report a Problem"),
  "Settings UX sections are missing"
);

expect(
  settingsTools.includes('id: "diagnostics"') &&
    settingsTools.includes('id: "backup"') &&
    settingsTools.includes('id: "getting-started"'),
  "Settings tools do not expose resilience utilities"
);

expect(
  updates.includes("Installed version") &&
    updates.includes("Check latest") &&
    updates.includes("Search release notes"),
  "Updates smoke check failed"
);

expect(
  diagnostics.includes("Recent non-sensitive errors") &&
    diagnostics.includes("Real-Debrid") &&
    diagnostics.includes("Addons") &&
    diagnostics.includes("Copy report"),
  "Diagnostics smoke check failed"
);

expect(
  backup.includes('format: "media-god-backup"') &&
    backup.includes("WatchlistItem") &&
    backup.includes("Favorite") &&
    backup.includes("display_preferences"),
  "Backup/restore smoke check failed"
);

expect(
  onboarding.includes("STEPS") &&
    onboarding.includes("Getting started with Media God") &&
    onboarding.includes("markCompleted"),
  "Onboarding smoke check failed"
);

expect(
  css.includes('html[data-mg-text-scale="large"]') &&
    css.includes(".mg-high-contrast") &&
    css.includes(".mg-reduced-motion") &&
    css.includes("focus-visible"),
  "Responsive/accessibility CSS smoke check failed"
);

await access(`${root}/dist/index.html`);
const distIndex = await read("dist/index.html");
expect(
  /<div[^>]+id=["']root["']/.test(distIndex),
  "Built application is missing the React root"
);
expect(
  /assets\/.+\.(js|mjs)/.test(distIndex),
  "Built application is missing its JavaScript bundle"
);

console.log("ok non-playback catalogue/settings smoke checks complete");
