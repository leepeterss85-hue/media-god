from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SELF = ROOT / "scripts" / "apply_safe_app_polish.py"
WORKFLOW = ROOT / ".github" / "workflows" / "apply-safe-app-polish-once.yml"


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected one regex match, found {count}")
    return updated


# Shared native-release fetcher: one cache/in-flight request per platform and
# bounded network waits so update checks cannot hold the UI open indefinitely.
write(
    "src/components/mg/nativeReleaseInfo.js",
    '''const RELEASE_URLS = {
  "fire-tv": [
    "/firetv-update.json",
    "https://raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/firetv-update.json",
  ],
  "android-mobile": [
    "/android-mobile-update.json",
    "https://raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/android-mobile-update.json",
  ],
};

const CACHE_TTL_MS = 4 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

const releaseCache = new Map();
const inFlight = new Map();

const fetchReleaseJson = async (url) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
};

export const clearNativeReleaseCache = (platform) => {
  if (platform) {
    releaseCache.delete(String(platform));
    return;
  }

  releaseCache.clear();
};

export const fetchLatestNativeRelease = async (
  platform,
  { force = false } = {}
) => {
  if (typeof window === "undefined") return null;

  const key = String(platform || "");
  const urls = RELEASE_URLS[key] || [];
  if (!urls.length) return null;

  const now = Date.now();
  const cached = releaseCache.get(key);

  if (!force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const request = (async () => {
    const releases = await Promise.all(urls.map(fetchReleaseJson));
    const latest =
      releases
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(b?.versionCode || 0) - Number(a?.versionCode || 0)
        )[0] || null;

    releaseCache.set(key, {
      value: latest,
      expiresAt:
        Date.now() + (latest ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS),
    });

    return latest;
  })();

  inFlight.set(key, request);

  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
};
''',
)


# Generic page-level recovery. Successful screens render with no wrapper, so
# this does not alter normal layout or interaction.
write(
    "src/components/mg/PageErrorBoundary.jsx",
    '''import React, { Component } from "react";

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "This screen could not be opened.",
    };
  }

  componentDidCatch(error, info) {
    console.error("Media God page error:", error, info);
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.resetKey !== this.props.resetKey &&
      this.state.hasError
    ) {
      this.setState({
        hasError: false,
        message: "",
      });
    }
  }

  retry = () => {
    this.setState({
      hasError: false,
      message: "",
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const label = String(this.props.label || "screen");

    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center p-4 md:p-6">
        <div
          role="alert"
          className="w-full max-w-lg rounded-xl border border-red-500/30 bg-mg-surface p-5 text-white shadow-2xl"
        >
          <h2 className="text-lg font-bold">Could not open {label}</h2>
          <p className="mt-2 text-sm text-white/60">
            Media God contained the problem to this screen instead of letting it blank the whole app.
          </p>
          <p className="mt-3 break-words rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-red-300">
            {this.state.message}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.retry}
              className="min-h-11 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => this.props.onHome?.()}
              className="min-h-11 rounded-lg bg-mg-green px-4 py-2 text-sm font-semibold text-black focus:outline-none focus:ring-2 focus:ring-mg-green"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
''',
)


# Home: defer secondary screens and contain page crashes. Live TV, Music and
# all player components remain untouched and outside the new page boundary.
home = read("src/pages/Home.jsx")
home = replace_once(
    home,
    '  Component,\n  useCallback,\n  useState,',
    '  Component,\n  Suspense,\n  lazy,\n  useCallback,\n  useState,',
    "Home React lazy imports",
)

lazy_names = [
    "WatchlistView",
    "RdLibraryView",
    "DebridDashboard",
    "AddonsView",
    "SourcesView",
    "RoadmapView",
    "UpdatesView",
    "SettingsView",
    "SettingsTools",
    "WatchPartyView",
    "FavoritesView",
]

for name in lazy_names:
    home = regex_once(
        home,
        rf'import {name} from "@/components/mg/{name}";\n',
        "",
        f"remove eager {name} import",
    )

