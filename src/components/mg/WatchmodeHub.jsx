import React, { useCallback, useEffect, useState } from "react";
import {
  Award, CalendarClock, CalendarDays, CircleAlert, Clock3, ExternalLink,
  Loader2, Radio, RefreshCw, Search, Trophy, Tv, Wifi,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const TABS = [
  { id: "events", label: "Live sports & TV", icon: Radio },
  { id: "leaving", label: "Leaving soon", icon: CalendarClock },
  { id: "awards", label: "Awards", icon: Award },
  { id: "releases", label: "Release times", icon: Clock3 },
  { id: "changes", label: "Availability changes", icon: RefreshCw },
];

const asArray = (value) => Array.isArray(value) ? value : [];
const firstArray = (data, keys) => {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
};
const titleOf = (item) => item?.title || item?.name || item?.event_name || item?.program_title || "Untitled";
const dateOf = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: value.includes?.("T") ? "short" : undefined });
};

function ResultCard({ item, fallbackDate }) {
  const title = titleOf(item);
  const poster = item?.poster_url || item?.image_url || item?.thumbnail_url;
  const links = [
    item?.web_url, item?.watch_url, item?.url,
    ...(asArray(item?.sources).map((source) => source?.web_url || source?.url)),
    ...(asArray(item?.streaming_options).map((source) => source?.web_url || source?.url)),
  ].filter((url, index, all) => /^https?:\/\//i.test(String(url || "")) && all.indexOf(url) === index);
  const date = item?.start_time || item?.start_date || item?.release_at || item?.release_date || item?.leaving_date || item?.leaves_on || fallbackDate;
  const providerNames = [
    item?.source_name, item?.network, item?.league_name, item?.status,
    ...(asArray(item?.sources).map((source) => source?.name || source?.source_name)),
    ...(asArray(item?.streaming_options).map((source) => source?.name || source?.provider_name)),
  ].filter(Boolean);
  return (
    <article className="flex gap-3 rounded-xl border border-white/10 bg-mg-card p-3 sm:p-4">
      {poster ? <img src={poster} alt="" loading="lazy" className="h-24 w-16 shrink-0 rounded-md bg-black/30 object-cover" /> : (
        <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-white/5 text-mg-green"><Tv className="h-6 w-6" /></div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-white">{title}</h3>
        {item?.year || item?.release_year ? <p className="mt-0.5 text-xs text-white/50">{item.year || item.release_year}</p> : null}
        {date ? <p className="mt-1 flex items-center gap-1.5 text-xs text-white/60"><CalendarDays className="h-3.5 w-3.5 shrink-0" />{dateOf(date)}</p> : null}
        {item?.description || item?.overview || item?.short_description ? <p className="mt-2 line-clamp-3 text-sm text-white/60">{item.description || item.overview || item.short_description}</p> : null}
        {providerNames.length > 0 ? <p className="mt-2 text-xs text-mg-green">{[...new Set(providerNames)].slice(0, 4).join(" · ")}</p> : null}
        {links.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{links.slice(0, 3).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-mg-green px-3 py-2 text-xs font-bold text-black hover:brightness-110">Watch / details <ExternalLink className="h-3 w-3" /></a>)}</div> : null}
      </div>
    </article>
  );
}

export default function WatchmodeHub() {
  const [tab, setTab] = useState("events");
  const [region, setRegion] = useState("GB");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [selectedTitle, setSelectedTitle] = useState(null);

  const request = useCallback(async (action, params = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("watchmodeData", { action, params: { region, regions: region, ...params } });
      const payload = response?.data || {};
      if (payload.error) throw new Error(payload.error);
      return payload.data ?? payload;
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "Unable to load Watchmode data.";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [region]);

  const loadTab = useCallback(async (nextTab = tab) => {
    setResults([]);
    setMetadata(null);
    if (nextTab === "events") {
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 86400000);
      const to = new Date(now.getTime() + 7 * 86400000);
      const data = await request("events", {
        date_from: from.toISOString(), date_to: to.toISOString(),
        status: "scheduled,live", page: "1", limit: "25",
      });
      if (data) {
        setResults(firstArray(data, ["events", "results"]));
        setMetadata({ total: data.total_results, limited: data.date_range_limited });
      }
    } else if (nextTab === "leaving") {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 86400000);
      const ymd = (date) => Number(date.toISOString().slice(0, 10).replaceAll("-", ""));
      const data = await request("leaving", { start_date: String(ymd(now)), end_date: String(ymd(end)), page: "1", limit: "100" });
      if (data) setResults(firstArray(data, ["titles", "results", "leaving", "data"]));
    } else if (nextTab === "releases") {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 86400000);
      const ymd = (date) => Number(date.toISOString().slice(0, 10).replaceAll("-", ""));
      const data = await request("releases", { start_date: String(ymd(now)), end_date: String(ymd(end)), limit: "100" });
      if (data) setResults(firstArray(data, ["releases", "results"]));
    } else if (nextTab === "changes") {
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 86400000);
      const ymd = (date) => Number(date.toISOString().slice(0, 10).replaceAll("-", "") + "000000");
      const data = await request("sourceChanges", { start_date: String(ymd(from)), end_date: String(ymd(now)), page: "1", limit: "100" });
      if (data) {
        const changed = firstArray(data, ["titles", "results"]);
        setResults(changed.map((item) => typeof item === "number" || typeof item === "string" ? { id: item, title: `Watchmode title ${item}` } : item));
        setMetadata({ total: data.total_results });
      }
    }
  }, [request, tab]);

  useEffect(() => { loadTab(tab); }, [tab, region, loadTab]);

  const searchAwards = async () => {
    if (!query.trim()) return;
    setSearchMatches([]);
    setSelectedTitle(null);
    const data = await request("search", { search_field: "name", search_value: query.trim(), types: "movie,tv_series" });
    if (data) setSearchMatches(firstArray(data, ["title_results", "results", "titles"]).slice(0, 8));
  };

  const loadAwards = async (item) => {
    const id = item?.id || item?.title_id || item?.watchmode_id;
    if (!id) return;
    setSelectedTitle(item);
    const data = await request("awards", { id: String(id) });
    if (data) setResults(firstArray(data, ["awards", "results", "nominations", "data"]));
  };

  const currentTab = TABS.find((item) => item.id === tab);
  const Icon = currentTab?.icon || Wifi;

  return (
    <div className="w-full p-3 sm:p-5 md:p-6 text-white" data-mg-watchmode-hub="true">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-mg-green">Powered by Watchmode</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">What to watch</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/60">Find live events, streaming availability, upcoming releases and titles leaving services. Coverage depends on your Watchmode plan and region.</p>
        </div>
        <label className="text-xs text-white/60">Country
          <select value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-white/10 bg-mg-card px-3 text-sm text-white" aria-label="Watchmode country">
            <option value="GB">United Kingdom</option><option value="US">United States</option><option value="CA">Canada</option><option value="AU">Australia</option>
          </select>
        </label>
      </header>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Watchmode features">
        {TABS.map((item) => {
          const TabIcon = item.icon;
          return <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${tab === item.id ? "border-mg-green bg-mg-green text-black" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"}`}><TabIcon className="h-4 w-4" />{item.label}</button>;
        })}
      </div>

      {tab === "awards" && <section className="mb-5 rounded-xl border border-white/10 bg-mg-card p-3 sm:p-4">
        <label className="mb-2 block text-sm font-semibold">Find awards for a film or TV show</label>
        <div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") searchAwards(); }} placeholder="Search a title…" className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-mg-green" /><button onClick={searchAwards} disabled={loading || !query.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-mg-green px-4 text-sm font-bold text-black disabled:opacity-50"><Search className="h-4 w-4" />Search</button></div>
        {searchMatches.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{searchMatches.map((item, index) => <button key={item.id || index} onClick={() => loadAwards(item)} className="rounded-lg border border-white/10 p-3 text-left hover:border-mg-green/50"><span className="block font-semibold">{titleOf(item)}</span><span className="mt-1 block text-xs text-white/50">{item.year || item.type || "Title"}{item.id ? ` · Watchmode ID ${item.id}` : ""}</span></button>)}</div>}
        {selectedTitle && <p className="mt-3 text-xs text-white/50">Showing award records for {titleOf(selectedTitle)}.</p>}
      </section>}

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Icon className="h-5 w-5 text-mg-green" />{currentTab?.label}</h2>
        <button onClick={() => tab === "awards" ? searchAwards() : loadTab(tab)} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white/70 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button>
      </div>

      {loading && <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-white/60"><Loader2 className="h-5 w-5 animate-spin text-mg-green" />Loading Watchmode data…</div>}
      {!loading && error && <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Watchmode data unavailable</p><p className="mt-1 text-amber-100/70">{error}</p></div></div>}
      {!loading && !error && results.length === 0 && <div className="rounded-xl border border-white/10 bg-mg-card p-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mg-green/10 text-mg-green"><Icon className="h-6 w-6" /></div><p className="mt-3 font-semibold">No results returned</p><p className="mt-1 text-sm text-white/50">This can mean there is no matching data for {region}, or your Watchmode plan does not include this endpoint.</p></div>}
      {!loading && results.length > 0 && <><p className="mb-3 text-xs text-white/40">{metadata?.total != null ? `${metadata.total} matching records` : `${results.length} records returned`}{metadata?.limited ? " · Date range limited by plan" : ""}</p><div className="grid gap-3 lg:grid-cols-2">{results.map((item, index) => <ResultCard key={item?.id || item?.title_id || item?.event_id || index} item={item} />)}</div></>}

      <p className="mt-6 border-t border-white/10 pt-4 text-xs text-white/35">Watchmode data and deep links depend on service, event, country and account coverage. A listed service is not a guarantee that a title is currently playable.</p>
    </div>
  );
}
