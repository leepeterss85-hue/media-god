import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  ExternalLink,
  Film,
  Globe2,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Trophy,
  Tv,
  Wifi,
} from "lucide-react";

import {
  getFreeTvChannels,
} from "@/components/mg/freeTvPlaylist";

import {
  usePlayer,
} from "@/components/mg/PlayerProvider";

import { cn } from "@/lib/utils";

const DEFAULT_FILTER = "All";
const MAX_VISIBLE = 400;

const searchText = (value) =>
  String(value || "")
    .toLowerCase()
    .trim();

const groupSort = (a, b) => {
  if (a === "United Kingdom") {
    return -1;
  }

  if (b === "United Kingdom") {
    return 1;
  }

  if (a === "Sports") {
    return -1;
  }

  if (b === "Sports") {
    return 1;
  }

  if (a === "Movies") {
    return -1;
  }

  if (b === "Movies") {
    return 1;
  }

  return String(a || "").localeCompare(
    String(b || "")
  );
};

const qualityLabel = (channel) => {
  const quality = Number(
    channel?.quality || 0
  );

  if (quality >= 2160) {
    return "4K";
  }

  if (quality >= 1080) {
    return "1080p";
  }

  if (quality >= 720) {
    return "HD";
  }

  if (quality >= 576) {
    return "576p";
  }

  if (quality > 0) {
    return "SD";
  }

  return "";
};