anchor = 'import AndroidMobileAppUpdateNotice from "@/components/mg/AndroidMobileAppUpdateNotice";\n'
lazy_block = '''import PageErrorBoundary from "@/components/mg/PageErrorBoundary";\n\nconst WatchlistView = lazy(() => import("@/components/mg/WatchlistView"));\nconst RdLibraryView = lazy(() => import("@/components/mg/RdLibraryView"));\nconst DebridDashboard = lazy(() => import("@/components/mg/DebridDashboard"));\nconst AddonsView = lazy(() => import("@/components/mg/AddonsView"));\nconst SourcesView = lazy(() => import("@/components/mg/SourcesView"));\nconst RoadmapView = lazy(() => import("@/components/mg/RoadmapView"));\nconst UpdatesView = lazy(() => import("@/components/mg/UpdatesView"));\nconst SettingsView = lazy(() => import("@/components/mg/SettingsView"));\nconst SettingsTools = lazy(() => import("@/components/mg/SettingsTools"));\nconst WatchPartyView = lazy(() => import("@/components/mg/WatchPartyView"));\nconst FavoritesView = lazy(() => import("@/components/mg/FavoritesView"));\n'''
home = replace_once(home, anchor, anchor + lazy_block, "Home lazy declarations")

safe_view = '''\nconst ViewLoadingFallback = ({ label }) => (\n  <div className="flex min-h-[32vh] w-full items-center justify-center p-6 text-white">\n    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-mg-card px-5 py-4 shadow-xl">\n      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-mg-green" />\n      <span className="text-sm font-semibold text-white/80">Loading {label}…</span>\n    </div>\n  </div>\n);\n\nconst SafeDeferredView = ({ resetKey, label, onHome, children }) => (\n  <PageErrorBoundary resetKey={resetKey} label={label} onHome={onHome}>\n    <Suspense fallback={<ViewLoadingFallback label={label} />}>\n      {children}\n    </Suspense>\n  </PageErrorBoundary>\n);\n'''
home = replace_once(
    home,
    'const SETTINGS_TOOL_VIEWS = new Set([',
    safe_view + '\nconst SETTINGS_TOOL_VIEWS = new Set([',
    "Home safe deferred view helper",
)

view_replacements = {
'''          {view ===\n            "movies" && (\n            <MoviesView />\n          )}''': '''          {view ===\n            "movies" && (\n            <SafeDeferredView resetKey={view} label="Movies" onHome={() => setView("home")}>\n              <MoviesView />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "tv" && (\n            <TvShowsView\n              initialProvider={tvProviderRequest.service}\n              providerRequestKey={tvProviderRequest.key}\n              onProviderChange={handleTvProviderChange}\n            />\n          )}''': '''          {view ===\n            "tv" && (\n            <SafeDeferredView resetKey={view} label="TV Shows" onHome={() => setView("home")}>\n              <TvShowsView\n                initialProvider={tvProviderRequest.service}\n                providerRequestKey={tvProviderRequest.key}\n                onProviderChange={handleTvProviderChange}\n              />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "watchlist" && (\n            <WatchlistView />\n          )}''': '''          {view ===\n            "watchlist" && (\n            <SafeDeferredView resetKey={view} label="Watchlist" onHome={() => setView("home")}>\n              <WatchlistView />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "favorites" && (\n            <FavoritesView />\n          )}''': '''          {view ===\n            "favorites" && (\n            <SafeDeferredView resetKey={view} label="Favorites" onHome={() => setView("home")}>\n              <FavoritesView />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "watchparty" && (\n            <WatchPartyView />\n          )}''': '''          {view ===\n            "watchparty" && (\n            <SafeDeferredView resetKey={view} label="Watch Party" onHome={() => setView("home")}>\n              <WatchPartyView />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "rdlib" && (\n            <RdLibraryView />\n          )}''': '''          {view ===\n            "rdlib" && (\n            <SafeDeferredView resetKey={view} label="RD Library" onHome={() => setView("home")}>\n              <RdLibraryView />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "downloads" && (\n            <DebridDashboard />\n          )}''': '''          {view ===\n            "downloads" && (\n            <SafeDeferredView resetKey={view} label="Downloads" onHome={() => setView("home")}>\n              <DebridDashboard />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "addons" && (\n            <AddonsView />\n          )}''': '''          {view ===\n            "addons" && (\n            <SafeDeferredView resetKey={view} label="Addons" onHome={() => setView("home")}>\n              <AddonsView />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "sources" && (\n            <SourcesView />\n          )}''': '''          {view ===\n            "sources" && (\n            <SafeDeferredView resetKey={view} label="Sources" onHome={() => setView("home")}>\n              <SourcesView />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "roadmap" && (\n            <RoadmapView onBack={goBack} />\n          )}''': '''          {view ===\n            "roadmap" && (\n            <SafeDeferredView resetKey={view} label="Release Dates" onHome={() => setView("home")}>\n              <RoadmapView onBack={goBack} />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "updates" && (\n            <UpdatesView />\n          )}''': '''          {view ===\n            "updates" && (\n            <SafeDeferredView resetKey={view} label="Updates" onHome={() => setView("home")}>\n              <UpdatesView />\n            </SafeDeferredView>\n          )}''',
'''          {view ===\n            "settings" && (\n            <div className="w-full">\n              <div className="w-full max-w-4xl 3xl:max-w-5xl 4xl:max-w-6xl px-4 pt-4 md:px-6 md:pt-6 3xl:px-8 3xl:pt-8 4xl:px-10 4xl:pt-10">\n                <SettingsTools onSelect={openSettingsTool} />\n              </div>\n              <SettingsView />\n            </div>\n          )}''': '''          {view ===\n            "settings" && (\n            <SafeDeferredView resetKey={view} label="Settings" onHome={() => setView("home")}>\n              <div className="w-full">\n                <div className="w-full max-w-4xl 3xl:max-w-5xl 4xl:max-w-6xl px-4 pt-4 md:px-6 md:pt-6 3xl:px-8 3xl:pt-8 4xl:px-10 4xl:pt-10">\n                  <SettingsTools onSelect={openSettingsTool} />\n                </div>\n                <SettingsView />\n              </div>\n            </SafeDeferredView>\n          )}''',
}
for old, new in view_replacements.items():
    home = replace_once(home, old, new, f"Home safe view: {old.split(chr(10))[1].strip()}")

