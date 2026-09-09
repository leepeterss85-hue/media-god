import { base44 } from "@/api/base44Client";
import {
  PLAYBACK_PREFERENCES_KEY,
  readPlaybackPreferences,
  writePlaybackPreferences,
} from "@/components/mg/playbackPreferences";
import {
  MEDIA_TRACK_PREFERENCES_KEY,
  readTrackPreferences,
  writeTrackPreferences,
} from "@/components/mg/mediaTrackPreferences";
import {
  SOURCE_SELECTOR_SORT_KEY,
  writeSourceSortMode,
} from "@/components/mg/sourceSelectorPreferences";

const LIVE_TV_FAVOURITES_KEY = "mg_live_tv_favourites_v1";
const LIVE_TV_RECENT_KEY = "mg_live_tv_recent_v1";
const ACCOUNT_PREFERENCE_EVENT = "mg:account-preferences-changed";
const LIVE_TV_SYNC_INTERVAL_MS = 2000;

let pendingPatch = {};
let flushTimer = null;

const hasOwn = (object, key) =>
  Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);

const storageHas = (key) => {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
};

const readStoredArray = (key) => {
  if (typeof window === "undefined") return [];

  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
};

const writeStoredArray = (key, value) => {
  if (typeof window === "undefined" || !Array.isArray(value)) return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(value.filter(Boolean).map(String))
    );
  } catch {
    // Account sync is best effort; local storage may be disabled.
  }
};

const cleanPatch = (patch) =>
  Object.fromEntries(
    Object.entries(patch || {}).filter(([, value]) => value !== undefined)
  );

const localAccountPreferenceSeed = () => {
  const patch = {};

  if (storageHas(PLAYBACK_PREFERENCES_KEY) || storageHas("mg_auto_next")) {
    const playback = readPlaybackPreferences();
    patch.autoplay = playback.autoNext;
    patch.quality = playback.quality;
    patch.autoRecovery = playback.autoRecovery;
  }

  if (storageHas(MEDIA_TRACK_PREFERENCES_KEY)) {
    const tracks = readTrackPreferences();
    patch.subs = tracks.subtitlesEnabled;
    patch.audioLanguage = tracks.audioLanguage;
    patch.subtitleLanguage = tracks.subtitleLanguage;
    patch.preferForcedSubtitles = tracks.preferForcedSubtitles;
    patch.preferSdhSubtitles = tracks.preferSdhSubtitles;
    patch.subtitleOffsetSeconds = tracks.subtitleOffsetSeconds;
    patch.subtitleSize = tracks.subtitleSize;
    patch.subtitleBackground = tracks.subtitleBackground;
  }

  if (storageHas(SOURCE_SELECTOR_SORT_KEY)) {
    try {
      patch.sourceSortMode = String(
        window.localStorage.getItem(SOURCE_SELECTOR_SORT_KEY) || "best"
      );
    } catch {
      // Ignore inaccessible storage.
    }
  }

  if (storageHas(LIVE_TV_FAVOURITES_KEY)) {
    patch.liveTvFavourites = readStoredArray(LIVE_TV_FAVOURITES_KEY);
  }

  if (storageHas(LIVE_TV_RECENT_KEY)) {
    patch.liveTvRecent = readStoredArray(LIVE_TV_RECENT_KEY);
  }

  return patch;
};

const missingRemoteSeed = (remote, local) => {
  const patch = {};

  for (const [key, value] of Object.entries(local || {})) {
    if (!hasOwn(remote, key)) {
      patch[key] = value;
    }
  }

  return patch;
};

export const hydrateAccountPreferences = async (user) => {
  const remote =
    user?.preferences && typeof user.preferences === "object"
      ? user.preferences
      : {};

  const localPlayback = readPlaybackPreferences();
  const localTracks = readTrackPreferences();

  writePlaybackPreferences({
    ...localPlayback,
    ...(hasOwn(remote, "autoplay") ? { autoNext: remote.autoplay } : {}),
    ...(hasOwn(remote, "quality") ? { quality: remote.quality } : {}),
    ...(hasOwn(remote, "autoRecovery")
      ? { autoRecovery: remote.autoRecovery }
      : {}),
  });

  writeTrackPreferences({
    ...localTracks,
    ...(hasOwn(remote, "subs") ? { subtitlesEnabled: remote.subs } : {}),
    ...(hasOwn(remote, "audioLanguage")
      ? { audioLanguage: remote.audioLanguage }
      : {}),
    ...(hasOwn(remote, "subtitleLanguage")
      ? { subtitleLanguage: remote.subtitleLanguage }
      : {}),
    ...(hasOwn(remote, "preferForcedSubtitles")
      ? { preferForcedSubtitles: remote.preferForcedSubtitles }
      : {}),
    ...(hasOwn(remote, "preferSdhSubtitles")
      ? { preferSdhSubtitles: remote.preferSdhSubtitles }
      : {}),
    ...(hasOwn(remote, "subtitleOffsetSeconds")
      ? { subtitleOffsetSeconds: remote.subtitleOffsetSeconds }
      : {}),
    ...(hasOwn(remote, "subtitleSize")
      ? { subtitleSize: remote.subtitleSize }
      : {}),
    ...(hasOwn(remote, "subtitleBackground")
      ? { subtitleBackground: remote.subtitleBackground }
      : {}),
  });

  if (hasOwn(remote, "sourceSortMode")) {
    writeSourceSortMode(remote.sourceSortMode);
  }

  if (Array.isArray(remote.liveTvFavourites)) {
    writeStoredArray(LIVE_TV_FAVOURITES_KEY, remote.liveTvFavourites);
  }

  if (Array.isArray(remote.liveTvRecent)) {
    writeStoredArray(LIVE_TV_RECENT_KEY, remote.liveTvRecent);
  }

  // Existing installations may already have useful device-local settings
  // from before account sync existed. Seed only keys that genuinely exist on
  // the device and are missing from the account; a new device never replaces
  // established account values with defaults.
  const seed = missingRemoteSeed(remote, localAccountPreferenceSeed());

  if (Object.keys(seed).length > 0) {
    try {
      await base44.auth.updateMe({
        preferences: {
          ...remote,
          ...seed,
        },
      });
    } catch {
      // A temporary network failure must not block login.
    }
  }
};

