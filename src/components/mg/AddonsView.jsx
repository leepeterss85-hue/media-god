import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import { base44 } from "@/api/base44Client";

const unwrap = (response) =>
  response?.data ??
  response ??
  {};

const clean = (value) =>
  String(
    value ||
    ""
  ).trim();

const AIOSTREAMS_CONFIGURE_URL =
  "https://aiostreams.elfhosted.com/stremio/configure";

const normaliseManifestUrl = (
  value
) => {
  let raw = clean(value);

  if (!raw) {
    return "";
  }

  if (/^stremio:\/\//i.test(raw)) {
    raw = raw.replace(/^stremio:\/\//i, "https://");
  } else if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  try {
    const parsed = new URL(raw);
    parsed.hash = "";

    let path = parsed.pathname.replace(/\/+$/, "");

    if (/\/configure$/i.test(path)) {
      path = path.replace(/\/configure$/i, "");
    }

    if (!/\/manifest\.json$/i.test(path)) {
      path = `${path}/manifest.json`;
    }

    parsed.pathname = path.replace(/\/{2,}/g, "/");

    return parsed.toString();
  } catch {
    return raw;
  }
};

const isElfHostedAioStreams = (value) => {
  try {
    const parsed = new URL(normaliseManifestUrl(value));
    return /(^|\.)aiostreams\.elfhosted\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
};

const isBareAioStreamsManifest = (value) => {
  try {
    const parsed = new URL(normaliseManifestUrl(value));

    if (!/(^|\.)aiostreams\.elfhosted\.com$/i.test(parsed.hostname)) {
      return false;
    }

    const parts = parsed.pathname
      .split("/")
      .filter(Boolean);
    const stremioIndex = parts.findIndex(
      (part) => part.toLowerCase() === "stremio"
    );
    const afterStremio =
      stremioIndex >= 0
        ? parts.slice(stremioIndex + 1)
        : parts;
    const configParts = afterStremio.filter(
      (part) => part.toLowerCase() !== "manifest.json"
    );

    return configParts.length === 0;
  } catch {
    return false;
  }
};

const displayManifestUrl = (value) => {
  const raw = clean(value);

  if (!raw || !isElfHostedAioStreams(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const stremioIndex = parts.findIndex(
      (part) => part.toLowerCase() === "stremio"
    );

    if (stremioIndex >= 0) {
      for (let index = stremioIndex + 1; index < parts.length; index += 1) {
        if (parts[index].toLowerCase() !== "manifest.json") {
          parts[index] = "••••";
        }
      }

      parsed.pathname = `/${parts.join("/")}`;
    }

    if (parsed.search) {
      parsed.search = "?configured=hidden";
    }

    return parsed.toString();
  } catch {
    return "Configured AIOStreams manifest";
  }
};

export default function AddonsManager() {
  const [
    addons,
    setAddons,
  ] =
    useState(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    newName,
    setNewName,
  ] =
    useState(
      ""
    );

  const [
    newUrl,
    setNewUrl,
  ] =
    useState(
      ""
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      ""
    );

  const [
    testing,
    setTesting,
  ] =
    useState(
      false
    );

  const [
    mutating,
    setMutating,
  ] =
    useState(
      false
    );

  const [
    health,
    setHealth,
  ] =
    useState(
      []
    );

  const loadAddons =
    async () => {
      setLoading(
        true
      );

      setError(
        ""
      );

      try {
        const list =
          await base44.entities.Addon.list(
            "-created_date",
            100
          );

        setAddons(
          list ||
          []
        );
      } catch {
        setError(
          "Failed to load configured addons from Base44."
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  useEffect(() => {
    loadAddons();
  }, []);

  const activeCount =
    useMemo(
      () =>
        addons.filter(
          (addon) =>
            addon?.active !==
              false &&
            addon?.installed !==
              false
        ).length,
      [
        addons,
      ]
    );

  const healthByName =
    useMemo(
      () => {
        const map =
          new Map();

        health.forEach(
          (item) => {
            const key =
              clean(
                item?.name
              ).toLowerCase();

            if (key) {
              map.set(
                key,
                item
              );
            }
          }
        );

        return map;
      },
      [
        health,
      ]
    );

  const handleAdd =
    async (
      event
    ) => {
      event.preventDefault();

      const name =
        clean(
          newName
        );

      const rawUrl =
        clean(
          newUrl
        );

      const url =
        normaliseManifestUrl(
          rawUrl
        );

      setError(
        ""
      );

      setMessage(
        ""
      );

      if (
        !name ||
        !url
      ) {
        setError(
          "Enter both an addon name and manifest URL."
        );

        return;
      }

      if (
        !/^https:\/\//i.test(
          url
        )
      ) {
        setError(
          "Use an HTTPS manifest URL or a Stremio install URL."
        );

        return;
      }

      if (
        isElfHostedAioStreams(rawUrl) &&
        (/\/configure(?:[/?#]|$)/i.test(rawUrl) ||
          isBareAioStreamsManifest(url))
      ) {
        setError(
          "AIOStreams needs your generated configured manifest. Open Configure AIOStreams, save the profile, then paste the generated install/manifest URL here — not the bare configure URL."
        );

        return;
      }

      if (
        addons.some(
          (addon) =>
            normaliseManifestUrl(addon?.url) === url
        )
      ) {
        setError(
          "That addon manifest is already configured."
        );
        return;
      }

      if (mutating) {
        return;
      }

      setMutating(true);
      setHealth([]);

      try {
        const created = await base44.entities.Addon.create(
          {
            name,

            url,

            active:
              true,

            installed:
              true,
          }
        );

        if (created?.id) {
          setAddons((current) => [
            created,
            ...current.filter((addon) => addon?.id !== created.id),
          ]);
        } else {
          await loadAddons();
        }

        setNewName(
          ""
        );

        setNewUrl(
          ""
        );

        setMessage(
          "Addon saved. Use Test active to confirm the manifest is reachable."
        );

      } catch {
        setError(
          "Failed to add the addon."
        );
      } finally {
        setMutating(false);
      }
    };

  const toggleActive =
    async (
      addon
    ) => {
      setError(
        ""
      );

      setMessage(
        ""
      );

      if (mutating) {
        return;
      }

      setMutating(true);
      setHealth([]);

      try {
        const nextActive =
          addon?.active ===
            false ||
          addon?.installed ===
            false;

        const updated = await base44.entities.Addon.update(
          addon.id,
          {
            active:
              nextActive,

            installed:
              nextActive,
          }
        );

        setAddons((current) =>
          current.map((item) =>
            item?.id === addon.id
              ? {
                  ...item,
                  ...(updated || {}),
                  active: nextActive,
                  installed: nextActive,
                }
              : item
          )
        );
      } catch {
        setError(
          "Failed to update the addon status."
        );
      } finally {
        setMutating(false);
      }
    };

  const deleteAddon =
    async (
      id
    ) => {
      setError(
        ""
      );

      setMessage(
        ""
      );

      if (mutating) {
        return;
      }

      setMutating(true);
      setHealth([]);

      try {
        await base44.entities.Addon.delete(
          id
        );

        setAddons((current) =>
          current.filter((addon) => addon?.id !== id)
        );
      } catch {
        setError(
          "Failed to delete the addon."
        );
      } finally {
        setMutating(false);
      }
    };

  const testActiveAddons =
    async () => {
      setTesting(
        true
      );

      setError(
        ""
      );

      setMessage(
        ""
      );

      setHealth(
        []
      );

      try {
        const response =
          await base44.functions.invoke(
            "fetchAddonStreams",
            {
              action:
                "health",
            }
          );

        const data =
          unwrap(
            response
          );

        const diagnostics =
          Array.isArray(
            data?.diagnostics
          )
            ? data.diagnostics
            : [];

        setHealth(
          diagnostics
        );

        if (
          Number(
            data?.addons_checked ||
              0
          ) ===
          0
        ) {
          setMessage(
            "No active playback addons are configured."
          );
        } else {
          const working =
            diagnostics.filter(
              (item) =>
                item?.status ===
                "ok"
            ).length;

          setMessage(
            `Tested ${Number(
              data?.addons_checked ||
                0
            )} active addon${
              Number(
                data?.addons_checked ||
                  0
              ) ===
              1
                ? ""
                : "s"
            }. ${working} responded successfully.`
          );
        }
      } catch (testError) {
        setError(
          testError?.message ||
            "Addon health check failed."
        );
      } finally {
        setTesting(
          false
        );
      }
    };

  const healthBadge =
    (
      addon
    ) => {
      const item =
        healthByName.get(
          clean(
            addon?.name
          ).toLowerCase()
        );

      if (!item) {
        return null;
      }

      if (
        item?.status ===
        "ok"
      ) {
        return (
          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-950/50 px-2 py-0.5 rounded-full border border-green-800">
            <CheckCircle2 className="w-3 h-3" />

            Reachable
          </span>
        );
      }

      return (
        <span
          className="flex items-center gap-1 text-xs text-amber-300 bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-900/50"
          title={
            item?.message ||
            item?.status
          }
        >
          <CircleHelp className="w-3 h-3" />

          {
            item?.status ||
            "Problem"
          }
        </span>
      );
    };

  return (
    <div data-mg-addons-view="true" className="p-4 sm:p-6 max-w-4xl mx-auto text-white space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Streaming Addons
          </h1>

          <p className="text-sm text-gray-400 mt-1">
            Manage Stremio-compatible manifests that you are authorised to use.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={
              testActiveAddons
            }
            disabled={
              testing || loading || mutating
            }
            className="flex min-h-11 items-center gap-2 px-3 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-60 rounded-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}

            Test active
          </button>

          <button
            type="button"
            onClick={
              loadAddons
            }
            disabled={loading || testing || mutating}
            className="flex min-h-11 items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 rounded-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
          >
            <RefreshCw className="w-4 h-4" />

            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-sm text-gray-300">
        <p>
          Media God now uses only addons actually saved here. It no longer creates hidden/default addon records automatically.
        </p>

        <p className="text-xs text-gray-500 mt-1">
          Active:{" "}
          {
            activeCount
          }{" "}
          of{" "}
          {
            addons.length
          }
          . Real-Debrid credentials are not inserted into addon URLs by Media God.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm">
          {
            error
          }
        </div>
      )}

      {message && (
        <div role="status" aria-live="polite" className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-gray-300">
          {
            message
          }
        </div>
      )}

      <div className="rounded-xl border border-sky-900/60 bg-sky-950/20 p-4 space-y-3">
        <div>
          <h2 className="text-md font-semibold text-white">
            AIOStreams (optional)
          </h2>

          <p className="text-xs text-gray-400 mt-1">
            AIOStreams can combine additional Stremio-compatible sources into one configured manifest. Configure it first, then add the generated manifest below. Media God will not save the bare public manifest as a source.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={AIOSTREAMS_CONFIGURE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <ExternalLink className="w-4 h-4" />
            Configure AIOStreams
          </a>

          <button
            type="button"
            onClick={() => {
              setNewName("AIOStreams");
              setError("");
              setMessage(
                "Paste the configured AIOStreams manifest/install URL into the manifest field below."
              );
            }}
            className="min-h-11 rounded-lg border border-sky-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-sky-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Add configured manifest
          </button>
        </div>

        <p className="text-[11px] text-gray-500">
          Configured AIOStreams URLs can contain private profile information, so Media God hides those path values when displaying the saved addon.
        </p>
      </div>

      <form
        onSubmit={
          handleAdd
        }
        className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-4"
      >
        <div>
          <h2 className="text-md font-semibold">
            Add Custom Addon
          </h2>

          <p className="text-xs text-gray-500 mt-1">
            Enter a Stremio-compatible HTTPS manifest URL for a service you are authorised to access.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Addon name"
            value={
              newName
            }
            onChange={(
              event
            ) =>
              setNewName(
                event.target.value
              )
            }
            aria-label="Addon name"
            disabled={mutating}
            className="min-h-11 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30 disabled:opacity-60"
          />

          <input
            type="text"
            placeholder="https://…/manifest.json or stremio://…"
            value={
              newUrl
            }
            onChange={(
              event
            ) =>
              setNewUrl(
                event.target.value
              )
            }
            aria-label="Addon manifest URL"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={mutating}
            className="min-h-11 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30 disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={mutating || !clean(newName) || !clean(newUrl)}
          className="flex min-h-11 items-center justify-center gap-2 w-full py-2 bg-green-600 hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50 font-semibold rounded-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
        >
          <Plus className="w-4 h-4" />

          Add Addon
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="text-md font-semibold">
          Configured Addons (
          {
            addons.length
          }
          )
        </h2>

        {loading ? (
          <div className="text-sm text-gray-500 py-4 text-center">
            Loading addons...
          </div>
        ) : addons.length ===
          0 ? (
          <div className="text-sm text-gray-500 py-6 text-center bg-zinc-900 rounded-xl border border-zinc-800">
            No addons are configured yet.
          </div>
        ) : (
          addons.map(
            (addon) => {
              const isActive =
                addon?.active !==
                  false &&
                addon?.installed !==
                  false;

              const healthItem =
                healthByName.get(
                  clean(
                    addon?.name
                  ).toLowerCase()
                );

              return (
                <div
                  key={
                    addon.id
                  }
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">
                        {
                          addon?.name ||
                          "Addon"
                        }
                      </span>

                      {isActive ? (
                        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-950/50 px-2 py-0.5 rounded-full border border-green-800">
                          <CheckCircle2 className="w-3 h-3" />

                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-400 bg-zinc-800 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" />

                          Disabled
                        </span>
                      )}

                      {
                        healthBadge(
                          addon
                        )
                      }
                    </div>

                    {addon?.description && (
                      <p className="text-xs text-gray-400">
                        {addon.description}
                      </p>
                    )}

                    <p className="text-xs text-gray-500 break-all">
                      {
                        displayManifestUrl(addon?.url)
                      }
                    </p>

                    {healthItem?.message && (
                      <p className="text-[11px] text-gray-500">
                        {
                          healthItem.message
                        }
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        toggleActive(
                          addon
                        )
                      }
                      disabled={mutating}
                      aria-pressed={isActive}
                      className={`min-h-10 px-3 py-1.5 rounded-lg text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green disabled:opacity-50 ${
                        isActive
                          ? "bg-zinc-800 hover:bg-zinc-700 text-gray-300"
                          : "bg-green-600 hover:bg-green-500 text-white"
                      }`}
                    >
                      {isActive
                        ? "Disable"
                        : "Enable"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        deleteAddon(
                          addon.id
                        )
                      }
                      disabled={mutating}
                      className="min-h-10 min-w-10 p-1.5 bg-red-950/40 hover:bg-red-900 border border-red-900/50 text-red-400 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                      title="Delete Addon"
                      aria-label={`Delete ${
                        addon?.name ||
                        "addon"
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            }
          )
        )}
      </div>
    </div>
  );
}
