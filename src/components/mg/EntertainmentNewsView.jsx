import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  ExternalLink,
  Film,
  Loader2,
  Newspaper,
  RefreshCw,
  Search,
  Tv,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all", label: "All News", icon: Newspaper },
  { id: "film", label: "Film News", icon: Film },
  { id: "tv", label: "TV News", icon: Tv },
];

const dateLabel = (value) => {
  if (!value) return "Recently published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently published";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export default function EntertainmentNewsView() {
  const [section, setSection] = useState("all");
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      // Load the combined feed once; switching All/Film/TV is then instant client-side.
      const response = await base44.functions.invoke("getEntertainmentNews", { section: "all" });
      const payload = response?.data || response;
      const nextStories = Array.isArray(payload?.stories) ? payload.stories : [];
      setStories(nextStories);
      setUpdatedAt(payload?.updatedAt || new Date().toISOString());
      if (!nextStories.length) {
        setError("News is temporarily unavailable. Please try refreshing in a moment.");
      } else if (payload?.partial) {
        setError("Some news feeds are temporarily unavailable. Showing the stories we could retrieve.");
      }
    } catch {
      setStories([]);
      setError("News could not be loaded right now. Check your connection and try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return stories.filter((story) =>
      (section === "all" || story.category === section) &&
      (!wanted || [story.title, story.description, story.source].join(" ").toLowerCase().includes(wanted))
    );
  }, [stories, query, section]);

  return (
    <section className="w-full px-4 py-6 md:px-6 md:py-8 3xl:px-10">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-mg-green">
              <Newspaper className="h-4 w-4" />
              The latest from entertainment
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">TV &amp; Film News</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60 md:text-base">
              New releases, trailers, casting, renewals and the stories behind the screen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load({ quiet: true })}
            disabled={loading || refreshing}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:border-mg-green/50 hover:bg-white/10 disabled:opacity-50 md:self-auto"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh news
          </button>
        </div>

        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="News category">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={section === tab.id}
                  onClick={() => setSection(tab.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition",
                    section === tab.id
                      ? "border-mg-green/50 bg-mg-green/15 text-mg-green"
                      : "border-white/10 bg-mg-card text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/10 bg-mg-card px-3 text-white/60 lg:max-w-sm">
            <Search className="h-4 w-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search headlines..."
              aria-label="Search news headlines"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>
        </div>

        {updatedAt && !loading && (
          <p className="mb-4 flex items-center gap-2 text-xs text-white/45">
            <CalendarClock className="h-3.5 w-3.5" />
            Updated {dateLabel(updatedAt)}
          </p>
        )}

        {error && (
          <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-white/75">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-white/60">
            <Loader2 className="h-5 w-5 animate-spin text-mg-green" />
            Loading the latest entertainment news…
          </div>
        ) : filtered.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((story) => (
              <article key={story.id || story.url} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-mg-card transition hover:border-mg-green/35 hover:bg-white/[0.04]">
                <a
                  href={story.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Read ${story.title} at ${story.source || "the original publisher"}`}
                  className="relative block aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-mg-green"
                >
                  {story.image ? (
                    <img
                      src={story.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/20">
                      {story.category === "tv" ? <Tv className="h-12 w-12" /> : <Film className="h-12 w-12" />}
                    </div>
                  )}
                  <span className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur">
                    {story.category === "tv" ? "TV" : "Film"}
                  </span>
                </a>
                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs text-white/45">
                    <span className="truncate font-semibold text-mg-green">{story.source || "Entertainment News"}</span>
                    <time dateTime={story.publishedAt || undefined} className="shrink-0">{dateLabel(story.publishedAt)}</time>
                  </div>
                  <h2 className="line-clamp-3 text-base font-bold leading-6 text-white md:text-lg">{story.title}</h2>
                  {story.description && (
                    <p className="mt-2 line-clamp-3 text-sm leading-5 text-white/60">{story.description}</p>
                  )}
                  <a
                    href={story.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-mg-green hover:text-white focus:outline-none focus:underline"
                  >
                    Read full story <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : stories.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
            <Newspaper className="mb-3 h-9 w-9 text-white/25" />
            <h2 className="text-lg font-bold text-white">News is temporarily unavailable</h2>
            <p className="mt-1 max-w-md text-sm text-white/55">The news providers did not return any stories. Try again, or switch to another news category.</p>
            <button
              type="button"
              onClick={() => load({ quiet: true })}
              disabled={refreshing}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Try again
            </button>
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
            <Search className="mb-3 h-9 w-9 text-white/25" />
            <h2 className="text-lg font-bold text-white">No matching stories</h2>
            <p className="mt-1 text-sm text-white/55">Try a different search term or switch between All News, Film News and TV News.</p>
          </div>
        )}

        <p className="mt-8 text-xs leading-5 text-white/40">
          Stories are supplied by Google News RSS and link through to their publishers. Headlines and excerpts remain credited to their original sources.
        </p>
      </div>
    </section>
  );
}