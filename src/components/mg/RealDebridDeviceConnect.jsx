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
import { withGuestDebridPayload } from "@/components/mg/guestDebridDevice";

const clean = (value) =>
  String(value ?? "").trim();

const unwrap = (response) =>
  response?.data ?? response ?? {};

const errorText = (error, fallback) =>
  clean(
    error?.response?.data?.error ||
      error?.message ||
      fallback
  );

const RD_DEVICE_URL =
  "https://real-debrid.com/device";

export default function RealDebridDeviceConnect({
  compact = false,
}) {
  const [status, setStatus] =
    useState(null);
  const [deviceFlow, setDeviceFlow] =
    useState(null);
  const [checking, setChecking] =
    useState(false);
  const [starting, setStarting] =
    useState(false);
  const [disconnecting, setDisconnecting] =
    useState(false);
  const [copied, setCopied] =
    useState(false);
  const [message, setMessage] =
    useState("");
  const [error, setError] =
    useState("");

  const flowStartedAtRef =
    useRef(0);
  const timerRef =
    useRef(null);

  const connected = Boolean(
    status?.connected ||
      status?.valid
  );

  const clearTimer = useCallback(() => {
    if (
      timerRef.current != null
    ) {
      window.clearTimeout(
        timerRef.current
      );
      timerRef.current =
        null;
    }
  }, []);

  const loadStatus = useCallback(
    async ({
      quiet = true,
    } = {}) => {
      setChecking(true);

      try {
        const response =
          await base44.functions.invoke(
            "realDebridAuth",
            withGuestDebridPayload({
              action:
                "status",
            })
          );

        const next =
          unwrap(response);

        setStatus(next);

        if (
          !quiet &&
          !next?.connected
        ) {
          setMessage(
            "Real-Debrid is not connected yet."
          );
        }

        return next;
      } catch (statusError) {
        const text =
          errorText(
            statusError,
            "Could not check Real-Debrid."
          );

        setStatus({
          connected:
            false,
          valid:
            false,
        });

        if (!quiet) {
          setError(text);
        }

        return null;
      } finally {
        setChecking(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadStatus();
  }, [
    loadStatus,
  ]);

  const finishConnected =
    useCallback(
      (nextStatus) => {
        clearTimer();
        setDeviceFlow(null);
        setStatus(
          nextStatus
        );
        setError("");
        setMessage(
          "Real-Debrid linked successfully."
        );

        if (
          typeof window !==
          "undefined"
        ) {
          window.dispatchEvent(
            new CustomEvent(
              "mg:real-debrid-connected"
            )
          );
        }
      },
      [
        clearTimer,
      ]
    );

  const pollDevice =
    useCallback(
      async ({
        manual = false,
        flow = deviceFlow,
      } = {}) => {
        const deviceCode =
          clean(
            flow
              ?.device_code
          );

        if (!deviceCode) {
          return false;
        }

        const expiresMs =
          Math.max(
            60,
            Number(
              flow?.expires_in ||
                1800
            )
          ) *
          1000;

        if (
          flowStartedAtRef.current &&
          Date.now() -
            flowStartedAtRef.current >
            expiresMs
        ) {
          clearTimer();
          setDeviceFlow(
            null
          );
          setError(
            "That Real-Debrid code expired. Choose Get 8-digit code for a new one."
          );
          return false;
        }

        try {
          const response =
            await base44.functions.invoke(
              "realDebridAuth",
              withGuestDebridPayload({
                action:
                  "poll_device",
                device_code:
                  deviceCode,
              })
            );

          const data =
            unwrap(
              response
            );

          if (
            data?.connected
          ) {
            finishConnected(
              data
            );
            return true;
          }

          if (
            manual &&
            data?.pending
          ) {
            setMessage(
              "Still waiting. Enter the 8-digit code at Real-Debrid, approve Media God, then check again."
            );
          }
        } catch (pollError) {
          if (manual) {
            setError(
              errorText(
                pollError,
                "Could not confirm the Real-Debrid login."
              )
            );
          }
        }

        return false;
      },
      [
        clearTimer,
        deviceFlow,
        finishConnected,
      ]
    );

  useEffect(() => {
    clearTimer();

    if (
      !deviceFlow?.device_code
    ) {
      return undefined;
    }

    let cancelled =
      false;

    const schedule =
      () => {
        const delay =
          Math.max(
            5,
            Number(
              deviceFlow
                ?.interval ||
                5
            )
          ) *
          1000;

        timerRef.current =
          window.setTimeout(
            async () => {
              if (cancelled) {
                return;
              }

              const done =
                await pollDevice({
                  flow:
                    deviceFlow,
                });

              if (
                !done &&
                !cancelled
              ) {
                schedule();
              }
            },
            delay
          );
      };

    schedule();

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [
    clearTimer,
    deviceFlow,
    pollDevice,
  ]);

  useEffect(
    () => () =>
      clearTimer(),
    [
      clearTimer,
    ]
  );

  const startConnect =
    async () => {
      clearTimer();
      setStarting(true);
      setDeviceFlow(null);
      setCopied(false);
      setMessage("");
      setError("");

      try {
        const response =
          await base44.functions.invoke(
            "realDebridAuth",
            withGuestDebridPayload({
              action:
                "start_device",
            })
          );

        const data =
          unwrap(
            response
          );

        if (
          !data?.device_code ||
          !data?.user_code
        ) {
          throw new Error(
            data?.error ||
              "Real-Debrid did not return a device login code."
          );
        }

        flowStartedAtRef.current =
          Date.now();

        setDeviceFlow(
          data
        );

        setMessage(
          "Enter this 8-digit code on the Real-Debrid device page. Media God will link automatically after approval."
        );
      } catch (startError) {
        setError(
          errorText(
            startError,
            "Could not start Real-Debrid login."
          )
        );
      } finally {
        setStarting(
          false
        );
      }
    };

  const copyCode =
    async () => {
      const code =
        clean(
          deviceFlow
            ?.user_code
        );

      if (!code) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          code
        );
        setCopied(true);
        window.setTimeout(
          () =>
            setCopied(
              false
            ),
          1500
        );
      } catch {
        setError(
          "The code could not be copied on this device. You can still type it into Real-Debrid."
        );
      }
    };

  const disconnect =
    async () => {
      if (
        disconnecting
      ) {
        return;
      }

      setDisconnecting(
        true
      );
      setError("");
      setMessage("");

      try {
        await base44.functions.invoke(
          "realDebridAuth",
          withGuestDebridPayload({
            action:
              "disconnect",
          })
        );

        clearTimer();
        setStatus({
          connected:
            false,
          valid:
            false,
        });
        setDeviceFlow(
          null
        );
        setMessage(
          "Real-Debrid disconnected."
        );
      } catch (disconnectError) {
        setError(
          errorText(
            disconnectError,
            "Could not disconnect Real-Debrid."
          )
        );
      } finally {
        setDisconnecting(
          false
        );
      }
    };

  return (
    <section
      data-mg-real-debrid-device-connect="true"
      className={
        compact
          ? "rounded-xl border border-mg-green/25 bg-mg-green/[0.06] p-4"
          : "rounded-xl border border-mg-green/25 bg-mg-card p-4 3xl:p-6"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-white 3xl:text-lg">
            <KeyRound className="h-4 w-4 text-mg-green 3xl:h-5 3xl:w-5" />
            Real-Debrid 8-digit device login
          </h2>

          <p className="mt-1 max-w-2xl text-xs leading-5 text-white/50 3xl:text-sm">
            Link your own Real-Debrid account without signing in to Media God or pasting an API token. Get the code here, enter it at Real-Debrid, and Media God remembers the approved connection for this device.
          </p>
        </div>

        {checking ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-white/45">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking
          </span>
        ) : connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-mg-green/25 bg-mg-green/10 px-2.5 py-1 text-xs font-bold text-mg-green">
            <ShieldCheck className="h-3.5 w-3.5" />
            Connected
          </span>
        ) : (
          <span className="text-xs text-white/40">
            Not connected
          </span>
        )}
      </div>

      {deviceFlow ? (
        <div className="mt-4 rounded-xl border border-mg-green/30 bg-black/25 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-mg-green">
            Your 8-digit Real-Debrid code
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-center sm:text-left">
              <span
                data-mg-real-debrid-user-code="true"
                className="break-all font-mono text-2xl font-bold tracking-[0.16em] text-white sm:text-3xl 3xl:text-4xl"
              >
                {deviceFlow.user_code}
              </span>
            </div>

            <button
              type="button"
              onClick={
                copyCode
              }
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
            >
              {copied ? (
                <Check className="h-4 w-4 text-mg-green" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied
                ? "Copied"
                : "Copy code"}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <a
              href={
                deviceFlow.verification_url ||
                RD_DEVICE_URL
              }
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-mg-green px-4 py-2 text-sm font-bold text-black hover:bg-mg-green-dim"
            >
              <ExternalLink className="h-4 w-4" />
              Open Real-Debrid device page
            </a>

            <button
              type="button"
              onClick={() =>
                pollDevice({
                  manual:
                    true,
                })
              }
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4" />
              I approved it — check now
            </button>
          </div>

          <p className="mt-3 text-[11px] leading-4 text-white/40 3xl:text-sm">
            Keep this page open after entering the code. Media God checks automatically and changes to Connected when Real-Debrid approves it.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {!connected && (
            <button
              type="button"
              onClick={
                startConnect
              }
              disabled={
                starting ||
                checking
              }
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-mg-green px-4 py-2 text-sm font-bold text-black hover:bg-mg-green-dim disabled:opacity-50"
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {starting
                ? "Getting code…"
                : "Get 8-digit code"}
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              loadStatus({
                quiet:
                  false,
              })
            }
            disabled={
              checking
            }
            className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Re-check connection
          </button>

          {connected && (
            <button
              type="button"
              onClick={
                disconnect
              }
              disabled={
                disconnecting
              }
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              {disconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
              Disconnect
            </button>
          )}
        </div>
      )}

      {connected &&
        !deviceFlow && (
        <p className="mt-3 text-xs font-semibold text-mg-green">
          {status?.username
            ? `Linked as ${status.username}`
            : "Real-Debrid is linked and ready."}
        </p>
      )}

      {message && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-xs leading-5 text-white/55"
        >
          {message}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs leading-5 text-red-300"
        >
          {error}
        </p>
      )}
    </section>
  );
}
