import { readEmbedBookmark } from "./embedWatchingHistory";
import { profiledLibrary, activeHouseholdProfileId } from "@/components/mg/householdProfiles";
import { watchContinueWatchingChanges } from "@/components/mg/continueWatchingSync";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Clock3,
  Download,
  History,
  ListVideo,
  Play,
  Star,
  X,
} from "lucide-react";

import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import StreamSourcesBox from "@/components/mg/StreamSourcesBox";
import MediaDownloadPicker from "@/components/mg/MediaDownloadPicker";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { Image } from "@/components/ui/image";
import { restoreResumeSource } from "./resumeSource";
import { isIpBoundHostedProvider, isElfHostedUrl } from "@/components/mg/ipBoundVodSafety";

const PosterImage = /** @type {any} */ (Image);

const WATCHED_THRESHOLD = 0.92;
const MIN_PROGRESS_SECONDS = 5;
const TMDB_RESOLVE_BUDGET_MS = 300;

const isCardActivationKey = (event) => {
  const key = String(event?.key || event?.code || "");
  const code = Number(event?.keyCode || event?.which || 0);

  return (
    key === "Enter" ||
    key === "NumpadEnter" ||
    key === "Select" ||
    key === "Accept" ||
    key === " " ||
    code === 13 ||
    code === 23 ||
    code === 66
  );
};

const positiveInt = (value) => {
  const number = Number(value);

  return Number.isInteger(number) && number > 0
    ? number
    : null;
};

const baseTitle = (value) =>
  String(value || "")
    .replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, "")
    .trim();

const parseContentKey = (item) => {
  const key = String(item?.content_key || "");

  if (key.startsWith("mg2|")) {
    const [
      ,
      tmdbId,
      mediaType,
      year,
      season,
      episode,
      encodedTitle,
    ] = key.split("|");

    let title = item?.title || "";

    try {
      title = decodeURIComponent(encodedTitle || "") || title;
    } catch {
      // Keep stored title.
    }

    return {
      canonical: true,
      tmdbId: String(tmdbId || ""),
      mediaType: mediaType === "tv" ? "tv" : "movie",
      year: String(year || item?.year || ""),
      season: positiveInt(season),
      episode: positiveInt(episode),
      episodeName: String(item?.episode_name || "").trim(),
      title: baseTitle(title || item?.title || "Video") || "Video",
    };
  }

  const parts = key.split("|");
  const season = positiveInt(parts[2]);
  const episode = positiveInt(parts[3]);

  return {
    canonical: false,
    tmdbId: "",
    mediaType: season && episode ? "tv" : "movie",
    year: String(parts[1] || item?.year || ""),
    season,
    episode,
    episodeName: String(item?.episode_name || "").trim(),
    title:
      baseTitle(parts[0] || item?.title || "Video") ||
      item?.title ||
      "Video",
  };
};

const hasSavedPlayableSource = (item) => {
  const type = String(item?.source_type || "").toLowerCase();
  const url = String(item?.video_url || "").trim();
  return /^(rd|debrid|torrent|file)$/.test(type) &&
    (url.startsWith("mgsource:") || /^https?:\/\//i.test(url));
};

const progressRatio = (item) => {
  const progress = Number(item?.progress || 0);
  const duration = Number(item?.duration || 0);

  if (!duration || duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, progress / duration));
};

