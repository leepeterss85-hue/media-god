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
  Unlink,
  Zap,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import SocialLoginSection from "@/components/mg/SocialLoginSection";

const DEFAULT_PREFERENCES = {
  autoplay: true,
  subs: true,
  quality: "Auto",
};

const unwrapError = (
  error,
  fallback
) =>
  error?.response?.data
    ?.error ||
  error?.message ||
  fallback;

export default function SettingsView() {
  const [
    me,
    setMe,
  ] = useState(null);

  const [
    autoplay,
    setAutoplay,
  ] = useState(
    DEFAULT_PREFERENCES.autoplay
  );

  const [
    subs,
    setSubs,
  ] = useState(
    DEFAULT_PREFERENCES.subs
  );

  const [
    quality,
    setQuality,
  ] = useState(
    DEFAULT_PREFERENCES.quality
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

  const pollTimerRef =
    useRef(null);

  const flowStartedAtRef =
    useRef(0);

  const { toast } =
    useToast();

  /*
   * Load the signed-in Media God
   * user and their saved settings.
   */
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

          setAutoplay(
            preferences.autoplay ??
              DEFAULT_PREFERENCES.autoplay
          );

          setSubs(
            preferences.subs ??
              DEFAULT_PREFERENCES.subs
          );

          setQuality(
            preferences.quality ||
              DEFAULT_PREFERENCES.quality
          );

          return user;
        } catch {
          return null;
        }
      },
      []
    );

  /*
   * Check RD connection.
   *
   * The backend will also refresh
   * the saved access token when
   * necessary.
   */
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

            valid: false,

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

  /*
   * Initial Settings load.
   */
  useEffect(() => {
    let mounted =
      true;

    const load =
      async () => {
        await loadMe();

        if (mounted) {
          await checkRd(
            false
          );
        }
      };

    load();

    return () => {
      mounted = false;
    };
  }, [
    checkRd,
    loadMe,
  ]);

  /*
   * Save general user settings.
   */
  const save =
    async () => {
      try {
        await base44.auth.updateMe(
          {
            preferences: {
              autoplay,
              subs,
              quality,
            },
          }
        );

        await loadMe();

        toast({
          title:
            "Settings saved",

          description:
            "Your settings are saved to your Media God account.",
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
      }
    };

  /*
   * Ask RD for a new device code.
   */
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

  /*
   * Check whether the user has
   * authorised the displayed code.
   */
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
          ) * 1000;

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
          if (manual) {
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

  /*
   * Automatically check RD at the
   * interval returned by RD.
   */
  useEffect(() => {
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
      ) * 1000;

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
  }, [
    deviceFlow
      ?.device_code,

    deviceFlow
      ?.interval,

    pollDevice,
  ]);

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
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={cn(
        "w-11 h-6 3xl:w-14 3xl:h-7 rounded-full transition-colors relative shrink-0",

        on
          ? "bg-mg-green"
          : "bg-white/20"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 3xl:w-6 3xl:h-6 rounded-full bg-black transition-transform",

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
    <div className="w-full max-w-3xl 3xl:max-w-4xl 4xl:max-w-5xl p-4 md:p-6 3xl:p-8 4xl:p-10">
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
            Your preferences and
            Real-Debrid connection
            are saved to this
            Media God user.
          </p>
        </div>
      )}

      <SocialLoginSection />

      <div className="bg-mg-card border border-white/10 rounded-lg 3xl:rounded-xl divide-y divide-white/5">
        <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
          <div>
            <p className="text-sm 3xl:text-base text-white font-medium">
              Autoplay
            </p>

            <p className="text-xs 3xl:text-sm text-white/40">
              Start next episode
              automatically
            </p>
          </div>

          <Toggle
            on={autoplay}
            onClick={() =>
              setAutoplay(
                !autoplay
              )
            }
            label="Toggle autoplay"
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-4 3xl:p-5">
          <div>
            <p className="text-sm 3xl:text-base text-white font-medium">
              Subtitles
            </p>

            <p className="text-xs 3xl:text-sm text-white/40">
              Auto-fetch subtitles
              via OpenSubtitles
            </p>
          </div>

          <Toggle
            on={subs}
            onClick={() =>
              setSubs(
                !subs
              )
            }
            label="Toggle subtitles"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 3xl:p-5">
          <div>
            <p className="text-sm 3xl:text-base text-white font-medium">
              Stream quality
            </p>

            <p className="text-xs 3xl:text-sm text-white/40">
              Default playback
              quality
            </p>
          </div>

          <select
            value={quality}
            onChange={(
              event
            ) =>
              setQuality(
                event.target
                  .value
              )
            }
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
          Connect your own
          Real-Debrid account with
          its device-code login.
          Media God saves the
          connection to the
          currently signed-in app
          user, so you do not need
          to paste a private API
          token.
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
              Your Real-Debrid
              login code
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
                I authorised it —
                check now
              </button>
            </div>

            <p className="mt-3 text-[11px] 3xl:text-sm text-white/40">
              Media God is also
              checking
              automatically.
              Keep this screen
              open until it says
              Connected.
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

      <button
        type="button"
        onClick={save}
        className="mt-6 3xl:mt-8 min-h-11 3xl:min-h-12 bg-mg-green text-black font-semibold text-sm 3xl:text-base px-5 3xl:px-6 py-2.5 3xl:py-3 rounded-lg hover:bg-mg-green-dim"
      >
        Save settings
      </button>
    </div>
  );
}