write("src/pages/Home.jsx", home)


# Settings: share update fetching, avoid the duplicate auth.me() call on initial
# load, and run independent startup checks concurrently.
settings = read("src/components/mg/SettingsView.jsx")
settings = replace_once(
    settings,
    'import { nativeFireTvAppInfo } from "@/components/mg/nativeFireTvBridge";\n',
    'import { nativeFireTvAppInfo } from "@/components/mg/nativeFireTvBridge";\nimport { fetchLatestNativeRelease } from "@/components/mg/nativeReleaseInfo";\n',
    "Settings release helper import",
)
settings = regex_once(
    settings,
    r'const releaseUrlsForPlatform = \(platform\) => \{.*?\n\};\n\nconst fetchLatestNativeRelease = async \(platform\) => \{.*?\n\};\n\n',
    '',
    "Settings local release fetch removal",
)
settings = replace_once(
    settings,
    'const latest = await fetchLatestNativeRelease(platform);',
    'const latest = await fetchLatestNativeRelease(platform, { force: openPrompt });',
    "Settings forced manual update check",
)
settings = replace_once(
    settings,
    '      async (\n        showToast = false\n      ) => {',
    '      async (\n        showToast = false,\n        refreshUser = true\n      ) => {',
    "Settings RD refresh option",
)
settings = replace_once(
    settings,
    '          await loadMe();\n\n          return status;',
    '          if (refreshUser) {\n            await loadMe();\n          }\n\n          return status;',
    "Settings avoid duplicate user load",
)
old_effect = '''  useEffect(\n    () => {\n      let mounted =\n        true;\n\n      const load =\n        async () => {\n          await checkAppVersion();\n          await loadMe();\n\n          if (\n            mounted\n          ) {\n            await checkRd(\n              false\n            );\n          }\n        };\n\n      load();\n\n      return () => {\n        mounted =\n          false;\n      };\n    },\n    [\n      checkAppVersion,\n      checkRd,\n      loadMe,\n    ]\n  );'''
new_effect = '''  useEffect(\n    () => {\n      void Promise.all([\n        checkAppVersion(),\n        loadMe(),\n        checkRd(false, false),\n      ]);\n    },\n    [\n      checkAppVersion,\n      checkRd,\n      loadMe,\n    ]\n  );'''
settings = replace_once(settings, old_effect, new_effect, "Settings concurrent startup")
write("src/components/mg/SettingsView.jsx", settings)


