import React from "react";

import {
  CalendarDays,
  CheckCircle2,
  Megaphone,
  Sparkles,
} from "lucide-react";

import {
  ALL_UPDATE_COUNT,
  RELEASED_UPDATE_COUNT,
  UPDATE_HISTORY,
} from "@/components/mg/updateHistory";

export default function UpdatesView() {
  const latestReleasedIndex = UPDATE_HISTORY.findIndex(
    (release) => release.status !== "planned"
  );

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
                Every major playback, Fire TV, source, subtitle and navigation improvement is kept here so you can see what changed after each release.
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

        <div className="mt-6 space-y-5">
          {UPDATE_HISTORY.map((release, releaseIndex) => (
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
          ))}
        </div>
      </div>
    </section>
  );
}
