import React, {
  useEffect,
  useMemo,
  useRef,
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
import RealDebridDeviceConnect from "@/components/mg/RealDebridDeviceConnect";
import { OPTIONAL_SCRAPER_PILOTS, isOptionalScraperPilot, isBareOptionalPilotManifest, redactOptionalPilotManifest, buildOrionTorrentOnlyManifest } from "@/components/mg/optionalScraperPilots.js";

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

const COMET_CONFIGURE_URL =
  "https://comet.elfhosted.com/configure";

const MEDIAFUSION_CONFIGURE_URL =
  "https://mediafusion.elfhosted.com/configure";

const JACKETTIO_CONFIGURE_URL =
  "https://jackettio.elfhosted.com/configure";

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

const manifestHostIsPrivate = (value) => {
  try {
    const parsed =
      new URL(
        normaliseManifestUrl(
          value
        )
      );

    const host =
      String(
        parsed.hostname ||
        ""
      )
        .toLowerCase()
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .replace(/\.$/, "");

    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".lan") ||
      host.endsWith(".internal")
    ) {
      return true;
    }

    const ipv4 =
      host.match(
        /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
      );

    if (ipv4) {
      const parts =
        ipv4
          .slice(1)
          .map(Number);

      if (
        parts.some(
          (part) =>
            !Number.isInteger(
              part
            ) ||
            part < 0 ||
            part > 255
        )
      ) {
        return true;
      }

      const [
        a,
        b,
      ] = parts;

      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (
          a === 100 &&
          b >= 64 &&
          b <= 127
        ) ||
        (
          a === 169 &&
          b === 254
        ) ||
        (
          a === 172 &&
          b >= 16 &&
          b <= 31
        ) ||
        (
          a === 192 &&
          b === 168
        ) ||
        a >= 224
      );
    }

    if (
      host.includes(":")
    ) {
      return (
        host === "::" ||
        host === "::1" ||
        /^f[cd]/i.test(
          host
        ) ||
        /^fe[89ab]/i.test(
          host
        ) ||
        /^ff/i.test(
          host
        )
      );
    }

    return false;
  } catch {
    return true;
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

const isElfHostedComet = (value) => {
  try {
    const parsed = new URL(normaliseManifestUrl(value));
    return /(^|\.)comet\.elfhosted\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
};

const isBareCometManifest = (value) => {
  try {
    const parsed = new URL(normaliseManifestUrl(value));

    if (!/(^|\.)comet\.elfhosted\.com$/i.test(parsed.hostname)) {
      return false;
    }

    return /^\/manifest\.json\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
};

const isElfHostedJackettio = (value) => {
  try {
    const parsed = new URL(normaliseManifestUrl(value));
    return parsed.hostname.toLowerCase() === "jackettio.elfhosted.com";
  } catch {
    return false;
  }
};

const isBareJackettioManifest = (value) => {
  try {
    const parsed = new URL(normaliseManifestUrl(value));
    return isElfHostedJackettio(value) &&
      /^\/manifest\.json\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
};

const isElfHostedMediaFusion = (value) => {
  try {
    const parsed = new URL(normaliseManifestUrl(value));

    return /(^|\.)mediafusion\.elfhosted\.com$/i.test(
      parsed.hostname
    );
  } catch {
    return false;
  }
};

const displayManifestUrl = (value, name = "") => {
  const pilotDisplay = redactOptionalPilotManifest(name, value);
  if (pilotDisplay !== null) return pilotDisplay;
  const raw = clean(value);

  if (!raw) {
    return raw;
  }

  if (isElfHostedJackettio(raw)) {
    return "https://jackettio.elfhosted.com/[configured]/manifest.json";
  }

  if (isElfHostedComet(raw) && !isBareCometManifest(raw)) {
    try {
      const parsed = new URL(normaliseManifestUrl(raw));
      return `${parsed.origin}/[configured]/manifest.json`;
    } catch {
      return "Configured Comet manifest";
    }
  }

  if (isElfHostedMediaFusion(raw)) {
    try {
      const parsed = new URL(normaliseManifestUrl(raw));
      return `${parsed.origin}/[encrypted-profile]/manifest.json`;
    } catch {
      return "Configured MediaFusion manifest";
    }
  }

  if (!isElfHostedAioStreams(raw)) {
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

  const [orionRdChecking, setOrionRdChecking] = useState(false);
  const [orionRdResult, setOrionRdResult] = useState(null);

  const [
    mutating,
    setMutating,
  ] =
    useState(
      false
    );

  const [
    configuringMediaFusion,
    setConfiguringMediaFusion,
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

  const autoHealthCheckedRef = useRef(false);

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

  const autoConfigureMediaFusion =
    async () => {
      if (
        mutating ||
        configuringMediaFusion
      ) {
        return;
      }

      setError(
        ""
      );

      setMessage(
        ""
      );

      setHealth(
        []
      );

      setMutating(
        true
      );

      setConfiguringMediaFusion(
        true
      );

      try {
        const response =
          await base44.functions.invoke(
            "configureMediaFusion",
            {
              action:
                "configure",
            }
          );

        const data =
          unwrap(
            response
          );

        if (
          !data?.configured
        ) {
          throw new Error(
            data?.error ||
              "MediaFusion did not complete configuration."
          );
        }

        await loadAddons();

        setMessage(
          data?.message ||
            "MediaFusion is configured and active."
        );
      } catch (errorValue) {
        const detail =
          clean(
            errorValue?.response?.data?.error ||
            errorValue?.data?.error ||
            errorValue?.message
          );

        setError(
          detail ||
            "Could not auto-configure MediaFusion. Make sure Real-Debrid is connected in Settings."
        );
      } finally {
        setConfiguringMediaFusion(
          false
        );

        setMutating(
          false
        );
      }
    };

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
        manifestHostIsPrivate(
          url
        )
      ) {
        setError(
          "Addon manifest URLs must use a public HTTPS host. Local and private-network addresses are blocked."
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
        isElfHostedComet(rawUrl) &&
        (/\/configure(?:[/?#]|$)/i.test(rawUrl) ||
          isBareCometManifest(url))
      ) {
        setError(
          "Comet needs its generated configured manifest. Open Configure Comet, add your debrid service, use Copy Link, then paste that generated manifest URL here — not the bare public manifest."
        );

        return;
      }

      if (
        isElfHostedJackettio(rawUrl) &&
        (/\/configure(?:[/?#]|$)/i.test(rawUrl) ||
          isBareJackettioManifest(url))
      ) {
        setError(
          "Jackettio needs your own configured manifest. Open Configure Jackettio, choose its indexers and debrid settings, then use Copy Link. The public manifest alone does not provide your personalised episode sources."
        );
        return;
      }

      if (isBareOptionalPilotManifest(name, url)) {
        setError("This is the unconfigured public manifest. Configure the provider with your own account first, then copy its generated install/manifest URL.");
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

            // New pilot candidates are saved OFF, so they cannot change
            // working Fire TV / phone autoplay until explicitly enabled.
            active: !isOptionalScraperPilot(name),

            installed: true,
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
          isOptionalScraperPilot(name)
            ? "Test candidate saved disabled. Use Test candidate to check its manifest before enabling. Nothing has changed in autoplay."
            : "Addon saved. Use Test active to confirm the manifest is reachable."
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

  const createTorrentOnlyOrionTest = async (addon) => {
    if (!addon?.id || mutating || testing) return;
    setError("");
    setMessage("");
    let converted;
    try {
      converted = buildOrionTorrentOnlyManifest(addon.url);
    } catch {
      setError("Orion's saved configuration cannot be converted safely. Reopen Orion Configure, select 'Torrents only', then add the generated manifest manually.");
      return;
    }
    if (!converted) {
      setMessage("This Orion addon already uses torrent-only results. Use Test candidate, then Enable to test it.");
      return;
    }
    if (addons.some(item => normaliseManifestUrl(item?.url) === normaliseManifestUrl(converted))) {
      setMessage("Torrent-only Orion is already saved. Disable the previous Orion entry and test the existing candidate.");
      return;
    }

    setMutating(true);
    setHealth([]);
    try {
      // Keep the original configured profile (and its credentials) saved.
      // Disable the upstream resolver before adding a new OFF test candidate.
      await base44.entities.Addon.update(addon.id, { active: false });
      const indexes = addons.map(row => /^orion(?:[ _-]?(\d+))?$/i.exec(clean(row?.name)))
        .filter(Boolean).map(match => Number(match[1] || 1));
      const nextName = "Orion" + (Math.max(2, ...indexes) + 1);
      await base44.entities.Addon.create({
        name: nextName,
        url: converted,
        active: false,
        installed: true,
        description: "Experimental Orion torrent-only results. Resolve hashes using Media God's existing Real-Debrid connection.",
      });
      await loadAddons();
      setMessage("Created a disabled Orion torrent-only test candidate and disabled the original Orion debrid-video feed. Test candidate, then enable only when ready. Normal sources and Live TV are unchanged.");
    } catch {
      await loadAddons();
      setError("Could not complete the Orion test setup. Check whether the old Orion is disabled before testing.");
    } finally {
      setMutating(false);
    }
  };

  // Read-only check. Never copy an Orion configuration or a Real-Debrid
  // token into the request/diagnostic; authentication remains per app user.
  const checkOrionRealDebrid = async () => {
    if (orionRdChecking) return;
    setOrionRdChecking(true);
    setOrionRdResult(null);
    try {
      const response = await base44.functions.invoke("realDebridAuth", {
        action: "status",
      });
      const status = unwrap(response);
      if (status?.connected !== true || status?.valid === false) {
        setOrionRdResult({
          healthy: false,
          text: "Media God cannot confirm this device/account is connected to Real-Debrid. Reconnect through Settings → Real-Debrid, then test another source.",
        });
      } else if (status?.premium !== true) {
        setOrionRdResult({
          healthy: false,
          text: "Real-Debrid is connected but a premium subscription was not confirmed. Check your subscription in Settings; Orion torrent mode cannot guarantee playable links.",
        });
      } else {
        setOrionRdResult({
          healthy: true,
          text: "Real-Debrid login and premium status are valid. If a source still says 'info failed: 404', the selected torrent information is unavailable. Avoid retrying the same hash; try a different source. This connection check does not verify individual torrents.",
        });
      }
    } catch {
      setOrionRdResult({
        healthy: false,
        text: "Could not check Real-Debrid on this account or device. Check Settings → Real-Debrid. No playback settings were changed.",
      });
    } finally {
      setOrionRdChecking(false);
    }
  };

  const testCandidateAddon = async (addon) => {
    if (!addon?.id || testing || mutating) return;
    setTesting(true);
    setError("");
    setMessage("");
    setHealth([]);
    try {
      const response = await base44.functions.invoke("testScraperCandidate", {
        candidate_addon_id: addon.id,
      });
      const data = unwrap(response);
      const report = Array.isArray(data?.diagnostics) ? data.diagnostics : [];
      setHealth(report);
      const result = report[0];
      setMessage(result?.status === "ok"
        ? "Manifest responded and advertises streams. This does not prove a playable English source; keep the candidate disabled until tested on a real device."
        : result?.message || "Candidate manifest did not pass the health check.");
    } catch {
      setError("Candidate health check failed. The working scrapers were not changed.");
    } finally {
      setTesting(false);
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

  useEffect(() => {
    if (loading || activeCount === 0 || autoHealthCheckedRef.current) {
      return;
    }

    autoHealthCheckedRef.current = true;
    testActiveAddons();
    // Run once after the saved addon list is loaded. Manual Test active remains
    // available for subsequent checks without repeatedly hitting providers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeCount]);

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

      if (
        item?.status === "configuration_required"
      ) {
        return (
          <span
            className="flex items-center gap-1 text-xs text-amber-300 bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-900/50"
            title={item?.message || "Configuration required"}
          >
            <CircleHelp className="w-3 h-3" />
            Needs config
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

      <RealDebridDeviceConnect compact />

      <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-sm text-gray-300">
        <p>
          Media God uses your saved addons plus one built-in credential-free public discovery fallback, so movies and TV episodes can still find source candidates when this account has no saved addon records. The fallback is not stored in your account and contains no debrid credentials.
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
          . Raw Real-Debrid credentials are never shown in addon URLs. MediaFusion receives the token only when you choose auto-configure and returns an encrypted profile URL.
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

      <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-4 space-y-3" data-mg-jackettio-setup="true">
        <div>
          <h2 className="text-md font-semibold text-white">Jackettio (optional)</h2>
          <p className="mt-1 text-xs text-gray-400">
            Configure the public Jackettio instance with indexers and your own debrid access, then add the generated HTTPS manifest. Jackettio has its own rate limits, and a working manifest does not guarantee a playable episode. Your existing add-ons keep working.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={JACKETTIO_CONFIGURE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            <ExternalLink className="h-4 w-4" />
            Configure Jackettio
          </a>
          <button
            type="button"
            onClick={() => {
              setNewName("Jackettio");
              setNewUrl("");
              setError("");
              setMessage("After configuring Jackettio, select Copy Link on its setup page, paste the generated manifest below and press Add Addon. Never paste your raw Real-Debrid key here.");
              document.getElementById("mg-addon-manifest-url")?.focus();
            }}
            className="min-h-11 rounded-lg border border-indigo-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-indigo-200 hover:bg-zinc-800"
          >
            Add configured Jackettio
          </button>
        </div>
        <p className="text-[11px] text-gray-500">
          Media God hides saved Jackettio profile paths. Configure your personal debrid connection on Jackettio itself, not in the addon name or URL fields.
        </p>
      </div>

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

      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 space-y-3">
        <div>
          <h2 className="text-md font-semibold text-white">
            MediaFusion (optional)
          </h2>

          <p className="text-xs text-gray-400 mt-1">
            Media God can create a MediaFusion profile automatically from the Real-Debrid connection already saved to your account. Your raw token is handled server-side and is never shown in this screen.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={
              autoConfigureMediaFusion
            }
            disabled={
              mutating ||
              configuringMediaFusion
            }
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {
              configuringMediaFusion
                ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )
                : (
                    <Plus className="w-4 h-4" />
                  )
            }

            {
              configuringMediaFusion
                ? "Configuring MediaFusion…"
                : "Auto-configure with Real-Debrid"
            }
          </button>

          <a
            href={
              MEDIAFUSION_CONFIGURE_URL
            }
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ExternalLink className="w-4 h-4" />
            Open MediaFusion manually
          </a>
        </div>

        <p className="text-[11px] text-gray-500">
          Auto-configure sends your existing Real-Debrid token to MediaFusion over HTTPS only after you press the button. MediaFusion returns an encrypted profile path; Media God stores that encrypted manifest and hides it on this screen.
        </p>
      </div>

      <div className="rounded-xl border border-violet-900/60 bg-violet-950/20 p-4 space-y-3">
        <div>
          <h2 className="text-md font-semibold text-white">
            Comet (optional)
          </h2>

          <p className="text-xs text-gray-400 mt-1">
            The bare public Comet manifest can identify the addon but its stream lookup is rejected from Media God. Configure Comet with your debrid service first, then paste the generated manifest URL here.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={COMET_CONFIGURE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <ExternalLink className="w-4 h-4" />
            Configure Comet
          </a>

          <button
            type="button"
            onClick={() => {
              setNewName("Comet");
              setError("");
              setMessage(
                "Paste the configured Comet manifest/install URL into the manifest field below."
              );
            }}
            className="min-h-11 rounded-lg border border-violet-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-violet-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            Add configured manifest
          </button>
        </div>

        <p className="text-[11px] text-gray-500">
          Media God hides configured Comet path values on this screen because they can include private service configuration.
        </p>
      </div>

      <section data-mg-optional-scraper-pilots="true" className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-4 space-y-3">
        <div>
          <h2 className="text-md font-semibold text-white">New scraper candidates — optional testing</h2>
          <p className="mt-1 text-xs text-gray-400">These are not installed automatically. Add a configured manifest to your own account, saved disabled by default. Test its manifest before enabling; no changes are made to the existing player, automatic source order or Live TV.</p>
        </div>
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 space-y-2" data-mg-orion-rd-diagnostics="true">
          <p className="text-xs text-amber-100">Orion torrent test failing with “info failed: 404”? That comes from Real-Debrid's torrent-information lookup, not the addon manifest. The source may have an expired/missing torrent ID or unavailable download. Check your own Real-Debrid connection separately before retrying.</p>
          <button type="button" onClick={checkOrionRealDebrid} disabled={orionRdChecking}
            className="min-h-10 rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">
            {orionRdChecking ? "Checking Real-Debrid…" : "Check my Real-Debrid connection"}
          </button>
          {orionRdResult && (
            <p role="status" className={`text-xs ${orionRdResult.healthy ? "text-green-300" : "text-amber-200"}`}>
              {orionRdResult.text}
            </p>
          )}
        </div>
        {OPTIONAL_SCRAPER_PILOTS.map((pilot) => (
          <div key={pilot.name} className="rounded-lg border border-blue-900/50 bg-zinc-950/40 p-3 space-y-2">
            <div className="font-medium text-sm text-white">{pilot.name}</div>
            <p className="text-xs text-gray-400">{pilot.description}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a href={pilot.configureUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                <ExternalLink className="h-4 w-4" /> Configure {pilot.name}
              </a>
              <button type="button" onClick={() => {
                setNewName(pilot.name);
                setNewUrl("");
                setError("");
                setMessage(`Copy the configured ${pilot.name} manifest URL from its provider page into the form below. It will be saved disabled until you test it.`);
                document.getElementById("mg-addon-manifest-url")?.focus();
              }} className="min-h-10 rounded-lg border border-blue-900 px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-zinc-800">
                Add disabled test candidate
              </button>
            </div>
          </div>
        ))}
      </section>

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
            id="mg-addon-manifest-url"
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
                        displayManifestUrl(addon?.url, addon?.name)
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

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {isOptionalScraperPilot(addon?.name) && (
                      <button type="button" onClick={() => testCandidateAddon(addon)} disabled={mutating || testing} className="min-h-10 rounded-lg border border-blue-800 bg-blue-950/50 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-900/60 disabled:opacity-50">
                        Test candidate
                      </button>
                    )}
                    {/^\s*orion(?:[ _-]?\d+)?\s*$/i.test(clean(addon?.name)) && (
                      <button type="button" data-mg-orion-torrent-mode="true"
                        onClick={() => createTorrentOnlyOrionTest(addon)}
                        disabled={mutating || testing}
                        className="min-h-10 rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/50 disabled:opacity-50"
                        title="Keep this Orion configuration as a disabled backup, and create a separate torrent-only test that uses your existing Media God Real-Debrid connection."
                      >
                        Try Orion torrent mode
                      </button>
                    )}
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