const formatWatched = (item) => {
  const seconds = Number(item?.progress || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${Math.max(1, minutes)}m`;
};

const formatRemaining = (item) => {
  const progress = Number(item?.progress || 0);
  const duration = Number(item?.duration || 0);

  if (!duration || duration <= progress) {
    return "";
  }

  const seconds = Math.max(0, duration - progress);
  const minutes = Math.max(1, Math.ceil(seconds / 60));

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return mins > 0
      ? `${hours}h ${mins}m left`
      : `${hours}h left`;
  }

  return `${minutes} min left`;
};

const identityFor = (meta) => {
  if (meta.mediaType === "tv") {
    return [
      "tv",
      meta.tmdbId || meta.title.toLowerCase(),
      meta.season || "",
      meta.episode || "",
    ].join(":");
  }

  return [
    "movie",
    meta.tmdbId || meta.title.toLowerCase(),
    meta.year || "",
  ].join(":");
};

const resolveTmdbId = async (meta) => {
  if (meta.tmdbId) {
    return String(meta.tmdbId);
  }

  if (!meta.title) {
    return "";
  }

  try {
    const response = await base44.functions.invoke(
      "getTmdbMovies",
      {
        multi_search: meta.title,
      }
    );

    const candidates = Array.isArray(response?.data?.movies)
      ? response.data.movies
      : [];

    const sameType = candidates.filter(
      (candidate) =>
        String(candidate?.media_type || "") === meta.mediaType
    );

    const sameYear = meta.year
      ? sameType.find(
          (candidate) =>
            String(candidate?.year || "") === String(meta.year)
        )
      : null;

    const match = sameYear || sameType[0] || candidates[0];

    return String(match?.id || match?.tmdb_id || "");
  } catch {
    return "";
  }
};

const resolveTmdbIdQuickly = async (meta) => {
  if (meta?.tmdbId) {
    return String(meta.tmdbId);
  }

  let timer = 0;

  try {
    return await Promise.race([
      resolveTmdbId(meta),
      new Promise((resolve) => {
        timer = window.setTimeout(() => resolve(""), TMDB_RESOLVE_BUDGET_MS);
      }),
    ]);
  } finally {
    if (timer) {
      window.clearTimeout(timer);
    }
  }
};

export default function ContinueWatchingRow({ onOpenDetail }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourcePicker, setSourcePicker] = useState(null);
  const [downloadPicker, setDownloadPicker] = useState(null);
  const player = usePlayer();
  const loadVersionRef = useRef(0);
  useEffect(() => {
    // Once an explicitly chosen torrent opens the player, hide the selector.
    if (player.isOpen) setSourcePicker(null);
  }, [player.isOpen]);

  const load = () => {
    const version = ++loadVersionRef.current;
    const requestedProfile = activeHouseholdProfileId();
    profiledLibrary.ContinueWatching
      .list("-updated_date", 250)
      .then((rows) => {
        if (version !== loadVersionRef.current || requestedProfile !== activeHouseholdProfileId()) return;
        const entries = [...(rows || [])]
          .map((item) => ({
            item,
            meta: parseContentKey(item),
            ratio: progressRatio(item),
            updatedAt: new Date(
              item?.updated_date || item?.created_date || 0
            ).getTime(),
          }))
          .filter(
            ({ item }) =>
              Number(item?.progress || 0) >= MIN_PROGRESS_SECONDS || Boolean(readEmbedBookmark(item))
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);

        const byIdentity = new Map();

        entries.forEach((entry) => {
          const identity = identityFor(entry.meta);
          const state =
            entry.ratio >= WATCHED_THRESHOLD
              ? "completed"
              : "resume";
          const stateIdentity = `${identity}:${state}`;
          const existing = byIdentity.get(stateIdentity);

          /*
           * Entries are already newest-first. Keep the newest row for each
           * content/state pair so a fresh replay cannot be hidden by an older
           * completed record. Completed history and in-progress resume state
           * deliberately remain separate because Recently Watched uses the
           * completed rows.
           */
          if (!existing) {
            byIdentity.set(stateIdentity, entry);
            return;
          }

          if (!hasSavedPlayableSource(existing.item) &&
              hasSavedPlayableSource(entry.item)) {
            // Recover a stable source saved by an older row without losing
            // the newer row's playback position (e.g. 52 minutes).
            byIdentity.set(stateIdentity, {
              ...existing,
              item: {
                ...existing.item,
                video_url: entry.item.video_url,
                source_type: entry.item.source_type,
              },
            });
            // The older record is a recovery copy until the next save.
            return;
          }

        });

        const winners = Array.from(byIdentity.values());

        setItems(
          winners
            .filter(({ ratio }) => ratio < WATCHED_THRESHOLD)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 20)
            .map(({ item }) => item)
        );

        // Never silently delete a duplicate on a history refresh. Another
        // device may still be writing that row; explicit Remove is the only
        // action that deletes account history.
      })
      .catch(() => {})
      .finally(() => { if (version === loadVersionRef.current) setLoading(false); });
  };

  useEffect(() => {
    const cleanup = watchContinueWatchingChanges(load, {
      subscribe: (onChange) => profiledLibrary.ContinueWatching.subscribe(onChange),
    });
    return () => {
      loadVersionRef.current += 1;
      cleanup();
    };
  }, []);

  const remove = async (id, event) => {
    event?.stopPropagation();

    setItems((current) =>
      current.filter((item) => item.id !== id)
    );

    try {
      await profiledLibrary.ContinueWatching.delete(id);
    } catch {
      load();
    }
  };

  const openDetail = async (item) => {
    const meta = parseContentKey(item);
    const isTv = meta.mediaType === "tv";
    const tmdbId = await resolveTmdbIdQuickly(meta);

    /*
     * OnlyFlix is the default for a new movie launch. Continue Watching is
     * different: if the user manually picked a source, replay that same source
     * first. A saved mgsource descriptor carries the stable torrent/magnet and
     * file/provider identity, not just the short-lived resolved stream URL.
     */
    const bookmark = readEmbedBookmark(item);
    if (bookmark && player.playSavedEmbed?.({
      id: tmdbId || undefined, tmdbId: tmdbId || undefined,
      title: meta.title, year: meta.year, poster: item.poster_url || "",
      mediaType: meta.mediaType, type: isTv ? "series" : "movie",
      season: meta.season || undefined, episode: meta.episode || undefined,
    }, bookmark)) return;

    const savedUrl = String(item.video_url || "").trim();
    const savedSourceType = String(item.source_type || "").toLowerCase();
    const hasSavedSource =
      /^(rd|torrent|debrid|file)$/i.test(savedSourceType) &&
      (savedUrl.startsWith("mgsource:") || /^https?:\/\//i.test(savedUrl));
    const hasPreviouslySelectedAlternateSource =
      /^(rd|torrent|debrid|file)$/i.test(savedSourceType);

    if (hasSavedSource) {
      let savedSource = null;

      if (savedUrl.startsWith("mgsource:")) {
        try {
          savedSource = restoreResumeSource(JSON.parse(decodeURIComponent(savedUrl.slice("mgsource:".length))));
        } catch {
          savedSource = null;
        }
      }

      // Old history can contain a direct ElfHosted link issued from a server
      // IP. Never reopen that expired/IP-bound URL when resuming; fall back
      // to fresh source discovery while retaining the saved seek position.
      const savedDirectIsIpBound = savedSource &&
        String(savedSource.type || "").toLowerCase() === "url" &&
        isIpBoundHostedProvider(savedSource);
      if (savedSource && typeof savedSource === "object" && !savedDirectIsIpBound) {
        await player.play({
          id: tmdbId || undefined,
          tmdbId: tmdbId || undefined,
          tmdb_id: tmdbId || undefined,
          imdbId: meta.imdbId || item.imdb_id,
          title: meta.title,
          year: meta.year,
          poster: item.poster_url || "",
          mediaType: meta.mediaType,
          type: isTv ? "series" : "movie",
          season: meta.season || undefined,
          episode: meta.episode || undefined,
          rdTitle: meta.title,
          rdYear: meta.year,
          rdSeason: meta.season || undefined,
          rdEpisode: meta.episode || undefined,
          episodeName: meta.episodeName || "",
          startTime: Number(item.progress || 0),
          preferRd: true,
          // The saved torrent is the preferred candidate, not the entire
          // catalogue. Keep Real-Debrid and addon discovery available.
          resumeFromHistory: true,
          verifiedPlaybackPolicy: "manual",
          sources: [savedSource],
        });
        return;
      }

      if (/^https?:\/\//i.test(savedUrl) &&
          !isElfHostedUrl(savedUrl) &&
          !isIpBoundHostedProvider({
            url: savedUrl,
            addon: item?.source_name || item?.sourceName || item?.addon || "",
          })) {
        await player.play({
          id: tmdbId || undefined,
          tmdbId: tmdbId || undefined,
          tmdb_id: tmdbId || undefined,
          imdbId: meta.imdbId || item.imdb_id,
          title: meta.title,
          year: meta.year,
          poster: item.poster_url || "",
          mediaType: meta.mediaType,
          type: isTv ? "series" : "movie",
          season: meta.season || undefined,
          episode: meta.episode || undefined,
          rdTitle: meta.title,
          rdYear: meta.year,
          rdSeason: meta.season || undefined,
          rdEpisode: meta.episode || undefined,
          episodeName: meta.episodeName || "",
          startTime: Number(item.progress || 0),
          // Old history may hold an expired CDN or debrid URL. Keep it as
          // one candidate, but do not lock discovery onto it.
          resumeFromHistory: true,
          sources: [{
            label: "Resume last source",
            name: "Resume last source",
            type: "url",
            src: savedUrl,
            url: savedUrl,
            direct: true,
            viaRealDebrid: savedSourceType === "rd" || savedSourceType === "debrid",
          }],
          verifiedPlaybackPolicy: "manual",
          preferRd: true,
        });
        return;
      }
    }

    // A previous non-OnlyFlix selection must never be silently replaced by
    // OnlyFlix, even if an older record is missing its serialised source URL.
    // In that recovery case, let the normal source resolver try again.
    // Only a recorded, explicit OnlyFlix URL can reopen that web player.
    // Incomplete/stale history must resolve a playable source instead of
    // silently replacing the viewer's last torrent with OnlyFlix.
    const explicitOnlyFlixResume =
      savedSourceType === "onlyflix" && /onlyflix/i.test(savedUrl);
    if (!isTv && explicitOnlyFlixResume && !hasPreviouslySelectedAlternateSource && player.playOnlyFlix) {
      if (player.playOnlyFlix({
        id: tmdbId || undefined,
        tmdbId: tmdbId || undefined,
        tmdb_id: tmdbId || undefined,
        imdbId: meta.imdbId || item.imdb_id,
        title: meta.title,
        year: meta.year,
        poster: item.poster_url || "",
        mediaType: "movie",
        type: "movie",
      })) return;
    }

    // A TV resume must not route through Choose Episode: that is a fresh
    // Play action, which loses the saved seek point. Both films and episodes
    // continue to the native/source player at the recorded position.

    const playbackTitle =
      isTv && meta.season && meta.episode
        ? `${meta.title} — S${String(meta.season).padStart(2, "0")}E${String(
            meta.episode
          ).padStart(2, "0")}`
        : meta.title;

    player.play({
      id: tmdbId || undefined,
      tmdbId: tmdbId || undefined,
      title: playbackTitle,
      poster: item.poster_url || "",
      year: meta.year,
      mediaType: meta.mediaType,
      type: isTv ? "series" : "movie",
      season: meta.season || undefined,
      episode: meta.episode || undefined,
      rdTitle: meta.title,
      rdYear: meta.year,
      rdSeason: meta.season || undefined,
      rdEpisode: meta.episode || undefined,
      episodeName: meta.episodeName || "",
      startTime: Number(item.progress || 0),
      preferRd: true,
      resumeFromHistory: true,
      verifiedPlaybackPolicy: "strict",
      sources: [],
    });
  };

  // An explicit Players action offers the same OnlyFlix + backup tabs
  // available from normal movie and episode Play. It must never replace
  // card activation: resuming a saved torrent or native source still uses
  // the original file and playback position.
  const openPlayerOptions = async (item, event) => {
    event?.stopPropagation();
    const meta = parseContentKey(item);
    const isTv = meta.mediaType === "tv";
    const tmdbId = await resolveTmdbIdQuickly(meta);

    if (isTv && (!meta.season || !meta.episode)) {
      // A generic TV series page cannot identify the watched episode.
      // Preserve the existing resume route rather than guessing.
      await openDetail(item);
      return;
    }

    const launched = player.playOnlyFlix?.({
      id: tmdbId || undefined,
      tmdbId: tmdbId || undefined,
      tmdb_id: tmdbId || undefined,
      imdbId: item.imdb_id || undefined,
      title: meta.title,
      year: meta.year,
      poster: item.poster_url || "",
      mediaType: meta.mediaType,
      type: isTv ? "series" : "movie",
      season: isTv ? meta.season : undefined,
      episode: isTv ? meta.episode : undefined,
      rdSeason: isTv ? meta.season : undefined,
      rdEpisode: isTv ? meta.episode : undefined,
      episodeName: meta.episodeName || "",
    });

    if (!launched) {
      // Older history records may lack any resolvable TMDB/IMDb identity.
      // Never open the wrong film or episode; keep their prior resume path.
      await openDetail(item);
    }
  };

  const openTorrentSources = async (item, event) => {
    event?.stopPropagation();
    const meta = parseContentKey(item);
    // Avoid a generic TV show search that could return the wrong episode.
    if (meta.mediaType === "tv" && (!meta.season || !meta.episode)) {
      await openReviews(item, event, "overview");
      return;
    }
    const tmdbId = await resolveTmdbIdQuickly(meta);
    setSourcePicker({ item, meta, tmdbId });
  };

  const openReviews = async (item, event, tab = "reviews") => {
    event?.stopPropagation();
    const meta = parseContentKey(item);
    const tmdbId = await resolveTmdbIdQuickly(meta);
    if (!onOpenDetail) return;
    onOpenDetail({
      id: tmdbId || undefined,
      tmdb_id: tmdbId || undefined,
      tmdbId: tmdbId || undefined,
      title: meta.title,
      poster_url: item.poster_url || "",
      year: meta.year,
      media_type: meta.mediaType,
      mediaType: meta.mediaType,
      type: meta.mediaType,
      season: meta.season || undefined,
      episode: meta.episode || undefined,
      initialDetailTab: tab,
    });
  };

  const displayItems = useMemo(
    () =>
      items.map((item) => {
        const meta = parseContentKey(item);
        const ratio = progressRatio(item);

        return {
          item,
          meta,
          progress: ratio * 100,
          remaining: formatRemaining(item),
        };
      }),
    [items]
  );

  if (loading || displayItems.length === 0) {
    return null;
  }

  return (
    <section className="mg-fire-tv-resume-section px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14 pt-3 sm:pt-5">
      <div className="flex items-center gap-2.5 3xl:gap-3 mb-4 3xl:mb-5">
        <History className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />

        <div>
          <h2 className="text-white font-semibold text-sm sm:text-base 3xl:text-xl 4xl:text-2xl">
            Continue Watching
          </h2>

          <p className="mt-0.5 text-[11px] sm:text-xs 3xl:text-sm text-white/40">
            Resume where you stopped, or choose a torrent. Web players may start from the beginning.
          </p>
        </div>
      </div>

      <div
        className="mg-fire-tv-resume-row flex gap-4 3xl:gap-6 overflow-x-auto overscroll-x-contain pb-4 scrollbar-hide snap-x snap-proximity"
        data-mg-tv-row="true"
        aria-label="Continue Watching"
      >
        {displayItems.map(({ item, meta, progress, remaining }) => {
          const episodeLabel =
            meta.mediaType === "tv" && meta.season && meta.episode
              ? `S${String(meta.season).padStart(2, "0")} E${String(
                  meta.episode
                ).padStart(2, "0")}`
              : "";

          const watched = formatWatched(item);
          const detailLine = [
            episodeLabel,
            meta.episodeName,
            remaining,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <div
              key={item.id}
              data-mg-card-primary="true"
              data-mg-focus-key={`continue:${identityFor(meta)}`}
              onClick={() => openDetail(item)}
              role="button"
              tabIndex={0}
              aria-label={`Resume ${meta.title}${episodeLabel ? ` ${episodeLabel}` : ""} at ${watched || "saved position"}`}
              onKeyDown={(event) => {
                if (isCardActivationKey(event)) {
                  event.preventDefault();
                  event.stopPropagation();
                  openDetail(item);
                }
              }}
              className="mg-fire-tv-resume-card group relative w-44 sm:w-52 md:w-56 xl:w-60 3xl:w-72 4xl:w-80 shrink-0 text-left cursor-pointer snap-start rounded-xl transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-mg-green focus:ring-offset-2 focus:ring-offset-mg-background focus:scale-[1.025] focus-within:ring-2 focus-within:ring-mg-green"
            >
              <div className="relative aspect-video rounded-xl overflow-hidden bg-mg-card border border-white/10 shadow-lg shadow-black/20 group-focus:border-mg-green">
                <PosterImage
                  src={item.poster_url}
                  fittingType="fill"
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">
                  <div className="w-9 h-9 3xl:w-12 3xl:h-12 4xl:w-14 4xl:h-14 rounded-full bg-mg-green text-black flex items-center justify-center shadow-xl">
                    <Play className="w-4 h-4 3xl:w-6 3xl:h-6 fill-black" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => remove(item.id, event)}
                  className="mg-fire-tv-secondary-action absolute top-1 right-1 3xl:top-2 3xl:right-2 w-7 h-7 3xl:w-9 3xl:h-9 rounded-full bg-black/75 text-white/75 hover:text-white hover:bg-black flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-mg-green"
                  aria-label={`Remove ${meta.title} from Continue Watching`}
                  title="Remove from Continue Watching"
                >
                  <X className="w-3.5 h-3.5 3xl:w-4 3xl:h-4" />
                </button>

                {episodeLabel && (
                  <span className="absolute left-2 top-2 rounded bg-black/80 px-2 py-1 text-[10px] font-bold text-white shadow">
                    {episodeLabel}
                  </span>
                )}

                {remaining && (
                  <span className="absolute left-2 bottom-2 flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[9px] font-semibold text-white/90">
                    <Clock3 className="w-3 h-3 text-mg-green" />
                    {remaining}
                  </span>
                )}

                <div role="progressbar" aria-label="Episode watched" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="absolute bottom-0 left-0 right-0 h-1.5 3xl:h-2 bg-white/20">
                  <div
                    className="h-full bg-mg-green"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-2 text-white font-semibold text-sm sm:text-[15px] 3xl:text-base truncate">
                {meta.title}
              </div>

              <div className="mt-1 min-h-[1rem] text-white/50 text-[11px] sm:text-xs 3xl:text-sm truncate">
                {readEmbedBookmark(item) ? "Reopen last player · position unavailable" : detailLine || `${Math.round(progress)}% watched`}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5" data-mg-continue-actions="true">
                <button
                  type="button"
                  data-mg-continue-resume="true"
                  onClick={(event) => { event.stopPropagation(); void openDetail(item); }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="flex min-h-11 items-center justify-center gap-1 rounded-lg bg-mg-green px-2 text-xs font-bold text-black focus:outline-none focus:ring-2 focus:ring-white"
                >
                  <Play className="h-3.5 w-3.5 fill-black" />
                  {watched ? `Resume · ${watched}` : "Resume"}
                </button>
                <button
                  type="button"
                  data-mg-continue-sources="true"
                  onClick={(event) => { void openTorrentSources(item, event); }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-mg-green/40 bg-mg-green/10 px-2 text-xs font-semibold text-mg-green focus:outline-none focus:ring-2 focus:ring-mg-green"
                >
                  <ListVideo className="h-3.5 w-3.5" />
                  Sources
                </button>
                <button
                  type="button"
                  data-mg-continue-reviews="true"
                  onClick={(event) => { void openReviews(item, event); }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green"
                >
                  <Star className="h-3.5 w-3.5" />
                  Reviews
                </button>
                <button
                  type="button"
                  data-mg-continue-player-options="true"
                  onClick={(event) => { void openPlayerOptions(item, event); }}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={`Open web player alternatives for ${meta.title} (may restart)`}
                  className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green"
                >
                  <ListVideo className="h-3.5 w-3.5" />
                  Web players
                </button>
                <button
                  type="button"
                  data-mg-continue-download="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDownloadPicker({ item, meta });
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-mg-green/30 bg-mg-green/10 px-2 text-xs font-semibold text-mg-green focus:outline-none focus:ring-2 focus:ring-mg-green"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>

            </div>
          );
        })}
      </div>
      {downloadPicker && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-black/90 p-3"
          onClick={() => setDownloadPicker(null)} role="presentation">
          <div role="dialog" aria-modal="true"
            aria-label={`Download ${downloadPicker.meta.title}`}
            className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-zinc-950 p-3 text-white"
            onClick={(event) => event.stopPropagation()}>
            <MediaDownloadPicker
              title={downloadPicker.meta.title}
              year={downloadPicker.meta.year}
              mediaType={downloadPicker.meta.mediaType}
              season={downloadPicker.meta.season}
              episode={downloadPicker.meta.episode}
              onClose={() => setDownloadPicker(null)}
              onFindSources={() => {
                const selected = downloadPicker.item;
                setDownloadPicker(null);
                void openTorrentSources(selected);
              }}
            />
          </div>
        </div>, document.body
      )}
      {sourcePicker && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-black/90 p-3"
          onClick={() => setSourcePicker(null)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Torrent sources for ${sourcePicker.meta.title}`}
            className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/20 bg-zinc-950 p-4 text-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{sourcePicker.meta.title}</h3>
                <p className="text-xs text-white/60">Choose a torrent or Real-Debrid source. The saved playback position will be requested.</p>
              </div>
              <button
                type="button"
                onClick={() => setSourcePicker(null)}
                aria-label="Close torrent sources"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/20 focus:outline-none focus:ring-2 focus:ring-mg-green"
              ><X className="h-4 w-4" /></button>
            </div>
            <StreamSourcesBox
              title={sourcePicker.meta.title}
              poster={sourcePicker.item.poster_url || ""}
              tmdbId={sourcePicker.tmdbId}
              imdbId={sourcePicker.item.imdb_id || ""}
              rdYear={sourcePicker.meta.year}
              mediaType={sourcePicker.meta.mediaType}
              season={sourcePicker.meta.season}
              episode={sourcePicker.meta.episode}
              resumeAt={Number(sourcePicker.item.progress || 0)}
              torrentOnly
            />
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}
