import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, RefreshCw, Radio, Tv, Film, AlertCircle, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";

const API = "https://media-god-metadata-api-production.up.railway.app/functions/publicDiscovery";
const TODAY = () => { const now=new Date(); return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-"); };
const dateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||"")) ? value : "";
const tabs = [
  { id: "sports", label: "Sports fixtures", icon: Radio },
  { id: "tv", label: "TV schedule", icon: Tv },
  { id: "releases", label: "Film & TV releases", icon: Film },
];
const normalise = item => ({
  id: item?.id || item?.tmdb_id || item?.title,
  title: item?.title || item?.name || "Untitled",
  description: item?.description || item?.overview || "",
  start_time: item?.start_time || item?.release_date || item?.first_air_date || "",
  poster_url: item?.poster_url || item?.image_url || "",
  source_name: item?.source_name || "",
  web_url: item?.web_url || "",
  status: item?.status || "",
});
function DiscoveryCard({ item }) {
  const row = normalise(item);
  let when = "";
  if (row.start_time) {
    const date = new Date(row.start_time);
    when = dateOnly(row.start_time) ? row.start_time.split("-").reverse().join("/") : Number.isNaN(date.getTime()) ? row.start_time : date.toLocaleString("en-GB", {dateStyle:"medium", ...(row.start_time.includes("T") ? {timeStyle:"short"} : {})});
  }
  return <article className="flex gap-3 rounded-xl border border-white/10 bg-mg-card p-3">
    {row.poster_url ? <img className="h-24 w-16 shrink-0 rounded object-cover" src={row.poster_url} loading="lazy" alt="" /> : <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-white/5"><Tv className="h-5 w-5 text-mg-green" /></div>}
    <div className="min-w-0 flex-1">
      <h3 className="font-semibold text-white">{row.title}</h3>
      {when && <p className="mt-1 flex items-center gap-1.5 text-xs text-white/60"><CalendarDays className="h-3.5 w-3.5" />{when}</p>}
      {row.description && <p className="mt-2 line-clamp-3 text-sm text-white/60">{row.description}</p>}
      {(row.source_name || row.status) && <p className="mt-2 text-xs text-mg-green">{[row.source_name,row.status].filter(Boolean).join(" · ")}</p>}
      {/^https:\/\//i.test(row.web_url) && <a href={row.web_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-mg-green/30 px-3 py-1 text-xs font-semibold text-mg-green">Details <ExternalLink className="h-3 w-3" /></a>}
    </div>
  </article>;
}
async function discovery(action, region, signal) {
  const response = await fetch(API, {
    method: "POST", credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, region }),
    signal,
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Discovery service unavailable");
  return Array.isArray(data.results) ? data.results : [];
}
export default function WatchmodeHub() {
  const [tab, setTab] = useState("sports");
  const [region, setRegion] = useState("GB");
  const [releaseType, setReleaseType] = useState("movie");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const load = useCallback(async (signal) => {
    setLoading(true); setError(""); setRows([]);
    try {
      if (tab === "releases") {
        const [films, shows] = await Promise.allSettled([
          base44.functions.invoke("getTmdbMovies", {category:"upcoming",media_type:"movie",region,include_global_releases:true,date:TODAY()}),
          base44.functions.invoke("getTmdbMovies", {category:"tv_upcoming",media_type:"tv",region,date:TODAY()}),
        ]);
        if (signal.aborted) return;
        if (films.status === "rejected" && shows.status === "rejected") throw new Error("Film and TV release data is temporarily unavailable");
        const filmItems = films.status === "fulfilled" && Array.isArray(films.value?.data?.movies) ? films.value.data.movies : [];
        const showItems = shows.status === "fulfilled" && Array.isArray(shows.value?.data?.movies) ? shows.value.data.movies : [];
        const items = releaseType === "movie" ? filmItems : showItems;
        const today = TODAY();
        const cleaned = items.map(item => ({
          ...item,
          media_type: releaseType,
          release_date: String(item.release_date || item.first_air_date || ""),
          source_name: releaseType === "movie" ? "TMDB · Film" : "TMDB · TV",
          status: releaseType === "movie" ? "Listed release date" : "Series premiere (not a new episode)",
        })).filter(item => dateOnly(item.release_date) && item.release_date >= today)
          .sort((a,b) => a.release_date.localeCompare(b.release_date) || String(a.title||"").localeCompare(String(b.title||"")));
        const seen = new Set();
        setRows(cleaned.filter(item => { const key=String(item.tmdb_id||item.id||item.title); if(seen.has(key))return false;seen.add(key);return true; }).slice(0,100));
      } else {
        const data = await discovery(tab,region,signal);
        if (!signal.aborted) setRows(data);
      }
    } catch (e) {
      if (!signal.aborted) setError(e?.message || "Discovery temporarily unavailable");
    } finally { if (!signal.aborted) setLoading(false); }
  },[tab,region,releaseType]);
  useEffect(()=> { const controller = new AbortController(); void load(controller.signal); return ()=>controller.abort(); },[load,reload]);
  return <div data-mg-watchmode-hub="true" className="w-full p-3 sm:p-5 md:p-6 text-white">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wider text-mg-green">TMDB · TVmaze · TheSportsDB</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">What to watch</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">Film releases, scheduled TV episodes and selected upcoming sports fixtures. No Watchmode account required.</p></div>
      <label className="text-xs text-white/60">Country<select aria-label="Discovery country" value={region} onChange={event=>setRegion(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-white/10 bg-mg-card px-3 text-sm text-white">
        <option value="GB">United Kingdom</option><option value="US">United States</option><option value="CA">Canada</option><option value="AU">Australia</option></select></label>
    </header>
    <div className="mb-4 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Discovery sections">{tabs.map(t=>{const Icon=t.icon;return <button key={t.id} role="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${tab===t.id?"border-mg-green bg-mg-green text-black":"border-white/10 bg-white/5 text-white/70"}`}><Icon className="h-4 w-4" />{t.label}</button>})}</div>
    {tab === "releases" && <div className="mb-4 flex gap-2" role="group" aria-label="Release type"><button onClick={()=>setReleaseType("movie")} aria-pressed={releaseType==="movie"} className={`min-h-10 rounded-lg border px-4 text-sm font-semibold ${releaseType==="movie"?"border-mg-green bg-mg-green text-black":"border-white/10 text-white/70"}`}>Films</button><button onClick={()=>setReleaseType("tv")} aria-pressed={releaseType==="tv"} className={`min-h-10 rounded-lg border px-4 text-sm font-semibold ${releaseType==="tv"?"border-mg-green bg-mg-green text-black":"border-white/10 text-white/70"}`}>TV premieres</button></div>}
    <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm text-white/60">{tab==="sports"?"Selected fixtures from TheSportsDB's limited free feed":tab==="tv"?"TVmaze scheduled episodes":releaseType==="movie"?"Upcoming film releases from TMDB":"Upcoming TV series premieres (not new episodes)"}</p><button onClick={()=>setReload(x=>x+1)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-bold"><RefreshCw className="h-4 w-4" />Refresh</button></div>
    {loading && <p role="status" className="flex min-h-24 items-center gap-2 text-sm text-white/60"><Loader2 className="h-5 w-5 animate-spin" />Loading discovery…</p>}
    {!loading && error && <p role="alert" className="mb-4 flex gap-2 rounded-lg border border-amber-400/30 p-4 text-sm text-amber-100"><AlertCircle className="h-5 w-5 shrink-0" />{error}</p>}
    {!loading && !error && !rows.length && <p className="rounded-xl bg-mg-card p-6 text-sm text-white/60">No confirmed upcoming entries available for this selection right now.</p>}
    {!loading && rows.length>0 && <div className="grid gap-3 lg:grid-cols-2">{rows.map((item,index)=><DiscoveryCard item={item} key={item?.id||index}/>)}</div>}
    <p className="mt-6 border-t border-white/10 pt-4 text-xs text-white/40">Sports information is a limited fixture sample, not a live score or streaming guide. Listed programmes and releases are not guaranteed playable; provider coverage and dates can change.</p>
  </div>;
}
