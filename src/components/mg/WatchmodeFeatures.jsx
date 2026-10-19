import React, { useCallback, useState } from "react";
import { Award, CalendarClock, ChevronRight, CircleAlert, Loader2, Radio, RefreshCw, Trophy, ListChecks, History } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { detectStreamingRegion } from "@/components/mg/streamingRegion";

const TABS = [
  { id: "live-events", label: "Live Sports & TV", icon: Radio, description: "Upcoming games, award ceremonies and where to watch them." },
  { id: "leaving", label: "Leaving Soon", icon: CalendarClock, description: "Titles scheduled to leave streaming services in your region." },
  { id: "awards", label: "Awards", icon: Trophy, description: "Find awards and nominations for a film or TV show." },
  { id: "live-leagues", label: "Leagues & Teams", icon: ListChecks, description: "Browse leagues and competitions covered by Live." },
  { id: "source-changes", label: "Availability changes", icon: History, description: "Track titles whose streaming availability has changed." },
];

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? {};
const asArray = (value) => Array.isArray(value) ? value : [];
const text = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "";

const eventRows = (payload) => {
  const data = payload?.events ?? payload?.results ?? payload?.live_events ?? payload;
  return Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
};

const leavingRows = (payload) => {
  const data = payload?.titles ?? payload?.results ?? payload?.leaving_dates ?? payload;
  return Array.isArray(data) ? data : Array.isArray(data?.titles) ? data.titles : [];
};

const awardRows = (payload) => asArray(payload?.awards ?? payload?.results ?? payload);

const objectRows = (payload) => {
  const candidate = payload?.leagues ?? payload?.changes ?? payload?.results ?? payload?.data ?? payload;
  if (Array.isArray(candidate)) return candidate;
  if (Array.isArray(candidate?.results)) return candidate.results;
  if (Array.isArray(candidate?.leagues)) return candidate.leagues;
  if (Array.isArray(candidate?.changes)) return candidate.changes;
  return [];
};

const formatDate = (value) => {
  if (!value) return "Date TBC";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: value.includes?.("T") ? "short" : undefined });
};

