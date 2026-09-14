import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Loader2,
  RefreshCw,
  Tv,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import SocialLoginSection from "@/components/mg/SocialLoginSection";
import { nativeFireTvAppInfo } from "@/components/mg/nativeFireTvBridge";
import {
  readTrackPreferences,
  writeTrackPreferences,
} from "@/components/mg/mediaTrackPreferences";
import {
  readPlaybackPreferences,
  writePlaybackPreferences,
} from "@/components/mg/playbackPreferences";

const DEFAULT_PREFERENCES = {
  autoplay: true,
  subs: true,
  quality: "Auto",
};

const unwrapError = (
  error,
  fallback
) =>
  error?.response?.data?.error ||
  error?.message ||
  fallback;

const releaseUrlsForPlatform = (platform) => {
  if (platform === "fire-tv") {
    return [
      "/firetv-update.json",
      "https://raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/firetv-update.json",
    ];
  }

  if (platform === "android-mobile") {
    return [
      "/android-mobile-update.json",
      "https://raw.githubusercontent.com/leepeterss85-hue/media-god/main/public/android-mobile-update.json",
    ];
  }

  return [];
};

const fetchLatestNativeRelease = async (platform) => {
  const urls = releaseUrlsForPlatform(platform);

  if (urls.length === 0) {
    return null;
  }

  const releases = await Promise.all(
    urls.map(async (url) => {
      try {
        const separator = url.includes("?") ? "&" : "?";
        const response = await fetch(
          `${url}${separator}t=${Date.now()}`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return null;
        }

        return await response.json();
      } catch {
        return null;
      }
    })
  );

  return (
    releases
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(b?.versionCode || 0) -
          Number(a?.versionCode || 0)
      )[0] || null
  );
};

