import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  ExternalLink,
  Film,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Server,
  Trash2,
  Tv,
  Wifi,
  WifiOff,
} from "lucide-react";

import {
  LIVE_TV_SOURCES,
  PUBLIC_DIRECT_CHANNELS,
  clearFreeTvCache,
  getFreeTvChannels,
  parseFreeTvPlaylist,
} from "@/components/mg/freeTvPlaylist";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import {
  addCustomLiveSource,
  addMediaServer,
  readCustomLiveSources,
  readMediaServers,
  readSourceHealth,
  recordSourceHealth,
  removeCustomLiveSource,
  removeMediaServer,
  sourceRegistryEvent,
  updateCustomLiveSource,
  updateMediaServer,
} from "@/components/mg/sourceRegistry";

const clean = (value) => String(value || "").trim();
const trimSlash = (value) => clean(value).replace(/\/+$/, "");
const TORRENT_HASH_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

const hashFromMagnetOrHash = (value) => {
  const raw = clean(value);
  if (TORRENT_HASH_RE.test(raw)) return raw.toLowerCase();
  const match = raw.match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i);
  return clean(match?.[1]).toLowerCase();
};

const magnetFromValue = (value) => {
  const raw = clean(value);
  if (/^magnet:\?/i.test(raw)) return raw;
  const hash = hashFromMagnetOrHash(raw);
  return hash ? `magnet:?xt=urn:btih:${hash}` : "";
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
};

const serverHeaders = (server) => {
  const headers = {
    Accept: "application/json",
  };

  if (server?.apiKey) {
    if (server.type === "plex") headers["X-Plex-Token"] = server.apiKey;
    else headers["X-Emby-Token"] = server.apiKey;
  }

  return headers;
};

const withKey = (server, url) => {
  if (!server?.apiKey) return url;

  const next = new URL(url);
  next.searchParams.set(
    server.type === "plex" ? "X-Plex-Token" : "api_key",
    server.apiKey
  );
  return next.toString();
};

const jellyfinImage = (server, item) => {
  if (!item?.Id) return "";
  return withKey(
    server,
    `${trimSlash(server.baseUrl)}/Items/${encodeURIComponent(item.Id)}/Images/Primary?maxWidth=500`
  );
};

const normaliseJellyfinResult = (server, item) => ({
  id: String(item?.Id || ""),
  title:
    clean(item?.SeriesName) && item?.Type === "Episode"
      ? `${item.SeriesName} — ${clean(item?.Name) || "Episode"}`
      : clean(item?.Name) || "Untitled",
  subtitle:
    item?.Type === "Episode"
      ? `S${Number(item?.ParentIndexNumber || 0)} E${Number(item?.IndexNumber || 0)}`
      : clean(item?.ProductionYear),
  type: item?.Type === "Episode" ? "episode" : "movie",
  poster: jellyfinImage(server, item),
  raw: item,
  server,
});

const searchJellyfinLike = async (server, query) => {
  const base = trimSlash(server.baseUrl);
  const path = server.userId
    ? `/Users/${encodeURIComponent(server.userId)}/Items`
    : "/Items";
  const url = new URL(`${base}${path}`);

  url.searchParams.set("SearchTerm", query);
  url.searchParams.set("Recursive", "true");
  url.searchParams.set("IncludeItemTypes", "Movie,Episode");
  url.searchParams.set(
    "Fields",
    "Overview,ProductionYear,SeriesName,ParentIndexNumber,IndexNumber,MediaSources"
  );
  url.searchParams.set("Limit", "30");

  if (server.apiKey) url.searchParams.set("api_key", server.apiKey);

  const response = await fetchWithTimeout(url.toString(), {
    headers: serverHeaders(server),
  });

  if (!response.ok) {
    throw new Error(`${server.name} returned ${response.status}`);
  }

  const data = await response.json();
  return (Array.isArray(data?.Items) ? data.Items : []).map((item) =>
    normaliseJellyfinResult(server, item)
  );
};

const plexPoster = (server, item) => {
  const thumb = clean(item?.thumb || item?.art);
  if (!thumb) return "";
  const absolute = thumb.startsWith("http")
    ? thumb
    : `${trimSlash(server.baseUrl)}${thumb}`;
  return withKey(server, absolute);
};