const flushPreferencePatch = async () => {
  flushTimer = null;
  const patch = cleanPatch(pendingPatch);
  pendingPatch = {};

  if (Object.keys(patch).length === 0) return;

  try {
    const user = await base44.auth.me();
    const current =
      user?.preferences && typeof user.preferences === "object"
        ? user.preferences
        : {};

    await base44.auth.updateMe({
      preferences: {
        ...current,
        ...patch,
      },
    });
  } catch {
    // Preference sync is best effort and must never interrupt playback.
  }
};

export const queueAccountPreferencePatch = (patch) => {
  if (typeof window === "undefined" || !patch || typeof patch !== "object") {
    return;
  }

  pendingPatch = {
    ...pendingPatch,
    ...cleanPatch(patch),
  };

  if (flushTimer) {
    window.clearTimeout(flushTimer);
  }

  flushTimer = window.setTimeout(flushPreferencePatch, 800);
};

export const installAccountPreferenceSync = () => {
  if (typeof window === "undefined") return () => {};

  const onPlayback = (event) => {
    const value = event?.detail || {};
    queueAccountPreferencePatch({
      autoplay: value.autoNext,
      quality: value.quality,
      autoRecovery: value.autoRecovery,
    });
  };

  const onTracks = (event) => {
    const value = event?.detail || {};
    queueAccountPreferencePatch({
      subs: value.subtitlesEnabled,
      audioLanguage: value.audioLanguage,
      subtitleLanguage: value.subtitleLanguage,
      preferForcedSubtitles: value.preferForcedSubtitles,
      preferSdhSubtitles: value.preferSdhSubtitles,
      subtitleOffsetSeconds: value.subtitleOffsetSeconds,
      subtitleSize: value.subtitleSize,
      subtitleBackground: value.subtitleBackground,
    });
  };

  const onSourceSort = (event) => {
    queueAccountPreferencePatch({
      sourceSortMode: String(event?.detail?.mode || "best"),
    });
  };

  const onExplicitPatch = (event) => {
    queueAccountPreferencePatch(event?.detail || {});
  };

  window.addEventListener("mg:playback-preferences-changed", onPlayback);
  window.addEventListener("mg:media-track-preferences-changed", onTracks);
  window.addEventListener("mg:source-selector-sort-changed", onSourceSort);
  window.addEventListener(ACCOUNT_PREFERENCE_EVENT, onExplicitPatch);

  // Live TV favourites/recent channels pre-date the account-sync event bus.
  // Watch their two small local lists and mirror changes to the signed-in
  // Media God user without touching device-only Fire TV navigation settings.
  let lastLiveTvSnapshot = JSON.stringify({
    favourites: readStoredArray(LIVE_TV_FAVOURITES_KEY),
    recent: readStoredArray(LIVE_TV_RECENT_KEY),
  });

  const liveTvTimer = window.setInterval(() => {
    const favourites = readStoredArray(LIVE_TV_FAVOURITES_KEY);
    const recent = readStoredArray(LIVE_TV_RECENT_KEY);
    const snapshot = JSON.stringify({ favourites, recent });

    if (snapshot === lastLiveTvSnapshot) return;
    lastLiveTvSnapshot = snapshot;

    queueAccountPreferencePatch({
      liveTvFavourites: favourites,
      liveTvRecent: recent,
    });
  }, LIVE_TV_SYNC_INTERVAL_MS);

  return () => {
    window.removeEventListener("mg:playback-preferences-changed", onPlayback);
    window.removeEventListener("mg:media-track-preferences-changed", onTracks);
    window.removeEventListener("mg:source-selector-sort-changed", onSourceSort);
    window.removeEventListener(ACCOUNT_PREFERENCE_EVENT, onExplicitPatch);
    window.clearInterval(liveTvTimer);

    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
  };
};
