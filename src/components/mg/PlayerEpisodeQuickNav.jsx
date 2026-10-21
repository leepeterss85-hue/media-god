import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ListVideo,
  LoaderCircle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { episodeHasAired } from "@/components/mg/episodeExperience";

const positiveInt = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const visible = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || 1) > 0.02;
};

const playerOverlay = () => {
  const selectors = Array.from(document.querySelectorAll([
    'select[aria-label="Choose playback source"]',
    'select[aria-label="Choose source or quality"]',
    'button[aria-label="Fullscreen"]',
    "video",
  ].join(","))).filter(visible);

  for (let index = selectors.length - 1; index >= 0; index -= 1) {
    const overlay = selectors[index].closest(".fixed.inset-0");
    if (overlay instanceof HTMLElement && visible(overlay)) return overlay;
  }
  return null;
};

const episodeNavigationKey = (context) => [
  String(context?.tmdbId ?? ""),
  positiveInt(context?.season) ?? "",
  positiveInt(context?.episode) ?? "",
].join(":");

const readContext = () => {
  const context = typeof window !== "undefined"
    ? window.__MG_PLAYER_CONTEXT__ || {}
    : {};
  return {
    mediaType: context?.mediaType || null,
    tmdbId: context?.tmdbId ?? null,
    title: context?.title || "",
    season: positiveInt(context?.season),
    episode: positiveInt(context?.episode),
    episodeName: context?.episodeName || "",
    nextEpisodeAvailable: context?.nextEpisodeAvailable,
  };
};

const unwrap = (response) => {
  const first = response?.data ?? response ?? {};
  return first?.data && typeof first.data === "object"
    ? first.data
    : first;
};

const regularSeasons = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((item) =>
      positiveInt(item?.season_number) != null &&
      Number(item?.episode_count || 0) > 0
    )
    .sort((a, b) =>
      Number(a?.season_number || 0) -
      Number(b?.season_number || 0)
    );

const regularEpisodes = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => positiveInt(item?.episode_number) != null)
    .sort((a, b) =>
      Number(a?.episode_number || 0) -
      Number(b?.episode_number || 0)
    );

