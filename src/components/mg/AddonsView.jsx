import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  CircleHelp,
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

const normaliseManifestUrl = (
  value
) => {
  const url =
    clean(
      value
    ).replace(
      /\/+$/,
      ""
    );

  if (!url) {
    return "";
  }

  if (
    /\/manifest\.json(?:\?.*)?$/i.test(
      url
    )
  ) {
    return url;
  }

  return `${url}/manifest.json`;
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

      const url =
        normaliseManifestUrl(
          newUrl
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
          "Use an HTTPS manifest URL."
        );

        return;
      }

      try {
        await base44.entities.Addon.create(
          {
            name,

            url,

            active:
              true,

            installed:
              true,
          }
        );

        setNewName(
          ""
        );

        setNewUrl(
          ""
        );

        setMessage(
          "Addon saved. Use Test active to confirm the manifest is reachable."
        );

        await loadAddons();
      } catch {
        setError(
          "Failed to add the addon."
        );
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

      try {
        const nextActive =
          addon?.active ===
            false ||
          addon?.installed ===
            false;

        await base44.entities.Addon.update(
          addon.id,
          {
            active:
              nextActive,

            installed:
              nextActive,
          }
        );

        await loadAddons();
      } catch {
        setError(
          "Failed to update the addon status."
        );
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

      try {
        await base44.entities.Addon.delete(
          id
        );

        await loadAddons();
      } catch {
        setError(
          "Failed to delete the addon."
        );
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
    <div className="p-6 max-w-4xl mx-auto text-white space-y-6">
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
              testing
            }
            className="flex items-center gap-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-60 rounded-lg text-sm transition"
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
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition"
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
        <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm">
          {
            error
          }
        </div>
      )}

      {message && (
        <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-gray-300">
          {
            message
          }
        </div>
      )}

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
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-green-500"
          />

          <input
            type="text"
            placeholder="https://example.com/manifest.json"
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
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-green-500"
          />
        </div>

        <button
          type="submit"
          className="flex items-center justify-center gap-2 w-full py-2 bg-green-600 hover:bg-green-500 font-semibold rounded-lg text-sm transition"
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

                    <p className="text-xs text-gray-400 break-all">
                      {
                        addon?.url
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
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
                      className="p-1.5 bg-red-950/40 hover:bg-red-900 border border-red-900/50 text-red-400 rounded-lg transition"
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
