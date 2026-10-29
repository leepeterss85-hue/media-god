import { EMBED_HISTORY_CHANGED } from "./embedWatchingHistory";
import { profiledLibrary } from "@/components/mg/householdProfiles";
import {
  useEffect,
  useRef,
} from "react";


const WATCHED_THRESHOLD = 0.92;
const MIN_RESUME_SECONDS = 5;
const SAVE_INTERVAL_MS = 10000;

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

const normaliseContext = (value) => {
  const mediaType =
    value?.mediaType === "tv"
      ? "tv"
      : value?.mediaType === "movie"
        ? "movie"
        : null;

  const title = baseTitle(value?.title);

  if (!mediaType || !title) {
    return null;
  }

  return {
    mediaType,
    tmdbId: String(value?.tmdbId ?? "").trim(),
    title,
    year: String(value?.year ?? "").trim(),
    season: positiveInt(value?.season),
    episode: positiveInt(value?.episode),
    episodeName: String(value?.episodeName || "").trim(),
  };
};

const contentKeyFor = (context) => {
  if (!context) {
    return "";
  }

  return [
    "mg2",
    context.tmdbId || "",
    context.mediaType,
    context.year || "",
    context.season || "",
    context.episode || "",
    encodeURIComponent(context.title || "Video"),
  ].join("|");
};

const parseContentKey = (row) => {
  const key = String(row?.content_key || "");

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

    let title = row?.title || "";

    try {
      title = decodeURIComponent(encodedTitle || "") || title;
    } catch {
      // Keep the stored title.
    }

    return {
      canonical: true,
      tmdbId: String(tmdbId || ""),
      mediaType: mediaType === "tv" ? "tv" : "movie",
      year: String(year || row?.year || ""),
      season: positiveInt(season),
      episode: positiveInt(episode),
      title: baseTitle(title || row?.title || "Video"),
    };
  }

  const parts = key.split("|");
  const season = positiveInt(parts[2]);
  const episode = positiveInt(parts[3]);

  return {
    canonical: false,
    tmdbId: "",
    mediaType: season && episode ? "tv" : "movie",
    year: String(parts[1] || row?.year || ""),
    season,
    episode,
    title: baseTitle(parts[0] || row?.title || "Video"),
  };
};

const sameContent = (meta, context) => {
  if (!meta || !context || meta.mediaType !== context.mediaType) {
    return false;
  }

  if (
    meta.mediaType === "tv" &&
    (meta.season !== context.season || meta.episode !== context.episode)
  ) {
    return false;
  }

  if (meta.tmdbId && context.tmdbId) {
    return String(meta.tmdbId) === String(context.tmdbId);
  }

  const sameTitle =
    baseTitle(meta.title).toLowerCase() ===
    baseTitle(context.title).toLowerCase();

  if (!sameTitle) {
    return false;
  }

  if (meta.year && context.year) {
    return String(meta.year) === String(context.year);
  }

  return true;
};

const ratioFor = (row) => {
  const progress = Number(row?.progress || 0);
  const duration = Number(row?.duration || 0);

  if (!duration || duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, progress / duration));
};

const serialiseResumeSource = (source) => {
  if (!source || typeof source !== "object") return null;
  const fields = [
    "id", "type", "label", "name", "title", "src", "url", "magnet",
    "magnetLink", "richMagnet", "infoHash", "info_hash", "fileIdx",
    "file_idx", "addon", "debridProvider", "sourceName", "provider",
    "filename", "quality", "resolution", "debridCached", "viaRealDebrid",
    "rdTorrentId", "torrentId", "cacheRequired", "cometUncached",
  ];
  const clean = {};
  fields.forEach((key) => {
    const value = source[key];
    if (value == null) return;
    if (["string", "number", "boolean"].includes(typeof value)) clean[key] = value;
  });
  return (clean.src || clean.url || clean.magnet || clean.magnetLink ||
    clean.richMagnet || clean.infoHash || clean.info_hash || clean.torrentId ||
    clean.rdTorrentId) ? clean : null;
};