# Android + Fire TV update notices use the shared bounded/cache-aware fetcher.
for path, platform, old_name in [
    ("src/components/mg/AndroidMobileAppUpdateNotice.jsx", "android-mobile", "fetchLatestAndroidRelease"),
    ("src/components/mg/FireTvAppUpdateNotice.jsx", "fire-tv", "fetchLatestFireTvRelease"),
]:
    text = read(path)
    bridge_anchor = 'from "@/components/mg/nativeFireTvBridge";\n'
    text = replace_once(
        text,
        bridge_anchor,
        bridge_anchor + 'import { fetchLatestNativeRelease } from "@/components/mg/nativeReleaseInfo";\n',
        f"{path} release helper import",
    )
    if platform == "android-mobile":
        text = regex_once(
            text,
            r'const ANDROID_RELEASE_URLS = \[.*?\n\];\n\nconst fetchLatestAndroidRelease = async \(\) => \{.*?\n\};\n\n',
            '',
            "Android local release fetch removal",
        )
    else:
        text = regex_once(
            text,
            r'const FIRE_TV_RELEASE_URLS = \[.*?\n\];\n\nconst fetchLatestFireTvRelease = async \(\) => \{.*?\n\};\n\n',
            '',
            "Fire TV local release fetch removal",
        )
    text = replace_once(
        text,
        f'const nextRelease = await {old_name}();',
        f'const nextRelease = await fetchLatestNativeRelease("{platform}", {{ force }});',
        f"{path} shared release fetch call",
    )
    write(path, text)


# Regression coverage for deferred screens, page recovery and shared update fetch.
ui = read("scripts/ui-regression-check.mjs")
ui = replace_once(
    ui,
    'const androidUpdateNotice = await read("src/components/mg/AndroidMobileAppUpdateNotice.jsx");\n',
    'const androidUpdateNotice = await read("src/components/mg/AndroidMobileAppUpdateNotice.jsx");\nconst nativeReleaseInfo = await read("src/components/mg/nativeReleaseInfo.js");\nconst pageErrorBoundary = await read("src/components/mg/PageErrorBoundary.jsx");\n',
    "UI regression new helper sources",
)
old_update_expect = '''expect(\n  fireTvUpdateNotice.includes("raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/firetv-update.json") &&\n    fireTvUpdateNotice.includes('window.addEventListener("mg:check-fire-tv-update"') &&\n    fireTvUpdateNotice.includes("60000") &&\n    androidUpdateNotice.includes('window.addEventListener("mg:check-android-mobile-update"'),\n  "Native update checks no longer re-check reliably or expose the manual Settings trigger"\n);'''
new_update_expect = '''expect(\n  nativeReleaseInfo.includes("raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/firetv-update.json") &&\n    nativeReleaseInfo.includes("raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/android-mobile-update.json") &&\n    nativeReleaseInfo.includes("AbortController") &&\n    nativeReleaseInfo.includes("CACHE_TTL_MS") &&\n    fireTvUpdateNotice.includes('fetchLatestNativeRelease("fire-tv"') &&\n    fireTvUpdateNotice.includes('window.addEventListener("mg:check-fire-tv-update"') &&\n    androidUpdateNotice.includes('fetchLatestNativeRelease("android-mobile"') &&\n    androidUpdateNotice.includes('window.addEventListener("mg:check-android-mobile-update"') &&\n    settings.includes("checkRd(false, false)") &&\n    settings.includes("void Promise.all(["),\n  "Native update checks or Settings startup optimisation regressed"\n);\nexpect(\n  home.includes("const WatchlistView = lazy(") &&\n    home.includes("const SettingsView = lazy(") &&\n    home.includes("<SafeDeferredView") &&\n    pageErrorBoundary.includes("Back to Home") &&\n    pageErrorBoundary.includes("Try again"),\n  "Deferred secondary screens or page-level crash recovery are missing"\n);'''
ui = replace_once(ui, old_update_expect, new_update_expect, "UI update/recovery regression")
write("scripts/ui-regression-check.mjs", ui)


# Keep CI on the runtime GitHub Actions now uses instead of relying on Node 20
# compatibility shims.
workflow = read(".github/workflows/media-god-regression.yml")
workflow = workflow.replace("actions/checkout@v4", "actions/checkout@v5")
workflow = workflow.replace("- name: Use Node 20", "- name: Use Node 24")
workflow = workflow.replace("actions/setup-node@v4", "actions/setup-node@v5")
workflow = workflow.replace("node-version: 20", "node-version: 24")
write(".github/workflows/media-god-regression.yml", workflow)


# The one-shot patch infrastructure removes itself from the final commit.
if SELF.exists():
    SELF.unlink()
if WORKFLOW.exists():
    WORKFLOW.unlink()

print("safe app polish applied")