export default function LiveTVView() {
  const [
    channels,
    setChannels,
  ] = useState([]);

  const [
    sourceStatus,
    setSourceStatus,
  ] = useState([]);

  const [
    rawCount,
    setRawCount,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    group,
    setGroup,
  ] = useState(DEFAULT_FILTER);

  const [
    quickFilter,
    setQuickFilter,
  ] = useState(DEFAULT_FILTER);

  const [
    directOnly,
    setDirectOnly,
  ] = useState(false);

  const player = usePlayer();

  const load = async (
    force = false
  ) => {
    if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const result =
        await getFreeTvChannels({
          force,
        });

      const list =
        Array.isArray(
          result?.channels
        )
          ? result.channels
          : [];

      setChannels(list);

      setSourceStatus(
        Array.isArray(
          result?.sourceStatus
        )
          ? result.sourceStatus
          : []
      );

      setRawCount(
        Number(
          result?.rawCount || 0
        )
      );
    } catch (loadError) {
      setError(
        loadError?.message ||
          "Could not load the public Live TV playlists."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);

    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const values = Array.from(
      new Set(
        channels
          .map(
            (channel) =>
              channel?.group
          )
          .filter(Boolean)
      )
    ).sort(groupSort);

    return [
      "All",
      ...values,
    ];
  }, [channels]);

  const quickCounts = useMemo(() => {
    const counts = {
      All: channels.length,
      "United Kingdom": 0,
      Sports: 0,
      Movies: 0,
    };

    for (const channel of channels) {
      const tags = new Set(
        channel?.tags || []
      );

      if (
        tags.has(
          "United Kingdom"
        )
      ) {
        counts["United Kingdom"] += 1;
      }

      if (
        tags.has("Sports")
      ) {
        counts.Sports += 1;
      }

      if (
        tags.has("Movies")
      ) {
        counts.Movies += 1;
      }
    }

    return counts;
  }, [channels]);

  const filtered = useMemo(() => {
    const q = searchText(query);

    return channels.filter(
      (channel) => {
        const tags = new Set(
          channel?.tags || []
        );

        if (
          quickFilter !== "All" &&
          !tags.has(quickFilter)
        ) {
          return false;
        }

        if (
          group !== "All" &&
          channel?.group !== group
        ) {
          return false;
        }

        if (
          directOnly &&
          channel?.kind !== "direct"
        ) {
          return false;
        }

        if (!q) {
          return true;
        }

        const haystack =
          searchText(
            `${
              channel?.name || ""
            } ${
              channel?.group || ""
            } ${
              channel?.country || ""
            } ${
              (
                channel?.sourceNames ||
                []
              ).join(" ")
            } ${
              (
                channel?.tags ||
                []
              ).join(" ")
            }`
          );

        return haystack.includes(q);
      }
    );
  }, [
    channels,
    group,
    query,
    directOnly,
    quickFilter,
  ]);

  const shown = filtered.slice(
    0,
    MAX_VISIBLE
  );

  const playChannel = (channel) => {
    if (!channel?.url) {
      return;
    }

    if (
      channel.kind === "external"
    ) {
      window.open(
        channel.url,
        "_blank",
        "noopener,noreferrer"
      );

      return;
    }

    const directSources = [
      channel,
      ...(channel.alternatives || []),
    ]
      .filter(
        (candidate) =>
          candidate?.kind ===
            "direct" &&
          candidate?.url
      )
      .map(
        (
          candidate,
          index
        ) => {
          const quality =
            qualityLabel(candidate);

          return {
            label:
              index === 0
                ? `LIVE • Best${
                    quality
                      ? ` • ${quality}`
                      : ""
                  }`
                : `Backup ${index}${
                    quality
                      ? ` • ${quality}`
                      : ""
                  }`,

            type: "live",
            src: candidate.url,
            url: candidate.url,
            live: true,
            sourceName:
              candidate.sourceName,
          };
        }
      );

    player.play({
      id:
        channel.tvgId ||
        channel.id,

      title:
        channel.name,

      poster:
        channel.logo || "",

      type:
        "live",

      mediaType:
        "live",

      noRd:
        true,

      sources:
        directSources.length > 0
          ? directSources
          : [
              {
                label: "LIVE",
                type: "live",
                src: channel.url,
                url: channel.url,
                live: true,
              },
            ],
    });
  };

  const failedSources =
    sourceStatus.filter(
      (source) =>
        source.error
    );

  const workingSources =
    sourceStatus.filter(
      (source) =>
        !source.error
    );

  if (loading) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="h-7 w-7 animate-spin text-mg-green" />

        <p className="text-sm text-white/55">
          Loading and merging public Live TV sources…
        </p>
      </div>
    );
  }

  return (
    <div className="w-full p-3 min-[420px]:p-4 sm:p-6 md:p-8 3xl:p-10 4xl:p-14">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Radio className="h-5 w-5 text-mg-green" />

            <h1 className="text-xl font-bold text-white sm:text-2xl 3xl:text-3xl">
              Live TV
            </h1>
          </div>

          <p className="max-w-3xl text-xs text-white/45 sm:text-sm">
            Public Live TV, UK, sports and movie channels merged into one list with duplicates removed and the strongest available feed kept first.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            load(true)
          }
          disabled={refreshing}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-mg-card px-4 py-2 text-sm font-semibold text-white/75 hover:border-mg-green/50 hover:text-white disabled:opacity-50"
        >
          <RefreshCw
            className={cn(
              "h-4 w-4",
              refreshing &&
                "animate-spin"
            )}
          />

          Refresh channels
        </button>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

          <div>
            <div className="font-semibold">
              Live TV could not load
            </div>

            <div className="mt-1 text-red-200/70">
              {error}
            </div>
          </div>
        </div>
      )}

      {!error &&
        failedSources.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
            {failedSources.length} playlist source
            {failedSources.length === 1
              ? ""
              : "s"}{" "}
            could not be reached. The working sources are still available.
          </div>
        )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            id: "All",
            label: "All",
            icon: Tv,
          },
          {
            id: "United Kingdom",
            label: "UK",
            icon: Globe2,
          },
          {
            id: "Sports",
            label: "Sports",
            icon: Trophy,
          },
          {
            id: "Movies",
            label: "Movies",
            icon: Film,
          },
        ].map((item) => {
          const Icon = item.icon;

          const active =
            quickFilter === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setQuickFilter(
                  item.id
                );

                setGroup("All");
              }}
              className={cn(
                "flex min-h-12 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors",

                active
                  ? "border-mg-green bg-mg-green text-black"
                  : "border-white/10 bg-mg-card text-white/70 hover:border-mg-green/50 hover:text-white"
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />

                {item.label}
              </span>

              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px]",

                  active
                    ? "bg-black/15"
                    : "bg-white/5 text-white/45"
                )}
              >
                {Number(
                  quickCounts[
                    item.id
                  ] || 0
                ).toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px_auto]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />

          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="Search channel, country, source or category…"
            className="h-11 w-full rounded-lg border border-white/10 bg-mg-card pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green"
          />
        </label>

        <select
          value={group}
          onChange={(event) =>
            setGroup(
              event.target.value
            )
          }
          className="h-11 rounded-lg border border-white/10 bg-mg-card px-3 text-sm text-white outline-none focus:border-mg-green"
        >
          {groups.map((item) => (
            <option
              key={item}
              value={item}
            >
              {item}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() =>
            setDirectOnly(
              (current) =>
                !current
            )
          }
          className={cn(
            "h-11 rounded-lg border px-4 text-sm font-semibold transition-colors",

            directOnly
              ? "border-mg-green bg-mg-green text-black"
              : "border-white/10 bg-mg-card text-white/70 hover:text-white"
          )}
        >
          Direct streams only
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/40 sm:text-xs">
        <span className="flex items-center gap-1.5">
          <Tv className="h-3.5 w-3.5" />

          {filtered.length.toLocaleString()} matching channels
        </span>

        <span>
          {rawCount.toLocaleString()} raw entries merged into{" "}
          {channels.length.toLocaleString()} visible channels
        </span>

        <span>
          {workingSources.length}/
          {sourceStatus.length} playlist sources loaded
        </span>

        {filtered.length >
          MAX_VISIBLE && (
          <span>
            Showing first {MAX_VISIBLE}. Use search or filters to narrow the list.
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-mg-card p-8 text-center">
          <Tv className="mx-auto mb-3 h-8 w-8 text-white/25" />

          <div className="font-semibold text-white">
            No channels found
          </div>

          <div className="mt-1 text-sm text-white/40">
            Try All, another group, or a different search.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5">
          {shown.map(
            (
              channel,
              index
            ) => {
              const external =
                channel.kind ===
                "external";

              const quality =
                qualityLabel(
                  channel
                );

              const backupCount =
                (
                  channel.alternatives ||
                  []
                ).filter(
                  (candidate) =>
                    candidate?.kind ===
                      "direct" &&
                    candidate?.url
                ).length;

              return (
                <button
                  key={`${channel.id}-${index}`}
                  type="button"
                  onClick={() =>
                    playChannel(
                      channel
                    )
                  }
                  className="group flex min-h-[92px] items-center gap-3 rounded-xl border border-white/10 bg-mg-card p-3 text-left transition-colors hover:border-mg-green/60 hover:bg-mg-surface focus:border-mg-green focus:outline-none"
                >
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                    <Tv className="h-5 w-5 text-white/20" />

                    {channel.logo && (
                      <img
                        src={channel.logo}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-contain p-1"
                        onError={(event) => {
                          event.currentTarget.style.display =
                            "none";
                        }}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white group-hover:text-mg-green">
                      {channel.name}
                    </div>

                    <div className="mt-1 truncate text-xs text-white/40">
                      {channel.group ||
                        channel.country ||
                        "Free TV"}
                    </div>

                    <div className="mt-1 truncate text-[10px] text-white/30">
                      {channel.sourceName ||
                        "Public IPTV"}

                      {backupCount > 0
                        ? ` • ${backupCount} backup${
                            backupCount === 1
                              ? ""
                              : "s"
                          }`
                        : ""}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {external ? (
                        <span className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/50">
                          <ExternalLink className="h-2.5 w-2.5" />
                          Web stream
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-mg-green/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-mg-green">
                          <Wifi className="h-2.5 w-2.5" />
                          Live
                        </span>
                      )}

                      {quality && (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-200">
                          {quality}
                        </span>
                      )}

                      {(channel.tags || []).includes(
                        "Sports"
                      ) && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200">
                          Sports
                        </span>
                      )}

                      {(channel.tags || []).includes(
                        "Movies"
                      ) && (
                        <span className="rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-fuchsia-200">
                          Movies
                        </span>
                      )}

                      {channel.geoBlocked && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
                          Geo
                        </span>
                      )}

                      {channel.standardDefinition && (
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/40">
                          SD
                        </span>
                      )}

                      {channel.insecure && (
                        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-300">
                          HTTP
                        </span>
                      )}
                    </div>
                  </div>

                  {external ? (
                    <ExternalLink className="h-4 w-4 shrink-0 text-white/30" />
                  ) : (
                    <Wifi className="h-4 w-4 shrink-0 text-mg-green" />
                  )}
                </button>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}