const hasPlayableSavedSource = (row) => {
  const type = String(row?.source_type || "").toLowerCase();
  const url = String(row?.video_url || "").trim();
  return /^(rd|debrid|torrent|file)$/.test(type) &&
    (url.startsWith("mgsource:") || /^https?:\/\//i.test(url));
};

const hasTorrentIdentity = (source) => Boolean(
  source?.infoHash || source?.info_hash || source?.magnet ||
  source?.magnetLink || source?.richMagnet || source?.torrentId ||
  source?.rdTorrentId
);

const encodeResumeSource = (source) => {
  const clean = serialiseResumeSource(source);
  if (!clean) return "";
  try {
    return `mgsource:${encodeURIComponent(JSON.stringify(clean))}`;
  } catch {
    return "";
  }
};

const currentPlayerVideo = () => {
  const videos = Array.from(document.querySelectorAll("video"));

  for (let index = videos.length - 1; index >= 0; index -= 1) {
    const video = videos[index];
    const rect = video.getBoundingClientRect();

    if (rect.width > 4 && rect.height > 4 && video.isConnected) {
      return video;
    }
  }

  return null;
};

export default function ContinueWatchingAssist() {
  const stateRef = useRef({
    context: null,
    selectedSource: null,
    manualSelectionKey: "",
    recordIdByKey: new Map(),
    writesByKey: new Map(),
    pendingResume: 0,
    pendingResumeKey: "",
    lookupToken: 0,
    lastSaveAt: 0,
    completedKey: "",
    lastPosition: {
      time: 0,
      duration: 0,
      video: null,
    },
  });

  useEffect(() => {
    const state = stateRef.current;

    const save = async (
      context,
      time,
      duration,
      video,
      force = false
    ) => {
      if (!context) {
        return;
      }

      const safeTime = Math.max(0, Number(time || 0));
      const safeDuration = Math.max(0, Number(duration || 0));

      if (!Number.isFinite(safeTime) || !Number.isFinite(safeDuration)) return;

      if (safeTime < MIN_RESUME_SECONDS && !force) {
        return;
      }

      const now = Date.now();

      if (!force && now - state.lastSaveAt < SAVE_INTERVAL_MS) {
        return;
      }

      state.lastSaveAt = now;

      const key = contentKeyFor(context);

      if (!key) {
        return;
      }

      const completed =
        safeDuration > 0 && safeTime / safeDuration >= WATCHED_THRESHOLD;

      const progress = completed
        ? safeDuration
        : safeTime;

      const currentSrc = String(
        video?.currentSrc ||
          video?.src ||
          ""
      ).trim();

      if (
        completed &&
        context.mediaType === "tv" &&
        state.completedKey !== key
      ) {
        state.completedKey = key;

        window.dispatchEvent(
          new CustomEvent("mg:episode-completed", {
            detail: {
              ...context,
              contentKey: key,
            },
          })
        );
      }

      const selectedSource = serialiseResumeSource(state.selectedSource);
      const selectedSourceUrl = encodeResumeSource(selectedSource);
      const sourceUrl = selectedSourceUrl || currentSrc;
      const sourceType = selectedSource
        ? (/real-debrid|debrid/i.test(JSON.stringify(selectedSource)) ||
            selectedSource.viaRealDebrid === true ||
            Boolean(selectedSource.debridProvider)
              ? "rd"
              : "torrent")
        : /real-debrid|debrid/i.test(currentSrc)
          ? "rd"
          : /torrent|webtor|webtorrent/i.test(currentSrc)
            ? "torrent"
            : /^https?:\/\//i.test(currentSrc) && !/onlyflix/i.test(currentSrc)
              ? "torrent"
              : /onlyflix/i.test(currentSrc)
                ? "onlyflix"
                : "file";

      const patch = {
        progress,
        duration: safeDuration,
        video_url: sourceUrl,
        poster_url: String(video?.poster || ""),
        source_type: sourceType,
        title: context.title,
        year: context.year || "",
        episode_name: context.episodeName || "",
      };

      const previous = state.writesByKey.get(key) || Promise.resolve();
      const write = previous.catch(() => {}).then(async () => {
        try {
          // Always inspect the stored row before updating: a late native
          // progress callback may know the position but not the source.
          // Never let it replace an earlier manually chosen torrent.
          let existing = await profiledLibrary.ContinueWatching.filter({
            content_key: key,
          });
          // Fire TV and mobile sometimes supply different year/title metadata
          // for the SAME TMDB movie or episode. Reuse its account history row
          // instead of making two separate Continue Watching entries.
          if (!existing?.length) {
            const accountRows = await profiledLibrary.ContinueWatching.list("-updated_date", 100);
            existing = (accountRows || []).filter((row) =>
              sameContent(parseContentKey(row), context)
            );
          }

          if (existing?.length) {
            const row = existing[0];
            state.recordIdByKey.set(key, row.id);
            const preserveSource =
              hasPlayableSavedSource(row) &&
              (!selectedSourceUrl ||
                (state.manualSelectionKey !== key &&
                  !hasTorrentIdentity(selectedSource) &&
                  row.video_url.startsWith("mgsource:") &&
                  (() => {
                    try {
                      const previousSource = JSON.parse(
                        decodeURIComponent(row.video_url.slice("mgsource:".length))
                      );
                      return hasTorrentIdentity(previousSource);
                    } catch {
                      return false;
                    }
                  })()));
            // A source-selection event can arrive before the second device
            // retrieves the saved playhead. The synthetic 5-second bookmark
            // must NEVER erase the genuine position saved on another device.
            const preservePlayhead = safeTime <= MIN_RESUME_SECONDS &&
              Number(row.progress || 0) > MIN_RESUME_SECONDS;
            const savedPatch = preservePlayhead
              ? { ...patch, progress: row.progress, duration: row.duration }
              : patch;
            await profiledLibrary.ContinueWatching.update(
              row.id,
              preserveSource
                ? { ...savedPatch, video_url: row.video_url, source_type: row.source_type }
                : savedPatch
            );
            window.dispatchEvent(new CustomEvent(EMBED_HISTORY_CHANGED));
            return;
          }

          const created = await profiledLibrary.ContinueWatching.create({
            content_key: key,
            ...patch,
          });

          window.dispatchEvent(new CustomEvent(EMBED_HISTORY_CHANGED));
          if (created?.id) {
            state.recordIdByKey.set(key, created.id);
          }
        } catch {
          // Continue Watching should never interrupt playback.
        }
      });
      state.writesByKey.set(key, write);
      await write;
      if (state.writesByKey.get(key) === write) state.writesByKey.delete(key);
    };

    const flush = (force = true) => {
      const context = state.context;
      const { time, duration, video } = state.lastPosition;

      if (context && time >= MIN_RESUME_SECONDS) {
        save(context, time, duration, video, force);
      }
    };

    const applyResume = (video = currentPlayerVideo()) => {
      if (!video || !state.context || !state.pendingResume) {
        return false;
      }

      const key = contentKeyFor(state.context);

      if (!key || key !== state.pendingResumeKey) {
        return false;
      }

      const duration = Number(video.duration || 0);
      const resumeAt = Number(state.pendingResume || 0);

      if (
        resumeAt < MIN_RESUME_SECONDS ||
        Number(video.currentTime || 0) > MIN_RESUME_SECONDS ||
        (duration > 0 && resumeAt >= duration * WATCHED_THRESHOLD)
      ) {
        state.pendingResume = 0;
        state.pendingResumeKey = "";
        return false;
      }

      try {
        video.currentTime =
          duration > 0
            ? Math.min(resumeAt, Math.max(0, duration - 10))
            : resumeAt;

        state.pendingResume = 0;
        state.pendingResumeKey = "";

        window.dispatchEvent(
          new CustomEvent("mg:player-status", {
            detail: {
              message: `Resuming from ${Math.max(1, Math.floor(resumeAt / 60))} min…`,
            },
          })
        );

        return true;
      } catch {
        return false;
      }
    };

    const findResume = async (context) => {
      const token = ++state.lookupToken;
      const key = contentKeyFor(context);

      state.pendingResume = 0;
      state.pendingResumeKey = key;

      try {
        const rows = await profiledLibrary.ContinueWatching.list(
          "-updated_date",
          100
        );

        if (token !== state.lookupToken || state.context !== context) {
          return;
        }

        const matches = (rows || [])
          .map((row) => ({
            row,
            meta: parseContentKey(row),
          }))
          .filter(({ meta }) => sameContent(meta, context))
          .sort((a, b) => {
            const aDate = new Date(
              a.row?.updated_date || a.row?.created_date || 0
            ).getTime();
            const bDate = new Date(
              b.row?.updated_date || b.row?.created_date || 0
            ).getTime();

            return bDate - aDate;
          });

        const match = matches[0]?.row;

        if (!match) {
          return;
        }

        const progress = Number(match.progress || 0);
        const ratio = ratioFor(match);

        if (progress >= MIN_RESUME_SECONDS && ratio < WATCHED_THRESHOLD) {
          state.pendingResume = progress;
          state.pendingResumeKey = key;
          applyResume();
        }
      } catch {
        // Missing history simply means start from the beginning.
      }
    };

    const onContext = (event) => {
      const next = normaliseContext(event?.detail || null);

      // Context is republished for skip markers, auto-next and preferences.
      // It is not a new playback session. Resetting here lost the user's
      // chosen source before Android returned its final seek position.
      if (next && state.context && sameContent(next, state.context)) {
        // Keep the same object reference while an async resume lookup is in
        // flight, otherwise the valid lookup is discarded as stale.
        Object.assign(state.context, next);
        return;
      }

      flush(true);
      state.context = next;
      state.selectedSource = null;
      state.manualSelectionKey = "";
      state.lastPosition = {
        time: 0,
        duration: 0,
        video: null,
      };
      state.lastSaveAt = 0;
      state.completedKey = "";
      state.pendingResume = 0;
      state.pendingResumeKey = next ? contentKeyFor(next) : "";

      if (next) {
        findResume(next);
      }
    };

    const onLoadedMetadata = (event) => {
      if (!(event.target instanceof HTMLVideoElement)) {
        return;
      }

      applyResume(event.target);
    };

    const onCanPlay = (event) => {
      if (!(event.target instanceof HTMLVideoElement)) {
        return;
      }

      applyResume(event.target);
    };

    const onTimeUpdate = (event) => {
      if (!(event.target instanceof HTMLVideoElement) || !state.context) {
        return;
      }

      const video = event.target;
      const time = Number(video.currentTime || 0);
      const duration = Number(video.duration || 0);

      state.lastPosition = {
        time,
        duration,
        video,
      };

      save(state.context, time, duration, video, false);
    };

    const onEnded = (event) => {
      if (!(event.target instanceof HTMLVideoElement) || !state.context) {
        return;
      }

      const video = event.target;
      const duration = Number(video.duration || state.lastPosition.duration || 0);

      state.lastPosition = {
        time: duration,
        duration,
        video,
      };

      save(state.context, duration, duration, video, true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush(true);
      }
    };

    const onPageHide = () => {
      flush(true);
    };

    const onPlaybackProgress = (event) => {
      const detail = event.detail || {};
      const context = normaliseContext(detail.context);
      // Reject callbacks from a player that has already been replaced.
      if (!context || !state.context || !sameContent(context, state.context)) return;
      const time = Number(detail.time);
      const duration = Number(detail.duration);
      if (!Number.isFinite(time) || time < MIN_RESUME_SECONDS) return;
      const source = serialiseResumeSource(detail.source);
      // A resolved HTTP URL is less stable than the originally selected
      // torrent identity. Retain that identity through native hand-offs.
      if (source && (!hasTorrentIdentity(state.selectedSource) || hasTorrentIdentity(source))) {
        state.selectedSource = source;
      }
      const video = { currentSrc: detail.url || "", poster: detail.poster || "" };
      state.lastPosition = { time, duration: Number.isFinite(duration) ? duration : 0, video };
      save(state.context, time, state.lastPosition.duration, video, detail.force === true);
    };

    const onSelectedSource = (event) => {
      const source = serialiseResumeSource(event?.detail?.source);
      if (!source || !state.context || state.context.mediaType === "live") return;
      state.selectedSource = source;
      state.manualSelectionKey = contentKeyFor(state.context);
      const { time, duration, video } = state.lastPosition;
      // Persist the source choice immediately, including native playback where
      // no HTMLVideoElement emits timeupdate events.
      save(
        state.context,
        Math.max(MIN_RESUME_SECONDS, Number(time || 0)),
        duration,
        video,
        true
      );
    };

    window.addEventListener("mg:continue-watching-progress", onPlaybackProgress);
    window.addEventListener("mg:continue-watching-source", onSelectedSource);
    window.addEventListener("mg:player-context", onContext);
    document.addEventListener("loadedmetadata", onLoadedMetadata, true);
    document.addEventListener("canplay", onCanPlay, true);
    document.addEventListener("timeupdate", onTimeUpdate, true);
    document.addEventListener("ended", onEnded, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    const initial = normaliseContext(window.__MG_PLAYER_CONTEXT__ || null);

    if (initial) {
      state.context = initial;
      findResume(initial);
    }

    return () => {
      flush(true);
      window.removeEventListener("mg:continue-watching-progress", onPlaybackProgress);
      window.removeEventListener("mg:continue-watching-source", onSelectedSource);
      window.removeEventListener("mg:player-context", onContext);
      document.removeEventListener("loadedmetadata", onLoadedMetadata, true);
      document.removeEventListener("canplay", onCanPlay, true);
      document.removeEventListener("timeupdate", onTimeUpdate, true);
      document.removeEventListener("ended", onEnded, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
