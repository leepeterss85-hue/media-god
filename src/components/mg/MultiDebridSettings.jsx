import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const PROVIDERS = [
  {
    key: "alldebrid",
    name: "AllDebrid",
    help: "Paste your AllDebrid API key.",
  },
  {
    key: "torbox",
    name: "TorBox",
    help: "Paste the API token from your TorBox account settings.",
  },
  {
    key: "premiumize",
    name: "Premiumize.me",
    help: "Paste your Premiumize API key or OAuth access token.",
  },
  {
    key: "debridlink",
    name: "Debrid-Link",
    help: "Paste the API key generated in your Debrid-Link account.",
  },
];

const unwrapError = (error, fallback) =>
  error?.response?.data?.error || error?.message || fallback;

export default function MultiDebridSettings() {
  const [statuses, setStatuses] = useState([]);
  const [priority, setPriority] = useState([]);
  const [tokens, setTokens] = useState({});
  const [dirty, setDirty] = useState({});
  const [enabled, setEnabled] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  const statusByKey = useMemo(() => {
    const map = new Map();
    statuses.forEach((item) => {
      if (item?.key) map.set(item.key, item);
    });
    return map;
  }, [statuses]);

  const loadStatus = useCallback(
    async (showToast = false) => {
      setTesting(true);

      try {
        const response = await base44.functions.invoke("multiDebrid", {
          action: "status",
        });

        const data = response?.data ?? response ?? {};
        const nextStatuses = Array.isArray(data?.providers)
          ? data.providers
          : [];

        setStatuses(nextStatuses);
        setPriority(Array.isArray(data?.priority) ? data.priority : []);
        setEnabled(
          new Set(
            nextStatuses
              .filter((item) => item?.enabled && item?.key !== "realdebrid")
              .map((item) => item.key)
          )
        );

        if (showToast) {
          const configured = nextStatuses.filter(
            (item) => item?.configured && item?.valid
          ).length;

          toast({
            title: "Debrid providers checked",
            description: `${configured} provider${configured === 1 ? " is" : "s are"} ready.`,
          });
        }
      } catch (error) {
        if (showToast) {
          toast({
            title: "Could not check debrid providers",
            description: unwrapError(error, "Please try again."),
            variant: "destructive",
          });
        }
      } finally {
        setLoading(false);
        setTesting(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadStatus(false);
  }, [loadStatus]);

  const toggleEnabled = (key) => {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const movePriority = (key, direction) => {
    setPriority((current) => {
      const base = [
        ...current,
        "realdebrid",
        "torbox",
        "alldebrid",
        "premiumize",
        "debridlink",
      ].filter((item, index, list) => list.indexOf(item) === index);

      const index = base.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= base.length) return base;

      const next = [...base];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveProviders = async () => {
    setSaving(true);

    try {
      const tokenPatch = {};
      PROVIDERS.forEach(({ key }) => {
        if (dirty[key]) tokenPatch[key] = String(tokens[key] || "").trim();
      });

      await base44.functions.invoke("multiDebrid", {
        action: "save_tokens",
        tokens: tokenPatch,
        enabledProviders: Array.from(enabled),
        priority,
      });

      setTokens({});
      setDirty({});
      await loadStatus(false);
      window.dispatchEvent(new CustomEvent("mg:debrid-providers-changed"));

      toast({
        title: "Debrid providers saved",
        description:
          "Media God will use the enabled provider tokens during cache checks and playback resolution.",
      });
    } catch (error) {
      toast({
        title: "Could not save debrid providers",
        description: unwrapError(error, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const clearProvider = async (key) => {
    setSaving(true);

    try {
      const nextEnabled = new Set(enabled);
      nextEnabled.delete(key);

      await base44.functions.invoke("multiDebrid", {
        action: "save_tokens",
        tokens: { [key]: "" },
        enabledProviders: Array.from(nextEnabled),
        priority,
      });

      setEnabled(nextEnabled);
      setTokens((current) => ({ ...current, [key]: "" }));
      setDirty((current) => ({ ...current, [key]: false }));
      await loadStatus(false);
      window.dispatchEvent(new CustomEvent("mg:debrid-providers-changed"));

      toast({
        title: "Provider disconnected",
        description: "The saved token was removed from this Media God user.",
      });
    } catch (error) {
      toast({
        title: "Could not disconnect provider",
        description: unwrapError(error, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const orderedProviders = useMemo(() => {
    const order = [
      ...priority,
      "realdebrid",
      "torbox",
      "alldebrid",
      "premiumize",
      "debridlink",
    ].filter((item, index, list) => list.indexOf(item) === index);

    return PROVIDERS.map((provider) => ({
      ...provider,
      order: order.indexOf(provider.key),
    })).sort((a, b) => a.order - b.order);
  }, [priority]);

  return (
    <div className="mt-6 3xl:mt-8 rounded-lg 3xl:rounded-xl border border-white/10 bg-mg-card p-4 3xl:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 3xl:gap-3">
          <ShieldCheck className="h-4 w-4 3xl:h-5 3xl:w-5 text-mg-green" />
          <h2 className="text-sm 3xl:text-lg font-bold text-white">
            Additional Debrid Providers
          </h2>
        </div>

        <button
          type="button"
          onClick={() => loadStatus(true)}
          disabled={testing || saving}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs 3xl:text-sm text-white/75 hover:bg-white/10 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Test connections
        </button>
      </div>

      <p className="mt-2 text-xs 3xl:text-sm text-white/45">
        Real-Debrid keeps its device-code connection above. Add any other debrid accounts you use here. Tokens are stored on the signed-in Media God user and are read by the backend when checking cache or resolving a stream.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-white/45">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading providers…
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {orderedProviders.map((provider) => {
            const status = statusByKey.get(provider.key) || {};
            const configured = Boolean(status?.configured);
            const valid = Boolean(status?.valid);
            const isEnabled = enabled.has(provider.key);

            return (
              <div
                key={provider.key}
                className="rounded-xl border border-white/10 bg-black/20 p-3 3xl:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{provider.name}</h3>
                      {configured ? (
                        valid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] 3xl:text-xs font-semibold text-mg-green">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] 3xl:text-xs font-semibold text-red-300">
                            <XCircle className="h-3.5 w-3.5" />
                            Token failed
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] 3xl:text-xs text-white/35">
                          Not configured
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-[11px] 3xl:text-sm text-white/40">
                      {provider.help}
                    </p>

                    {status?.username && (
                      <p className="mt-1 text-[10px] 3xl:text-xs text-white/50">
                        {status.username}
                      </p>
                    )}

                    {status?.error && (
                      <p className="mt-1 text-[10px] 3xl:text-xs text-red-300/80">
                        {status.error}
                      </p>
                    )}
                  </div>

                  <label className="flex shrink-0 items-center gap-2 text-xs text-white/65">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleEnabled(provider.key)}
                      disabled={!configured && !dirty[provider.key]}
                      className="h-4 w-4 accent-[var(--mg-green)]"
                    />
                    Enabled
                  </label>
                </div>

                <div className="mt-3 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      value={tokens[provider.key] || ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setTokens((current) => ({ ...current, [provider.key]: value }));
                        setDirty((current) => ({ ...current, [provider.key]: true }));
                        if (value.trim()) {
                          setEnabled((current) => new Set([...current, provider.key]));
                        }
                      }}
                      placeholder={configured ? "Saved token — enter a new one to replace" : "API token"}
                      autoComplete="off"
                      className="min-h-11 w-full rounded-lg border border-white/10 bg-black/35 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-mg-green/60"
                    />
                  </div>

                  {configured && (
                    <button
                      type="button"
                      onClick={() => clearProvider(provider.key)}
                      disabled={saving}
                      title={`Disconnect ${provider.name}`}
                      className="inline-flex min-h-11 w-11 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] 3xl:text-xs text-white/35">
                    Priority position {Math.max(1, provider.order + 1)}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => movePriority(provider.key, -1)}
                      className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10"
                    >
                      Higher
                    </button>
                    <button
                      type="button"
                      onClick={() => movePriority(provider.key, 1)}
                      className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10"
                    >
                      Lower
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={saveProviders}
        disabled={saving || loading}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-mg-green px-4 py-2.5 text-sm font-semibold text-black hover:bg-mg-green-dim disabled:opacity-60 3xl:min-h-12 3xl:text-base"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? "Saving…" : "Save debrid providers"}
      </button>
    </div>
  );
}