export default function WatchmodeFeatures() {
  const [activeTab, setActiveTab] = useState("live-events");
  const [payloads, setPayloads] = useState({});
  const [loading, setLoading] = useState("");
  const [errors, setErrors] = useState({});
  const [awardQuery, setAwardQuery] = useState("");
  const [loaded, setLoaded] = useState({});
  const region = detectStreamingRegion() || "GB";

  const load = useCallback(async (action, extra = {}) => {
    setLoading(action);
    setErrors((current) => ({ ...current, [action]: "" }));
    try {
      const response = await base44.functions.invoke("getWatchmodeFeatures", {
        action,
        region,
        ...extra,
      });
      const data = unwrap(response);
      if (data?.error) throw new Error(data.error);
      setPayloads((current) => ({ ...current, [action]: data }));
      setLoaded((current) => ({ ...current, [action]: true }));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [action]: error?.message || "Watchmode data could not be loaded.",
      }));
    } finally {
      setLoading("");
    }
  }, [region]);

  const selected = TABS.find((tab) => tab.id === activeTab) || TABS[0];
  const Icon = selected.icon;
  const payload = payloads[activeTab];
  const busy = loading === activeTab;

  return (
    <section data-mg-watchmode-features="true" className="mx-3 sm:mx-5 md:mx-6 3xl:mx-8 rounded-2xl border border-white/10 bg-gradient-to-br from-[#13221f] to-[#101318] p-4 sm:p-5 3xl:p-7">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-mg-green">Powered by Watchmode</p>
          <h2 className="mt-1 text-xl sm:text-2xl 3xl:text-3xl font-bold text-white">More to watch</h2>
          <p className="mt-1 text-sm text-white/55">Sports schedules, streaming departures and award history.</p>
        </div>
        <span className="text-xs text-white/40">Region: {region}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5" role="tablist" aria-label="Watchmode features">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green ${active ? "border-mg-green/60 bg-mg-green/10 text-white" : "border-white/10 bg-black/15 text-white/65 hover:bg-white/5"}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-mg-green text-black" : "bg-white/5 text-white/65"}`}><TabIcon className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className="mt-0.5 block text-xs text-white/45">{tab.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="rounded-xl border border-white/10 bg-black/20 p-4 sm:p-5 min-h-36">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-mg-green" />
            <h3 className="font-semibold text-white">{selected.label}</h3>
          </div>
          {loaded[activeTab] && !busy && (
            <button type="button" onClick={() => load(activeTab, activeTab === "awards" ? { title: awardQuery.trim() } : {})} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/65 hover:bg-white/5" aria-label={`Refresh ${selected.label}`}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          )}
        </div>

        {activeTab === "awards" && (
          <form
            className="mt-4 flex flex-col sm:flex-row gap-2"
            onSubmit={(event) => { event.preventDefault(); if (awardQuery.trim().length >= 2) load("awards", { title: awardQuery.trim() }); }}
          >
            <input
              value={awardQuery}
              onChange={(event) => setAwardQuery(event.target.value)}
              placeholder="Search a film or TV show"
              aria-label="Film or TV show for awards search"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-mg-green focus:outline-none"
            />
            <button type="submit" disabled={busy || awardQuery.trim().length < 2} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-mg-green px-4 py-2 text-sm font-bold text-black disabled:opacity-45">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />} Find awards
            </button>
          </form>
        )}

        {!loaded[activeTab] && !busy && !errors[activeTab] && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-white/55">
              {activeTab === "live-events" ? "Check the events available to your Watchmode plan, including event status and supported viewing links." : activeTab === "leaving" ? "Check the next 45 days of scheduled departures. Streaming services can change dates, so treat them as estimates." : "Search a title to see its award history where Watchmode has coverage."}
            </p>
            {activeTab !== "awards" && (
              <button type="button" onClick={() => load(activeTab)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-mg-green px-4 py-2.5 text-sm font-bold text-black">
                Load {activeTab === "live-events" ? "events" : activeTab === "leaving" ? "titles" : activeTab === "live-leagues" ? "leagues" : "changes"} <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {busy && <div className="mt-5 flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin text-mg-green" /> Loading from Watchmode…</div>}

        {errors[activeTab] && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/5 p-3 text-sm text-amber-100/80">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div><p>{errors[activeTab]}</p><button type="button" onClick={() => load(activeTab, activeTab === "awards" ? { title: awardQuery.trim() } : {})} className="mt-2 font-semibold underline underline-offset-2">Try again</button></div>
          </div>
        )}

        {loaded[activeTab] && !busy && !errors[activeTab] && activeTab === "live-events" && (
          <div className="mt-4 space-y-2">
            {eventRows(payload?.events).length ? eventRows(payload?.events).slice(0, 25).map((event, index) => {
              const name = text(event?.name, event?.title, event?.event_name, event?.matchup, "Live event");
              const start = text(event?.start_time, event?.start_date, event?.date, event?.scheduled_start);
              const status = text(event?.status, event?.event_status, "Scheduled");
              const sources = asArray(event?.sources ?? event?.viewing_options ?? event?.providers);
              return <article key={String(event?.id || event?.event_id || name) + index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.025] p-3">
                <div><p className="font-medium text-white">{name}</p><p className="mt-1 text-xs text-white/45">{formatDate(start)} · {status}</p></div>
                <div className="flex flex-wrap gap-2">{sources.slice(0, 4).map((source, sourceIndex) => {
                  const href = text(source?.web_url, source?.url, source?.link, source?.android_url, source?.ios_url);
                  const label = text(source?.name, source?.source_name, source?.provider_name, "Watch");
                  return href ? <a key={label + sourceIndex} href={href} target="_blank" rel="noopener noreferrer" className="rounded-md border border-mg-green/20 px-2.5 py-1.5 text-xs text-mg-green hover:bg-mg-green/10">{label}</a> : <span key={label + sourceIndex} className="rounded-md bg-white/5 px-2.5 py-1.5 text-xs text-white/60">{label}</span>;
                })}</div>
              </article>;
            }) : <p className="mt-4 text-sm text-white/50">No events were returned for this region and date range. Your plan's live coverage may be limited or require Live API access.</p>}
          </div>
        )}

        {loaded[activeTab] && !busy && !errors[activeTab] && activeTab === "leaving" && (
          <div className="mt-4 space-y-2">
            {leavingRows(payload?.leaving).length ? leavingRows(payload?.leaving).slice(0, 50).map((item, index) => {
              const title = text(item?.title, item?.name, "Untitled");
              const date = text(item?.leaving_date, item?.leave_date, item?.end_date, item?.date, item?.removal_date);
              const service = text(item?.source_name, item?.service_name, item?.provider_name, item?.source?.name);
              const href = text(item?.web_url, item?.url, item?.link);
              const details = <><span className="font-medium text-white">{title}</span><span className="block mt-1 text-xs text-white/45">{service || "Streaming service"} · Leaving {formatDate(date)}</span></>;
              return <article key={String(item?.id || title) + index} className="rounded-lg border border-white/5 bg-white/[0.025] p-3">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-mg-green">{details}</a> : details}</article>;
            }) : <p className="mt-4 text-sm text-white/50">No titles leaving soon were returned for {region}. Coverage varies by country and plan.</p>}
          </div>
        )}

        {loaded[activeTab] && !busy && !errors[activeTab] && (activeTab === "live-leagues" || activeTab === "source-changes") && (
          <div className="mt-4 space-y-2">
            {objectRows(payload).length ? objectRows(payload).slice(0, 50).map((item, index) => {
              const name = text(item?.name, item?.title, item?.league_name, item?.competition, item?.event_name, item?.source_name, item?.provider_name, "Watchmode record");
              const detail = text(item?.sport, item?.category, item?.country, item?.region, item?.change_type, item?.status, item?.event_status);
              const date = text(item?.date, item?.changed_at, item?.change_date, item?.start_date, item?.start_time);
              const href = text(item?.web_url, item?.url, item?.link);
              return <article key={String(item?.id || item?.league_id || item?.title_id || name) + index} className="rounded-lg border border-white/5 bg-white/[0.025] p-3">
                {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:text-mg-green">{name}</a> : <p className="font-medium text-white">{name}</p>}
                {(detail || date) && <p className="mt-1 text-xs text-white/45">{[detail, date ? formatDate(date) : ""].filter(Boolean).join(" · ")}</p>}
              </article>;
            }) : <p className="mt-4 text-sm text-white/50">{activeTab === "live-leagues" ? "No leagues were returned. Live league coverage depends on your Watchmode plan and region." : "No streaming availability changes were returned for this region."}</p>}
          </div>
        )}

        {loaded[activeTab] && !busy && !errors[activeTab] && activeTab === "awards" && (
          <div className="mt-4 space-y-2">
            {payload?.matched_title && <p className="text-xs text-white/45">Results for {payload.matched_title}</p>}
            {awardRows(payload?.awards).length ? awardRows(payload?.awards).map((award, index) => {
              const name = text(award?.award_name, award?.name, award?.award, award?.series_name, "Award");
              const event = text(award?.ceremony, award?.award_show, award?.organization, award?.event);
              const year = text(award?.year, award?.award_year, award?.ceremony_year);
              const result = text(award?.result, award?.status, award?.outcome, award?.won ? "Winner" : "");
              const category = text(award?.category, award?.award_category, award?.nomination);
              return <article key={String(award?.id || name) + index} className="rounded-lg border border-white/5 bg-white/[0.025] p-3">
                <p className="font-medium text-white">{name}</p>
                <p className="mt-1 text-xs text-white/50">{[event, category, year].filter(Boolean).join(" · ") || "Award record"}</p>
                {result && <span className="mt-2 inline-flex rounded-full bg-mg-green/10 px-2 py-1 text-xs text-mg-green">{result}</span>}
              </article>;
            }) : <p className="mt-3 text-sm text-white/50">No award records were returned for this title. Coverage and endpoint access depend on your Watchmode plan.</p>}
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-white/30">Availability depends on Watchmode coverage and your API plan. Events and departure dates may be incomplete or change.</p>
    </section>
  );
}