const searchPlex = async (server, query) => {
  const url = new URL(`${trimSlash(server.baseUrl)}/hubs/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "30");
  if (server.apiKey) url.searchParams.set("X-Plex-Token", server.apiKey);

  const response = await fetchWithTimeout(url.toString(), {
    headers: serverHeaders(server),
  });

  if (!response.ok) {
    throw new Error(`${server.name} returned ${response.status}`);
  }

  const data = await response.json();
  const hubs = Array.isArray(data?.MediaContainer?.Hub)
    ? data.MediaContainer.Hub
    : [];

  return hubs.flatMap((hub) =>
    (Array.isArray(hub?.Metadata) ? hub.Metadata : [])
      .filter((item) => item?.type === "movie" || item?.type === "episode")
      .map((item) => ({
        id: String(item?.ratingKey || item?.key || ""),
        title:
          item?.type === "episode" && item?.grandparentTitle
            ? `${item.grandparentTitle} — ${item.title || "Episode"}`
            : clean(item?.title) || "Untitled",
        subtitle:
          item?.type === "episode"
            ? `S${Number(item?.parentIndex || 0)} E${Number(item?.index || 0)}`
            : clean(item?.year),
        type: item?.type === "episode" ? "episode" : "movie",
        poster: plexPoster(server, item),
        raw: item,
        server,
      }))
  );
};

const plexDirectUrl = async (result) => {
  const server = result.server;
  const key = clean(result?.raw?.ratingKey || result?.id);
  if (!key) return "";

  const url = new URL(
    `${trimSlash(server.baseUrl)}/library/metadata/${encodeURIComponent(key)}`
  );
  url.searchParams.set("includeMedia", "1");
  if (server.apiKey) url.searchParams.set("X-Plex-Token", server.apiKey);

  const response = await fetchWithTimeout(url.toString(), {
    headers: serverHeaders(server),
  });
  if (!response.ok) return "";

  const data = await response.json();
  const item = data?.MediaContainer?.Metadata?.[0];
  const part = item?.Media?.[0]?.Part?.[0]?.key;
  if (!part) return "";

  const absolute = String(part).startsWith("http")
    ? String(part)
    : `${trimSlash(server.baseUrl)}${part}`;

  return withKey(server, absolute);
};

const jellyfinDirectUrl = (result) => {
  const server = result.server;
  const id = encodeURIComponent(result.id);
  const url = new URL(`${trimSlash(server.baseUrl)}/Videos/${id}/stream`);
  url.searchParams.set("Static", "true");
  if (server.apiKey) url.searchParams.set("api_key", server.apiKey);
  return url.toString();
};

export default function SourcesView() {
  const player = usePlayer();
  const [liveSources, setLiveSources] = useState(readCustomLiveSources);
  const [servers, setServers] = useState(readMediaServers);
  const [health, setHealth] = useState(readSourceHealth);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testingId, setTestingId] = useState("");
  const [serverTestingId, setServerTestingId] = useState("");
  const [refreshingLive, setRefreshingLive] = useState(false);

  const [sourceForm, setSourceForm] = useState({
    kind: "playlist",
    name: "",
    url: "",
    category: "Custom",
    priority: 85,
  });

  const [serverForm, setServerForm] = useState({
    type: "jellyfin",
    name: "",
    baseUrl: "",
    apiKey: "",
    userId: "",
  });

  const [mediaQuery, setMediaQuery] = useState("");
  const [mediaSearching, setMediaSearching] = useState(false);
  const [mediaResults, setMediaResults] = useState([]);

  const syncRegistry = () => {
    setLiveSources(readCustomLiveSources());
    setServers(readMediaServers());
    setHealth(readSourceHealth());
  };

  useEffect(() => {
    window.addEventListener(sourceRegistryEvent, syncRegistry);
    return () => window.removeEventListener(sourceRegistryEvent, syncRegistry);
  }, []);

  const builtInCount = LIVE_TV_SOURCES.length + PUBLIC_DIRECT_CHANNELS.length;
  const activeCustomCount = liveSources.filter(
    (item) => item.active !== false && item.kind !== "magnet"
  ).length;
  const activeDebridSourceCount = liveSources.filter(
    (item) => item.active !== false && item.kind === "magnet"
  ).length;
  const activeServers = useMemo(
    () => servers.filter((server) => server.active !== false),
    [servers]
  );

  const addLive = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const name = clean(sourceForm.name);
    const rawUrl = clean(sourceForm.url);
    const isDebridSource = sourceForm.kind === "magnet";
    const resolvedUrl = isDebridSource ? magnetFromValue(rawUrl) : rawUrl;

    if (!name) {
      setError("Enter a source name.");
      return;
    }

    if (isDebridSource) {
      if (!resolvedUrl) {
        setError("Enter a valid magnet link or torrent hash.");
        return;
      }
    } else if (!/^https?:\/\//i.test(resolvedUrl)) {
      setError("Enter a valid http/https URL.");
      return;
    }

    addCustomLiveSource({
      ...sourceForm,
      url: resolvedUrl,
      category: isDebridSource ? clean(sourceForm.category) || "Debrid" : sourceForm.category,
    });
    clearFreeTvCache();
    setSourceForm({
      kind: "playlist",
      name: "",
      url: "",
      category: "Custom",
      priority: 85,
    });
    setMessage(
      isDebridSource
        ? "Debrid source added. Media God will check it across every connected debrid service when you play or test it."
        : "Live source added. It will be merged into Live TV."
    );
  };

  const testLiveSource = async (source) => {
    setTestingId(source.id);
    setError("");
    setMessage("");
    const startedAt = Date.now();

    try {
      if (source.kind === "magnet") {
        const hash = hashFromMagnetOrHash(source.url);
        if (!hash) throw new Error("Invalid torrent hash or magnet link");
        if (!player?.hasDebrid) {
          throw new Error("Connect a debrid service in Settings first");
        }

        const response = await base44.functions.invoke("multiDebrid", {
          action: "check_cache",
          hashes: [hash],
        });
        const data = response?.data ?? response ?? {};
        const provider = clean(data?.bestProviderByHash?.[hash]);
        const checked = Array.isArray(data?.providersChecked)
          ? data.providersChecked.length
          : 0;

        recordSourceHealth(source.id, {
          success: Boolean(provider),
          loaded: provider ? 1 : 0,
          latencyMs: Date.now() - startedAt,
          error: provider ? "" : "Not cached on connected debrid services",
        });

        if (!provider) {
          throw new Error(
            `Not cached on the ${checked || "connected"} debrid service${checked === 1 ? "" : "s"} checked`
          );
        }

        setMessage(`${source.name} is cached · ${provider} selected by Combined Debrid.`);
        return;
      }

      const hlsLike = /\.m3u8?(?:[?#]|$)/i.test(source.url);
      const needsBody = source.kind === "playlist" || hlsLike;
      const response = await fetchWithTimeout(
        source.url,
        {
          method: needsBody ? "GET" : "HEAD",
          cache: "no-store",
          headers: {
            Accept: "application/vnd.apple.mpegurl,text/plain,*/*",
          },
        },
        9000
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      let loaded = 1;

      if (needsBody) {
        const text = await response.text();
        if (source.kind === "playlist") {
          loaded = parseFreeTvPlaylist(text, source).length;
          if (!loaded) throw new Error("No playable channels found");
        } else if (!/#EXTM3U/i.test(text)) {
          throw new Error("The URL did not return an HLS playlist");
        }
      }

      recordSourceHealth(source.id, {
        success: true,
        loaded,
        latencyMs: Date.now() - startedAt,
      });
      setMessage(`${source.name} is reachable${loaded > 1 ? ` · ${loaded} channels` : ""}.`);
    } catch (testError) {
      recordSourceHealth(source.id, {
        success: false,
        error: testError?.message || "Source test failed",
        latencyMs: Date.now() - startedAt,
      });
      setError(
        `${source.name}: ${testError?.message || "test failed"}. A browser CORS block can also cause this even when a source works in another player.`
      );
    } finally {
      setTestingId("");
      syncRegistry();
    }
  };

  const refreshLive = async () => {
    setRefreshingLive(true);
    setError("");
    setMessage("");

    try {
      clearFreeTvCache();
      const result = await getFreeTvChannels({ force: true });
      setMessage(
        `Live TV refreshed · ${Number(result?.dedupedCount || 0)} playable channels from ${Number(
          result?.sourceStatus?.length || 0
        )} playlist sources plus direct fallbacks.`
      );
    } catch (refreshError) {
      setError(refreshError?.message || "Could not refresh Live TV sources.");
    } finally {
      setRefreshingLive(false);
      syncRegistry();
    }
  };

  const addServer = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!clean(serverForm.name) || !/^https?:\/\//i.test(clean(serverForm.baseUrl))) {
      setError("Enter a server name and a valid http/https server address.");
      return;
    }

    addMediaServer(serverForm);
    setServerForm({
      type: "jellyfin",
      name: "",
      baseUrl: "",
      apiKey: "",
      userId: "",
    });
    setMessage("Personal media server saved on this device.");
  };

  const testServer = async (server) => {
    setServerTestingId(server.id);
    setError("");
    setMessage("");

    try {
      const base = trimSlash(server.baseUrl);
      const url =
        server.type === "plex"
          ? withKey(server, `${base}/identity`)
          : `${base}/System/Info/Public`;
      const response = await fetchWithTimeout(url, {
        headers: serverHeaders(server),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setMessage(`${server.name} is reachable.`);
    } catch (serverError) {
      setError(
        `${server.name}: ${serverError?.message || "connection failed"}. LAN servers may need CORS enabled for the Media God WebView.`
      );
    } finally {
      setServerTestingId("");
    }
  };

  const searchPersonalMedia = async (event) => {
    event?.preventDefault?.();
    const query = clean(mediaQuery);
    if (query.length < 2) return;

    setMediaSearching(true);
    setMediaResults([]);
    setError("");
    setMessage("");

    try {
      const settled = await Promise.allSettled(
        activeServers.map((server) =>
          server.type === "plex"
            ? searchPlex(server, query)
            : searchJellyfinLike(server, query)
        )
      );

      const results = settled.flatMap((item) =>
        item.status === "fulfilled" ? item.value : []
      );

      setMediaResults(results.slice(0, 60));

      if (!results.length) {
        setMessage("No personal-server results found. Check the server connection and user/API details.");
      }
    } finally {
      setMediaSearching(false);
    }
  };

  const playPersonalResult = async (result) => {
    setError("");
    setMessage("");

    try {
      const url =
        result.server.type === "plex"
          ? await plexDirectUrl(result)
          : jellyfinDirectUrl(result);

      if (!url) throw new Error("The server did not expose a direct media part");

      player.play({
        id: `personal:${result.server.id}:${result.id}`,
        title: result.title,
        poster: result.poster || "",
        mediaType: "movie",
        type: "movie",
        noRd: true,
        skipRdLookup: true,
        skipAddonLookup: true,
        allowNonPlaybackFallback: false,
        sources: [
          {
            label: `${result.server.name} · Direct`,
            type: "url",
            src: url,
            url,
          },
        ],
      });
    } catch (playError) {
      setError(playError?.message || "Could not start the personal-server item.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 3xl:max-w-7xl 3xl:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-mg-green" />
            <h1 className="text-xl font-bold text-white 3xl:text-2xl">Sources</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-white/45">
            Add your own Live TV playlists/direct feeds and personal Plex, Jellyfin or Emby servers. Custom credentials stay in this device&apos;s local storage.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshLive}
          disabled={refreshingLive}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshingLive ? "animate-spin" : ""}`} />
          Refresh Live TV
        </button>
      </div>

      {(message || error) && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-red-500/25 bg-red-500/10 text-red-200"
              : "border-mg-green/25 bg-mg-green/10 text-mg-green"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-mg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-white">
                <Tv className="h-4 w-4 text-mg-green" />
                Live TV sources
              </h2>
              <p className="mt-1 text-xs text-white/40">
                {builtInCount} built-in free/public source entries · {activeCustomCount} custom active
              </p>
            </div>
          </div>

          <form onSubmit={addLive} className="mt-4 grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={sourceForm.kind}
                onChange={(event) =>
                  setSourceForm((current) => ({ ...current, kind: event.target.value }))
                }
                className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white"
              >
                <option value="playlist">M3U / M3U8 playlist</option>
                <option value="direct">Direct channel URL</option>
              </select>

              <input
                type="number"
                min="1"
                max="150"
                value={sourceForm.priority}
                onChange={(event) =>
                  setSourceForm((current) => ({ ...current, priority: event.target.value }))
                }
                className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white"
                placeholder="Priority"
              />
            </div>

            <input
              value={sourceForm.name}
              onChange={(event) =>
                setSourceForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Source / channel name"
              className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white placeholder:text-white/25"
            />

            <input
              value={sourceForm.url}
              onChange={(event) =>
                setSourceForm((current) => ({ ...current, url: event.target.value }))
              }
              placeholder="https://…/playlist.m3u or direct stream URL"
              className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white placeholder:text-white/25"
            />

            <div className="flex gap-2">
              <input
                value={sourceForm.category}
                onChange={(event) =>
                  setSourceForm((current) => ({ ...current, category: event.target.value }))
                }
                placeholder="Category"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white"
              />
              <button className="flex min-h-11 items-center gap-2 rounded-lg bg-mg-green px-4 text-sm font-bold text-black">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </form>

          <div className="mt-4 grid gap-2">
            {liveSources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/35">
                No custom Live TV sources yet. Built-in sources still work normally.
              </div>
            ) : (
              liveSources.map((source) => {
                const itemHealth = health[source.id];
                return (
                  <div key={source.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-mg-green/10 p-2 text-mg-green">
                        {source.kind === "playlist" ? <Radio className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{source.name}</p>
                          <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase text-white/40">
                            {source.kind}
                          </span>
                          <label className="flex items-center gap-1 text-[10px] text-white/35">
                            Priority
                            <input
                              type="number"
                              min="1"
                              max="150"
                              value={source.priority}
                              onChange={(event) =>
                                updateCustomLiveSource(source.id, {
                                  priority: Number(event.target.value || 85),
                                })
                              }
                              className="h-7 w-14 rounded border border-white/10 bg-black/30 px-1.5 text-[10px] text-white"
                              aria-label={`Priority for ${source.name}`}
                            />
                          </label>
                        </div>
                        <p className="mt-1 truncate text-xs text-white/35">{source.url}</p>
                        {itemHealth?.lastCheckedAt && (
                          <p className="mt-1 text-[10px] text-white/35">
                            {itemHealth.lastError
                              ? `Last test failed · ${itemHealth.lastError}`
                              : `Healthy · ${Number(itemHealth.lastLatencyMs || 0)} ms${itemHealth.loaded ? ` · ${itemHealth.loaded} loaded` : ""}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateCustomLiveSource(source.id, { active: source.active === false })}
                        className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${
                          source.active === false
                            ? "border-white/10 bg-white/5 text-white/50"
                            : "border-mg-green/30 bg-mg-green/10 text-mg-green"
                        }`}
                      >
                        {source.active === false ? "Disabled" : "Enabled"}
                      </button>
                      <button
                        type="button"
                        onClick={() => testLiveSource(source)}
                        disabled={testingId === source.id}
                        className="min-h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {testingId === source.id ? "Testing…" : "Test"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeCustomLiveSource(source.id);
                          clearFreeTvCache();
                        }}
                        className="ml-auto flex min-h-9 items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-xs font-semibold text-red-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-mg-card p-4 sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-white">
              <Server className="h-4 w-4 text-mg-green" />
              Personal media servers
            </h2>
            <p className="mt-1 text-xs text-white/40">
              Plex, Jellyfin and Emby. LAN servers may need browser/CORS access enabled.
            </p>
          </div>

          <form onSubmit={addServer} className="mt-4 grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={serverForm.type}
                onChange={(event) =>
                  setServerForm((current) => ({ ...current, type: event.target.value }))
                }
                className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white"
              >
                <option value="jellyfin">Jellyfin</option>
                <option value="emby">Emby</option>
                <option value="plex">Plex</option>
              </select>
              <input
                value={serverForm.name}
                onChange={(event) =>
                  setServerForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Server name"
                className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white"
              />
            </div>

            <input
              value={serverForm.baseUrl}
              onChange={(event) =>
                setServerForm((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder="http://192.168.1.20:8096"
              className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white placeholder:text-white/25"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                value={serverForm.apiKey}
                onChange={(event) =>
                  setServerForm((current) => ({ ...current, apiKey: event.target.value }))
                }
                placeholder="API key / Plex token"
                className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white placeholder:text-white/25"
              />
              <input
                value={serverForm.userId}
                onChange={(event) =>
                  setServerForm((current) => ({ ...current, userId: event.target.value }))
                }
                placeholder="User ID (Jellyfin/Emby)"
                className="min-h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white placeholder:text-white/25"
              />
            </div>

            <button className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-mg-green px-4 text-sm font-bold text-black">
              <Plus className="h-4 w-4" /> Save server
            </button>
          </form>

          <div className="mt-4 grid gap-2">
            {servers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/35">
                No personal servers configured.
              </div>
            ) : (
              servers.map((server) => (
                <div key={server.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-mg-green/10 p-2 text-mg-green">
                      <Server className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{server.name}</p>
                        <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase text-white/40">
                          {server.type}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-white/35">{server.baseUrl}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateMediaServer(server.id, { active: server.active === false })}
                      className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${
                        server.active === false
                          ? "border-white/10 bg-white/5 text-white/50"
                          : "border-mg-green/30 bg-mg-green/10 text-mg-green"
                      }`}
                    >
                      {server.active === false ? "Disabled" : "Enabled"}
                    </button>
                    <button
                      type="button"
                      onClick={() => testServer(server)}
                      disabled={serverTestingId === server.id}
                      className="min-h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {serverTestingId === server.id ? "Testing…" : "Test"}
                    </button>
                    <a
                      href={server.baseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-9 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                    <button
                      type="button"
                      onClick={() => removeMediaServer(server.id)}
                      className="ml-auto flex min-h-9 items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-xs font-semibold text-red-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-white/10 bg-mg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-white">
              <Film className="h-4 w-4 text-mg-green" />
              Search personal media
            </h2>
            <p className="mt-1 text-xs text-white/40">
              Searches every enabled personal server and sends a direct result into the normal Media God player.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            {activeServers.length > 0 ? (
              <Wifi className="h-4 w-4 text-mg-green" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            {activeServers.length} enabled server{activeServers.length === 1 ? "" : "s"}
          </div>
        </div>

        <form onSubmit={searchPersonalMedia} className="mt-4 flex gap-2">
          <input
            value={mediaQuery}
            onChange={(event) => setMediaQuery(event.target.value)}
            placeholder="Search your Plex / Jellyfin / Emby libraries…"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-4 text-sm text-white placeholder:text-white/25"
          />
          <button
            disabled={mediaSearching || activeServers.length === 0 || mediaQuery.trim().length < 2}
            className="min-h-12 rounded-xl bg-mg-green px-5 text-sm font-bold text-black disabled:opacity-40"
          >
            {mediaSearching ? "Searching…" : "Search"}
          </button>
        </form>

        {mediaResults.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mediaResults.map((result, index) => (
              <button
                key={`${result.server.id}:${result.id}:${index}`}
                type="button"
                onClick={() => playPersonalResult(result)}
                className="group flex min-h-20 items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-mg-green/35 focus:outline-none focus:ring-2 focus:ring-mg-green"
              >
                <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-white/5">
                  {result.poster ? (
                    <img src={result.poster} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Film className="h-4 w-4 text-white/30" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{result.title}</p>
                  <p className="mt-1 truncate text-xs text-white/40">
                    {result.server.name}{result.subtitle ? ` · ${result.subtitle}` : ""}
                  </p>
                </div>
                <Play className="h-4 w-4 shrink-0 text-mg-green" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-mg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-bold text-white">
          <CheckCircle2 className="h-4 w-4 text-mg-green" />
          Built-in free/public fallbacks
        </h2>
        <p className="mt-1 text-xs text-white/40">
          These are shipped as fallback inputs. Playlist deduplication means the same channel still appears only once when several sources contain it.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LIVE_TV_SOURCES.map((source) => (
            <div key={source.id} className="rounded-lg border border-white/8 bg-black/15 p-3">
              <p className="truncate text-xs font-semibold text-white">{source.name}</p>
              <p className="mt-1 truncate text-[10px] text-white/30">{source.url}</p>
            </div>
          ))}
          {PUBLIC_DIRECT_CHANNELS.map((channel) => (
            <div key={channel.id} className="rounded-lg border border-white/8 bg-black/15 p-3">
              <p className="truncate text-xs font-semibold text-white">{channel.name}</p>
              <p className="mt-1 truncate text-[10px] text-white/30">{channel.url}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
