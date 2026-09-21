import React, { useEffect, useMemo, useState } from "react";

import {
  CalendarDays,
  CheckCircle2,
  Megaphone,
  RefreshCw,
  Search,
  Sparkles,
  Smartphone,
} from "lucide-react";

import {
  ALL_UPDATE_COUNT,
  RELEASED_UPDATE_COUNT,
  UPDATE_HISTORY,
} from "@/components/mg/updateHistory";
import { nativeFireTvAppInfo } from "@/components/mg/nativeFireTvBridge";
import { fetchLatestNativeRelease } from "@/components/mg/nativeReleaseInfo";

export default function UpdatesView() {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [checking, setChecking] = useState(false);
  const [installed, setInstalled] = useState(() => nativeFireTvAppInfo());
  const [latest, setLatest] = useState(null);

  const latestReleasedIndex = UPDATE_HISTORY.findIndex(
    (release) => release.status !== "planned"
  );

  const checkVersion = async (force = false) => {
    const info = nativeFireTvAppInfo();
    setInstalled(info);

    if (!info?.platform) {
      setLatest(null);
      return;
    }

    setChecking(true);
    try {
      setLatest(
        await fetchLatestNativeRelease(info.platform, { force })
      );
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkVersion(false);
  }, []);

  const visible = useMemo(() => {
    const wanted = query.trim().toLowerCase();

    return UPDATE_HISTORY.filter((release) => {
      if (filter === "released" && release.status === "planned") return false;
      if (filter === "planned" && release.status !== "planned") return false;

      if (!wanted) return true;

      return [
        release.title,
        release.summary,
        release.date,
        ...(release.changes || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(wanted);
    });
  }, [filter, query]);

  const updateAvailable =
    installed &&
    latest &&
    Number(latest.versionCode || 0) > Number(installed.versionCode || 0);

  return (
    <section className="w-full flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-8 3xl:px-10 3xl:pt-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="overflow-hidden rounded-2xl border border-mg-green/25 bg-gradient-to-br from-mg-green/10 via-mg-surface to-mg-surface p-5 shadow-xl sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-mg-green/25 bg-mg-green/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-mg-green">
                <Megaphone className="h-3.5 w-3.5" />
                Media God updates
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                What’s new in Media God
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                See released changes, planned improvements and the version installed on this device.
              </p>
            </div>

            <div className="shrink-0 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-left sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
                Improvements listed
              </p>
              <p className="mt-1 text-3xl font-black text-mg-green">
                {ALL_UPDATE_COUNT}
              </p>
              <p className="text-xs text-white/40">
                across {RELEASED_UPDATE_COUNT} released updates
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-mg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-mg-green" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white">
                  Installed version
                </h2>
                <p className="mt-1 text-sm text-white/65">
                  {installed
                    ? `${installed.versionName || "Unknown"}${Number(installed.versionCode || 0) > 0 ? ` (code ${installed.versionCode})` : ""}`
                    : "Hosted web version"}
                </p>
                {latest && installed && (
                  <p
                    className={`mt-1 text-xs font-semibold ${
                      updateAvailable ? "text-amber-300" : "text-mg-green"
                    }`}
                  >
                    {updateAvailable
                      ? `Update available: ${latest.versionName || latest.versionCode}`
                      : `Latest: ${latest.versionName || installed.versionName}`}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => checkVersion(true)}
              disabled={checking || !installed}
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking…" : "Check latest"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-mg-surface p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search release notes…"
              className="min-h-11 w-full rounded-lg border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green/50"
            />
          </label>

          <div className="flex gap-1 overflow-x-auto">
            {[
              ["all", "All"],
              ["released", "Released"],
              ["planned", "Planned"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                aria-pressed={filter === id}
                className={`min-h-11 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${
                  filter === id
                    ? "bg-mg-green text-black"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-mg-surface p-10 text-center text-sm text-white/45">
              No release notes match that search.
            </div>
          ) : (
            visible.map((release) => {
              const releaseIndex = UPDATE_HISTORY.indexOf(release);

              return (
                <article
                  key={release.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-mg-surface shadow-lg"
                >
                  <div className="border-b border-white/8 bg-black/20 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {release.status === "planned" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-mg-green/30 bg-mg-green/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-mg-green">
                              <Sparkles className="h-3 w-3" />
                              Coming next
                            </span>
                          ) : releaseIndex === latestReleasedIndex ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-mg-green px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black">
                              <Sparkles className="h-3 w-3" />
                              Latest released
                            </span>
                          ) : null}

                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/45">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {release.date}
                          </span>
                        </div>

                        <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
                          {release.title}
                        </h2>

                        <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
                          {release.summary}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/50">
                        {release.changes.length} {release.status === "planned" ? "planned" : "changes"}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2.5 p-4 sm:grid-cols-2 sm:p-6">
                    {release.changes.map((change) => (
                      <div
                        key={`${release.id}-${change}`}
                        className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-black/20 p-3"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mg-green" />
                        <span className="text-xs leading-5 text-white/72 sm:text-sm">
                          {change}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
