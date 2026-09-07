import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Tv,
  Unlink,
  Zap,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import SocialLoginSection from "@/components/mg/SocialLoginSection";
import MultiDebridSettings from "@/components/mg/MultiDebridSettings";
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

const TV_REMOTE_STORAGE_KEY =
  "mg:fire-tv-settings-v2";

const DEFAULT_TV_REMOTE_SETTINGS = {
  remoteMode: "auto",
  focusStyle: "strong",
  seekSeconds: 10,
  wrapNavigation: true,
  scrollFallback: true,
  autoFocus: true,
};

const unwrapError = (
  error,
  fallback
) =>
  error?.response?.data?.error ||
  error?.message ||
  fallback;

const looksLikeFireTv = () => {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return false;
  }

  const ua =
    String(
      navigator.userAgent ||
        ""
    );

  const platform =
    String(
      navigator.platform ||
        ""
    );

  return /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i.test(
    `${ua} ${platform}`
  );
};

const normaliseRemoteSettings = (
  value
) => {
  const raw =
    value &&
    typeof value ===
      "object"
      ? value
      : {};

  const seek =
    Number(
      raw.seekSeconds
    );

  return {
    remoteMode:
      raw.remoteMode ===
      "always"
        ? "always"
        : "auto",

    focusStyle:
      raw.focusStyle ===
      "standard"
        ? "standard"
        : "strong",

    seekSeconds:
      [10, 20, 30].includes(
        seek
      )
        ? seek
        : DEFAULT_TV_REMOTE_SETTINGS.seekSeconds,

    wrapNavigation:
      typeof raw.wrapNavigation ===
      "boolean"
        ? raw.wrapNavigation
        : DEFAULT_TV_REMOTE_SETTINGS.wrapNavigation,

    scrollFallback:
      typeof raw.scrollFallback ===
      "boolean"
        ? raw.scrollFallback
        : DEFAULT_TV_REMOTE_SETTINGS.scrollFallback,

    autoFocus:
      typeof raw.autoFocus ===
      "boolean"
        ? raw.autoFocus
        : DEFAULT_TV_REMOTE_SETTINGS.autoFocus,
  };
};

const readRemoteSettings =
  () => {
    if (
      typeof window ===
      "undefined"
    ) {
      return DEFAULT_TV_REMOTE_SETTINGS;
    }

    try {
      const raw =
        window.localStorage.getItem(
          TV_REMOTE_STORAGE_KEY
        );

      if (!raw) {
        return DEFAULT_TV_REMOTE_SETTINGS;
      }

      return normaliseRemoteSettings(
        JSON.parse(raw)
      );
    } catch {
      return DEFAULT_TV_REMOTE_SETTINGS;
    }
  };