export default function PlayerEpisodeQuickNav() {
  const [context, setContext] = useState(readContext);
  const [target, setTarget] = useState(null);
  const [previousBusy, setPreviousBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const episodeKeyRef = useRef(episodeNavigationKey(context));
  const pickerRequestRef = useRef(0);
  const seasonCacheRef = useRef(new Map());

  useEffect(() => {
    const refreshTarget = () => setTarget(playerOverlay());
    let refreshTimer = null;
    const onContext = (event) => {
      const detail = event?.detail || {};
      const next = {
        mediaType: detail?.mediaType || null,
        tmdbId: detail?.tmdbId ?? null,
        title: detail?.title || "",
        season: positiveInt(detail?.season),
        episode: positiveInt(detail?.episode),
        episodeName: detail?.episodeName || "",
        nextEpisodeAvailable: detail?.nextEpisodeAvailable,
      };
      const nextKey = episodeNavigationKey(next);
      // Preload/marker/status updates often publish the *same* episode.
      // Keep an open season picker intact until playback truly switches.
      if (nextKey !== episodeKeyRef.current) {
        episodeKeyRef.current = nextKey;
        ++pickerRequestRef.current;
        seasonCacheRef.current.clear();
        setPickerOpen(false);
        setPickerBusy(false);
        setPickerError("");
        setSeasons([]);
        setEpisodes([]);
        setSelectedSeason(null);
      }
      setContext(next);
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refreshTarget, 60);
    };

    window.addEventListener("mg:player-context", onContext);
    const observer = new MutationObserver(refreshTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    refreshTarget();

    return () => {
      ++pickerRequestRef.current;
      window.removeEventListener("mg:player-context", onContext);
      observer.disconnect();
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
    };
  }, []);

  const closePicker = () => {
    ++pickerRequestRef.current; // Invalidate all delayed TMDB results.
    setPickerOpen(false);
    setPickerBusy(false);
  };


  const loadEpisodes = async (seasonNumber, tmdbId = context.tmdbId) => {
    const season = positiveInt(seasonNumber);
    if (!tmdbId || !season) return;
    const requestId = ++pickerRequestRef.current;
    setPickerBusy(true);
    setPickerError("");
    setSelectedSeason(season);
    setEpisodes([]);

    const cacheKey = `${tmdbId}:${season}`;
    const cached = seasonCacheRef.current.get(cacheKey);
    if (cached) {
      if (requestId === pickerRequestRef.current) {
        setEpisodes(cached);
        setPickerBusy(false);
      }
      return;
    }

    try {
      const response = await base44.functions.invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: tmdbId,
        season_number: season,
      });
      if (requestId !== pickerRequestRef.current) return;
      const data = unwrap(response);
      const nextEpisodes = regularEpisodes(data?.episodes);
      seasonCacheRef.current.set(cacheKey, nextEpisodes);
      setEpisodes(nextEpisodes);
      if (!nextEpisodes.length) {
        setPickerError("No episodes were returned for this season.");
      }
    } catch (error) {
      if (requestId !== pickerRequestRef.current) return;
      console.warn("[Media God] Could not load season episodes", error);
      setPickerError(error?.message || "Could not load this season's episodes.");
    } finally {
      if (requestId === pickerRequestRef.current) setPickerBusy(false);
    }
  };

  const openSeasonPicker = async () => {
    if (pickerOpen) {
      closePicker();
      return;
    }
    if (!context.tmdbId) return;
    setPickerOpen(true);
    setPickerBusy(true);
    setPickerError("");

    // Reopening the selector should not reload the same show or flicker.
    if (seasons.length) {
      await loadEpisodes(selectedSeason || context.season || seasons[0].season_number);
      return;
    }

    const requestId = ++pickerRequestRef.current;
    try {
      const response = await base44.functions.invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: context.tmdbId,
      });
      if (requestId !== pickerRequestRef.current) return;
      const data = unwrap(response);
      const nextSeasons = regularSeasons(data?.details?.seasons || data?.seasons);
      setSeasons(nextSeasons);

      if (!nextSeasons.length) {
        setPickerError("Season information is not available for this show.");
        setPickerBusy(false);
        return;
      }
      const currentSeason = nextSeasons.find(
        (season) => Number(season.season_number) === Number(context.season)
      );
      await loadEpisodes((currentSeason || nextSeasons[0]).season_number, context.tmdbId);
    } catch (error) {
      if (requestId !== pickerRequestRef.current) return;
      console.warn("[Media God] Could not load show seasons", error);
      setPickerError(error?.message || "Could not load this show's seasons.");
      setPickerBusy(false);
    }
  };


  const chooseEpisodes = () => {
    closePicker();
    window.dispatchEvent(new CustomEvent("mg:choose-episode"));
  };

  const playPrevious = async () => {
    const tmdbId = context.tmdbId;
    const season = positiveInt(context.season);
    const episode = positiveInt(context.episode);

    if (!tmdbId || !season || !episode || previousBusy) return;

    if (episode > 1) {
      window.dispatchEvent(new CustomEvent("mg:play-specific-episode", {
        detail: { tmdbId, seasonNumber: season, episodeNumber: episode - 1 },
      }));
      return;
    }

    setPreviousBusy(true);
    try {
      const detailsResponse = await base44.functions.invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: tmdbId,
      });
      const details = unwrap(detailsResponse);
      const seasonList = regularSeasons(details?.details?.seasons || details?.seasons);
      const previousSeason = [...seasonList].reverse().find(
        (item) => Number(item?.season_number || 0) < season
      );
      const previousSeasonNumber = positiveInt(previousSeason?.season_number);
      if (!previousSeasonNumber) return;

      const seasonResponse = await base44.functions.invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: tmdbId,
        season_number: previousSeasonNumber,
      });
      const seasonData = unwrap(seasonResponse);
      const lastEpisode = regularEpisodes(seasonData?.episodes)
        .filter((item) => episodeHasAired(item)).slice(-1)[0];
      const episodeNumber = positiveInt(lastEpisode?.episode_number) ||
        positiveInt(previousSeason?.episode_count);
      if (!episodeNumber) return;

      window.dispatchEvent(new CustomEvent("mg:play-specific-episode", {
        detail: {
          tmdbId,
          seasonNumber: previousSeasonNumber,
          episodeNumber,
          episodeItem: lastEpisode || null,
        },
      }));
    } catch (error) {
      console.warn("[Media God] Could not load the previous episode", error);
    } finally {
      setPreviousBusy(false);
    }
  };

  const playEpisode = (episodeItem) => {
    const episodeNumber = positiveInt(episodeItem?.episode_number);
    const seasonNumber = positiveInt(selectedSeason);
    if (!context.tmdbId || !seasonNumber || !episodeNumber) return;

    if (!episodeHasAired(episodeItem)) return;
    closePicker();
    window.dispatchEvent(new CustomEvent("mg:play-specific-episode", {
      detail: {
        tmdbId: context.tmdbId,
        seasonNumber,
        episodeNumber,
        episodeItem,
        seriesTitle: context.title,
      },
    }));
  };

  const playNext = () => {
    if (context.nextEpisodeAvailable === false) return;
    closePicker();
    window.dispatchEvent(new CustomEvent("mg:play-next-episode"));
  };

  const isTvEpisode = context.mediaType === "tv" &&
    context.tmdbId && context.season && context.episode;

  if (!target || !isTvEpisode) return null;

  const controls = (
    <>
      <div
        className="absolute right-2 top-2 z-[85] flex flex-wrap items-center justify-end gap-1 rounded-xl border border-white/10 bg-black/75 p-1 shadow-xl backdrop-blur-md sm:right-3 sm:top-3"
        data-mg-episode-quick-nav="true"
      >
        <button
          type="button"
          data-mg-overlay-back="true"
          onClick={openSeasonPicker}
          className="flex min-h-10 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-mg-green sm:text-sm"
          aria-label="Browse seasons and episodes"
          aria-expanded={pickerOpen}
          title="Browse seasons and episodes"
        >
          <ListVideo className="h-4 w-4" />
          <span>Seasons & episodes</span>
          <ChevronDown className={`h-3.5 w-3.5 transition ${pickerOpen ? "rotate-180" : ""}`} />
        </button>
        <button type="button" data-mg-overlay-back="true" onClick={playPrevious}
          disabled={previousBusy}
          className="flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-mg-green"
          aria-label="Previous episode" title="Previous episode">
          {previousBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SkipBack className="h-4 w-4" />}
          <span className="hidden sm:inline">Previous</span>
        </button>
        <button type="button" data-mg-overlay-back="true" onClick={playNext}
          disabled={context.nextEpisodeAvailable === false}
          className="flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-mg-green"
          aria-label="Next episode" title="Next episode">
          <SkipForward className="h-4 w-4" />
          <span className="hidden sm:inline">Next</span>
        </button>
        <button
          type="button"
          data-mg-overlay-back="true"
          onClick={chooseEpisodes}
          className="flex min-h-10 items-center gap-1.5 rounded-lg bg-mg-green/15 px-3 text-xs font-semibold text-mg-green transition hover:bg-mg-green/25 focus:outline-none focus:ring-2 focus:ring-mg-green sm:text-sm"
          aria-label="Back to episodes"
          title="Back to episodes"
        >
          <span>Back to episodes</span>
        </button>
      </div>

      {pickerOpen && (
        <section
          className="absolute right-2 top-14 z-[86] flex max-h-[min(72vh,36rem)] w-[min(23rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-950/95 text-white shadow-2xl backdrop-blur-xl sm:right-3 sm:top-16"
          aria-label="Season and episode picker"
          data-mg-season-episode-picker="true"
        >
          <header className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
            <div className="min-w-0">
              <div className="text-sm font-bold">Seasons & episodes</div>
              <div className="mt-0.5 truncate text-xs text-white/60">{context.title || "TV show"}</div>
            </div>
            <button
              type="button"
              onClick={closePicker}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20"
              aria-label="Close season picker"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="border-b border-white/10 p-3">
            <label htmlFor="mg-player-season-select" className="mb-1.5 block text-xs font-semibold text-white/65">
              Choose season
            </label>
            <select
              id="mg-player-season-select"
              value={selectedSeason ?? ""}
              onChange={(event) => loadEpisodes(event.target.value)}
              disabled={pickerBusy && seasons.length === 0}
              className="min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-mg-green focus:ring-1 focus:ring-mg-green"
            >
              {seasons.map((season) => (
                <option key={season.season_number} value={season.season_number}>
                  {season.name || `Season ${season.season_number}`}
                  {season.episode_count ? ` · ${season.episode_count} episodes` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {pickerBusy && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-white/70">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading episodes…
              </div>
            )}
            {!pickerBusy && pickerError && (
              <p role="status" className="px-2 py-5 text-center text-sm text-amber-200/90">
                {pickerError}
              </p>
            )}
            {!pickerBusy && !pickerError && episodes.map((episodeItem) => {
              const episodeNumber = positiveInt(episodeItem.episode_number);
              const isCurrent = Number(selectedSeason) === Number(context.season) &&
                Number(episodeNumber) === Number(context.episode);
              const hasAired = episodeHasAired(episodeItem);
              return (
                <button
                  type="button"
                  key={episodeNumber}
                  onClick={() => playEpisode(episodeItem)}
                  disabled={!hasAired}
                  title={!hasAired ? "Not yet aired" : undefined}
                  className={`mb-1 flex w-full items-start gap-3 rounded-xl p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-mg-green ${isCurrent ? "bg-mg-green/15 ring-1 ring-mg-green/50" : "hover:bg-white/10"} ${!hasAired ? "cursor-not-allowed opacity-45" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 px-1 text-xs font-bold text-white/80">
                    {String(episodeNumber).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5">
                      {episodeItem.name || `Episode ${episodeNumber}`}
                      {isCurrent && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-mg-green">Playing</span>}
                      {!hasAired && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-200">Coming soon</span>}
                    </span>
                    {episodeItem.overview && (
                      <span className="mt-1 block line-clamp-2 text-xs leading-4 text-white/55">
                        {episodeItem.overview}
                      </span>
                    )}
                    {episodeItem.air_date && (
                      <span className="mt-1 block text-[11px] text-white/40">
                        {episodeItem.air_date}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );

  return createPortal(controls, target);
}