export default function SettingsView() {
  const [me, setMe] = useState(null);

  const [autoplay, setAutoplay] = useState(
    () => readPlaybackPreferences().autoNext
  );

  const [subs, setSubs] = useState(
    () => readTrackPreferences().subtitlesEnabled
  );

  const [quality, setQuality] = useState(
    () => readPlaybackPreferences().quality
  );

  const [autoRecovery, setAutoRecovery] = useState(
    () => readPlaybackPreferences().autoRecovery
  );

  const [trackPreferences, setTrackPreferences] = useState(
    () => readTrackPreferences()
  );

  const [saving, setSaving] = useState(false);

  const [appVersionInfo, setAppVersionInfo] = useState(
    () => nativeFireTvAppInfo()
  );

  const [latestAppRelease, setLatestAppRelease] = useState(null);
  const [appVersionChecking, setAppVersionChecking] = useState(false);

  const { toast } = useToast();

  const checkAppVersion = useCallback(
    async ({ openPrompt = false } = {}) => {
      setAppVersionChecking(true);

      try {
        const info = nativeFireTvAppInfo();
        setAppVersionInfo(info);

        const platform = String(info?.platform || "");
        const latest = await fetchLatestNativeRelease(platform);
        setLatestAppRelease(latest);

        if (
          openPrompt &&
          typeof window !== "undefined"
        ) {
          if (platform === "fire-tv") {
            window.dispatchEvent(
              new CustomEvent("mg:check-fire-tv-update")
            );
          } else if (platform === "android-mobile") {
            window.dispatchEvent(
              new CustomEvent("mg:check-android-mobile-update")
            );
          }
        }

        return {
          info,
          latest,
        };
      } finally {
        setAppVersionChecking(false);
      }
    },
    []
  );

  const loadMe = useCallback(async () => {
    try {
      const user = await base44.auth.me();
      setMe(user);

      const preferences = user?.preferences || {};
      const localPlayback = readPlaybackPreferences();
      const localTracks = readTrackPreferences();

      const nextPlayback = writePlaybackPreferences({
        ...localPlayback,
        autoNext:
          preferences.autoplay ??
          localPlayback.autoNext ??
          DEFAULT_PREFERENCES.autoplay,
        quality:
          preferences.quality ||
          localPlayback.quality ||
          DEFAULT_PREFERENCES.quality,
        autoRecovery:
          preferences.autoRecovery ??
          localPlayback.autoRecovery,
      });

      const nextTracks = writeTrackPreferences({
        ...localTracks,
        subtitlesEnabled:
          preferences.subs ??
          localTracks.subtitlesEnabled ??
          DEFAULT_PREFERENCES.subs,
        audioLanguage:
          preferences.audioLanguage ||
          localTracks.audioLanguage,
        subtitleLanguage:
          preferences.subtitleLanguage ||
          localTracks.subtitleLanguage,
        preferForcedSubtitles:
          preferences.preferForcedSubtitles ??
          localTracks.preferForcedSubtitles,
        preferSdhSubtitles:
          preferences.preferSdhSubtitles ??
          localTracks.preferSdhSubtitles,
        subtitleOffsetSeconds:
          preferences.subtitleOffsetSeconds ??
          localTracks.subtitleOffsetSeconds,
        subtitleSize:
          preferences.subtitleSize ||
          localTracks.subtitleSize,
        subtitleBackground:
          preferences.subtitleBackground ||
          localTracks.subtitleBackground,
      });

      setAutoplay(nextPlayback.autoNext);
      setQuality(nextPlayback.quality);
      setAutoRecovery(nextPlayback.autoRecovery);
      setSubs(nextTracks.subtitlesEnabled);
      setTrackPreferences(nextTracks);

      return user;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    checkAppVersion();
    loadMe();
  }, [
    checkAppVersion,
    loadMe,
  ]);

  const save = async () => {
    setSaving(true);

    try {
      const nextPlayback = writePlaybackPreferences({
        autoNext: autoplay,
        quality,
        autoRecovery,
      });

      const nextTracks = writeTrackPreferences({
        ...trackPreferences,
        subtitlesEnabled: subs,
      });

      setTrackPreferences(nextTracks);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("mg:set-auto-next", {
            detail: {
              enabled: nextPlayback.autoNext,
            },
          })
        );
      }

      await base44.auth.updateMe({
        preferences: {
          ...(me?.preferences || {}),
          autoplay: nextPlayback.autoNext,
          subs: nextTracks.subtitlesEnabled,
          quality: nextPlayback.quality,
          autoRecovery: nextPlayback.autoRecovery,
          audioLanguage: nextTracks.audioLanguage,
          subtitleLanguage: nextTracks.subtitleLanguage,
          preferForcedSubtitles: nextTracks.preferForcedSubtitles,
          preferSdhSubtitles: nextTracks.preferSdhSubtitles,
          subtitleOffsetSeconds: nextTracks.subtitleOffsetSeconds,
          subtitleSize: nextTracks.subtitleSize,
          subtitleBackground: nextTracks.subtitleBackground,
        },
      });

      await loadMe();

      toast({
        title: "Settings saved",
        description:
          "Playback, audio and subtitle preferences are active on this device and saved to your Media God account.",
      });
    } catch (error) {
      toast({
        title: "Could not save settings",
        description: unwrapError(
          error,
          "Please try again."
        ),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({
    on,
    onClick,
    label,
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={cn(
        "w-12 h-7 3xl:w-14 3xl:h-8 rounded-full transition-colors relative shrink-0 border",
        on
          ? "bg-mg-green border-mg-green"
          : "bg-white/10 border-white/15"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-6 h-6 3xl:w-7 3xl:h-7 rounded-full bg-black transition-transform",
          on
            ? "translate-x-5 3xl:translate-x-6"
            : "translate-x-0"
        )}
      />
    </button>
  );

  return (
    <div
      data-mg-settings-view="true"
      className="w-full max-w-4xl 3xl:max-w-5xl 4xl:max-w-6xl p-4 md:p-6 3xl:p-8 4xl:p-10"
    >
      <h1 className="text-xl md:text-2xl 3xl:text-3xl 4xl:text-4xl font-bold text-white mb-6 3xl:mb-8">
        Settings
      </h1>

      {me && (
        <div className="bg-mg-card border border-white/10 rounded-lg 3xl:rounded-xl p-4 3xl:p-5 mb-6 3xl:mb-8">
          <p className="text-sm 3xl:text-base text-white/50">
            Signed in as
          </p>

          <p className="text-white 3xl:text-lg font-semibold break-all">
            {me.email}
          </p>

          <p className="text-xs 3xl:text-sm text-white/35 mt-1">
            Your playback, audio and subtitle preferences are saved to this Media God user.
          </p>
        </div>
      )}

      <div
        className="bg-mg-card border border-white/10 rounded-lg 3xl:rounded-xl p-4 3xl:p-5 mb-6 3xl:mb-8"
        data-mg-app-version="true"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Tv className="h-4 w-4 text-mg-green" />

              <h2 className="text-sm 3xl:text-lg font-bold text-white">
                Media God version
              </h2>
            </div>

            {appVersionInfo ? (
              <>
                <p className="mt-2 text-sm 3xl:text-base text-white/80">
                  Installed:{" "}
                  <span className="font-bold text-white">
                    {appVersionInfo.versionName || "Unknown"}
                  </span>
                  {Number(appVersionInfo.versionCode || 0) > 0
                    ? ` (code ${appVersionInfo.versionCode})`
                    : ""}
                </p>

                <p className="mt-1 text-xs 3xl:text-sm text-white/45">
                  {appVersionInfo.platform === "fire-tv"
                    ? "Fire TV / Fire Stick app"
                    : appVersionInfo.platform === "android-mobile"
                      ? "Android phone / tablet app"
                      : String(
                          appVersionInfo.platform ||
                            "Native app"
                        )}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm 3xl:text-base text-white/65">
                Hosted web version — no native APK detected on this device.
              </p>
            )}

            {appVersionInfo && latestAppRelease && (
              <p
                className={cn(
                  "mt-2 text-xs 3xl:text-sm font-semibold",
                  Number(latestAppRelease.versionCode || 0) >
                    Number(appVersionInfo.versionCode || 0)
                    ? "text-amber-300"
                    : "text-mg-green"
                )}
              >
                {Number(latestAppRelease.versionCode || 0) >
                Number(appVersionInfo.versionCode || 0)
                  ? `Update available: ${
                      latestAppRelease.versionName ||
                      latestAppRelease.versionCode
                    }`
                  : `Up to date: ${
                      latestAppRelease.versionName ||
                      appVersionInfo.versionName ||
                      "current"
                    }`}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              checkAppVersion({
                openPrompt: true,
              })
            }
            disabled={
              appVersionChecking ||
              !appVersionInfo
            }
            className="min-h-11 shrink-0 rounded-lg border border-mg-green/35 bg-mg-green/10 px-4 py-2 text-sm font-bold text-mg-green outline-none hover:bg-mg-green/15 focus:ring-2 focus:ring-mg-green disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  appVersionChecking &&
                    "animate-spin"
                )}
              />

              {appVersionChecking
                ? "Checking…"
                : "Check for update"}
            </span>
          </button>
        </div>
      </div>

      <SocialLoginSection />

      <div className="mt-6 bg-mg-card border border-white/10 rounded-lg 3xl:rounded-xl overflow-hidden">
        <div className="p-4 3xl:p-5 border-b border-white/5">
          <h2 className="text-sm 3xl:text-lg font-bold text-white">
            Playback
          </h2>

          <p className="text-xs 3xl:text-sm text-white/40 mt-1">
            Default playback behaviour across Media God.
          </p>
        </div>

        <div className="divide-y divide-white/5">
          <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Auto next episode
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Start the next TV episode automatically when the current one finishes.
              </p>
            </div>

            <Toggle
              on={autoplay}
              onClick={() =>
                setAutoplay(
                  !autoplay
                )
              }
              label="Toggle auto next episode"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Automatic playback recovery
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                If a movie or episode genuinely stalls, switch to an unused backup source and resume at the same position.
              </p>
            </div>

            <Toggle
              on={autoRecovery}
              onClick={() =>
                setAutoRecovery(
                  !autoRecovery
                )
              }
              label="Toggle automatic playback recovery"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Subtitles
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Enable your preferred subtitle track automatically when one is available.
              </p>
            </div>

            <Toggle
              on={subs}
              onClick={() => {
                const enabled = !subs;

                setSubs(enabled);
                setTrackPreferences(
                  (current) => ({
                    ...current,
                    subtitlesEnabled: enabled,
                  })
                );
              }}
              label="Toggle subtitles"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Stream quality
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Preferred default quality when several streams are available.
              </p>
            </div>

            <select
              value={quality}
              onChange={(event) =>
                setQuality(
                  event.target.value
                )
              }
              aria-label="Stream quality"
              className="w-full sm:w-auto min-h-11 3xl:min-h-12 bg-mg-surface border border-white/10 rounded-md text-sm 3xl:text-base text-white px-3 py-2 focus:outline-none focus:border-mg-green"
            >
              {[
                "Auto",
                "4K",
                "1080p",
                "720p",
                "480p",
              ].map((item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Preferred audio language
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Choose the audio track Media God should try first when a source exposes multiple languages.
              </p>
            </div>

            <select
              value={trackPreferences.audioLanguage}
              onChange={(event) =>
                setTrackPreferences(
                  (current) => ({
                    ...current,
                    audioLanguage:
                      event.target.value,
                  })
                )
              }
              aria-label="Preferred audio language"
              className="w-full sm:w-44 min-h-11 3xl:min-h-12 bg-mg-surface border border-white/10 rounded-md text-sm 3xl:text-base text-white px-3 py-2 focus:outline-none focus:border-mg-green"
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Preferred subtitle language
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Used for automatic subtitle selection and forced subtitles.
              </p>
            </div>

            <select
              value={trackPreferences.subtitleLanguage}
              onChange={(event) =>
                setTrackPreferences(
                  (current) => ({
                    ...current,
                    subtitleLanguage:
                      event.target.value,
                  })
                )
              }
              aria-label="Preferred subtitle language"
              className="w-full sm:w-44 min-h-11 3xl:min-h-12 bg-mg-surface border border-white/10 rounded-md text-sm 3xl:text-base text-white px-3 py-2 focus:outline-none focus:border-mg-green"
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Prefer forced subtitles
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Prefer forced or foreign-parts subtitles before a full subtitle track when both are available.
              </p>
            </div>

            <Toggle
              on={trackPreferences.preferForcedSubtitles}
              onClick={() =>
                setTrackPreferences(
                  (current) => ({
                    ...current,
                    preferForcedSubtitles:
                      !current.preferForcedSubtitles,
                  })
                )
              }
              label="Toggle forced subtitle preference"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Prefer SDH subtitles
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Prefer hearing-impaired or SDH captions when available.
              </p>
            </div>

            <Toggle
              on={trackPreferences.preferSdhSubtitles}
              onClick={() =>
                setTrackPreferences(
                  (current) => ({
                    ...current,
                    preferSdhSubtitles:
                      !current.preferSdhSubtitles,
                  })
                )
              }
              label="Toggle SDH subtitle preference"
            />
          </div>

          <div className="grid gap-4 p-4 3xl:p-5 sm:grid-cols-2">
            <label>
              <span className="block text-sm 3xl:text-base text-white font-medium">
                Subtitle size
              </span>

              <span className="mt-0.5 block text-xs 3xl:text-sm text-white/40">
                Choose the default subtitle text size.
              </span>

              <select
                value={trackPreferences.subtitleSize}
                onChange={(event) =>
                  setTrackPreferences(
                    (current) => ({
                      ...current,
                      subtitleSize:
                        event.target.value,
                    })
                  )
                }
                aria-label="Subtitle size"
                className="mt-2 w-full min-h-11 3xl:min-h-12 bg-mg-surface border border-white/10 rounded-md text-sm 3xl:text-base text-white px-3 py-2 focus:outline-none focus:border-mg-green"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="extra-large">Extra large</option>
              </select>
            </label>

            <label>
              <span className="block text-sm 3xl:text-base text-white font-medium">
                Subtitle background
              </span>

              <span className="mt-0.5 block text-xs 3xl:text-sm text-white/40">
                Controls the background behind subtitle text.
              </span>

              <select
                value={trackPreferences.subtitleBackground}
                onChange={(event) =>
                  setTrackPreferences(
                    (current) => ({
                      ...current,
                      subtitleBackground:
                        event.target.value,
                    })
                  )
                }
                aria-label="Subtitle background"
                className="mt-2 w-full min-h-11 3xl:min-h-12 bg-mg-surface border border-white/10 rounded-md text-sm 3xl:text-base text-white px-3 py-2 focus:outline-none focus:border-mg-green"
              >
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        data-mg-settings-save="true"
        className="mt-6 3xl:mt-8 min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 bg-mg-green text-black font-semibold text-sm 3xl:text-base px-5 3xl:px-6 py-2.5 3xl:py-3 rounded-lg hover:bg-mg-green-dim disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mg-background"
      >
        {saving && (
          <Loader2 className="w-4 h-4 animate-spin" />
        )}

        {saving
          ? "Saving…"
          : "Save settings"}
      </button>
    </div>
  );
}