const writeRemoteSettings = (
  settings
) => {
  const next =
    normaliseRemoteSettings(
      settings
    );

  if (
    typeof window !==
    "undefined"
  ) {
    try {
      window.localStorage.setItem(
        TV_REMOTE_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Device-local storage is best effort.
    }

    window.dispatchEvent(
      new CustomEvent(
        "mg:remote-settings-changed",
        {
          detail: next,
        }
      )
    );
  }

  return next;
};

export default function SettingsView() {
  const [
    me,
    setMe,
  ] = useState(null);

  const [
    autoplay,
    setAutoplay,
  ] = useState(
    () => readPlaybackPreferences().autoNext
  );

  const [
    subs,
    setSubs,
  ] = useState(
    () => readTrackPreferences().subtitlesEnabled
  );

  const [
    quality,
    setQuality,
  ] = useState(
    () => readPlaybackPreferences().quality
  );

  const [
    autoRecovery,
    setAutoRecovery,
  ] = useState(
    () => readPlaybackPreferences().autoRecovery
  );

  const [
    trackPreferences,
    setTrackPreferences,
  ] = useState(
    () => readTrackPreferences()
  );

  const [
    remoteSettings,
    setRemoteSettings,
  ] = useState(
    () =>
      readRemoteSettings()
  );

  const [
    fireTvDetected,
  ] = useState(
    () =>
      looksLikeFireTv()
  );

  const [
    remoteActive,
    setRemoteActive,
  ] = useState(
    () => {
      if (
        typeof document ===
        "undefined"
      ) {
        return false;
      }

      return document.body.classList.contains(
        "mg-fire-tv-mode"
      );
    }
  );

  const [
    rdStatus,
    setRdStatus,
  ] = useState(null);

  const [
    rdChecking,
    setRdChecking,
  ] = useState(true);

  const [
    rdStarting,
    setRdStarting,
  ] = useState(false);

  const [
    rdDisconnecting,
    setRdDisconnecting,
  ] = useState(false);

  const [
    deviceFlow,
    setDeviceFlow,
  ] = useState(null);

  const [
    copied,
    setCopied,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const pollTimerRef =
    useRef(null);

  const flowStartedAtRef =
    useRef(0);

  const { toast } =
    useToast();

  const loadMe =
    useCallback(
      async () => {
        try {
          const user =
            await base44.auth.me();

          setMe(user);

          const preferences =
            user?.preferences ||
            {};

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
      },
      []
    );

  const checkRd =
    useCallback(
      async (
        showToast = false
      ) => {
        setRdChecking(
          true
        );

        try {
          const response =
            await base44.functions.invoke(
              "realDebridAuth",
              {
                action:
                  "status",
              }
            );

          const status =
            response?.data ||
            {};

          setRdStatus(
            status
          );

          if (
            showToast
          ) {
            toast({
              title:
                status?.connected
                  ? "Real-Debrid connected"
                  : "Real-Debrid not connected",

              description:
                status?.error ||
                undefined,

              variant:
                status?.connected
                  ? undefined
                  : "destructive",
            });
          }

          await loadMe();

          return status;
        } catch (
          error
        ) {
          const message =
            unwrapError(
              error,
              "Could not check Real-Debrid."
            );

          const status = {
            connected:
              false,

            valid:
              false,

            error:
              message,
          };

          setRdStatus(
            status
          );

          if (
            showToast
          ) {
            toast({
              title:
                "Real-Debrid check failed",

              description:
                message,

              variant:
                "destructive",
            });
          }

          return status;
        } finally {
          setRdChecking(
            false
          );
        }
      },
      [
        loadMe,
        toast,
      ]
    );

  useEffect(
    () => {
      let mounted =
        true;

      const load =
        async () => {
          await loadMe();

          if (
            mounted
          ) {
            await checkRd(
              false
            );
          }
        };

      load();

      return () => {
        mounted =
          false;
      };
    },
    [
      checkRd,
      loadMe,
    ]
  );

  useEffect(
    () => {
      const handleRemoteStatus =
        (
          event
        ) => {
          setRemoteActive(
            Boolean(
              event?.detail
                ?.active
            )
          );
        };

      const handleStorage =
        (
          event
        ) => {
          if (
            event.key ===
            TV_REMOTE_STORAGE_KEY
          ) {
            setRemoteSettings(
              readRemoteSettings()
            );
          }
        };

      window.addEventListener(
        "mg:remote-status",
        handleRemoteStatus
      );

      window.addEventListener(
        "storage",
        handleStorage
      );

      return () => {
        window.removeEventListener(
          "mg:remote-status",
          handleRemoteStatus
        );

        window.removeEventListener(
          "storage",
          handleStorage
        );
      };
    },
    []
  );

  const updateRemoteSetting =
    (
      key,
      value
    ) => {
      setRemoteSettings(
        (
          current
        ) => {
          const next = {
            ...current,
            [key]:
              value,
          };

          return writeRemoteSettings(
            next
          );
        }
      );
    };

  const resetRemoteSettings =
    () => {
      const next =
        writeRemoteSettings(
          DEFAULT_TV_REMOTE_SETTINGS
        );

      setRemoteSettings(
        next
      );

      toast({
        title:
          "TV remote settings reset",

        description:
          "Media God restored the recommended Fire TV controls for this device.",
      });
    };

  const save =
    async () => {
      setSaving(
        true
      );

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

        window.dispatchEvent(
          new CustomEvent("mg:set-auto-next", {
            detail: {
              enabled: nextPlayback.autoNext,
            },
          })
        );

        await base44.auth.updateMe(
          {
            preferences: {
              ...(
                me?.preferences ||
                {}
              ),

              autoplay: nextPlayback.autoNext,
              subs: nextTracks.subtitlesEnabled,
              quality: nextPlayback.quality,
              autoRecovery: nextPlayback.autoRecovery,
              audioLanguage: nextTracks.audioLanguage,
              subtitleLanguage: nextTracks.subtitleLanguage,
              preferForcedSubtitles: nextTracks.preferForcedSubtitles,
              subtitleSize: nextTracks.subtitleSize,
              subtitleBackground: nextTracks.subtitleBackground,
            },
          }
        );

        await loadMe();

        toast({
          title:
            "Settings saved",

          description:
            "Playback, audio and subtitle preferences are active on this device and saved to your Media God account.",
        });
      } catch (
        error
      ) {
        toast({
          title:
            "Could not save settings",

          description:
            unwrapError(
              error,
              "Please try again."
            ),

          variant:
            "destructive",
        });
      } finally {
        setSaving(
          false
        );
      }
    };

  const startRdConnect =
    async () => {
      if (
        pollTimerRef.current
      ) {
        clearTimeout(
          pollTimerRef.current
        );

        pollTimerRef.current =
          null;
      }

      setRdStarting(
        true
      );

      setDeviceFlow(
        null
      );

      setCopied(
        false
      );

      try {
        const response =
          await base44.functions.invoke(
            "realDebridAuth",
            {
              action:
                "start_device",
            }
          );

        const data =
          response?.data ||
          {};

        if (
          !data?.device_code ||
          !data?.user_code
        ) {
          throw new Error(
            data?.error ||
              "Real-Debrid did not return a login code."
          );
        }

        flowStartedAtRef.current =
          Date.now();

        setDeviceFlow(
          data
        );

        toast({
          title:
            "Real-Debrid code ready",

          description:
            "Open Real-Debrid and enter the code shown in Media God.",
        });
      } catch (
        error
      ) {
        toast({
          title:
            "Could not start Real-Debrid login",

          description:
            unwrapError(
              error,
              "Please try again."
            ),

          variant:
            "destructive",
        });
      } finally {
        setRdStarting(
          false
        );
      }
    };

  const finishConnectedFlow =
    useCallback(
      async (
        status
      ) => {
        if (
          pollTimerRef.current
        ) {
          clearTimeout(
            pollTimerRef.current
          );

          pollTimerRef.current =
            null;
        }

        setDeviceFlow(
          null
        );

        setRdStatus(
          status
        );

        await loadMe();

        toast({
          title:
            "Real-Debrid connected",

          description:
            "This account is now saved to your Media God user.",
        });
      },
      [
        loadMe,
        toast,
      ]
    );

  const pollDevice =
    useCallback(
      async (
        manual = false
      ) => {
        if (
          !deviceFlow
            ?.device_code
        ) {
          return;
        }

        const expiresMs =
          Number(
            deviceFlow.expires_in ||
              1800
          ) *
          1000;

        if (
          flowStartedAtRef.current &&
          Date.now() -
            flowStartedAtRef.current >
            expiresMs
        ) {
          setDeviceFlow(
            null
          );

          toast({
            title:
              "Real-Debrid code expired",

            description:
              "Choose Connect Real-Debrid to get a new code.",

            variant:
              "destructive",
          });

          return;
        }

        try {
          const response =
            await base44.functions.invoke(
              "realDebridAuth",
              {
                action:
                  "poll_device",

                device_code:
                  deviceFlow.device_code,
              }
            );

          const data =
            response?.data ||
            {};

          if (
            data?.connected
          ) {
            await finishConnectedFlow(
              data
            );

            return;
          }

          if (
            manual &&
            data?.pending
          ) {
            toast({
              title:
                "Still waiting for approval",

              description:
                "Enter the displayed code on the Real-Debrid page, then approve Media God.",
            });
          }
        } catch (
          error
        ) {
          if (
            manual
          ) {
            toast({
              title:
                "Could not confirm Real-Debrid",

              description:
                unwrapError(
                  error,
                  "Please try again."
                ),

              variant:
                "destructive",
            });
          }
        }
      },
      [
        deviceFlow,
        finishConnectedFlow,
        toast,
      ]
    );

  useEffect(
    () => {
      if (
        !deviceFlow
          ?.device_code
      ) {
        return undefined;
      }

      let cancelled =
        false;

      const intervalMs =
        Math.max(
          5,
          Number(
            deviceFlow.interval ||
              5
          )
        ) *
        1000;

      const schedule =
        () => {
          if (
            cancelled
          ) {
            return;
          }

          pollTimerRef.current =
            setTimeout(
              async () => {
                if (
                  cancelled
                ) {
                  return;
                }

                await pollDevice(
                  false
                );

                schedule();
              },
              intervalMs
            );
        };

      schedule();

      return () => {
        cancelled =
          true;

        if (
          pollTimerRef.current
        ) {
          clearTimeout(
            pollTimerRef.current
          );

          pollTimerRef.current =
            null;
        }
      };
    },
    [
      deviceFlow
        ?.device_code,

      deviceFlow
        ?.interval,

      pollDevice,
    ]
  );

  const copyCode =
    async () => {
      if (
        !deviceFlow
          ?.user_code
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          deviceFlow.user_code
        );

        setCopied(
          true
        );

        setTimeout(
          () =>
            setCopied(
              false
            ),
          1600
        );
      } catch {
        toast({
          title:
            "Copy failed",

          description:
            `Code: ${deviceFlow.user_code}`,
        });
      }
    };

  const disconnectRd =
    async () => {
      setRdDisconnecting(
        true
      );

      try {
        await base44.functions.invoke(
          "realDebridAuth",
          {
            action:
              "disconnect",
          }
        );

        if (
          pollTimerRef.current
        ) {
          clearTimeout(
            pollTimerRef.current
          );

          pollTimerRef.current =
            null;
        }

        setDeviceFlow(
          null
        );

        setRdStatus({
          connected:
            false,

          valid:
            false,
        });

        await loadMe();

        toast({
          title:
            "Real-Debrid disconnected",

          description:
            "The saved Real-Debrid connection was removed from this Media God user.",
        });
      } catch (
        error
      ) {
        toast({
          title:
            "Could not disconnect Real-Debrid",

          description:
            unwrapError(
              error,
              "Please try again."
            ),

          variant:
            "destructive",
        });
      } finally {
        setRdDisconnecting(
          false
        );
      }
    };

  const Toggle = ({
    on,
    onClick,
    label,
  }) => (
    <button
      type="button"
      onClick={
        onClick
      }
      aria-label={
        label
      }
      aria-pressed={
        on
      }
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

  const rdConnected =
    Boolean(
      rdStatus?.connected ||
        rdStatus?.valid
    );

  return (
    <div className="w-full max-w-4xl 3xl:max-w-5xl 4xl:max-w-6xl p-4 md:p-6 3xl:p-8 4xl:p-10">
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
            Playback preferences and your Real-Debrid connection are saved to this Media God user.
          </p>
        </div>
      )}

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
              on={
                autoplay
              }
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
                If a movie or episode stops progressing for about 14 seconds, switch to an unused backup source and resume at the same position.
              </p>
            </div>

            <Toggle
              on={autoRecovery}
              onClick={() => setAutoRecovery(!autoRecovery)}
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
              on={
                subs
              }
              onClick={() => {
                const enabled = !subs;
                setSubs(enabled);
                setTrackPreferences((current) => ({
                  ...current,
                  subtitlesEnabled: enabled,
                }));
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
              value={
                quality
              }
              onChange={(
                event
              ) =>
                setQuality(
                  event.target
                    .value
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
              ].map(
                (
                  item
                ) => (
                  <option
                    key={
                      item
                    }
                    value={
                      item
                    }
                  >
                    {
                      item
                    }
                  </option>
                )
              )}
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
                setTrackPreferences((current) => ({
                  ...current,
                  audioLanguage: event.target.value,
                }))
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
                setTrackPreferences((current) => ({
                  ...current,
                  subtitleLanguage: event.target.value,
                }))
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
                Prefer forced/foreign-parts subtitles before a full subtitle track when both are available.
              </p>
            </div>

            <Toggle
              on={trackPreferences.preferForcedSubtitles}
              onClick={() =>
                setTrackPreferences((current) => ({
                  ...current,
                  preferForcedSubtitles: !current.preferForcedSubtitles,
                }))
              }
              label="Toggle forced subtitle preference"
            />
          </div>

          <div className="grid gap-4 p-4 3xl:p-5 sm:grid-cols-2">
            <label>
              <span className="block text-sm 3xl:text-base text-white font-medium">
                Subtitle size
              </span>
              <span className="mt-0.5 block text-xs 3xl:text-sm text-white/40">
                Saved for this device and the QR remote.
              </span>
              <select
                value={trackPreferences.subtitleSize}
                onChange={(event) =>
                  setTrackPreferences((current) => ({
                    ...current,
                    subtitleSize: event.target.value,
                  }))
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
                  setTrackPreferences((current) => ({
                    ...current,
                    subtitleBackground: event.target.value,
                  }))
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

      <div className="mt-6 3xl:mt-8 bg-mg-card border border-white/10 rounded-lg 3xl:rounded-xl overflow-hidden">
        <div className="p-4 3xl:p-5 border-b border-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 3xl:gap-3">
              <Tv className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />

              <h2 className="text-sm 3xl:text-lg font-bold text-white">
                Fire TV & Remote
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] 3xl:text-sm">
              {fireTvDetected && (
                <span className="rounded-full border border-mg-green/30 bg-mg-green/10 px-2.5 py-1 font-semibold text-mg-green">
                  Fire TV detected
                </span>
              )}

              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 font-semibold",

                  remoteActive
                    ? "border-mg-green/30 bg-mg-green/10 text-mg-green"
                    : "border-white/10 bg-white/5 text-white/50"
                )}
              >
                {remoteActive
                  ? "Remote active"
                  : "Remote ready"}
              </span>
            </div>
          </div>

          <p className="text-xs 3xl:text-sm text-white/40 mt-2">
            These controls are stored on this device so your Fire Stick can have its own remote behaviour without changing your phone or computer.
          </p>
        </div>

        <div className="divide-y divide-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Remote mode
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Auto detects Fire TV. Always on also enables D-pad support in other TV browsers.
              </p>
            </div>

            <select
              value={
                remoteSettings.remoteMode
              }
              onChange={(
                event
              ) =>
                updateRemoteSetting(
                  "remoteMode",
                  event.target
                    .value
                )
              }
              aria-label="TV remote mode"
              className="w-full sm:w-44 min-h-11 3xl:min-h-12 bg-mg-surface border border-white/10 rounded-md text-sm 3xl:text-base text-white px-3 py-2 focus:outline-none focus:border-mg-green"
            >
              <option value="auto">
                Auto
              </option>

              <option value="always">
                Always on
              </option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Focus highlight
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Makes the currently selected remote-control item easier to see from across the room.
              </p>
            </div>

            <select
              value={
                remoteSettings.focusStyle
              }
              onChange={(
                event
              ) =>
                updateRemoteSetting(
                  "focusStyle",
                  event.target
                    .value
                )
              }
              aria-label="Remote focus highlight"
              className="w-full sm:w-44 min-h-11 3xl:min-h-12 bg-mg-surface border border-white/10 rounded-md text-sm 3xl:text-base text-white px-3 py-2 focus:outline-none focus:border-mg-green"
            >
              <option value="strong">
                Strong
              </option>

              <option value="standard">
                Standard
              </option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Rewind / fast-forward jump
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Amount moved by the Fire TV rewind and fast-forward buttons.
              </p>
            </div>

            <select
              value={String(
                remoteSettings.seekSeconds
              )}
              onChange={(
                event
              ) =>
                updateRemoteSetting(
                  "seekSeconds",
                  Number(
                    event.target
                      .value
                  )
                )
              }
              aria-label="Remote seek jump"
              className="w-full sm:w-44 min-h-11 3xl:min-h-12 bg-mg-surface border border-white/10 rounded-md text-sm 3xl:text-base text-white px-3 py-2 focus:outline-none focus:border-mg-green"
            >
              <option value="10">
                10 seconds
              </option>

              <option value="20">
                20 seconds
              </option>

              <option value="30">
                30 seconds
              </option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Wrap horizontal rows
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Press Left on the first card or Right on the last card to wrap to the other end.
              </p>
            </div>

            <Toggle
              on={
                remoteSettings.wrapNavigation
              }
              onClick={() =>
                updateRemoteSetting(
                  "wrapNavigation",
                  !remoteSettings.wrapNavigation
                )
              }
              label="Toggle remote row wrapping"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Scroll at navigation edge
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                If there is no focusable item in a direction, move the page instead of leaving the remote stuck.
              </p>
            </div>

            <Toggle
              on={
                remoteSettings.scrollFallback
              }
              onClick={() =>
                updateRemoteSetting(
                  "scrollFallback",
                  !remoteSettings.scrollFallback
                )
              }
              label="Toggle remote edge scrolling"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm 3xl:text-base text-white font-medium">
                Auto-focus new screens
              </p>

              <p className="text-xs 3xl:text-sm text-white/40">
                Automatically place remote focus on new pages, dialogs and player controls.
              </p>
            </div>

            <Toggle
              on={
                remoteSettings.autoFocus
              }
              onClick={() =>
                updateRemoteSetting(
                  "autoFocus",
                  !remoteSettings.autoFocus
                )
              }
              label="Toggle remote auto focus"
            />
          </div>
        </div>

        <div className="border-t border-white/5 p-4 3xl:p-5">
          <div className="grid gap-2 text-xs 3xl:text-sm text-white/50 sm:grid-cols-2">
            <div className="rounded-lg border border-white/5 bg-black/15 p-3">
              <span className="font-semibold text-white/80">
                D-pad
              </span>{" "}
              moves focus around Media God.
            </div>

            <div className="rounded-lg border border-white/5 bg-black/15 p-3">
              <span className="font-semibold text-white/80">
                Select
              </span>{" "}
              activates the focused button or card.
            </div>

            <div className="rounded-lg border border-white/5 bg-black/15 p-3">
              <span className="font-semibold text-white/80">
                Back
              </span>{" "}
              closes overlays first, then returns to Home without falling back to the login page.
            </div>

            <div className="rounded-lg border border-white/5 bg-black/15 p-3">
              <span className="font-semibold text-white/80">
                Play / Pause / Rewind / Fast Forward
              </span>{" "}
              control the active video or radio stream when Fire OS sends those keys to the app.
            </div>
          </div>

          <p className="mt-3 text-[11px] 3xl:text-sm text-white/35">
            The Fire TV Home button is controlled by Fire OS and cannot be captured by the web app.
          </p>

          <button
            type="button"
            onClick={
              resetRemoteSettings
            }
            className="mt-4 min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm 3xl:text-base text-white/75 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />

            Reset TV remote settings
          </button>
        </div>
      </div>

      <div className="mt-6 3xl:mt-8 bg-mg-card border border-white/10 rounded-lg 3xl:rounded-xl p-4 3xl:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 3xl:gap-3">
            <KeyRound className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />

            <h2 className="text-sm 3xl:text-lg font-bold text-white">
              Real-Debrid
            </h2>
          </div>

          {rdChecking ? (
            <span className="inline-flex items-center gap-1.5 text-xs 3xl:text-sm text-white/50">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />

              Checking
            </span>
          ) : rdConnected ? (
            <span className="inline-flex items-center gap-1.5 text-xs 3xl:text-sm font-semibold text-mg-green">
              <ShieldCheck className="w-4 h-4" />

              Connected
            </span>
          ) : (
            <span className="text-xs 3xl:text-sm text-white/40">
              Not connected
            </span>
          )}
        </div>

        <p className="text-xs 3xl:text-sm text-white/45 mb-4">
          Connect your own Real-Debrid account with its device-code login. Media God saves the connection to the currently signed-in app user, so you do not need to paste a private API token.
        </p>

        {rdConnected && (
          <div className="rounded-lg border border-mg-green/20 bg-mg-green/5 p-3 3xl:p-4 mb-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs 3xl:text-sm">
              <span className="inline-flex items-center gap-1 text-mg-green font-semibold">
                <Check className="w-3.5 h-3.5 3xl:w-4 3xl:h-4" />

                Ready to play
              </span>

              {rdStatus
                ?.username && (
                <span className="text-white/60">
                  {
                    rdStatus.username
                  }
                </span>
              )}

              <span className="text-white/50">
                {rdStatus
                  ?.premium
                  ? "Premium"
                  : "Free"}

                {rdStatus
                  ?.expires
                  ? ` · expires ${String(
                      rdStatus.expires
                    ).slice(
                      0,
                      10
                    )}`
                  : ""}
              </span>
            </div>
          </div>
        )}

        {rdStatus
          ?.error &&
          !rdConnected && (
            <p className="mb-4 text-xs 3xl:text-sm text-red-400">
              {
                rdStatus.error
              }
            </p>
          )}

        {deviceFlow ? (
          <div className="rounded-xl border border-mg-green/30 bg-black/20 p-4 3xl:p-6">
            <p className="text-xs 3xl:text-sm font-semibold uppercase tracking-wide text-mg-green mb-2">
              Your Real-Debrid login code
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <div className="flex-1 rounded-lg bg-black/50 border border-white/10 px-4 py-3 3xl:px-5 3xl:py-4 text-center sm:text-left">
                <span className="font-mono text-2xl sm:text-3xl 3xl:text-4xl 4xl:text-5xl tracking-[0.16em] text-white font-bold break-all">
                  {
                    deviceFlow.user_code
                  }
                </span>
              </div>

              <button
                type="button"
                onClick={
                  copyCode
                }
                className="min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm 3xl:text-base"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-mg-green" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}

                {copied
                  ? "Copied"
                  : "Copy code"}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={
                  deviceFlow.verification_url ||
                  "https://real-debrid.com/device"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 bg-mg-green text-black font-semibold text-sm 3xl:text-base px-4 3xl:px-5 py-2.5 rounded-lg hover:bg-mg-green-dim"
              >
                <ExternalLink className="w-4 h-4" />

                Open Real-Debrid
              </a>

              <button
                type="button"
                onClick={() =>
                  pollDevice(
                    true
                  )
                }
                className="min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 border border-white/10 bg-white/5 hover:bg-white/10 text-white text-sm 3xl:text-base px-4 3xl:px-5 py-2.5 rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />

                I authorised it — check now
              </button>
            </div>

            <p className="mt-3 text-[11px] 3xl:text-sm text-white/40">
              Media God is also checking automatically. Keep this screen open until it says Connected.
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {!rdConnected && (
              <button
                type="button"
                onClick={
                  startRdConnect
                }
                disabled={
                  rdStarting ||
                  rdChecking
                }
                className="min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 bg-mg-green text-black font-semibold text-sm 3xl:text-base px-4 3xl:px-5 py-2.5 rounded-lg hover:bg-mg-green-dim disabled:opacity-60"
              >
                {rdStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}

                {rdStarting
                  ? "Getting code…"
                  : "Connect Real-Debrid"}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                checkRd(
                  true
                )
              }
              disabled={
                rdChecking
              }
              className="min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 text-sm 3xl:text-base px-4 3xl:px-5 py-2.5 rounded-lg disabled:opacity-60"
            >
              {rdChecking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}

              Re-check
            </button>

            {rdConnected && (
              <button
                type="button"
                onClick={
                  disconnectRd
                }
                disabled={
                  rdDisconnecting
                }
                className="min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-300 text-sm 3xl:text-base px-4 3xl:px-5 py-2.5 rounded-lg disabled:opacity-60"
              >
                {rdDisconnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlink className="w-4 h-4" />
                )}

                Disconnect
              </button>
            )}
          </div>
        )}
      </div>

      <MultiDebridSettings />

      <button
        type="button"
        onClick={
          save
        }
        disabled={
          saving
        }
        className="mt-6 3xl:mt-8 min-h-11 3xl:min-h-12 inline-flex items-center justify-center gap-2 bg-mg-green text-black font-semibold text-sm 3xl:text-base px-5 3xl:px-6 py-2.5 3xl:py-3 rounded-lg hover:bg-mg-green-dim disabled:opacity-60"
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
