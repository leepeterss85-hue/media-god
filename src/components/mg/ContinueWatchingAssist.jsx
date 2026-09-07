import React, {
  useEffect,
  useRef,
} from "react";

import { base44 } from "@/api/base44Client";

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
    recordIdByKey: new Map(),
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

      const patch = {
        progress,
        duration: safeDuration,
        video_url: currentSrc,
        poster_url: String(video?.poster || ""),
        source_type: /real-debrid|debrid/i.test(currentSrc)
          ? "rd"
          : "file",
        title: context.title,
        year: context.year || "",
      };

      try {
        const cachedId = state.recordIdByKey.get(key);

        if (cachedId) {
          await base44.entities.ContinueWatching.update(cachedId, patch);
          return;
        }

        const existing = await base44.entities.ContinueWatching.filter({
          content_key: key,
        });

        if (existing?.length) {
          const id = existing[0].id;
          state.recordIdByKey.set(key, id);
          await base44.entities.ContinueWatching.update(id, patch);
          return;
        }

        const created = await base44.entities.ContinueWatching.create({
          content_key: key,
          ...patch,
        });

        if (created?.id) {
          state.recordIdByKey.set(key, created.id);
        }
      } catch {
        // Continue Watching should never interrupt playback.
      }
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
        const rows = await base44.entities.ContinueWatching.list(
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
            if (a.meta.canonical !== b.meta.canonical) {
              return a.meta.canonical ? -1 : 1;
            }

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
      flush(true);

      const next = normaliseContext(event?.detail || null);

      state.context = next;
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
