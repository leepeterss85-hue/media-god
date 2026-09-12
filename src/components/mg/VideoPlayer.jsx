import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  VolumeX,
  Tv,
  Loader2,
  RefreshCw,
  Maximize,
  Minimize,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import CastButton from "@/components/mg/CastButton";
import LiveVideo from "@/components/mg/LiveVideo";
import PlayerControls from "@/components/mg/PlayerControls";
import {
  isNativeFireTvPlayerAvailable,
  openNativeFireTvExternalUrl,
  playNativeFireTv,
} from "@/components/mg/nativeFireTvBridge";
import { readTrackPreferences } from "@/components/mg/mediaTrackPreferences";
import { readPlaybackPreferences } from "@/components/mg/playbackPreferences";
import {
  hasRecentNoSoundHistory,
  playbackReliabilityAdjustment,
  recordPlaybackReliability,
} from "@/components/mg/playbackReliability";
import {
  detectLanguagePreference,
  getPlaybackDeviceProfile,
  hasSevereVideoRisk,
  scoreSourceCompatibility,
} from "@/components/mg/mediaCompatibility";
import {
  debridProviderScoreHints,
  recordDebridProviderResult,
} from "@/components/mg/debridProviderReliability";
import {
  concisePlaybackSourceLabel,
  torrentFileLabel,
} from "@/components/mg/playbackSourceLabels";
import {
  liveTvUrlScore,
  recordLiveTvPlaybackResult,
} from "@/components/mg/liveTvPlaybackLearning";
import {
  readSourceSortMode,
  sortSourceEntries,
  SOURCE_SELECTOR_SORT_EVENT,
  SOURCE_SORT_OPTIONS,
  writeSourceSortMode,
} from "@/components/mg/sourceSelectorPreferences";

const isMagnet = (value) =>
  String(value || "")
    .toLowerCase()
    .startsWith("magnet:");

const magnetHash = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i);
  const hash = String(match?.[1] || (/^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(raw) ? raw : ""))
    .toLowerCase()
    .trim();

  return hash;
};

const currentFilePath = (files) =>
  (
    files?.find((file) => file.selected) ||
    files?.[0] ||
    {}
  ).path || "";

const getSourceUrl = (item) =>
  item?.src ||
  item?.url ||
  item?.magnet ||
  item?.magnetLink ||
  "";

const sourceDisplayLabel = (item, index) =>
  String(
    item?.label ||
      item?.name ||
      item?.title ||
      `Source ${index + 1}`
  )
    .replace(/\s+/g, " ")
    .trim();

const sourceTorrentHash = (item) =>
  magnetHash(
    item?.infoHash ||
      item?.info_hash ||
      item?.magnet ||
      item?.magnetLink ||
      getSourceUrl(item)
  );

/*
 * Torrent resolution has three deliberately separate ownership paths:
 *
 * 1. cached_debrid  - the payload already exists in debrid; resolve/play it.
 * 2. comet_uncached - Comet owns the torrent source/tracker metadata and must
 *                     be the component that asks Real-Debrid to start it.
 * 3. rd_magnet      - a normal magnet/info-hash source that Media God may add
 *                     to Real-Debrid itself.
 *
 * Keeping these strategies explicit prevents an uncached Comet row from first
 * being started by Comet and then immediately being re-added by Media God as a
 * second, poorer bare/fallback magnet.
 */
const sourceResolutionStrategy = (item) => {
  if (!item) return "";

  if (item?.debridCached === true) {
    return "cached_debrid";
  }

  const explicit = String(item?.resolutionStrategy || "").trim();

  if (explicit) {
    return explicit;
  }

  if (item?.cometUncached === true) {
    return "comet_uncached";
  }

  const value = String(getSourceUrl(item) || "").trim();
  const torrentLike =
    item?.type === "rd" ||
    item?.type === "rd_torrent" ||
    item?.type === "torrent" ||
    item?.type === "magnet" ||
    isMagnet(value) ||
    Boolean(sourceTorrentHash(item));

  return torrentLike ? "rd_magnet" : "";
};

const sourceNeedsCaching = (item) => {
  if (!item || item?.debridCached === true) return false;

  const strategy = sourceResolutionStrategy(item);

  return (
    strategy === "comet_uncached" ||
    item?.cacheRequired === true ||
    (
      item?.debridCacheChecked === true &&
      item?.debridCached !== true &&
      (strategy === "rd_magnet" || Boolean(sourceTorrentHash(item)))
    )
  );
};

const FAILED_TORRENT_HASHES_KEY =
  "mg:failed-uncached-torrent-hashes:v6";
const FAILED_TORRENT_HASH_TTL_MS =
  2 * 60 * 60 * 1000;
const FAILED_TORRENT_HASH_LIMIT = 80;

const readPersistentFailedTorrentHashes = () => {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = JSON.parse(
      window.localStorage.getItem(FAILED_TORRENT_HASHES_KEY) || "{}"
    );
    const now = Date.now();
    const fresh = Object.entries(
      raw && typeof raw === "object" ? raw : {}
    )
      .map(([hash, failedAt]) => [
        String(hash || "").toLowerCase(),
        Number(failedAt || 0),
      ])
      .filter(
        ([hash, failedAt]) =>
          /^[a-f0-9]{40,64}$/i.test(hash) &&
          failedAt > 0 &&
          now - failedAt < FAILED_TORRENT_HASH_TTL_MS
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, FAILED_TORRENT_HASH_LIMIT);

    const cleaned = Object.fromEntries(fresh);
    window.localStorage.setItem(
      FAILED_TORRENT_HASHES_KEY,
      JSON.stringify(cleaned)
    );

    return new Set(fresh.map(([hash]) => hash));
  } catch {
    return new Set();
  }
};

const rememberPersistentFailedTorrentHash = (hash) => {
  const normalized = String(hash || "").trim().toLowerCase();

  if (
    typeof window === "undefined" ||
    !/^[a-f0-9]{40,64}$/i.test(normalized)
  ) {
    return;
  }

  try {
    const now = Date.now();
    const raw = JSON.parse(
      window.localStorage.getItem(FAILED_TORRENT_HASHES_KEY) || "{}"
    );
    const fresh = Object.entries(
      raw && typeof raw === "object" ? raw : {}
    )
      .map(([storedHash, failedAt]) => [
        String(storedHash || "").toLowerCase(),
        Number(failedAt || 0),
      ])
      .filter(
        ([storedHash, failedAt]) =>
          /^[a-f0-9]{40,64}$/i.test(storedHash) &&
          failedAt > 0 &&
          now - failedAt < FAILED_TORRENT_HASH_TTL_MS
      );

    fresh.push([normalized, now]);

    const trimmed = Object.fromEntries(
      fresh
        .sort((a, b) => b[1] - a[1])
        .slice(0, FAILED_TORRENT_HASH_LIMIT)
    );

    window.localStorage.setItem(
      FAILED_TORRENT_HASHES_KEY,
      JSON.stringify(trimmed)
    );
  } catch {
    // Persistence is an optimisation; in-memory recovery still works.
  }
};

const formatCacheBytes = (value) => {
  const bytes = Math.max(0, Number(value || 0));

  if (!bytes) return "";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unit = 0;

  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }

  const decimals = amount >= 100 || unit === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(decimals)} ${units[unit]}`;
};

const formatCacheSpeed = (value) => {
  const speed = formatCacheBytes(value);
  return speed ? `${speed}/s` : "";
};

const formatCacheDuration = (value) => {
  const seconds = Math.max(0, Math.round(Number(value || 0)));

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes < 60) {
    return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const friendlyRdStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  const labels = {
    magnet_conversion: "Reading magnet",
    waiting_files_selection: "Selecting files",
    waiting_selection: "Queued",
    queued: "Queued",
    downloading: "Downloading",
    downloaded: "Cached",
    compressing: "Finishing",
    uploading: "Finishing",
    dead: "No live seeders",
    error: "Real-Debrid error",
    magnet_error: "Magnet failed",
    virus: "Blocked by Real-Debrid",
  };

  return labels[status] || (status ? status.replace(/_/g, " ") : "Preparing");
};

const friendlyPlaybackError = (value) => {
  const message = String(value || "").replace(/\s+/g, " ").trim();

  if (!message) {
    return "";
  }

  if (/\b451\b|infringing[_ -]?file|copyright|infringing/i.test(message)) {
    return "This torrent was rejected by Real-Debrid — trying another source.";
  }

  if (/\b502\b|bad gateway|temporarily unavailable/i.test(message)) {
    return "The source service is temporarily unavailable — trying another source.";
  }

  if (/no other playable source/i.test(message)) {
    return "No working source was found. Choose another source or try again.";
  }

  if (/no sound|audio/i.test(message) && /fail|error|unsupported/i.test(message)) {
    return "This source has an audio problem. Try Fix audio or another source.";
  }

  return message.length > 170
    ? `${message.slice(0, 167)}…`
    : message;
};

const openExternalPlaybackFallback = (url) => {
  const target = String(url || "").trim();

  if (!/^https?:\/\//i.test(target)) {
    return false;
  }

  if (openNativeFireTvExternalUrl(target)) {
    return true;
  }

  try {
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (opened) return true;
  } catch {
    // Fall through to same-window navigation.
  }

  try {
    window.location.assign(target);
    return true;
  } catch {
    return false;
  }
};

const isFireTvRemoteRuntime = () => {
  if (typeof navigator === "undefined" || typeof document === "undefined") {
    return false;
  }

  const ua = String(navigator.userAgent || "");

  return (
    /(?:\bAFT[A-Z0-9]*\b|Fire\s*TV|AmazonWebAppPlatform|Silk|MediaGodFireTV)/i.test(ua) ||
    document.documentElement.classList.contains("mg-fire-tv") ||
    document.documentElement.classList.contains("mg-fire-tv-mode") ||
    document.body?.classList.contains("mg-fire-tv") ||
    document.body?.classList.contains("mg-fire-tv-mode")
  );
};

const browserFullscreenElement = () => {
  if (typeof document === "undefined") {
    return null;
  }

  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
};

const requestBrowserFullscreen = async (element) => {
  if (!(element instanceof HTMLElement)) {
    throw new Error("Fullscreen target is unavailable.");
  }

  if (typeof element.requestFullscreen === "function") {
    try {
      await element.requestFullscreen({ navigationUI: "hide" });
    } catch (firstError) {
      try {
        await element.requestFullscreen();
      } catch {
        throw firstError;
      }
    }
    return;
  }

  if (typeof element.webkitRequestFullscreen === "function") {
    await Promise.resolve(element.webkitRequestFullscreen());
    return;
  }

  if (typeof element.mozRequestFullScreen === "function") {
    await Promise.resolve(element.mozRequestFullScreen());
    return;
  }

  if (typeof element.msRequestFullscreen === "function") {
    await Promise.resolve(element.msRequestFullscreen());
    return;
  }

  throw new Error("Browser fullscreen is unavailable.");
};

const exitBrowserFullscreen = async () => {
  if (typeof document === "undefined") {
    return;
  }

  if (typeof document.exitFullscreen === "function") {
    await document.exitFullscreen();
    return;
  }

  if (typeof document.webkitExitFullscreen === "function") {
    await Promise.resolve(document.webkitExitFullscreen());
    return;
  }

  if (typeof document.mozCancelFullScreen === "function") {
    await Promise.resolve(document.mozCancelFullScreen());
    return;
  }

  if (typeof document.msExitFullscreen === "function") {
    await Promise.resolve(document.msExitFullscreen());
  }
};

const isDesktopFullscreenBrowser = () => {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    typeof document === "undefined"
  ) {
    return false;
  }

  const ua = `${navigator.userAgent || ""} ${navigator.platform || ""}`;
  const root = document.documentElement;
  const body = document.body;

  // Dedicated TV/Android wrappers deliberately keep Media God's safe in-app
  // fullscreen. Their host activity owns the physical display and using the
  // browser Fullscreen API can restart playback or create a second surface.
  if (
    isFireTvRemoteRuntime() ||
    root.classList.contains("mg-android-mobile") ||
    body?.classList.contains("mg-android-mobile") ||
    /(?:Android|iPhone|iPad|iPod)/i.test(ua)
  ) {
    return false;
  }

  // Desktop/PWA/Electron-style windows are detected by capability rather than
  // a fragile OS user-agent allow-list. This lets installed desktop web apps
  // hide the Windows taskbar/browser frame just like a normal browser tab.
  return Boolean(
    root.requestFullscreen ||
      root.webkitRequestFullscreen ||
      root.mozRequestFullScreen ||
      root.msRequestFullscreen
  );
};

const audioTrackScore = (track, preferredLanguage = "en") => {
  const text = `${track?.language || ""} ${track?.label || ""}`;
  const language = String(track?.language || "").toLowerCase();
  const preferred = String(preferredLanguage || "").toLowerCase();

  let score = 0;

  if (
    preferred &&
    (
      language === preferred ||
      language.startsWith(`${preferred}-`) ||
      (preferred === "en" && /\b(?:eng|english)\b/i.test(text))
    )
  ) {
    score += 10000;
  }

  if (/\b(?:aac|he-?aac|mp4a)\b/i.test(text)) score += 2600;
  else if (/\b(?:e-?ac-?3|eac3|ec-?3|ddp|dd\+)\b/i.test(text)) score += 1400;
  else if (/\b(?:ac-?3|ac3|dolby digital)\b/i.test(text)) score += 1200;
  else if (/\bopus\b/i.test(text)) score += 900;
  else if (/\bflac\b/i.test(text)) score += 850;
  else if (/\b(?:alac|apple lossless)\b/i.test(text)) score += 750;
  else if (/\bvorbis\b/i.test(text)) score += 700;
  else if (/\b(?:pcm|lpcm)\b/i.test(text)) score += 650;
  else if (/\b(?:mp3|mpeg audio)\b/i.test(text)) score += 700;
  else if (/\bmp2\b/i.test(text)) score += 350;
  else if (/\b(?:truehd|mlp|dts(?:-?hd)?|dts:x|dca)\b/i.test(text)) score -= 5000;

  if (/\b(?:commentary|audio description|descriptive|visually impaired)\b/i.test(text)) {
    score -= 3200;
  }

  return score;
};

export default function VideoPlayer({
  source,
  onClose,
}) {
  const sources =
    source?.sources &&
    source.sources.length > 0
      ? source.sources
      : [
          {
            label:
              source?.label ||
              (source?.type === "live"
                ? "LIVE"
                : "Stream"),

            type: source?.type || "rd",

            src: getSourceUrl(source),

            magnet:
              source?.magnet ||
              source?.magnetLink ||
              source?.src ||
              source?.url,

            live: source?.type === "live",
          },
        ];

  const [activeIdx, setActiveIdx] =
    useState(0);

  const [sourceSortMode, setSourceSortMode] = useState(
    () => readSourceSortMode()
  );

  const [
    isAppFullscreen,
    setIsAppFullscreen,
  ] = useState(false);

  const [rdResolving, setRdResolving] =
    useState(false);

  const [rdPolling, setRdPolling] =
    useState(false);

  const [rdError, setRdError] =
    useState("");

  const [rdPreparation, setRdPreparation] =
    useState(null);

  const [rdOverride, setRdOverride] =
    useState(null);

  const [rdFiles, setRdFiles] =
    useState([]);

  const [rdTorrentId, setRdTorrentId] =
    useState(null);

  const [fileSwitching, setFileSwitching] =
    useState(false);

  const [nativeFallbackUrl, setNativeFallbackUrl] =
    useState("");

  const [forceNativePlayback, setForceNativePlayback] =
    useState(false);

  const [
    failedSources,
    setFailedSources,
  ] = useState(() => new Set());

  const failedSourcesRef =
    useRef(new Set());

  /*
   * A title can expose the same torrent through several addons/rows. Source-
   * index failure alone is not enough: automatic recovery could otherwise
   * select a duplicate row and reconnect to the exact same stalled RD job.
   * Keep a per-playback hash blacklist for hard torrent/cache failures.
   */
  const failedTorrentHashesRef =
    useRef(new Set());

  const videoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const pollRef = useRef(null);
  const recoveryResumeRef = useRef(0);
  const rdResolutionQueueRef = useRef(Promise.resolve());
  const torrentFailoverTimerRef = useRef(null);
  const nativePlaybackRef = useRef({
    requestId: "",
    url: "",
  });
  const nativeLaunchTimerRef = useRef(null);
  const streamActionGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      if (torrentFailoverTimerRef.current) {
        window.clearTimeout(torrentFailoverTimerRef.current);
        torrentFailoverTimerRef.current = null;
      }

      if (nativeLaunchTimerRef.current) {
        window.clearTimeout(nativeLaunchTimerRef.current);
        nativeLaunchTimerRef.current = null;
      }
    };
  }, []);

  const autoVideoRescueRef = useRef({
    key: "",
    timer: null,
  });
  const handleNoSoundRef = useRef(null);
  const autoRecoveryRef = useRef({
    lastTime: 0,
    lastProgressAt: Date.now(),
    lastSwitchAt: 0,
    abandoned: new Set(),
  });

  const sortedSourceEntries = sortSourceEntries(
    sources,
    sourceSortMode
  );

  /*
   * Android/Fire TV native <select> popups close if React changes their
   * option list while they are open. Source discovery can legitimately add
   * results a few seconds after the player appears, so freeze the visible
   * choices for the duration of the user's selection gesture. The live list
   * resumes as soon as the select closes or a choice is made.
   */
  const [sourceSelectorPinned, setSourceSelectorPinned] =
    useState(false);
  const sourceSelectorEntriesRef = useRef([]);
  const sourceSelectorValueRef = useRef(0);

  const [rdFileSelectorPinned, setRdFileSelectorPinned] =
    useState(false);
  const rdFileSelectorFilesRef = useRef([]);
  const rdFileSelectorValueRef = useRef("");

  const pinSourceSelector = () => {
    sourceSelectorEntriesRef.current = sortedSourceEntries;
    sourceSelectorValueRef.current = activeIdx;
    setSourceSelectorPinned(true);
  };

  const releaseSourceSelector = () => {
    setSourceSelectorPinned(false);
    sourceSelectorEntriesRef.current = [];
  };

  const visibleSourceSelectorEntries =
    sourceSelectorPinned && sourceSelectorEntriesRef.current.length > 0
      ? sourceSelectorEntriesRef.current
      : sortedSourceEntries;

  const visibleSourceSelectorValue =
    sourceSelectorPinned
      ? sourceSelectorValueRef.current
      : activeIdx;

  const pinRdFileSelector = () => {
    rdFileSelectorFilesRef.current = rdFiles;
    rdFileSelectorValueRef.current = String(
      rdFiles.find(
        (file) =>
          file.path === rdOverride?.file ||
          file.name === rdOverride?.file
      )?.id ?? ""
    );
    setRdFileSelectorPinned(true);
  };

  const releaseRdFileSelector = () => {
    setRdFileSelectorPinned(false);
    rdFileSelectorFilesRef.current = [];
  };

  const visibleRdFileSelectorFiles =
    rdFileSelectorPinned && rdFileSelectorFilesRef.current.length > 0
      ? rdFileSelectorFilesRef.current
      : rdFiles;

  const visibleRdFileSelectorValue =
    rdFileSelectorPinned
      ? rdFileSelectorValueRef.current
      : String(
          rdFiles.find(
            (file) =>
              file.path === rdOverride?.file ||
              file.name === rdOverride?.file
          )?.id ?? ""
        );

  const active =
    sources[activeIdx] ||
    sources[0] ||
    {};

  const activeUrl =
    getSourceUrl(active);

  const trackPreferences = readTrackPreferences();

  useEffect(() => {
    const onSourceSortChanged = (event) => {
      setSourceSortMode(
        String(event?.detail?.mode || readSourceSortMode())
      );
    };

    window.addEventListener(
      SOURCE_SELECTOR_SORT_EVENT,
      onSourceSortChanged
    );

    return () => {
      window.removeEventListener(
        SOURCE_SELECTOR_SORT_EVENT,
        onSourceSortChanged
      );
    };
  }, []);

  const recoverySourceScore = (item, index) => {
    const label = sourceDisplayLabel(item, index);
    const deviceProfile = getPlaybackDeviceProfile();
    const preferences = readPlaybackPreferences();

    const compatibility = scoreSourceCompatibility(
      item,
      label,
      {
        deviceProfile,
        qualityPreference: preferences.quality,
      }
    );

    const learned = playbackReliabilityAdjustment(
      label,
      deviceProfile
    );

    const languagePreference = detectLanguagePreference(item, label);
    const preferredAudioLanguage = String(
      trackPreferences?.audioLanguage || "en"
    ).toLowerCase();
    const languagePriority =
      preferredAudioLanguage === "en"
        ? languagePreference === "english"
          ? 50000
          : languagePreference === "multi"
            ? 24000
            : languagePreference === "foreign"
              ? -50000
              : 0
        : 0;

    const directBonus = /^https?:\/\//i.test(
      String(getSourceUrl(item) || "")
    )
      ? 2500
      : 0;

    const rdBonus =
      item?.viaRealDebrid && item?.cacheRequired !== true
        ? 5000
        : item?.cacheRequired === true
          ? -1000
          : 0;
    const trackerRichValue = String(item?.richMagnet || "").trim();
    const trackerRichBonus =
      /^magnet:/i.test(trackerRichValue) && /(?:[?&])tr=/i.test(trackerRichValue)
        ? 3500
        : 0;

    const swarmBonus = Math.min(
      4000,
      Math.max(0, Number(item?.reportedSeeders || 0)) * 20
    );
    const liveBonus =
      item?.live || item?.type === "live"
        ? liveTvUrlScore(getSourceUrl(item))
        : 0;

    return (
      compatibility +
      languagePriority +
      learned +
      directBonus +
      rdBonus +
      trackerRichBonus +
      swarmBonus +
      liveBonus
    );
  };

  const markSourceFailed = (index) => {
    failedSourcesRef.current.add(index);

    setFailedSources(
      new Set(
        failedSourcesRef.current
      )
    );
  };

  const markTorrentHashFailed = (item = active) => {
    const hash = sourceTorrentHash(item);

    if (hash) {
      failedTorrentHashesRef.current.add(hash);
      rememberPersistentFailedTorrentHash(hash);
    }

    return hash;
  };

  const clearSourceFailed = (index) => {
    if (
      !failedSourcesRef.current.has(
        index
      )
    ) {
      return;
    }

    failedSourcesRef.current.delete(
      index
    );

    setFailedSources(
      new Set(
        failedSourcesRef.current
      )
    );
  };

  const findNextPlayableSource = (
    fromIndex
  ) => {
    /*
     * Automatic failover must follow the same source ordering the user sees
     * in the selector. Previously the 4K/1080p sort only changed the dropdown
     * display while recovery used a separate compatibility score; that could
     * jump from a rejected 4K torrent straight to 720p even though unused 4K
     * or 1080p alternatives were still listed.
     */
    const selectorRankByIndex =
      new Map(
        sortedSourceEntries.map(
          (entry, rank) => [
            entry.index,
            rank,
          ]
        )
      );

    const obeySelectorOrder =
      sourceSortMode !== "best";

    const candidates = sources
      .map((candidate, index) => {
        const url = getSourceUrl(candidate);
        const torrent =
          candidate?.type === "rd" ||
          candidate?.type === "rd_torrent" ||
          candidate?.type === "torrent" ||
          candidate?.type === "magnet" ||
          isMagnet(url);

        const candidateHash = sourceTorrentHash(candidate);

        if (
          index === fromIndex ||
          failedSourcesRef.current.has(index) ||
          (candidateHash && failedTorrentHashesRef.current.has(candidateHash)) ||
          candidate?.diagnostic ||
          candidate?.type === "status" ||
          candidate?.type === "provider" ||
          candidate?.type === "youtube" ||
          (!url && !torrent)
        ) {
          return null;
        }

        return {
          index,
          selectorRank:
            selectorRankByIndex.get(index) ??
            Number.MAX_SAFE_INTEGER,
          score: recoverySourceScore(candidate, index),
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        obeySelectorOrder
          ? a.selectorRank - b.selectorRank ||
            b.score - a.score ||
            a.index - b.index
          : b.score - a.score ||
            a.index - b.index
      );

    return candidates[0]?.index ?? -1;
  };

  const switchToSource = (
    nextIndex,
    {
      preservePosition = true,
      statusMessage = "",
    } = {}
  ) => {
    streamActionGenerationRef.current += 1;

    if (nativeLaunchTimerRef.current) {
      window.clearTimeout(nativeLaunchTimerRef.current);
      nativeLaunchTimerRef.current = null;
    }

    nativePlaybackRef.current = {
      requestId: "",
      url: "",
    };

    if (torrentFailoverTimerRef.current) {
      window.clearTimeout(torrentFailoverTimerRef.current);
      torrentFailoverTimerRef.current = null;
    }

    const currentVideo =
      stageRef.current?.querySelector("video");
    const currentIsLive =
      source?.type === "live" ||
      active?.live ||
      active?.type === "live";
    const resumeAt =
      preservePosition && !currentIsLive
        ? Math.max(
            0,
            Number(
              currentVideo?.currentTime ||
                lastPosRef.current?.t ||
                0
            )
          )
        : 0;

    if (resumeAt > 5) {
      recoveryResumeRef.current = resumeAt;
    }

    clearSourceFailed(nextIndex);
    setRdTorrentId(null);
    setRdPreparation(null);
    setRdError("");
    setRdResolving(false);
    setRdPolling(false);
    setFileSwitching(false);

    setRdOverride(null);
    setRdFiles([]);
    setForceNativePlayback(false);
    setNativeFallbackUrl("");
    setActiveIdx(nextIndex);

    if (statusMessage) {
      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              resumeAt > 5
                ? `${statusMessage} Resuming at ${Math.floor(resumeAt / 60)} min…`
                : statusMessage,
          },
        })
      );
    }
  };

  const tryNextSource = (
    message =
      "This source could not be played.",
    {
      blacklistTorrentHash = false,
      immediate = false,
    } = {}
  ) => {
    const hardFailureMessage =
      /(?:\b451\b|infringing[_ -]?file|copyright|wrong\s+ip|rate[-\s]?limit|not\s+cached|couldn['’]?t\s+start|could\s+not\s+start|comet\s+returned\s+its\s+error)/i.test(
        String(message || "")
      );

    /*
     * Uncached torrent caching is an explicit operation, not ordinary playback
     * failover. Never silently abandon the torrent the user chose just because
     * its first RD/Comet request failed. Keep the same source on screen, show
     * the actual reason and let Retry/manual source selection decide what to do
     * next. Cached/direct playback can continue to use automatic failover.
     */
    if (sourceNeedsCaching(active)) {
      if (torrentFailoverTimerRef.current) {
        window.clearTimeout(torrentFailoverTimerRef.current);
        torrentFailoverTimerRef.current = null;
      }

      setRdResolving(false);
      setRdPolling(false);
      setRdError(
        `${String(message || "This uncached torrent could not be started.").trim()} Retry this source or choose another source manually.`
      );

      return false;
    }

    /*
     * A late error from the previous URL can arrive after React/Chromium has
     * already started the replacement stream. Never let that stale event kick
     * a healthy, buffered video onto yet another source. Hard provider/RD
     * failures are still allowed through because those are explicit upstream
     * rejections rather than a speculative playback watchdog decision.
     */
    const currentVideo = stageRef.current?.querySelector("video");
    const currentVideoHealthy =
      currentVideo instanceof HTMLVideoElement &&
      !currentVideo.paused &&
      !currentVideo.ended &&
      !currentVideo.error &&
      currentVideo.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE &&
      currentVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;

    if (currentVideoHealthy && !hardFailureMessage) {
      autoRecoveryRef.current.lastTime = Number(currentVideo.currentTime || 0);
      autoRecoveryRef.current.lastProgressAt = Date.now();
      return false;
    }

    markSourceFailed(
      activeIdx
    );

    if (blacklistTorrentHash) {
      markTorrentHashFailed(active);
    }

    const nextIndex =
      findNextPlayableSource(
        activeIdx
      );

    if (
      nextIndex === -1
    ) {
      setRdResolving(false);
      setRdPolling(false);
      setRdTorrentId(null);

      setRdError(
        `${message} No other playable source is available.`
      );

      return false;
    }

    const activeTorrentLike =
      active?.type === "rd" ||
      active?.type === "rd_torrent" ||
      active?.type === "torrent" ||
      active?.type === "magnet" ||
      isMagnet(activeUrl) ||
      Boolean(magnetHash(activeUrl));

    if (activeTorrentLike) {
      const rdRejectedTorrent =
        /(?:\b451\b|infringing[_ -]?file|copyright|infringing)/i.test(
          String(message || "")
        );

      /*
       * RD 451 / infringing_file means this exact torrent hash has been
       * refused upstream. Waiting and retrying the same quality is pointless;
       * move immediately to the next source in the user's visible sort order.
       * With 4K selected this exhausts all remaining 4K, then 1080p, before
       * considering 720p.
       */
      if (rdRejectedTorrent || immediate) {
        if (rdRejectedTorrent) {
          markTorrentHashFailed(active);
        }

        setRdResolving(false);
        setRdPolling(false);
        setRdTorrentId(null);
        setRdError("");

        switchToSource(nextIndex, {
          preservePosition: true,
          statusMessage:
            immediate && !rdRejectedTorrent
              ? "Torrent stalled — trying a different torrent…"
              : sourceSortMode === "4k"
                ? "Real-Debrid rejected that torrent — trying the next 4K/1080p source…"
                : sourceSortMode === "1080p"
                  ? "Real-Debrid rejected that torrent — trying the next 1080p source…"
                  : "Real-Debrid rejected that torrent — trying the next source…",
        });

        return true;
      }

      if (torrentFailoverTimerRef.current) {
        return true;
      }

      setRdResolving(false);
      setRdPolling(false);
      setRdTorrentId(null);
      setRdError(`${message} Trying one backup torrent source…`);

      torrentFailoverTimerRef.current = window.setTimeout(() => {
        torrentFailoverTimerRef.current = null;
        switchToSource(nextIndex, {
          preservePosition: true,
          statusMessage:
            "Torrent source failed — trying the next best source…",
        });
      }, 1800);

      return true;
    }

    switchToSource(nextIndex, {
      preservePosition: true,
      statusMessage:
        source?.type === "live" || active?.live || active?.type === "live"
          ? "Live stream failed — trying the best available backup…"
          : "Source failed — switching to the best available backup…",
    });

    return true;
  };

  const selectSource = (
    index
  ) => {
    const nextIndex =
      Number(index);

    if (
      Number.isNaN(
        nextIndex
      ) ||
      nextIndex < 0 ||
      nextIndex >=
        sources.length ||
      nextIndex === activeIdx
    ) {
      return;
    }

    switchToSource(nextIndex, {
      preservePosition: true,
      statusMessage:
        source?.type === "live" || active?.live || active?.type === "live"
          ? "Switching Live TV source…"
          : "Switching source…",
    });
  };

  const isLive =
    source?.type === "live" ||
    active?.live ||
    active?.type === "live";

  const isYoutube =
    active?.type ===
    "youtube";

  const isProvider =
    active?.type ===
    "provider";

  const activeType = String(active?.type || "").trim().toLowerCase();
  const activeMediaHint = [
    active?.format,
    active?.mimeType,
    active?.mime_type,
    active?.contentType,
    active?.content_type,
    active?.label,
    active?.name,
    activeUrl,
  ]
    .filter(Boolean)
    .join(" ");
  const activeLooksLikeMedia =
    /\.(?:m3u8|mpd|mp4|m4v|mkv|webm|mov|avi|ts|m2ts|flv|mpg|mpeg)(?:[?#&/]|$)/i.test(
      String(activeUrl || "")
    ) ||
    /(?:\bhls\b|mpegurl|mpeg-url|\bdash\b|mpeg[- ]?dash|video\/|audio\/|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i.test(
      activeMediaHint
    );

  const isGenericHttpsStream =
    /^https:\/\//i.test(String(activeUrl || "").trim()) &&
    ![
      "youtube",
      "provider",
      "external",
      "status",
      "torrent",
      "magnet",
    ].includes(activeType) &&
    !isMagnet(activeUrl) &&
    (
      ["url", "file", "live", "direct", "stream"].includes(activeType) ||
      Boolean(active?.live) ||
      activeLooksLikeMedia
    );

  const isDirectFile =
    activeType === "file" ||
    activeType === "url" ||
    activeType === "live" ||
    activeType === "direct" ||
    activeType === "stream" ||
    isGenericHttpsStream;

  const isRdSource =
    active?.type === "rd" ||
    active?.type ===
      "rd_torrent" ||
    active?.type ===
      "torrent" ||
    active?.type ===
      "magnet" ||
    isMagnet(
      activeUrl
    ) ||
    Boolean(
      magnetHash(
        activeUrl
      )
    );

  useEffect(() => {
    recoveryResumeRef.current = 0;
    autoRecoveryRef.current.lastTime = 0;
    autoRecoveryRef.current.lastProgressAt = Date.now();
    autoRecoveryRef.current.lastSwitchAt = 0;
    autoRecoveryRef.current.abandoned = new Set();
    if (torrentFailoverTimerRef.current) {
      window.clearTimeout(torrentFailoverTimerRef.current);
      torrentFailoverTimerRef.current = null;
    }
  }, [
    source?.tmdbId,
    source?.tmdb_id,
    source?.id,
    source?.title,
    source?.rdSeason,
    source?.rdEpisode,
    source?.season,
    source?.episode,
  ]);

  useEffect(() => {
    if (!isLive) {
      return undefined;
    }

    const url = String(activeUrl || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return undefined;
    }

    const startedAt =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    let successRecorded = false;
    let failureRecorded = false;
    let stallRecorded = false;
    let attachTimer = null;
    let video = null;

    const onPlaying = () => {
      if (successRecorded) return;
      successRecorded = true;

      const now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();

      recordLiveTvPlaybackResult(url, {
        success: true,
        startupMs: Math.max(0, now - startedAt),
      });
    };

    const onError = () => {
      if (failureRecorded) return;
      failureRecorded = true;
      recordLiveTvPlaybackResult(url, {
        success: false,
        startupMs: 0,
      });
    };

    const onStalled = () => {
      if (stallRecorded) return;
      stallRecorded = true;
      recordLiveTvPlaybackResult(url, {
        success: false,
        stalled: true,
      });
    };

    const attach = () => {
      video = stageRef.current?.querySelector("video") || null;
      if (!(video instanceof HTMLVideoElement)) {
        attachTimer = window.setTimeout(attach, 120);
        return;
      }

      video.addEventListener("playing", onPlaying);
      video.addEventListener("error", onError);
      video.addEventListener("stalled", onStalled);

      if (!video.paused && video.readyState >= 2) {
        onPlaying();
      }
    };

    attach();

    return () => {
      if (attachTimer) {
        window.clearTimeout(attachTimer);
      }

      if (video instanceof HTMLVideoElement) {
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("error", onError);
        video.removeEventListener("stalled", onStalled);
      }
    };
  }, [
    activeIdx,
    activeUrl,
    isLive,
  ]);

  const applyStageFullscreen = (stage) => {
    if (!stage) return;

    if (stage.dataset.mgFullscreen !== "true") {
      stage.dataset.mgPreviousStyle = stage.getAttribute("style") || "";
    }

    stage.dataset.mgFullscreen = "true";
    setIsAppFullscreen(true);

    Object.assign(stage.style, {
      position: "fixed",
      top: "0",
      right: "0",
      bottom: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      maxWidth: "none",
      maxHeight: "none",
      margin: "0",
      padding: "0",
      border: "0",
      borderRadius: "0",
      aspectRatio: "auto",
      background: "#000",
      overflow: "hidden",
      zIndex: "2147483647",
    });
  };

  const restoreInAppFullscreen = (stage) => {
    if (!stage) return;

    const previousStyle = stage.dataset.mgPreviousStyle || "";

    if (previousStyle) {
      stage.setAttribute("style", previousStyle);
    } else {
      stage.removeAttribute("style");
    }

    delete stage.dataset.mgFullscreen;
    delete stage.dataset.mgPreviousStyle;
    setIsAppFullscreen(false);
  };

  const goFullscreen = async () => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    /*
     * Desktop browsers/PWAs use the real Fullscreen API so the Windows taskbar,
     * browser frame and macOS dock disappear. The document element is the most
     * reliable fullscreen target across normal tabs and installed Chromium web
     * apps; the video stage is then pinned over that fullscreen viewport.
     * Fire TV/Android wrappers deliberately keep the safe CSS-only path.
     */
    if (isDesktopFullscreenBrowser()) {
      const nativeFullscreenElement = browserFullscreenElement();

      if (nativeFullscreenElement) {
        try {
          await exitBrowserFullscreen();
        } catch {
          // Keep the player usable even if the browser has already started
          // leaving fullscreen through Escape/F11 or its own window controls.
        }

        if (stage.dataset.mgFullscreen === "true") {
          restoreInAppFullscreen(stage);
        }

        return;
      }

      try {
        await requestBrowserFullscreen(document.documentElement);
        applyStageFullscreen(stage);
        return;
      } catch {
        /*
         * Some older embedded Chromium shells allow an element fullscreen even
         * when the document element request is rejected. Try the actual player
         * stage before falling back to CSS-only fullscreen.
         */
        try {
          await requestBrowserFullscreen(stage);
          applyStageFullscreen(stage);
          return;
        } catch {
          // The CSS fallback below still gives a usable in-window fullscreen.
        }
      }
    }

    const currentlyFullscreen = stage.dataset.mgFullscreen === "true";

    if (currentlyFullscreen) {
      restoreInAppFullscreen(stage);
      return;
    }

    applyStageFullscreen(stage);
  };

  useEffect(() => {
    const syncFullscreenState = () => {
      if (!isDesktopFullscreenBrowser()) return;

      const stage = stageRef.current;
      const fullscreenElement = browserFullscreenElement();
      const playerOwnsFullscreen = Boolean(
        stage &&
          fullscreenElement &&
          (
            fullscreenElement === stage ||
            fullscreenElement === document.documentElement ||
            fullscreenElement.contains?.(stage) ||
            stage.contains?.(fullscreenElement)
          )
      );

      if (playerOwnsFullscreen) {
        if (stage.dataset.mgFullscreen !== "true") {
          applyStageFullscreen(stage);
        } else {
          setIsAppFullscreen(true);
        }
        return;
      }

      if (!fullscreenElement && stage?.dataset.mgFullscreen === "true") {
        restoreInAppFullscreen(stage);
        return;
      }

      if (!fullscreenElement) {
        setIsAppFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    document.addEventListener("mozfullscreenchange", syncFullscreenState);
    document.addEventListener("MSFullscreenChange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
      document.removeEventListener("mozfullscreenchange", syncFullscreenState);
      document.removeEventListener("MSFullscreenChange", syncFullscreenState);
    };
  }, []);

  /*
   * Reset RD state whenever the user chooses
   * another source.
   */
  useEffect(
    () => {
      setRdOverride(
        null
      );

      setRdError(
        ""
      );

      setRdFiles(
        []
      );

      setRdTorrentId(
        null
      );

      if (
        pollRef.current
      ) {
        clearTimeout(
          pollRef.current
        );

        pollRef.current =
          null;
      }
    },
    [
      activeIdx,
    ]
  );

  /*
   * MAIN PLAYBACK RESOLUTION
   */
  useEffect(
    () => {
      if (
        !active
      ) {
        return;
      }

      if (
        isYoutube ||
        isProvider ||
        isDirectFile ||
        isLive
      ) {
        return;
      }

      if (
        !isRdSource
      ) {
        return;
      }

      let cancelled =
        false;

      setRdResolving(
        true
      );

      setRdPolling(
        false
      );

      setRdError(
        ""
      );

      setRdOverride(
        null
      );

      setRdTorrentId(
        null
      );

      const run =
        async () => {
          let rdResolveStartedAt = 0;

          try {
            const richMagnet = String(
              active?.richMagnet ||
              ""
            ).trim();

            /*
             * The same torrent can arrive with several magnet variants. In
             * particular, Comet may expose its original magnet in richMagnet
             * while Media God has already enriched src/magnet with a much
             * larger fallback tracker set. The old `richMagnet || src` choice
             * could therefore throw away most of the trackers immediately
             * before asking Real-Debrid to cache an uncached torrent.
             *
             * Prefer the magnet variant with the MOST tracker announce URLs.
             * Cached torrents are unaffected, but uncached torrents get the
             * best chance of peer discovery if Comet's direct start fails.
             */
            const magnetCandidates = [
              richMagnet,
              active?.magnet,
              active?.magnetLink,
              active?.src,
              active?.url,
            ]
              .map((value) => String(value || "").trim())
              .filter((value) => /^magnet:/i.test(value));

            const magnet =
              magnetCandidates
                .slice()
                .sort((left, right) => {
                  const leftTrackers = (left.match(/(?:[?&])tr=/gi) || []).length;
                  const rightTrackers = (right.match(/(?:[?&])tr=/gi) || []).length;

                  return (
                    rightTrackers - leftTrackers ||
                    right.length - left.length
                  );
                })[0] ||
              active?.src ||
              active?.url ||
              active?.magnet ||
              active?.magnetLink ||
              richMagnet ||
              "";

            const effectiveMagnetHasTrackers =
              /^magnet:/i.test(String(magnet || "")) &&
              /(?:[?&])tr=/i.test(String(magnet || ""));

            if (
              !magnet
            ) {
              throw new Error(
                "This source did not provide a playable link."
              );
            }

            if (
              String(
                magnet
              )
                .toLowerCase()
                .startsWith(
                  "http://"
                ) ||
              String(
                magnet
              )
                .toLowerCase()
                .startsWith(
                  "https://"
                )
            ) {
              if (
                !cancelled
              ) {
                setRdOverride({
                  src:
                    magnet,

                  label:
                    active?.label ||
                    "Stream",

                  file:
                    "",
                });

                setRdResolving(
                  false
                );
              }

              return;
            }

            const hash = magnetHash(magnet);

            /*
             * RD Library rows carry Real-Debrid's torrent ID, not a magnet or
             * info hash. Passing that ID to resolve_best makes the library's
             * Play button fail because resolve_best treats its input as a new
             * torrent source. Resolve existing RD torrents directly instead.
             */
            const existingRdTorrentId = String(
              active?.rdTorrentId ||
                (active?.type === "rd_torrent" && !hash && !isMagnet(magnet)
                  ? magnet
                  : "")
            ).trim();

            if (existingRdTorrentId) {
              rdResolveStartedAt = Date.now();

              const existingResponse = await base44.functions.invoke(
                "realDebrid",
                {
                  action: "torrent_info",
                  torrent_id: existingRdTorrentId,
                  title:
                    source?.rdTitle ||
                    source?.title ||
                    "",
                  ...(source?.rdYear != null ? { year: source.rdYear } : {}),
                  ...(source?.rdSeason != null ? { season: source.rdSeason } : {}),
                  ...(source?.rdEpisode != null ? { episode: source.rdEpisode } : {}),
                  ...(active?.fileIdx != null && Number.isFinite(Number(active.fileIdx))
                    ? { file_idx: Number(active.fileIdx) }
                    : {}),
                }
              );

              if (cancelled) return;

              const existingData = existingResponse?.data || {};

              if (existingData.status === "ready" && existingData.stream_url) {
                recordDebridProviderResult("realdebrid", {
                  success: true,
                  latencyMs: Date.now() - rdResolveStartedAt,
                });

                setRdOverride({
                  src: existingData.stream_url,
                  label:
                    existingData.filename ||
                    active?.label ||
                    "Real-Debrid Library",
                  file: currentFilePath(existingData.files),
                  audioRescue: existingData.audio_rescue || null,
                  fallbackSrc: existingData.fallback_stream_url || "",
                  videoRescue: existingData.video_rescue || null,
                  mediaInfo: existingData.media_info || null,
                });
                setRdFiles(existingData.files || []);
                setRdTorrentId(existingRdTorrentId);
                setRdResolving(false);
                setRdPreparation(null);
                return;
              }

              if (
                existingData.status === "preparing" ||
                existingData.torrent_id
              ) {
                setRdPreparation({
                  ...(existingData.torrent_progress || {}),
                  status:
                    existingData.torrent_progress?.status ||
                    existingData.rd_status ||
                    "preparing",
                  startedAt: Date.now(),
                  updatedAt: Date.now(),
                  attempts: 0,
                });
                setRdTorrentId(existingRdTorrentId);
                setRdResolving(false);
                return;
              }

              throw new Error(
                existingData.error ||
                  "Real-Debrid could not open this library torrent."
              );
            }

            /*
             * Do not silently replace one uncached torrent with another before
             * trying it. The active source has already been enriched with every
             * tracker Media God knows about. If it cannot start, keep it selected
             * and show the real error so the user can Retry or manually choose a
             * different torrent.
             */

            const explicitProvider = String(active?.debridProvider || "")
              .toLowerCase()
              .replace(/[^a-z]/g, "");
            let debridProviders = explicitProvider ? [explicitProvider] : [];

            const resolutionStrategy = sourceResolutionStrategy(active);
            const knownUncached = sourceNeedsCaching(active);

            /*
             * Generic magnets are owned by Media God/Real-Debrid, so they may
             * reuse an existing exact-hash RD job and run slot preflight here.
             * Comet uncached sources intentionally skip this block: Comet owns
             * their source/tracker metadata and gets the first and only start
             * request for that attempt.
             */
            if (
              hash &&
              knownUncached &&
              resolutionStrategy !== "comet_uncached" &&
              source?.hasRd !== false
            ) {
              /*
               * Before checking whether RD has a free download slot, look for
               * this exact hash in the user's RD account. A previous Media God
               * attempt may already be downloading it. The old preflight ran
               * first and, when RD reported all slots occupied, immediately
               * jumped to another source. That meant Media God never adopted
               * the already-active torrent and never reached the seeder/speed
               * polling UI.
               */
              let adopted = {};

              try {
                const adoptResponse = await base44.functions.invoke(
                  "realDebrid",
                  {
                    action: "adopt_hash",
                    info_hash: hash,
                    title:
                      source?.rdTitle ||
                      source?.title ||
                      "",
                    ...(source?.rdYear != null
                      ? { year: source.rdYear }
                      : {}),
                    ...(source?.rdSeason != null
                      ? { season: source.rdSeason }
                      : {}),
                    ...(source?.rdEpisode != null
                      ? { episode: source.rdEpisode }
                      : {}),
                  }
                );

                adopted = adoptResponse?.data || {};
              } catch {
                adopted = {};
              }

              if (cancelled) return;

              if (adopted.status === "ready" && adopted.stream_url) {
                setRdOverride({
                  src: adopted.stream_url,
                  label:
                    adopted.filename ||
                    active?.label ||
                    "Real-Debrid Stream",
                  file: currentFilePath(adopted.files),
                  audioRescue: adopted.audio_rescue || null,
                  fallbackSrc: adopted.fallback_stream_url || "",
                  videoRescue: adopted.video_rescue || null,
                  mediaInfo: adopted.media_info || null,
                });
                setRdFiles(adopted.files || []);
                setRdResolving(false);
                setRdPreparation(null);
                return;
              }

              if (
                adopted.status === "preparing" &&
                adopted.torrent_id
              ) {
                setRdPreparation({
                  ...(adopted.torrent_progress || {}),
                  status:
                    adopted.torrent_progress?.status ||
                    adopted.rd_status ||
                    "preparing",
                  startedAt: Date.now(),
                  updatedAt: Date.now(),
                  attempts: 0,
                });
                setRdTorrentId(String(adopted.torrent_id));
                setRdResolving(false);
                return;
              }

              if (adopted.status === "stale") {
                try {
                  await base44.functions.invoke(
                    "realDebrid",
                    {
                      action: "reset_stale_hash",
                      info_hash: hash,
                      claim_for_playback: true,
                      title:
                        source?.rdTitle ||
                        source?.title ||
                        "",
                    }
                  );
                } catch {
                  // A stale-hash reset is best-effort; preflight will diagnose slots.
                }
              }

              let preflight = {};

              try {
                const preflightResponse = await base44.functions.invoke(
                  "realDebrid",
                  {
                    action: "uncached_preflight",
                    keep_hash: hash,
                  }
                );

                preflight = preflightResponse?.data || {};
              } catch {
                // Slot cleanup/diagnostics are best-effort.
              }

              if (preflight.saturated === true) {
                const activeCount = Math.max(
                  0,
                  Number(preflight.active_count || 0)
                );
                const activeLimit = Math.max(
                  0,
                  Number(preflight.active_limit || 0)
                );

                /*
                 * Do NOT hop through every uncached source here. All of them
                 * share the same RD active-download limit, so switching hashes
                 * cannot create a free slot and only makes the UI look as if
                 * Media God is refusing to search for seeders.
                 */
                const slotError = new Error(
                  activeLimit > 0
                    ? `Real-Debrid has ${activeCount}/${activeLimit} active torrent slots in use. Finish or remove one active torrent, then retry this uncached source.`
                    : "Real-Debrid has no free active torrent slot for an uncached download."
                );
                slotError.code = "RD_ACTIVE_SLOTS_FULL";
                throw slotError;
              }

              if (adopted.status !== "stale") {
                try {
                  await base44.functions.invoke(
                    "realDebrid",
                    {
                      action: "reset_stale_hash",
                      info_hash: hash,
                      claim_for_playback: true,
                      title:
                        source?.rdTitle ||
                        source?.title ||
                        "",
                    }
                  );
                } catch {
                  // Same-hash cleanup is best-effort; the fresh RD add still runs.
                }
              }

              if (cancelled) return;
            }

            /*
             * Comet RD⬇ sources need Comet to start the torrent first.
             * Comet keeps the tracker/source list in its own database and
             * includes that metadata when it submits the torrent to the
             * user's debrid account. A bare info-hash magnet can be accepted
             * by RD yet sit forever at 0 seeders / 0 B/s.
             *
             * Trigger Comet from the actual playback device (same-IP safe),
             * then adopt the resulting RD torrent by hash and use Media God's
             * normal progress polling from that point onward.
             */
            const cometPlaybackUrl = String(
              active?.cometPlaybackUrl || ""
            ).trim();

            if (
              active?.cacheRequired === true &&
              active?.cometUncached === true &&
              hash &&
              /^https?:\/\//i.test(cometPlaybackUrl)
            ) {
              /*
               * Comet's playback endpoint is the authoritative way to start
               * an uncached Comet result because it can reuse Comet's stored
               * torrent sources/private trackers. Do not wait for the HTTP
               * response before polling RD: the endpoint can remain busy while
               * it is creating/selecting the torrent, and the previous code
               * aborted that request before adoption had a fair chance.
               */
              setRdPreparation((current) => ({
                ...(current || {}),
                status: current?.status || "magnet_conversion",
                progress: Number(current?.progress || 0),
                seeders: Number(
                  current?.seeders ||
                    active?.reportedSeeders ||
                    0
                ),
                speed_bps: Number(current?.speed_bps || 0),
                startedAt: current?.startedAt || Date.now(),
                updatedAt: Date.now(),
                attempts: 0,
              }));
              setRdResolving(false);

              const triggerController = new AbortController();
              const triggerTimer = window.setTimeout(
                () => triggerController.abort(),
                30000
              );

              void fetch(
                cometPlaybackUrl,
                {
                  method: "GET",
                  cache: "no-store",
                  redirect: "manual",
                  signal: triggerController.signal,
                }
              )
                .then(async (triggerResponse) => {
                  try {
                    await triggerResponse.body?.cancel?.();
                  } catch {
                    // The request itself is what starts the Comet/RD job.
                  }
                })
                .catch(() => {
                  /*
                   * CORS/opaque redirect errors can occur after Comet has
                   * already received the request. Adoption below is the source
                   * of truth for whether RD actually started the torrent.
                   */
                })
                .finally(() => {
                  window.clearTimeout(triggerTimer);
                });

              let cometResetAttempted = false;

              for (let adoptAttempt = 0; adoptAttempt < 24; adoptAttempt += 1) {
                if (cancelled) {
                  triggerController.abort();
                  return;
                }

                if (adoptAttempt > 0) {
                  await new Promise((resolve) =>
                    window.setTimeout(resolve, 1250)
                  );
                }

                try {
                  const adoptResponse = await base44.functions.invoke(
                    "realDebrid",
                    {
                      action: "adopt_hash",
                      info_hash: hash,
                      title:
                        source?.rdTitle ||
                        source?.title ||
                        "",
                      ...(source?.rdYear != null
                        ? { year: source.rdYear }
                        : {}),
                      ...(source?.rdSeason != null
                        ? { season: source.rdSeason }
                        : {}),
                      ...(source?.rdEpisode != null
                        ? { episode: source.rdEpisode }
                        : {}),
                    }
                  );

                  if (cancelled) return;

                  const adoptData = adoptResponse?.data || {};

                  if (adoptData.status === "stale") {
                    const staleProgress = Math.max(
                      0,
                      Math.min(100, Number(adoptData.progress || 0))
                    );

                    setRdPreparation((current) => ({
                      ...(current || {}),
                      status: "magnet_conversion",
                      progress: staleProgress,
                      updatedAt: Date.now(),
                      attempts: adoptAttempt + 1,
                    }));

                    /*
                     * A stale row for the same hash must not kick the user to
                     * another torrent. Clear it once, keep Comet's trigger
                     * alive, and give the same source time to create a fresh RD
                     * job with Comet's stored tracker/source metadata.
                     */
                    if (!cometResetAttempted) {
                      cometResetAttempted = true;

                      try {
                        await base44.functions.invoke(
                          "realDebrid",
                          {
                            action: "reset_stale_hash",
                            info_hash: hash,
                            claim_for_playback: true,
                            title:
                              source?.rdTitle ||
                              source?.title ||
                              "",
                          }
                        );
                      } catch {
                        // Continue polling; the existing row may recover itself.
                      }
                    }

                    continue;
                  }

                  if (adoptData.status === "failed") {
                    setRdPreparation((current) => ({
                      ...(current || {}),
                      status:
                        adoptData.rd_status ||
                        current?.status ||
                        "magnet_conversion",
                      updatedAt: Date.now(),
                      attempts: adoptAttempt + 1,
                    }));

                    if (!cometResetAttempted) {
                      cometResetAttempted = true;

                      try {
                        await base44.functions.invoke(
                          "realDebrid",
                          {
                            action: "reset_stale_hash",
                            info_hash: hash,
                            claim_for_playback: true,
                            title:
                              source?.rdTitle ||
                              source?.title ||
                              "",
                          }
                        );
                      } catch {
                        // Keep waiting for Comet to replace the failed RD row.
                      }
                    }

                    continue;
                  }

                  if (
                    adoptData.status === "ready" &&
                    adoptData.stream_url
                  ) {
                    setRdOverride({
                      src: adoptData.stream_url,
                      label:
                        adoptData.filename ||
                        active?.label ||
                        "Real-Debrid Stream",
                      file: currentFilePath(adoptData.files),
                      audioRescue: adoptData.audio_rescue || null,
                      fallbackSrc:
                        adoptData.fallback_stream_url || "",
                      videoRescue: adoptData.video_rescue || null,
                      mediaInfo: adoptData.media_info || null,
                    });
                    setRdFiles(adoptData.files || []);
                    setRdResolving(false);
                    setRdPreparation(null);
                    return;
                  }

                  if (adoptData.torrent_id) {
                    setRdPreparation({
                      ...(adoptData.torrent_progress || {}),
                      status:
                        adoptData.torrent_progress?.status ||
                        adoptData.rd_status ||
                        "preparing",
                      startedAt: Date.now(),
                      updatedAt: Date.now(),
                      attempts: 0,
                    });
                    setRdTorrentId(String(adoptData.torrent_id));
                    setRdResolving(false);
                    return;
                  }
                } catch {
                  // Give Comet/RD another moment to expose the new torrent.
                }
              }

              window.dispatchEvent(
                new CustomEvent("mg:player-status", {
                  detail: {
                    message:
                      "Comet could not start this uncached torrent directly — trying Real-Debrid with fallback trackers…",
                  },
                })
              );
              /*
               * Fall through to Media God's normal Real-Debrid resolver.
               * Uncached Comet magnets now carry a public fallback tracker
               * set, so RD still has a second route to discover peers.
               */
            }

            if (hash && source?.hasDebrid) {
              try {
                const cacheResponse = await base44.functions.invoke(
                  "multiDebrid",
                  {
                    action: "check_cache",
                    hashes: [hash],
                    provider_scores: debridProviderScoreHints(),
                  }
                );

                const cacheData = cacheResponse?.data || {};
                const best = String(
                  cacheData?.bestProviderByHash?.[hash] || ""
                )
                  .toLowerCase()
                  .replace(/[^a-z]/g, "");
                const ranked = Object.entries(
                  cacheData?.providerScoresByHash?.[hash] || {}
                )
                  .sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0))
                  .map(([provider]) =>
                    String(provider || "")
                      .toLowerCase()
                      .replace(/[^a-z]/g, "")
                  )
                  .filter(Boolean);

                debridProviders = [
                  explicitProvider,
                  best,
                  ...ranked,
                ].filter(
                  (provider, index, list) =>
                    provider && list.indexOf(provider) === index
                );
              } catch {
                // An explicit provider can still be tried when cache ranking fails.
              }
            }

            let lastMultiError = null;
            const alternateProviders = debridProviders.filter(
              (provider) => provider !== "realdebrid"
            );

            for (const debridProvider of alternateProviders) {
              const resolveStartedAt = Date.now();
              try {
                const multiResponse = await base44.functions.invoke(
                  "multiDebrid",
                  {
                    action: "resolve",
                    provider: debridProvider,
                    provider_scores: debridProviderScoreHints(),
                    source: magnet,
                    ...(source?.rdSeason != null
                      ? { season: source.rdSeason }
                      : {}),
                    ...(source?.rdEpisode != null
                      ? { episode: source.rdEpisode }
                      : {}),
                  }
                );

                if (cancelled) return;

                const multiData = multiResponse?.data || {};
                if (!multiData?.url) {
                  throw new Error(
                    multiData?.error ||
                      `${multiData?.providerName || "Debrid provider"} did not return a playable stream.`
                  );
                }

                recordDebridProviderResult(
                  multiData.provider || debridProvider,
                  {
                    success: true,
                    latencyMs: Date.now() - resolveStartedAt,
                  }
                );
                setRdOverride({
                  src: multiData.url,
                  label:
                    multiData.filename ||
                    multiData.providerName ||
                    active?.label ||
                    "Debrid Stream",
                  file:
                    multiData.selectedFile ||
                    multiData.filename ||
                    "",
                  provider: multiData.provider || debridProvider,
                  sourceUrl: magnet,
                });
                setRdFiles(
                  Array.isArray(multiData.files)
                    ? multiData.files
                    : []
                );
                setRdResolving(false);
                return;
              } catch (multiError) {
                lastMultiError = multiError;
                recordDebridProviderResult(
                  debridProvider,
                  {
                    success: false,
                    latencyMs: Date.now() - resolveStartedAt,
                  }
                );
              }
            }

            if (
              !source?.hasRd &&
              source?.hasDebrid &&
              explicitProvider !== "realdebrid"
            ) {
              throw lastMultiError || new Error(
                "No connected debrid provider could resolve this cached source."
              );
            }

            rdResolveStartedAt = Date.now();
            const res =
              await base44.functions.invoke(
                "realDebrid",
                {
                  action:
                    "resolve_best",

                  magnet,

                  title:
                    source?.rdTitle ||
                    source?.title ||
                    "",

                  ...(source?.rdYear !=
                  null
                    ? {
                        year:
                          source.rdYear,
                      }
                    : {}),

                  ...(source?.rdSeason !=
                  null
                    ? {
                        season:
                          source.rdSeason,
                      }
                    : {}),

                  ...(source?.rdEpisode !=
                  null
                    ? {
                        episode:
                          source.rdEpisode,
                      }
                    : {}),

                  ...(active?.fileIdx != null &&
                  Number.isFinite(Number(active.fileIdx))
                    ? {
                        file_idx:
                          Number(active.fileIdx),
                      }
                    : {}),
                }
              );

            if (
              cancelled
            ) {
              return;
            }

            const data =
              res?.data ||
              {};

            if (
              data.status ===
                "ready" &&
              data.stream_url
            ) {
              recordDebridProviderResult(
                "realdebrid",
                {
                  success: true,
                  latencyMs: Date.now() - rdResolveStartedAt,
                }
              );
              setRdOverride({
                src:
                  data.stream_url,

                label:
                  data.filename ||
                  active?.label ||
                  "Real-Debrid Stream",

                file:
                  currentFilePath(
                    data.files
                  ),

                audioRescue:
                  data.audio_rescue ||
                  null,

                fallbackSrc:
                  data.fallback_stream_url ||
                  "",

                videoRescue:
                  data.video_rescue ||
                  null,

                mediaInfo:
                  data.media_info ||
                  null,
              });

              setRdFiles(
                data.files ||
                  []
              );

              setRdResolving(
                false
              );

              setRdPreparation(null);

              return;
            }

            if (
              data.torrent_id
            ) {
              setRdPreparation({
                ...(data.torrent_progress || {}),
                status:
                  data.torrent_progress?.status ||
                  data.rd_status ||
                  "preparing",
                startedAt: Date.now(),
                updatedAt: Date.now(),
                attempts: 0,
              });

              setRdTorrentId(
                String(
                  data.torrent_id
                )
              );

              setRdResolving(
                false
              );

              return;
            }

            const resolveError = new Error(
              data.error ||
                "Real-Debrid could not resolve this source."
            );
            resolveError.code = String(data.error_code || "").trim();
            resolveError.rdStatus = String(data.rd_status || "").trim();
            throw resolveError;
          } catch (
            error
          ) {
            if (rdResolveStartedAt > 0) {
              recordDebridProviderResult(
                "realdebrid",
                {
                  success: false,
                  latencyMs: Date.now() - rdResolveStartedAt,
                }
              );
            }

            if (
              !cancelled
            ) {
              const uncachedActive = Boolean(
                active?.cacheRequired === true ||
                  (
                    active?.debridCacheChecked === true &&
                    active?.debridCached !== true
                  )
              );
              const terminalRdResolveFailure =
                uncachedActive &&
                (
                  /^RD_TORRENT_(?:MAGNET_ERROR|ERROR|DEAD|VIRUS)$/i.test(
                    String(error?.code || "")
                  ) ||
                  /could not resolve this magnet into an active torrent/i.test(
                    String(error?.message || "")
                  )
                );

              if (
                error?.code === "RD_ACTIVE_SLOTS_FULL" ||
                terminalRdResolveFailure
              ) {
                /*
                 * Do not make an uncached cache attempt disappear by hopping
                 * to another torrent. Slot exhaustion affects every candidate,
                 * while a terminal magnet error needs the current source's
                 * Comet/source metadata to be retried or inspected.
                 */
                setRdResolving(false);
                setRdPolling(false);
                setRdTorrentId(null);
                setRdPreparation((current) =>
                  terminalRdResolveFailure
                    ? {
                        ...(current || {}),
                        status: error?.rdStatus || "magnet_error",
                        updatedAt: Date.now(),
                      }
                    : null
                );
                setRdError(
                  error?.message ||
                    (error?.code === "RD_ACTIVE_SLOTS_FULL"
                      ? "Real-Debrid has no free active torrent slot."
                      : "Real-Debrid could not start this uncached torrent.")
                );
                return;
              }

              tryNextSource(
                error?.message ||
                  "Unable to resolve this stream."
              );
            }
          }
        };

      const queuedRun = rdResolutionQueueRef.current
        .catch(() => {})
        .then(() => {
          if (cancelled) {
            return undefined;
          }

          return run();
        });

      rdResolutionQueueRef.current = queuedRun.catch(() => {});

      return () => {
        cancelled =
          true;

        if (
          pollRef.current
        ) {
          clearTimeout(
            pollRef.current
          );

          pollRef.current =
            null;
        }
      };
    },
    [
      activeIdx,
      active,
      activeUrl,
      source,
      isYoutube,
      isProvider,
      isDirectFile,
      isLive,
      isRdSource,
    ]
  );

  /*
   * Poll Real-Debrid while a newly submitted
   * torrent is being prepared.
   */
  useEffect(
    () => {
      if (
        !rdTorrentId ||
        rdOverride
      ) {
        return;
      }

      let cancelled =
        false;

      let attempts =
        0;

      let latestProgress =
        0;

      let latestSeeders =
        0;

      let latestSpeed =
        0;

      let lastProgressValue =
        -1;

      let lastProgressAdvanceAt =
        Date.now();

      setRdPolling(
        true
      );

      const tick =
        async () => {
          if (
            cancelled
          ) {
            return;
          }

          attempts +=
            1;

          try {
            const res =
              await base44.functions.invoke(
                "realDebrid",
                {
                  action:
                    "torrent_info",

                  torrent_id:
                    rdTorrentId,

                  title:
                    source?.rdTitle ||
                    source?.title ||
                    "",

                  ...(source?.rdYear !=
                  null
                    ? {
                        year:
                          source.rdYear,
                      }
                    : {}),

                  ...(source?.rdSeason !=
                  null
                    ? {
                        season:
                          source.rdSeason,
                      }
                    : {}),

                  ...(source?.rdEpisode !=
                  null
                    ? {
                        episode:
                          source.rdEpisode,
                      }
                    : {}),

                  ...(active?.fileIdx != null &&
                  Number.isFinite(Number(active.fileIdx))
                    ? {
                        file_idx:
                          Number(active.fileIdx),
                      }
                    : {}),
                }
              );

            if (
              cancelled
            ) {
              return;
            }

            const data =
              res?.data ||
              {};

            const progressData =
              data.torrent_progress ||
              {};

            latestProgress = Math.max(
              0,
              Math.min(
                100,
                Number(progressData.progress || 0)
              )
            );

            latestSeeders = Math.max(
              0,
              Number(progressData.seeders || 0)
            );

            latestSpeed = Math.max(
              0,
              Number(progressData.speed_bps || 0)
            );

            if (
              lastProgressValue < 0 ||
              latestProgress > lastProgressValue + 0.001
            ) {
              lastProgressValue = latestProgress;
              lastProgressAdvanceAt = Date.now();
            }

            setRdPreparation(
              (current) => ({
                ...progressData,
                status:
                  progressData.status ||
                  data.rd_status ||
                  current?.status ||
                  "preparing",
                startedAt:
                  current?.startedAt ||
                  Date.now(),
                updatedAt:
                  Date.now(),
                attempts,
              })
            );

            const currentRdStatus = String(
              progressData.status ||
              data.rd_status ||
              ""
            ).toLowerCase();

            if (
              /^(?:dead|error|magnet_error|virus)$/.test(
                currentRdStatus
              )
            ) {
              setRdPolling(false);
              setRdTorrentId(null);

              const uncachedActive = Boolean(
                active?.cacheRequired === true ||
                  (
                    active?.debridCacheChecked === true &&
                    active?.debridCached !== true
                  )
              );

              if (uncachedActive) {
                /*
                 * Keep the failed uncached torrent selected. Automatically
                 * hopping here made the cache screen disappear on the very
                 * first RD poll (normally about 2.5 seconds after creation),
                 * which is exactly the behaviour seen on the phone screenshot.
                 */
                setRdPreparation((current) => ({
                  ...(current || {}),
                  status: currentRdStatus,
                  updatedAt: Date.now(),
                  attempts,
                }));
                setRdError(
                  `Real-Debrid stopped this uncached torrent: ${friendlyRdStatus(
                    currentRdStatus
                  )}. Retry this source to start it again.`
                );
                return;
              }

              const moved = tryNextSource(
                `Real-Debrid stopped preparing this torrent: ${friendlyRdStatus(
                  currentRdStatus
                )}. Trying another source.`,
                {
                  blacklistTorrentHash: true,
                  immediate: true,
                }
              );

              if (!moved) {
                setRdError(
                  `Real-Debrid stopped preparing this torrent: ${friendlyRdStatus(
                    currentRdStatus
                  )}. No other playable source is available.`
                );
              }

              return;
            }

            if (
              data.status ===
                "ready" &&
              data.stream_url
            ) {
              setRdOverride({
                src:
                  data.stream_url,

                label:
                  data.filename ||
                  "Real-Debrid Stream",

                file:
                  currentFilePath(
                    data.files
                  ),

                audioRescue:
                  data.audio_rescue ||
                  null,

                fallbackSrc:
                  data.fallback_stream_url ||
                  "",

                videoRescue:
                  data.video_rescue ||
                  null,

                mediaInfo:
                  data.media_info ||
                  null,
              });

              setRdFiles(
                data.files ||
                  []
              );

              setRdPolling(
                false
              );

              setRdTorrentId(
                null
              );

              setRdPreparation(null);

              return;
            }

            if (
              data.error
            ) {
              const rdErrorCode = String(
                data.error_code || ""
              ).trim();

              setRdPolling(
                false
              );

              setRdTorrentId(
                null
              );

              if (
                rdErrorCode ===
                "RD_NO_VIDEO_FILE"
              ) {
                setRdPreparation(null);

                const moved = tryNextSource(
                  "Real-Debrid finished this torrent, but it contains no playable video file. Trying a different torrent.",
                  {
                    blacklistTorrentHash: true,
                    immediate: true,
                  }
                );

                if (!moved) {
                  setRdError(
                    "Real-Debrid finished this torrent, but it contains no playable video file and no different playable source is available."
                  );
                }

                return;
              }

              setRdError(
                data.error
              );

              return;
            }
          } catch (
            error
          ) {
            if (
              !cancelled
            ) {
              setRdError(
                error?.message ||
                  "Real-Debrid polling failed."
              );

              setRdPolling(
                false
              );

              setRdTorrentId(
                null
              );
            }

            return;
          }

          const noProgressForMs =
            Date.now() - lastProgressAdvanceAt;

          const sourceReportedSeeders = Math.max(
            0,
            Number(active?.reportedSeeders || 0)
          );

          const activeOriginalTrackerMagnet = String(
            active?.richMagnet || ""
          ).trim();
          const hasOriginalTrackerMagnet =
            /^magnet:/i.test(activeOriginalTrackerMagnet) &&
            /(?:[?&])tr=/i.test(activeOriginalTrackerMagnet);

          /*
           * Real-Debrid can keep reporting a non-zero seeder count/speed even
           * when the torrent percentage has stopped moving. The RD website can
           * therefore show (for example) 13 seeders and ~200 KB/s while the
           * exact same percentage sits there for minutes. Seeder/speed numbers
           * are useful diagnostics, but actual progress is the authority.
           *
           * Give a fresh torrent time to establish, then fail it if the RD
           * percentage does not advance. A partial torrent gets a longer
           * flatline window so short swarm pauses do not throw away a healthy
           * download.
           */
          /*
           * Real-Debrid reports torrent progress as a WHOLE percentage. On a
           * large uncached movie, RD can genuinely download hundreds of MB at
           * a healthy speed while progress still reads 0%. The old watchdog
           * treated that as a dead torrent after 45-75 seconds and then
           * deleted it during failover, which made healthy uncached downloads
           * look as though they never started.
           *
           * Seeder/speed activity is therefore meaningful here. Give an
           * actively moving swarm a long runway, and only use the short dead
           * windows when RD is reporting no peer activity at all.
           */
          const hasReportedPeerActivity =
            latestSeeders > 0 || latestSpeed > 0;

          const stallAfterMs =
            latestProgress <= 0.001
              ? hasReportedPeerActivity
                ? 10 * 60 * 1000
                : hasOriginalTrackerMagnet
                  ? 3 * 60 * 1000
                  : 2 * 60 * 1000
              : hasReportedPeerActivity
                ? 10 * 60 * 1000
                : 3 * 60 * 1000;

          const looksCompletelyStalled =
            latestProgress < 100 &&
            noProgressForMs >= stallAfterMs;

          if (looksCompletelyStalled) {
            const nextSource = findNextPlayableSource(activeIdx);

            if (nextSource !== -1) {
              const stalledTorrentId = String(rdTorrentId || "").trim();

              if (stalledTorrentId) {
                try {
                  await base44.functions.invoke(
                    "realDebrid",
                    {
                      action: "torrent_delete",
                      torrent_id: stalledTorrentId,
                    }
                  );
                } catch {
                  // Cleanup is best-effort; source failover must still happen.
                }
              }

              setRdPolling(false);
              setRdTorrentId(null);
              tryNextSource(
                latestProgress <= 0.001
                  ? hasReportedPeerActivity
                    ? "Real-Debrid kept reporting peer activity but the whole-percent progress value did not advance for about 10 minutes. Trying another torrent."
                    : hasOriginalTrackerMagnet
                      ? "Real-Debrid could not establish peer activity for this original tracker magnet after about 3 minutes. Trying another torrent."
                      : sourceReportedSeeders > 0
                        ? "The source reported seeders, but Real-Debrid still found no live peer activity after about 2 minutes. Trying another torrent."
                        : "Real-Debrid found no peer activity after about 2 minutes. Trying another torrent."
                  : hasReportedPeerActivity
                    ? `Real-Debrid stayed at ${latestProgress.toFixed(2)}% for about 10 minutes despite continuing to report peer/speed activity. Trying another source.`
                    : `Real-Debrid stayed at ${latestProgress.toFixed(2)}% with no peer activity for about 3 minutes. Trying another source.`, 
                {
                  blacklistTorrentHash: true,
                  immediate: true,
                }
              );
              return;
            }
          }

          if (
            attempts <
            360
          ) {
            pollRef.current =
              setTimeout(
                tick,
                latestProgress >= 100 ? 2000 : 5000
              );
          } else {
            setRdPolling(
              false
            );

            setRdTorrentId(
              null
            );

            const stalledHint =
              latestSeeders <= 0 && latestSpeed <= 0
                ? " No active seeders or download speed were reported."
                : "";

            setRdError(
              latestProgress > 0
                ? `Real-Debrid reached ${Math.round(latestProgress)}% but is still not ready after about 30 minutes.${stalledHint} Try another source or retry this one later.`
                : `Real-Debrid has made no usable progress after about 30 minutes.${stalledHint} Try another source.`
            );
          }
        };

      pollRef.current =
        setTimeout(
          tick,
          2500
        );

      return () => {
        cancelled =
          true;

        if (
          pollRef.current
        ) {
          clearTimeout(
            pollRef.current
          );

          pollRef.current =
            null;
        }
      };
    },
    [
      rdTorrentId,
      rdOverride,
      source,
    ]
  );

  useEffect(
    () => {
      failedSourcesRef.current =
        new Set();
      failedTorrentHashesRef.current =
        readPersistentFailedTorrentHashes();

      setFailedSources(
        new Set()
      );
    },
    [
      source?.title,
      source?.id,
      source?.rdSeason,
      source?.rdEpisode,
    ]
  );

  /*
   * If a torrent hash failed recently, skip it immediately when a retry or
   * reopen makes the same row active again. This prevents repeatedly waiting
   * on the same dead partial Real-Debrid job across player sessions.
   */
  useEffect(
    () => {
      const activeHash = sourceTorrentHash(active);

      if (
        rdResolving ||
        rdPolling ||
        rdTorrentId ||
        rdPreparation ||
        !activeHash ||
        !failedTorrentHashesRef.current.has(activeHash)
      ) {
        return;
      }

      const nextIndex = findNextPlayableSource(activeIdx);

      if (nextIndex === -1) {
        return;
      }

      const timer = window.setTimeout(() => {
        switchToSource(nextIndex, {
          preservePosition: true,
          statusMessage:
            "Skipping a recently failed torrent — trying a different source…",
        });
      }, 0);

      return () => window.clearTimeout(timer);
    },
    [
      activeIdx,
      active,
      sources,
      source?.title,
      source?.id,
      source?.rdSeason,
      source?.rdEpisode,
      rdResolving,
      rdPolling,
      rdTorrentId,
      rdPreparation,
    ]
  );

  /*
   * Keyboard / TV remote controls.
   */
  useEffect(
    () => {
      const onKey =
        (
          event
        ) => {
          const backKey =
            event.key === "Escape" ||
            event.key === "Backspace" ||
            event.key === "BrowserBack" ||
            event.key === "GoBack" ||
            Number(event.keyCode || event.which || 0) === 4;

          if (backKey) {
            const stage =
              stageRef.current;

            event.preventDefault();
            event.stopPropagation();

            if (
              stage?.dataset
                ?.mgFullscreen ===
              "true"
            ) {
              goFullscreen();

              return;
            }

            const nativeFullscreenElement =
              document.fullscreenElement ||
              document.webkitFullscreenElement ||
              null;

            if (nativeFullscreenElement) {
              goFullscreen();
              return;
            }

            onClose();
            return;
          }

          /*
           * FireTvRemote is the sole owner of D-pad/OK/media navigation while
           * this player is running on Fire TV. The desktop keyboard shortcuts
           * below must not also turn the same Arrow keys into seek/volume
           * commands, otherwise one remote press has two competing meanings.
           */
          if (isFireTvRemoteRuntime()) {
            const remoteCode = Number(event.keyCode || event.which || 0);
            const remoteKey = String(event.key || event.code || "");
            const fireTvNavigationKey =
              remoteKey === "ArrowLeft" ||
              remoteKey === "ArrowRight" ||
              remoteKey === "ArrowUp" ||
              remoteKey === "ArrowDown" ||
              remoteKey === "Enter" ||
              remoteKey === "NumpadEnter" ||
              remoteKey === "Select" ||
              remoteKey === "Accept" ||
              remoteKey === "MediaPlayPause" ||
              remoteKey === "MediaPlay" ||
              remoteKey === "MediaPause" ||
              remoteKey === "MediaRewind" ||
              remoteKey === "MediaFastForward" ||
              [13, 19, 20, 21, 22, 23, 66, 85, 89, 90, 126, 127, 179, 227, 228].includes(
                remoteCode
              );

            if (fireTvNavigationKey) {
              return;
            }
          }

          const tag =
            (
              event.target
                ?.tagName ||
              ""
            ).toLowerCase();

          if (
            tag === "input" ||
            tag === "select" ||
            tag === "button" ||
            tag === "a" ||
            tag === "textarea" ||
            event.target?.isContentEditable
          ) {
            /*
             * Let FireTvRemote / the native WebView own D-pad movement,
             * Select and range/select adjustments while a real player control
             * is focused. Without this guard VideoPlayer was turning every
             * ArrowLeft/Right into a 10-second seek and every ArrowUp/Down
             * into a volume change, so the remote could not move between the
             * source, torrent, subtitle, audio and transport controls.
             */
            return;
          }

          const video =
            stageRef.current
              ?.querySelector(
                "video"
              );

          if (
            !video
          ) {
            return;
          }

          if (
            event.key >=
              "0" &&
            event.key <=
              "9" &&
            video.duration
          ) {
            event.preventDefault();

            video.currentTime =
              video.duration *
              (
                parseInt(
                  event.key,
                  10
                ) /
                10
              );

            return;
          }

          switch (
            event.key
          ) {
            case " ":
            case "k":
              event.preventDefault();

              if (
                video.paused
              ) {
                video
                  .play()
                  .catch(
                    () => {}
                  );
              } else {
                video.pause();
              }

              break;

            case "ArrowLeft":
            case "j":
              event.preventDefault();

              video.currentTime =
                Math.max(
                  0,
                  (
                    video.currentTime ||
                    0
                  ) -
                    10
                );

              break;

            case "ArrowRight":
            case "l":
              event.preventDefault();

              if (
                video.duration
              ) {
                video.currentTime =
                  Math.min(
                    video.duration,
                    (
                      video.currentTime ||
                      0
                    ) +
                      10
                  );
              }

              break;

            case "ArrowUp":
              event.preventDefault();

              video.volume =
                Math.min(
                  1,
                  (
                    video.volume ??
                    1
                  ) +
                    0.1
                );

              break;

            case "ArrowDown":
              event.preventDefault();

              video.volume =
                Math.max(
                  0,
                  (
                    video.volume ??
                    1
                  ) -
                    0.1
                );

              break;

            case "f":
            case "F":
              event.preventDefault();

              goFullscreen();

              break;

            case "m":
              event.preventDefault();

              video.muted =
                !video.muted;

              break;

            case "<":
              event.preventDefault();

              video.playbackRate =
                Math.max(
                  0.5,
                  (
                    video.playbackRate ||
                    1
                  ) -
                    0.25
                );

              break;

            case ">":
              event.preventDefault();

              video.playbackRate =
                Math.min(
                  2,
                  (
                    video.playbackRate ||
                    1
                  ) +
                    0.25
                );

              break;

            default:
              break;
          }
        };

      window.addEventListener(
        "keydown",
        onKey
      );

      document.body.style
        .overflow =
        "hidden";

      return () => {
        window.removeEventListener(
          "keydown",
          onKey
        );

        document.body.style
          .overflow =
          "";
      };
    },
    [
      onClose,
    ]
  );

  /*
   * Autoplay direct/RD video.
   */
  useEffect(
    () => {
      const video =
        rdOverride
          ? videoRef.current
          : liveVideoRef.current ||
            videoRef.current;

      const url =
        rdOverride?.src ||
        getSourceUrl(active);

      if (
        !video ||
        !url
      ) {
        return;
      }

      if (
        !rdOverride &&
        active?.type !==
          "file" &&
        active?.type !==
          "url" &&
        active?.type !==
          "live"
      ) {
        return;
      }

      video.muted =
        false;
      video.volume =
        1;

      if (
        video.dataset
          ?.mgAutoplayMuted ===
        "true"
      ) {
        delete video.dataset
          .mgAutoplayMuted;
      }

      const startPlayback = () => {
        video
          .play()
          .catch(
            () => {
              video.muted =
                true;

              video.dataset
                .mgAutoplayMuted =
                "true";

              video
                .play()
                .catch(
                  () => {}
                );
            }
          );
      };

      if (video.readyState >= 2) {
        startPlayback();
      } else {
        video.addEventListener(
          "canplay",
          startPlayback,
          { once: true }
        );

        return () => {
          video.removeEventListener(
            "canplay",
            startPlayback
          );
        };
      }
    },
    [
      active,
      rdOverride,
    ]
  );

  /*
   * Continue Watching.
   */
  const lastSaveRef =
    useRef(0);

  const cwIdRef =
    useRef({});

  const lastPosRef =
    useRef({
      t:
        0,

      d:
        0,
    });

  const saveProgress =
    (
      time,
      duration,
      force =
        false
    ) => {
      if (
        isLive ||
        !source?.title
      ) {
        return;
      }

      const url =
        rdOverride?.src ||
        active?.src ||
        active?.url;

      if (
        !url
      ) {
        return;
      }

      const now =
        Date.now();

      if (
        !force &&
        now -
          lastSaveRef.current <
          10000
      ) {
        return;
      }

      lastSaveRef.current =
        now;

      const legacyMediaType =
        source?.mediaType === "tv" ||
        source?.type === "series" ||
        source?.season != null ||
        source?.episode != null ||
        source?.rdSeason != null ||
        source?.rdEpisode != null
          ? "tv"
          : "movie";

      const canonicalTitle = String(
        source?.rdTitle || source?.title || "Video"
      )
        .replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, "")
        .trim();

      const key = [
        "mg2",
        source?.tmdbId ?? source?.tmdb_id ?? source?.id ?? "",
        legacyMediaType,
        source?.rdYear || source?.year || "",
        source?.rdSeason || source?.season || "",
        source?.rdEpisode || source?.episode || "",
        encodeURIComponent(canonicalTitle),
      ].join("|");

      const patch = {
        progress:
          time,

        duration,

        video_url:
          url,

        poster_url:
          source.poster ||
          "",

        source_type:
          rdOverride
            ? "rd"
            : "file",
      };

      const id =
        cwIdRef.current[
          key
        ];

      if (
        id
      ) {
        base44.entities.ContinueWatching
          .update(
            id,
            patch
          )
          .catch(
            () => {}
          );

        return;
      }

      base44.entities.ContinueWatching
        .filter({
          content_key:
            key,
        })
        .then(
          (
            rows
          ) => {
            if (
              rows?.length >
              0
            ) {
              cwIdRef.current[
                key
              ] =
                rows[0].id;

              base44.entities.ContinueWatching
                .update(
                  rows[0].id,
                  patch
                )
                .catch(
                  () => {}
                );

              return;
            }

            /*
             * ContinueWatchingAssist owns creation of canonical resume rows.
             * The player may update an existing canonical row, but it must not
             * create another record and race the canonical tracker.
             */
            return null;
          }
        )
        .catch(
          () => {}
        );
    };

  const saveProgressRef =
    useRef(
      saveProgress
    );

  saveProgressRef.current =
    saveProgress;

  useEffect(
    () => {
      return () => {
        const {
          t,
          d,
        } =
          lastPosRef.current;

        if (
          t >
          5
        ) {
          saveProgressRef.current?.(
            t,
            d,
            true
          );
        }
      };
    },
    []
  );

  const handleLoadedMetadata =
    (
      event
    ) => {
      const video =
        event.target;

      const loadedDuration = Number(
        video?.duration || 0
      );

      /*
       * The public Comet service can return a valid ~2 minute MP4 that is
       * actually its own "Couldn't start this stream" error card. Because
       * that file is valid video, the browser never raises a media error and
       * normal failover used to treat it as successful playback. Reject that
       * very specific Comet signature and move to the next real source.
       */
      const activeSourceText = [
        active?.addon,
        active?.label,
        active?.name,
        active?.title,
      ]
        .filter(Boolean)
        .join(" ");

      const cometNamedError =
        /\b(?:public\s+)?rate[-\s]?limit(?:ed)?\s+exceeded\b|couldn['’]?t\s+start\s+this\s+stream|could\s+not\s+start\s+this\s+stream|not\s+cached[^\n]{0,80}(?:debrid|server|yet|wait)|\bwrong\s+ip\b|infringing[_\s-]?file|\bcopyright\b/i.test(
          activeSourceText
        );

      const cometErrorVideo =
        /\bcomet\b/i.test(activeSourceText) &&
        (
          cometNamedError ||
          (!isLive && !Number.isFinite(loadedDuration)) ||
          loadedDuration <= 15 ||
          (
            loadedDuration >= 115 &&
            loadedDuration <= 125
          )
        );

      if (cometErrorVideo) {
        recordPlaybackReliability(
          sourceDisplayLabel(active, activeIdx),
          "failure"
        );

        tryNextSource(
          "Comet returned its error video instead of the requested stream."
        );

        return;
      }

      const recoveryTime = Number(
        recoveryResumeRef.current || 0
      );
      const requestedStart = Number(
        source?.startTime || 0
      );
      const resumeAt =
        recoveryTime > 5
          ? recoveryTime
          : requestedStart > 5
            ? requestedStart
            : 0;

      if (resumeAt > 5) {
        try {
          const duration = Number(video.duration || 0);
          video.currentTime =
            duration > 0
              ? Math.min(resumeAt, Math.max(0, duration - 8))
              : resumeAt;
        } catch {
          // Ignore.
        }
      }

      if (recoveryTime > 0) {
        recoveryResumeRef.current = 0;
      }
    };

  const handleTimeUpdate =
    (
      event
    ) => {
      const video =
        event.target;

      lastPosRef.current =
        {
          t:
            video.currentTime ||
            0,

          d:
            video.duration ||
            0,
        };

      saveProgress(
        video.currentTime ||
          0,

        video.duration ||
          0
      );
    };

  useEffect(() => {
    if (!isLive || sources.length <= 1) {
      return undefined;
    }

    let video = null;
    let attachTimer = null;
    let startupTimer = null;
    let stallTimer = null;
    let switched = false;

    const clearStartup = () => {
      if (startupTimer) {
        window.clearTimeout(startupTimer);
        startupTimer = null;
      }
    };

    const clearStall = () => {
      if (stallTimer) {
        window.clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    const switchLiveSource = (
      message,
      { stalled = false } = {}
    ) => {
      if (switched) return;
      switched = true;
      clearStartup();
      clearStall();

      const url = String(activeUrl || "").trim();
      if (/^https?:\/\//i.test(url)) {
        recordLiveTvPlaybackResult(url, {
          success: false,
          stalled,
        });
      }

      tryNextSource(message);
    };

    const armStallRecovery = () => {
      if (switched) return;
      clearStall();

      const startedAt = Number(video?.currentTime || 0);

      stallTimer = window.setTimeout(() => {
        stallTimer = null;

        const currentTime = Number(video?.currentTime || 0);
        const recovered =
          video instanceof HTMLVideoElement &&
          !video.paused &&
          !video.ended &&
          !video.error &&
          video.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE &&
          (
            currentTime > startedAt + 0.25 ||
            video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
          );

        if (recovered) {
          return;
        }

        switchLiveSource(
          "Live TV stopped responding.",
          { stalled: true }
        );
      }, 10000);
    };

    const onPlaying = () => {
      clearStartup();
      clearStall();
    };

    const onWaiting = () => {
      armStallRecovery();
    };

    const onStalled = () => {
      armStallRecovery();
    };

    const attach = () => {
      video = stageRef.current?.querySelector("video") || null;

      if (!(video instanceof HTMLVideoElement)) {
        attachTimer = window.setTimeout(attach, 120);
        return;
      }

      video.addEventListener("playing", onPlaying);
      video.addEventListener("canplay", onPlaying);
      video.addEventListener("waiting", onWaiting);
      video.addEventListener("stalled", onStalled);

      if (!video.paused && video.readyState >= 2) {
        onPlaying();
      }
    };

    attach();

    startupTimer = window.setTimeout(() => {
      startupTimer = null;

      const alreadyPlaying =
        video instanceof HTMLVideoElement &&
        !video.paused &&
        !video.ended &&
        !video.error &&
        video.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        Number(video.currentTime || 0) > 0.1;

      if (alreadyPlaying) {
        return;
      }

      switchLiveSource(
        "Live TV took too long to start."
      );
    }, 15000);

    return () => {
      clearStartup();
      clearStall();

      if (attachTimer) {
        window.clearTimeout(attachTimer);
      }

      if (video instanceof HTMLVideoElement) {
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("canplay", onPlaying);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("stalled", onStalled);
      }
    };
  }, [
    activeIdx,
    activeUrl,
    isLive,
    sources,
  ]);

  useEffect(() => {
    if (isLive || sources.length <= 1) {
      return undefined;
    }

    const state = autoRecoveryRef.current;
    state.lastTime = 0;
    state.lastProgressAt = Date.now();

    const recover = (video) => {
      const preferences = readPlaybackPreferences();

      if (!preferences.autoRecovery) {
        return false;
      }

      const now = Date.now();
      const activeTorrentLike =
        active?.type === "rd" ||
        active?.type === "rd_torrent" ||
        active?.type === "torrent" ||
        active?.type === "magnet" ||
        isMagnet(activeUrl) ||
        Boolean(magnetHash(activeUrl));
      const recoveryCooldownMs = activeTorrentLike
        ? 30000
        : 18000;

      if (now - Number(state.lastSwitchAt || 0) < recoveryCooldownMs) {
        return false;
      }

      state.abandoned.add(activeIdx);

      const candidates = sources
        .map((candidate, index) => {
          const candidateUrl = getSourceUrl(candidate);
          const torrentCandidate =
            candidate?.type === "rd" ||
            candidate?.type === "rd_torrent" ||
            candidate?.type === "torrent" ||
            candidate?.type === "magnet" ||
            isMagnet(candidateUrl);

          if (
            index === activeIdx ||
            state.abandoned.has(index) ||
            failedSourcesRef.current.has(index) ||
            candidate?.diagnostic ||
            candidate?.type === "status" ||
            candidate?.type === "provider" ||
            candidate?.type === "youtube" ||
            (!candidateUrl && !torrentCandidate)
          ) {
            return null;
          }

          return {
            index,
            score: recoverySourceScore(candidate, index),
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.index - b.index);

      const nextIndex = candidates[0]?.index ?? -1;

      if (nextIndex < 0) {
        setRdError(
          "Playback stalled and there is no unused backup source left to try."
        );
        return false;
      }

      const label = sourceDisplayLabel(active, activeIdx);

      recordPlaybackReliability(label, "buffer");
      markSourceFailed(activeIdx);

      state.lastSwitchAt = now;
      state.lastTime = 0;
      state.lastProgressAt = now;

      switchToSource(nextIndex, {
        preservePosition: true,
        statusMessage:
          "Playback stalled — switching to the best learned backup…",
      });

      return true;
    };

    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "hidden" ||
        rdResolving ||
        rdPolling ||
        rdTorrentId ||
        rdPreparation
      ) {
        state.lastProgressAt = Date.now();
        return;
      }

      const video = stageRef.current?.querySelector("video");

      if (
        !(video instanceof HTMLVideoElement) ||
        video.paused ||
        video.ended ||
        video.seeking
      ) {
        state.lastTime = Number(video?.currentTime || 0);
        state.lastProgressAt = Date.now();
        return;
      }

      const currentTime = Number(video.currentTime || 0);
      const duration = Number(video.duration || 0);
      const now = Date.now();

      if (duration > 0 && duration - currentTime < 3) {
        state.lastTime = currentTime;
        state.lastProgressAt = now;
        return;
      }

      if (Math.abs(currentTime - Number(state.lastTime || 0)) >= 0.35) {
        state.lastTime = currentTime;
        state.lastProgressAt = now;
        return;
      }

      /*
       * Do not abandon a source merely because currentTime did not move on a
       * particular polling sample. If Chromium still reports buffered future
       * media and no actual media error, the source is healthy enough to keep.
       * Genuine network stalls naturally drain that buffer/readyState and can
       * then fall through to recovery below.
       */
      let bufferedAhead = 0;
      try {
        for (let index = 0; index < video.buffered.length; index += 1) {
          const start = Number(video.buffered.start(index) || 0);
          const end = Number(video.buffered.end(index) || 0);
          if (currentTime >= start - 0.25 && currentTime <= end + 0.25) {
            bufferedAhead = Math.max(bufferedAhead, end - currentTime);
          }
        }
      } catch {
        bufferedAhead = 0;
      }

      const hasHealthyBuffer =
        !video.error &&
        video.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE &&
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
        bufferedAhead > 1;

      if (hasHealthyBuffer) {
        state.lastProgressAt = now;
        return;
      }

      const activeTorrentLike =
        active?.type === "rd" ||
        active?.type === "rd_torrent" ||
        active?.type === "torrent" ||
        active?.type === "magnet" ||
        isMagnet(activeUrl) ||
        Boolean(magnetHash(activeUrl));
      const stallThresholdMs = activeTorrentLike
        ? 40000
        : 28000;

      if (now - Number(state.lastProgressAt || now) >= stallThresholdMs) {
        recover(video);
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    active,
    activeIdx,
    isLive,
    rdPolling,
    rdResolving,
    rdTorrentId,
    rdPreparation,
    sources,
  ]);

  /*
   * Do not pre-resolve backup torrents in the background.
   *
   * A previous optimisation resolved another cached torrent a few seconds
   * after playback began. On Fire TV this could create unnecessary debrid
   * activity and make recovery feel as if the player was rapidly jumping
   * between torrents. Backups are now resolved only when the current source
   * genuinely fails or the user explicitly selects another source.
   */

  const pickFile =
    async (
      file
    ) => {
      const provider = String(rdOverride?.provider || "realdebrid")
        .toLowerCase()
        .replace(/[^a-z]/g, "");

      if (
        rdOverride?.file === file.path ||
        rdOverride?.file === file.name
      ) {
        return;
      }

      const actionGeneration = ++streamActionGenerationRef.current;
      const actionStillCurrent = () =>
        streamActionGenerationRef.current === actionGeneration;

      if (provider !== "realdebrid") {
        const sourceUrl = String(
          rdOverride?.sourceUrl || getSourceUrl(active) || ""
        ).trim();

        if (!sourceUrl) {
          setRdError("This debrid file no longer has its torrent source.");
          return;
        }

        setFileSwitching(true);
        setRdError("");

        try {
          const response = await base44.functions.invoke(
            "multiDebrid",
            {
              action: "resolve",
              provider,
              provider_scores: debridProviderScoreHints(),
              source: sourceUrl,
              selected_file: {
                id: file?.id,
                index: file?.index,
                path: file?.path,
                name: file?.name,
              },
              ...(source?.rdSeason != null ? { season: source.rdSeason } : {}),
              ...(source?.rdEpisode != null ? { episode: source.rdEpisode } : {}),
            }
          );

          if (!actionStillCurrent()) {
            return;
          }

          const data = response?.data || {};
          if (!data?.url) {
            throw new Error(
              data?.error || "The selected debrid file did not return a playable stream."
            );
          }

          setRdOverride({
            src: data.url,
            label:
              data.filename ||
              file?.path ||
              file?.name ||
              "Debrid File",
            file:
              data.selectedFile ||
              file?.path ||
              file?.name ||
              "",
            provider: data.provider || provider,
            sourceUrl,
          });
          setRdFiles(
            Array.isArray(data.files) ? data.files : rdFiles
          );
        } catch (error) {
          if (actionStillCurrent()) {
            setRdError(
              error?.message || "Debrid file selection failed."
            );
          }
        } finally {
          if (actionStillCurrent()) {
            setFileSwitching(false);
          }
        }

        return;
      }

      if (
        !file?.link
      ) {
        setRdError(
          "This file does not have a Real-Debrid link yet."
        );

        return;
      }

      setFileSwitching(
        true
      );

      setRdError(
        ""
      );

      try {
        const res =
          await base44.functions.invoke(
            "realDebrid",
            {
              action:
                "unrestrict_file",

              link:
                file.link,
            }
          );

        if (!actionStillCurrent()) {
          return;
        }

        const data =
          res?.data ||
          {};

        if (
          data.stream_url
        ) {
          setRdOverride({
            src:
              data.stream_url,

            label:
              data.filename ||
              file.path ||
              "Real-Debrid File",

            file:
              file.path ||
              "",

            audioRescue:
              data.audio_rescue ||
              null,

            fallbackSrc:
              data.fallback_stream_url ||
              "",

            videoRescue:
              data.video_rescue ||
              null,

            mediaInfo:
              data.media_info ||
              null,
          });
        } else {
          setRdError(
            data.error ||
              "Could not open this file."
          );
        }
      } catch (
        error
      ) {
        if (actionStillCurrent()) {
          setRdError(
            error?.message ||
              "Real-Debrid request failed."
          );
        }
      } finally {
        if (actionStillCurrent()) {
          setFileSwitching(
            false
          );
        }
      }
    };

  const retryResolution =
    () => {
      streamActionGenerationRef.current += 1;
      setFileSwitching(false);

      setRdOverride(
        null
      );

      setRdFiles(
        []
      );

      setRdTorrentId(
        null
      );

      setRdPreparation(null);

      setRdError(
        ""
      );

      setRdResolving(
        true
      );

      const current =
        activeIdx;

      setActiveIdx(
        -1
      );

      setTimeout(
        () => {
          setActiveIdx(
            current
          );
        },
        0
      );
    };

  const handleRdPlaybackError = () => {
    const fallback = String(rdOverride?.fallbackSrc || "").trim();

    if (
      fallback &&
      fallback !== rdOverride?.src &&
      rdOverride?.fallbackTried !== true
    ) {
      const video = stageRef.current?.querySelector("video");
      const resumeAt = Math.max(
        0,
        Number(video?.currentTime || lastPosRef.current?.t || 0)
      );

      if (resumeAt > 5) {
        recoveryResumeRef.current = resumeAt;
      }

      setRdOverride((current) => ({
        ...(current || {}),
        src: fallback,
        label: `${current?.label || sourceDisplayLabel(active, activeIdx)} [Original fallback]`,
        fallbackSrc: "",
        fallbackTried: true,
        audioRescue: {
          ...(current?.audioRescue || {}),
          used: false,
          state: "original_stream_fallback_after_transcode_error",
        },
      }));

      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              "Compatibility stream failed — trying the original torrent file…",
          },
        })
      );

      return;
    }

    tryNextSource(
      "This stream failed during playback."
    );
  };

  const handleDirectPlaybackError = () => {
    const fallback = String(
      active?.fallbackSrc || active?.fallback_stream_url || ""
    ).trim();

    if (fallback && fallback !== activeUrl) {
      const video = stageRef.current?.querySelector("video");
      const resumeAt = Math.max(
        0,
        Number(video?.currentTime || lastPosRef.current?.t || 0)
      );

      if (resumeAt > 5) {
        recoveryResumeRef.current = resumeAt;
      }

      setRdOverride({
        src: fallback,
        label: `${sourceDisplayLabel(active, activeIdx)} [Original fallback]`,
        file: "",
        fallbackSrc: "",
        fallbackTried: true,
        audioRescue: {
          ...(active?.audioRescue || {}),
          used: false,
          state: "original_stream_fallback_after_transcode_error",
        },
        mediaInfo: active?.mediaInfo || active?.media_info || null,
      });

      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              "Compatibility stream failed — trying the original Real-Debrid file…",
          },
        })
      );
      return;
    }

    tryNextSource(
      "This stream failed during playback."
    );
  };

  /*
   * Dedicated Fire TV builds expose MediaGodNative.play(). Once Media God has
   * resolved a real HTTP media URL, hand that URL to Android Media3 instead
   * of creating another WebView <video> decoder. The generic web/mobile app
   * does not expose the bridge and therefore keeps the existing LiveVideo
   * path unchanged.
   */
  const nativeFireTvPlayer =
    isNativeFireTvPlayerAvailable();

  const nativePlaybackUrl =
    nativeFireTvPlayer
      ? String(
          rdOverride?.src ||
            (isDirectFile ? activeUrl : "") ||
            ""
        ).trim()
      : "";

  const nativePlaybackAvailable =
    nativeFireTvPlayer &&
    /^https?:\/\//i.test(nativePlaybackUrl) &&
    nativeFallbackUrl !== nativePlaybackUrl;

  /*
   * Fire TV must not decode resolved VOD inside the WebView. The original
   * dedicated build was stable because Media3 owned the actual video surface;
   * keeping VOD in <video> reintroduced renderer/codec white-screen failures.
   *
   * Media God's web player remains the source/torrent selection surface, but
   * every resolved HTTP media URL is handed to native Media3 for playback.
   * Back from Media3 enters a safe selector mode rather than starting the same
   * URL in WebView again.
   */
  const useNativePlayback =
    nativePlaybackAvailable &&
    (isLive || forceNativePlayback || isFireTvRemoteRuntime());

  const fireTvNativeSelectorMode =
    nativeFireTvPlayer &&
    !isLive &&
    !forceNativePlayback &&
    /^https?:\/\//i.test(nativePlaybackUrl) &&
    nativeFallbackUrl === nativePlaybackUrl;

  useEffect(() => {
    if (!nativeFireTvPlayer) {
      return undefined;
    }

    const onNativeResult = (event) => {
      const detail = event?.detail || {};
      const activeRequest = nativePlaybackRef.current;

      if (
        !activeRequest.requestId ||
        String(detail.requestId || "") !== activeRequest.requestId
      ) {
        return;
      }

      if (nativeLaunchTimerRef.current) {
        window.clearTimeout(nativeLaunchTimerRef.current);
        nativeLaunchTimerRef.current = null;
      }

      const positionSeconds = Math.max(
        0,
        Number(detail.positionMs || 0) / 1000
      );
      const durationSeconds = Math.max(
        0,
        Number(detail.durationMs || 0) / 1000
      );

      if (positionSeconds > 0) {
        lastPosRef.current = {
          t: positionSeconds,
          d: durationSeconds,
        };

        if (!isLive && positionSeconds > 5) {
          saveProgress(
            positionSeconds,
            durationSeconds,
            true
          );
        }
      }

      nativePlaybackRef.current = {
        requestId: "",
        url: "",
      };

      const reason = String(detail.reason || "back").toLowerCase();
      const selectedSourceIndex = Number(detail.selectedSourceIndex);

      if (
        reason === "source" &&
        Number.isInteger(selectedSourceIndex) &&
        selectedSourceIndex >= 0 &&
        selectedSourceIndex < sources.length
      ) {
        if (positionSeconds > 5) {
          recoveryResumeRef.current = positionSeconds;
        }

        setForceNativePlayback(false);
        setNativeFallbackUrl("");

        if (selectedSourceIndex !== activeIdx) {
          switchToSource(selectedSourceIndex, {
            preservePosition: true,
            statusMessage: "Switching source from the Fire TV player…",
          });
        } else {
          setForceNativePlayback(true);
        }

        return;
      }

      if (reason === "error") {
        if (positionSeconds > 5) {
          recoveryResumeRef.current = positionSeconds;
        }

        setForceNativePlayback(false);

        window.dispatchEvent(
          new CustomEvent("mg:player-status", {
            detail: {
              message:
                detail.message ||
                "Fire TV native player could not play this source — trying a backup…",
            },
          })
        );

        if (rdOverride) {
          handleRdPlaybackError();
        } else {
          handleDirectPlaybackError();
        }

        return;
      }

      if (
        reason === "back" &&
        !isLive
      ) {
        /*
         * Return to Media God's source/torrent selector without immediately
         * sending the same URL back to Media3 and without asking WebView to
         * decode it. Choosing another source/file clears this URL lock; the
         * Resume button below clears it explicitly for the current source.
         */
        setForceNativePlayback(false);
        setNativeFallbackUrl(String(activeRequest.url || "").trim());

        window.dispatchEvent(
          new CustomEvent("mg:player-status", {
            detail: {
              message:
                "Playback paused — resume the Fire TV player or return to the episode list.",
            },
          })
        );
        return;
      }

      onClose?.();
    };

    window.addEventListener(
      "mg:native-player-result",
      onNativeResult
    );

    return () => {
      window.removeEventListener(
        "mg:native-player-result",
        onNativeResult
      );
    };
  }, [
    nativeFireTvPlayer,
    isLive,
    rdOverride,
    forceNativePlayback,
    onClose,
    activeIdx,
    sources,
  ]);

  useEffect(() => {
    const sourceDiscoveryPending =
      !isLive &&
      ["searching", "fast-start"].includes(
        String(source?.sourceDiagnostics?.phase || "")
      );

    /*
     * On Fire TV, launching Media3 pauses the WebView. If we launch as soon as
     * the first RD/library hit arrives, the later addon results cannot update
     * the native source selector until the user backs out. Wait for the normal
     * source pass to finish so the native player receives the full list.
     */
    if (!useNativePlayback || !nativePlaybackUrl || sourceDiscoveryPending) {
      return;
    }

    const current = nativePlaybackRef.current;

    if (current.url === nativePlaybackUrl && current.requestId) {
      return;
    }

    const resumeSeconds = Math.max(
      0,
      Number(
        recoveryResumeRef.current ||
          lastPosRef.current?.t ||
          source?.startTime ||
          0
      )
    );

    const requestId =
      `mg-${Date.now()}-${activeIdx}-${Math.random().toString(36).slice(2, 8)}`;

    if (nativeLaunchTimerRef.current) {
      window.clearTimeout(nativeLaunchTimerRef.current);
      nativeLaunchTimerRef.current = null;
    }

    nativePlaybackRef.current = {
      requestId,
      url: nativePlaybackUrl,
    };

    const started = playNativeFireTv({
      requestId,
      url: nativePlaybackUrl,
      title: source?.title || sourceDisplayLabel(active, activeIdx),
      poster: source?.poster || "",
      startPositionMs: Math.round(resumeSeconds * 1000),
      live: isLive,
      headers:
        rdOverride?.headers ||
        active?.headers ||
        active?.requestHeaders ||
        {},
      mimeType:
        rdOverride?.mimeType ||
        active?.mimeType ||
        active?.mime_type ||
        "",
      audioLanguage: trackPreferences.audioLanguage,
      subtitleLanguage: trackPreferences.subtitleLanguage,
      subtitlesEnabled: trackPreferences.subtitlesEnabled,
      subtitles: Array.isArray(active?.subtitles)
        ? active.subtitles
        : [],
      sources: sources.map((candidate, index) => {
        const baseLabel = sourceDisplayLabel(candidate, index);
        const provider = String(candidate?.sourceName || "").trim();

        return {
          ...candidate,
          label:
            provider && !baseLabel.toLowerCase().includes(provider.toLowerCase())
              ? `${baseLabel} • ${provider}`
              : baseLabel,
          url:
            index === activeIdx && /^https?:\/\//i.test(nativePlaybackUrl)
              ? nativePlaybackUrl
              : getSourceUrl(candidate),
          webIndex: index,
        };
      }),
      activeSourceIndex: activeIdx,
    });

    if (!started) {
      nativePlaybackRef.current = {
        requestId: "",
        url: "",
      };

      /* If an unexpected old/custom wrapper exposes a broken/busy bridge,
       * fall back instead of leaving the player on an endless handoff spinner. */
      setForceNativePlayback(false);
      setNativeFallbackUrl(nativePlaybackUrl);

      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              "Fire TV player was busy or could not open — using the fallback player.",
          },
        })
      );

      return;
    }

    /*
     * MainActivity pauses WebView timers while PlayerActivity owns the screen,
     * so this timeout only meaningfully expires when the native activity did
     * not actually take over, or when Fire OS returns without delivering the
     * expected result event. Either way, never leave Live TV spinning forever.
     */
    nativeLaunchTimerRef.current = window.setTimeout(() => {
      const pending = nativePlaybackRef.current;

      if (pending.requestId !== requestId) {
        return;
      }

      nativePlaybackRef.current = {
        requestId: "",
        url: "",
      };
      nativeLaunchTimerRef.current = null;
      setForceNativePlayback(false);
      setNativeFallbackUrl(nativePlaybackUrl);

      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              "Fire TV player did not open correctly — switched to the fallback player.",
          },
        })
      );
    }, 5500);
  }, [
    active,
    activeIdx,
    isLive,
    nativePlaybackUrl,
    rdOverride,
    source,
    useNativePlayback,
  ]);

  const handleNoSound =
    async (options = {}) => {
      const automatic = options?.automatic === true;
      const actionGeneration = ++streamActionGenerationRef.current;
      const actionStillCurrent = () =>
        streamActionGenerationRef.current === actionGeneration;

      if (!automatic && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("mg:playback-no-sound", {
            detail: {
              label: sourceDisplayLabel(active, activeIdx),
            },
          })
        );
      }

      const video =
        stageRef.current
          ?.querySelector(
            "video"
          );

      const resumeAt = Math.max(
        0,
        Number(
          video?.currentTime ||
            lastPosRef.current?.t ||
            0
        )
      );

      if (video) {
        video.muted = false;
        video.volume = 1;

        if (video.dataset?.mgAutoplayMuted === "true") {
          delete video.dataset.mgAutoplayMuted;
        }

        const tracks = video.audioTracks;

        if (
          tracks &&
          typeof tracks.length === "number" &&
          tracks.length > 1
        ) {
          let currentAudio = -1;

          const candidates = [];

          for (let index = 0; index < tracks.length; index += 1) {
            if (tracks[index]?.enabled) {
              currentAudio = index;
            }

            candidates.push({
              index,
              score: audioTrackScore(
                tracks[index],
                trackPreferences.audioLanguage
              ),
            });
          }

          const wantedAudio = candidates
            .filter((item) => item.index !== currentAudio)
            .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.index;

          if (wantedAudio != null) {
            try {
              for (let index = 0; index < tracks.length; index += 1) {
                tracks[index].enabled = index === wantedAudio;
              }

              if (tracks[wantedAudio]?.enabled) {
                video.play().catch(() => {});
                setRdError("");

                window.dispatchEvent(
                  new CustomEvent("mg:player-status", {
                    detail: {
                      message: `Audio switched to ${tracks[wantedAudio]?.label || tracks[wantedAudio]?.language || `track ${wantedAudio + 1}`}.`,
                    },
                  })
                );

                return;
              }
            } catch {
              // Continue to HLS/RD audio rescue.
            }
          }
        }

        video.play().catch(() => {});
      }

      if (typeof window !== "undefined") {
        const hlsHandled = await new Promise((resolve) => {
          const requestId = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          let timer = null;

          const finish = (handled) => {
            if (timer) window.clearTimeout(timer);
            window.removeEventListener("mg:audio-rescue-result", onResult);
            resolve(Boolean(handled));
          };

          const onResult = (event) => {
            if (String(event?.detail?.requestId || "") !== requestId) return;
            finish(event?.detail?.handled === true);
          };

          window.addEventListener("mg:audio-rescue-result", onResult);
          window.dispatchEvent(
            new CustomEvent("mg:audio-rescue-request", {
              detail: { requestId },
            })
          );

          timer = window.setTimeout(() => finish(false), 350);
        });

        if (!actionStillCurrent()) {
          return;
        }

        if (hlsHandled) {
          setRdError("");
          return;
        }
      }

      if (!actionStillCurrent()) {
        return;
      }

      if (
        source?.hasRd &&
        !rdOverride?.audioRescue?.used
      ) {
        const activeTorrentId = String(
          active?.rdTorrentId ||
            rdTorrentId ||
            (active?.type === "rd_torrent" && !isMagnet(activeUrl)
              ? activeUrl
              : "")
        ).trim();

        const activeMagnet =
          active?.magnet ||
          active?.magnetLink ||
          (isMagnet(activeUrl) ? activeUrl : "");

        const rescueRequest =
          activeTorrentId
            ? {
                action: "torrent_info",
                torrent_id: activeTorrentId,
              }
            : activeMagnet
              ? {
                  action: "resolve_best",
                  magnet: activeMagnet,
                }
              : null;

        if (rescueRequest) {
          try {
            setRdResolving(true);
            setRdError("");

            const response = await base44.functions.invoke(
              "realDebrid",
              {
                ...rescueRequest,
                title:
                  source?.rdTitle ||
                  source?.title ||
                  "",
                ...(source?.rdYear != null
                  ? { year: source.rdYear }
                  : {}),
                ...(source?.rdSeason != null
                  ? { season: source.rdSeason }
                  : {}),
                ...(source?.rdEpisode != null
                  ? { episode: source.rdEpisode }
                  : {}),
                force_audio_rescue: true,
                allow_transcode: true,
                prefer_english: true,
              }
            );

            const data = response?.data || {};

            if (!actionStillCurrent()) {
              return;
            }

            if (
              data?.status === "ready" &&
              data?.stream_url &&
              data?.audio_rescue?.used
            ) {
              if (resumeAt > 5) {
                recoveryResumeRef.current = resumeAt;
              }

              setRdOverride({
                src: data.stream_url,
                label:
                  data.filename ||
                  `${sourceDisplayLabel(active, activeIdx)} [Audio Rescue]`,
                file: currentFilePath(data.files),
                audioRescue: data.audio_rescue,
                fallbackSrc: data.fallback_stream_url || "",
                fallbackTried: rdOverride?.fallbackTried === true,
                videoRescue: data.video_rescue || null,
                mediaInfo: data.media_info || null,
              });

              setRdFiles(data.files || []);
              setRdTorrentId(null);
              setRdPolling(false);
              setRdResolving(false);

              window.dispatchEvent(
                new CustomEvent("mg:player-status", {
                  detail: {
                    message:
                      resumeAt > 5
                        ? "Audio Rescue loaded a compatible stream and kept your position."
                        : "Audio Rescue loaded a compatible stream.",
                  },
                })
              );

              return;
            }
          } catch {
            // Fall through to the next ranked source.
          } finally {
            if (actionStillCurrent()) {
              setRdResolving(false);
            }
          }
        }
      }

      if (!actionStillCurrent()) {
        return;
      }

      if (
        sources.length <=
        1
      ) {
        setRdError(
          "No compatible alternate audio track or backup source is available."
        );

        return;
      }

      const nextIndex =
        findNextPlayableSource(activeIdx);

      if (nextIndex < 0) {
        setRdError(
          "No compatible alternate audio track or backup source is available."
        );
        return;
      }

      if (resumeAt > 5) {
        recoveryResumeRef.current = resumeAt;
      }

      if (!actionStillCurrent()) {
        return;
      }

      markSourceFailed(activeIdx);

      switchToSource(nextIndex, {
        preservePosition: true,
        statusMessage:
          "Audio rescue could not recover this stream — trying the best backup source…",
      });
    };

  handleNoSoundRef.current = handleNoSound;

  useEffect(() => {
    const state = autoVideoRescueRef.current;

    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    if (
      isLive ||
      isYoutube ||
      isProvider ||
      rdResolving ||
      rdPolling ||
      rdTorrentId ||
      rdPreparation ||
      sources.length <= 1 ||
      readPlaybackPreferences().autoRecovery === false
    ) {
      return undefined;
    }

    const candidate = rdOverride
      ? {
          ...active,
          src: rdOverride.src || activeUrl,
          url: rdOverride.src || activeUrl,
          label: rdOverride.label || active?.label,
        }
      : active;
    const profile = getPlaybackDeviceProfile();
    const label = sourceDisplayLabel(candidate, activeIdx);

    if (!hasSevereVideoRisk(candidate, label, profile)) {
      return undefined;
    }

    const key = [
      source?.id || source?.tmdbId || source?.title || "media",
      activeIdx,
      rdOverride?.src || activeUrl,
    ].join("|");

    if (state.key === key) {
      return undefined;
    }

    state.key = key;

    const rescue = (remainingChecks = 4, previousTime = 0) => {
      state.timer = null;

      const video = stageRef.current?.querySelector("video");
      const currentTime = Number(video?.currentTime || 0);
      const clearlyPlaying =
        video instanceof HTMLVideoElement &&
        !video.paused &&
        !video.ended &&
        video.readyState >= 2 &&
        remainingChecks < 4 &&
        currentTime > previousTime + 0.2;
      const hardFailure =
        video instanceof HTMLVideoElement &&
        (Boolean(video.error) || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE);

      if (clearlyPlaying) {
        return;
      }

      if (remainingChecks > 0) {
        state.timer = window.setTimeout(
          () => rescue(remainingChecks - 1, currentTime),
          1500
        );
        return;
      }

      /*
       * A slow start is not proof of incompatibility. Only switch here after
       * the browser reports a real decode/source failure. The normal stall
       * recovery remains responsible for genuine buffering stalls.
       */
      if (!hardFailure) {
        return;
      }

      const alternatives = sources
        .map((item, index) => {
          if (
            index === activeIdx ||
            failedSourcesRef.current.has(index) ||
            item?.diagnostic ||
            item?.type === "status" ||
            item?.type === "provider" ||
            item?.type === "youtube"
          ) {
            return null;
          }

          const url = getSourceUrl(item);
          const playable =
            Boolean(url) ||
            item?.type === "rd" ||
            item?.type === "rd_torrent" ||
            item?.type === "torrent" ||
            item?.type === "magnet";

          if (!playable) return null;

          return {
            index,
            severe: hasSevereVideoRisk(
              item,
              sourceDisplayLabel(item, index),
              profile
            ),
            score: recoverySourceScore(item, index),
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(a.severe) - Number(b.severe) ||
            b.score - a.score ||
            a.index - b.index
        );

      const nextIndex = alternatives.find((item) => !item.severe)?.index ?? -1;
      if (nextIndex < 0) {
        return;
      }

      const resumeAt = Math.max(
        0,
        Number(video?.currentTime || lastPosRef.current?.t || 0)
      );

      if (resumeAt > 5) {
        recoveryResumeRef.current = resumeAt;
      }

      recordPlaybackReliability(label, "failure");
      markSourceFailed(activeIdx);

      switchToSource(nextIndex, {
        preservePosition: true,
        statusMessage:
          "Video compatibility rescue · switching to a safer source…",
      });
    };

    state.timer = window.setTimeout(
      () => rescue(4, 0),
      3200
    );

    return () => {
      if (state.timer) {
        window.clearTimeout(state.timer);
        state.timer = null;
      }
    };
  }, [
    active,
    activeIdx,
    activeUrl,
    isLive,
    isProvider,
    isYoutube,
    rdOverride,
    rdPolling,
    rdResolving,
    rdTorrentId,
    rdPreparation,
    source,
    sources,
  ]);

  const busy =
    rdResolving ||
    rdPolling ||
    !!rdTorrentId ||
    !!rdPreparation;

  const activeSourceFailed =
    failedSources.has(activeIdx);

  const displayedError =
    rdError ||
    "";

  const friendlyError =
    friendlyPlaybackError(
      displayedError
    );

  const activeSourceLabel =
    concisePlaybackSourceLabel(
      active,
      activeIdx
    );

  const selectableSourceCount =
    sources.filter(
      (item) =>
        item &&
        !item?.diagnostic &&
        item?.type !== "status" &&
        item?.type !== "provider" &&
        item?.type !== "youtube"
    ).length;

  const failedSourceCount =
    Array.from(
      failedSources
    ).filter(
      (index) =>
        Number.isInteger(
          Number(index)
        )
    ).length;

  const audioNeedsAttention =
    hasRecentNoSoundHistory(
      sourceDisplayLabel(
        active,
        activeIdx
      )
    );

  const cacheProgress = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Number(rdPreparation?.progress || 0)
      )
    )
  );

  const cacheStatusLabel =
    friendlyRdStatus(
      rdPreparation?.status
    );

  const cacheSeeders = Math.max(
    0,
    Number(rdPreparation?.seeders || 0)
  );

  const sourceReportedSeeders = Math.max(
    0,
    Number(active?.reportedSeeders || 0)
  );

  const cacheSpeedBps = Math.max(
    0,
    Number(rdPreparation?.speed_bps || 0)
  );

  const cacheSizeBytes = Math.max(
    0,
    Number(rdPreparation?.size_bytes || 0)
  );

  const cacheDownloadedBytes = Math.max(
    0,
    Number(
      rdPreparation?.downloaded_bytes ||
      (cacheSizeBytes * cacheProgress) / 100 ||
      0
    )
  );

  const cacheElapsedSeconds =
    rdPreparation?.startedAt
      ? Math.max(
          0,
          (Date.now() - Number(rdPreparation.startedAt)) / 1000
        )
      : 0;

  const cacheEtaSeconds =
    cacheSpeedBps > 0 &&
    cacheSizeBytes > cacheDownloadedBytes
      ? (cacheSizeBytes - cacheDownloadedBytes) / cacheSpeedBps
      : 0;

  const cacheStats = [
    cacheSeeders > 0
      ? `${cacheSeeders} active ${cacheSeeders === 1 ? "seeder" : "seeders"}`
      : sourceReportedSeeders > 0
        ? `RD 0 active · Comet found ${sourceReportedSeeders}`
        : "RD 0 active seeders",
    cacheSpeedBps > 0
      ? formatCacheSpeed(cacheSpeedBps)
      : "0 B/s",
    cacheSizeBytes > 0
      ? `${formatCacheBytes(cacheDownloadedBytes)} of ${formatCacheBytes(cacheSizeBytes)}`
      : "",
    cacheElapsedSeconds > 0
      ? `${formatCacheDuration(cacheElapsedSeconds)} elapsed`
      : "",
    cacheEtaSeconds > 0 && cacheEtaSeconds < 86400
      ? `~${formatCacheDuration(cacheEtaSeconds)} left`
      : "",
  ].filter(Boolean);

  const cacheHint =
    cacheProgress >= 100
      ? "Download is complete. Real-Debrid is preparing the playable link."
      : cacheSeeders <= 0 &&
          cacheSpeedBps <= 0 &&
          cacheElapsedSeconds >= 30
        ? sourceReportedSeeders > 0
          ? `Comet found ${sourceReportedSeeders} seeder${sourceReportedSeeders === 1 ? "" : "s"}, but Real-Debrid currently reports no active peers. Media God will move on if progress stays flat.`
          : "Real-Debrid reports no active seeders. Media God will move on if progress stays flat."
        : cacheSpeedBps <= 0 &&
            cacheProgress > 0 &&
            cacheElapsedSeconds >= 30
          ? "Download is paused right now. Media God will keep checking automatically."
          : "Playback will start automatically as soon as Real-Debrid reports the file ready.";

  const playerUiStatus =
    displayedError && !busy
      ? "Source issue"
      : rdResolving
        ? "Resolving"
        : rdPolling || rdTorrentId
          ? rdPreparation
            ? `Caching ${cacheProgress}%`
            : "Preparing"
          : fireTvNativeSelectorMode
            ? "Choose source"
            : useNativePlayback
              ? "Opening player"
              : rdOverride || isDirectFile
                ? "Ready"
                : isLive
                  ? "Live"
                  : "Loading";

  return (
    <div
      data-mg-player-root="true"
      data-mg-player-fullscreen={isAppFullscreen ? "true" : "false"}
      data-mg-native-selector-mode={fireTvNativeSelectorMode ? "true" : "false"}
      data-mg-rd-cache-source={active?.cacheRequired ? "true" : "false"}
      className="fixed inset-0 z-[2147483646] bg-black/95 flex items-center justify-center p-2 sm:p-3 md:p-4"
      onClick={
        onClose
      }
    >
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1600px] flex-col sm:max-h-[calc(100dvh-1.5rem)]"
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        <div data-mg-player-topbar="true" className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 px-2.5 py-2 shadow-lg backdrop-blur-md sm:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              data-mg-player-exit="true"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose?.();
              }}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white transition hover:border-mg-green/40 hover:bg-white/10 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green sm:min-h-10"
              aria-label="Exit player"
              title="Exit player"
            >
              <ArrowLeft className="w-4 h-4" />

              <span>
                Exit
              </span>
            </button>

            {isLive && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />

                LIVE
              </span>
            )}

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-white sm:text-base">
                {
                  source?.title
                }
              </h3>

              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-white/45 sm:text-[11px]">
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${
                    playerUiStatus === "Source issue"
                      ? "bg-red-500/15 text-red-300"
                      : playerUiStatus === "Ready" || playerUiStatus === "Live"
                        ? "bg-mg-green/15 text-mg-green"
                        : "bg-white/10 text-white/60"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    playerUiStatus === "Source issue"
                      ? "bg-red-400"
                      : playerUiStatus === "Ready" || playerUiStatus === "Live"
                        ? "bg-mg-green"
                        : "bg-white/50"
                  }`} />
                  {playerUiStatus}
                </span>

                {selectableSourceCount > 0 && (
                  <span className="shrink-0">
                    {selectableSourceCount} {selectableSourceCount === 1 ? "source" : "sources"}
                  </span>
                )}

                {failedSourceCount > 0 && (
                  <span className="shrink-0 text-white/30">
                    · {failedSourceCount} unavailable
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(isDirectFile ||
              isLive ||
              rdOverride) && (
              <>
                <button
                  type="button"
                  onClick={
                    goFullscreen
                  }
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:border-mg-green/30 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green sm:min-h-10 sm:min-w-10"
                  aria-label="Fullscreen"
                  title="Fullscreen"
                >
                  <Maximize className="w-4 h-4" />
                </button>

                <CastButton
                  url={
                    rdOverride?.src ||
                    active?.src ||
                    active?.url
                  }
                  title={
                    source?.title
                  }
                  poster={
                    source?.poster
                  }
                />
              </>
            )}
          </div>
        </div>

        <div
          ref={
            stageRef
          }
          onDoubleClick={(event) => {
            if (!isDesktopFullscreenBrowser()) return;
            event.preventDefault();
            event.stopPropagation();
            goFullscreen();
          }}
          className="relative flex min-h-[34vh] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl sm:min-h-0 sm:aspect-video"
        >
          {busy ? (
            <div className="flex w-full max-w-lg flex-col items-center gap-3 p-5 text-center sm:p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-mg-green/20 bg-mg-green/5">
                <Loader2 className="h-7 w-7 animate-spin text-mg-green" />
              </div>

              <div className="w-full">
                <p className="text-sm font-semibold text-white/85 sm:text-base">
                  {rdPreparation ? "Caching to Real-Debrid" : playerUiStatus}
                </p>

                <p className="mt-1 line-clamp-2 text-xs text-white/45">
                  {activeSourceLabel || "Finding the best available source…"}
                </p>

                {rdPreparation && (
                  <div className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white/75">
                        {cacheStatusLabel}
                      </span>

                      <span className="text-sm font-bold tabular-nums text-mg-green">
                        {cacheProgress}%
                      </span>
                    </div>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-mg-green transition-[width] duration-500"
                        style={{ width: `${cacheProgress}%` }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/50 sm:text-xs">
                      {cacheStats.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>

                    <p className="mt-2 text-[10px] leading-relaxed text-white/40 sm:text-xs">
                      {cacheHint}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : activeSourceFailed && displayedError ? (
            <div className="flex max-w-lg flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-amber-200">
                <VolumeX className="h-6 w-6" />
              </div>

              <p className="text-sm font-semibold text-white/85 sm:text-base">
                This source is unavailable
              </p>

              <p className="max-w-md text-xs leading-relaxed text-white/50 sm:text-sm">
                {friendlyError || "Media God rejected an error/status stream instead of playing it as video."}
              </p>
            </div>
          ) : fireTvNativeSelectorMode ? (
            <div
              data-mg-native-fire-tv-selector="true"
              className="flex flex-col items-center gap-3 p-6 text-center"
            >
              <Tv className="h-9 w-9 text-mg-green" />

              <p className="text-white/85 text-sm font-semibold">
                Native playback paused
              </p>

              <p className="max-w-md text-white/50 text-xs">
                Resume to return to the Fire TV player. Source selection is now available inside the native player.
              </p>

              <button
                type="button"
                onClick={() => {
                  setNativeFallbackUrl("");
                  setForceNativePlayback(true);
                }}
                className="mt-1 min-h-10 rounded-lg bg-mg-green px-4 text-xs font-bold text-black focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                Resume native playback
              </button>
            </div>
          ) : useNativePlayback ? (
            <div
              data-mg-native-fire-tv-player="true"
              className="flex flex-col items-center gap-3 p-6 text-center"
            >
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />

              <p className="text-white/80 text-sm font-semibold">
                Opening native player…
              </p>

              <p className="max-w-md text-white/45 text-xs">
                Media God is handing this stream to the Android native video engine.
              </p>
            </div>
          ) : rdOverride ? (
            <>
              <LiveVideo
                key={
                  rdOverride.src
                }
                ref={
                  videoRef
                }
                src={
                  rdOverride.src
                }
                sourceLabel={
                  rdOverride?.label ||
                  active?.label ||
                  "Real-Debrid Stream"
                }
                poster={
                  source?.poster
                }
                controls={
                  false
                }
                subtitles={
                  Array.isArray(active?.subtitles)
                    ? active.subtitles
                    : []
                }
                subtitlesEnabled={
                  trackPreferences.subtitlesEnabled
                }
                preferredSubtitleLanguage={
                  trackPreferences.subtitleLanguage
                }
                preferredAudioLanguage={
                  trackPreferences.audioLanguage
                }
                onLoadedMetadata={
                  handleLoadedMetadata
                }
                onTimeUpdate={
                  handleTimeUpdate
                }
                onError={
                  handleRdPlaybackError
                }
                className="w-full h-full object-contain bg-black"
              />

              <PlayerControls
                key={
                  rdOverride.src
                }
                videoRef={
                  videoRef
                }
                stageRef={
                  stageRef
                }
                isLive={
                  isLive
                }
                onFullscreen={
                  goFullscreen
                }
                isAppFullscreen={
                  isAppFullscreen
                }
                onBack={
                  onClose
                }
                title={
                  source?.title ||
                  ""
                }
                sources={
                  sources
                }
                activeIdx={
                  activeIdx
                }
                failedSources={
                  failedSources
                }
                onSelectSource={
                  selectSource
                }
                onNoSound={
                  handleNoSound
                }
              />
            </>
          ) : isYoutube ? (
            <iframe
              src={
                active.src
              }
              title={
                source?.title ||
                "Video"
              }
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : isProvider ? (
            <iframe
              src={
                active.src
              }
              title={
                source?.title ||
                "Provider"
              }
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : isDirectFile ? (
            <>
              <LiveVideo
                ref={
                  liveVideoRef
                }
                key={
                  active.src
                }
                src={
                  active.src
                }
                sourceLabel={
                  active?.format ||
                  active?.mimeType ||
                  active?.label ||
                  "Direct Stream"
                }
                poster={
                  source?.poster
                }
                controls={
                  false
                }
                subtitles={
                  Array.isArray(active?.subtitles)
                    ? active.subtitles
                    : []
                }
                subtitlesEnabled={
                  trackPreferences.subtitlesEnabled
                }
                preferredSubtitleLanguage={
                  trackPreferences.subtitleLanguage
                }
                preferredAudioLanguage={
                  trackPreferences.audioLanguage
                }
                className="w-full h-full object-contain bg-black"
                onLoadedMetadata={
                  handleLoadedMetadata
                }
                onTimeUpdate={
                  handleTimeUpdate
                }
                onError={
                  handleDirectPlaybackError
                }
              />

              <PlayerControls
                key={
                  active.src
                }
                videoRef={
                  liveVideoRef
                }
                stageRef={
                  stageRef
                }
                isLive={
                  isLive
                }
                onFullscreen={
                  goFullscreen
                }
                isAppFullscreen={
                  isAppFullscreen
                }
                onBack={
                  onClose
                }
                title={
                  source?.title ||
                  ""
                }
                sources={
                  sources
                }
                activeIdx={
                  activeIdx
                }
                failedSources={
                  failedSources
                }
                onSelectSource={
                  selectSource
                }
                onNoSound={
                  handleNoSound
                }
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />

              {isRdSource && (
                <button
                  type="button"
                  onClick={
                    retryResolution
                  }
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-mg-green text-black text-xs font-semibold hover:bg-mg-green-dim"
                >
                  <RefreshCw className="w-3.5 h-3.5" />

                  Try Again
                </button>
              )}
            </div>
          )}

          {isAppFullscreen &&
            !rdOverride &&
            !isDirectFile && (
              <div data-mg-player-loading-topbar="true" className="absolute left-0 right-0 top-0 z-40 flex items-center gap-2 bg-gradient-to-b from-black/90 via-black/55 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
                <button
                  type="button"
                  onClick={
                    onClose
                  }
                  className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
                  aria-label="Back to main menu"
                  title="Back to main menu"
                >
                  <ArrowLeft className="h-4 w-4" />

                  <span className="hidden sm:inline">
                    Back
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white sm:text-base">
                    {
                      source?.title
                    }
                  </p>
                </div>

                {sources.length >
                  1 && (
                  <div className="relative min-w-[9rem] max-w-[46vw] sm:min-w-[14rem] sm:max-w-sm">
                    <select
                      value={
                        visibleSourceSelectorValue
                      }
                      onPointerDown={pinSourceSelector}
                      onFocus={pinSourceSelector}
                      onBlur={releaseSourceSelector}
                      onChange={(
                        event
                      ) => {
                        const value = event.target.value;
                        releaseSourceSelector();
                        selectSource(value);
                      }}
                      className="min-h-11 w-full appearance-none rounded-lg border border-white/15 bg-black/60 py-2.5 pl-3 pr-9 text-xs font-medium text-white outline-none backdrop-blur transition focus:border-mg-green focus:ring-2 focus:ring-mg-green/30 sm:min-h-10 sm:text-sm"
                      aria-label="Choose source or quality while loading"
                    >
                      {visibleSourceSelectorEntries.map(
                        ({
                          item,
                          index,
                        }) => {
                          const failed =
                            failedSources.has(
                              index
                            );

                          const rawLabel = sourceDisplayLabel(item, index);
                          const label = concisePlaybackSourceLabel(item, index);

                          return (
                            <option
                              key={`loading-${index}-${rawLabel}`}
                              value={
                                index
                              }
                              data-mg-source-label={rawLabel}
                            >
                              {failed
                                ? "Unavailable • "
                                : index === activeIdx
                                  ? busy
                                    ? "Selected • "
                                    : "Playing • "
                                  : ""}

                              {
                                label
                              }
                            </option>
                          );
                        }
                      )}
                    </select>

                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/60">
                      <Tv className="h-4 w-4" />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={
                    goFullscreen
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
                  aria-label="Exit fullscreen"
                  title="Exit fullscreen"
                >
                  <Minimize className="h-4 w-4" />
                </button>
              </div>
            )}
        </div>

        <div
          data-mg-player-options-panel="true"
          className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-black/65 p-2.5 shadow-lg backdrop-blur-md sm:p-3"
        >
          <div className="flex w-full min-w-0 items-center justify-between gap-2 border-b border-white/5 pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mg-green/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-mg-green">
                <span className="h-1.5 w-1.5 rounded-full bg-mg-green" />
                Current
              </span>

              <span
                className="truncate text-xs font-medium text-white/75 sm:text-sm"
                title={sourceDisplayLabel(active, activeIdx)}
              >
                {activeSourceLabel}
              </span>
            </div>

            {selectableSourceCount > 0 && (
              <span className="shrink-0 text-[10px] font-medium text-white/35 sm:text-xs">
                {selectableSourceCount} {selectableSourceCount === 1 ? "source" : "sources"}
              </span>
            )}
          </div>
          {sources.length > 1 && (
            <label className="w-[6.75rem] shrink-0 sm:w-[8.5rem]">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                Sort
              </span>

              <select
                value={sourceSortMode}
                onChange={(event) => {
                  const next = writeSourceSortMode(event.target.value);
                  setSourceSortMode(next);
                }}
                className="min-h-11 w-full rounded-lg border border-white/10 bg-mg-card px-2 py-2.5 text-xs font-medium text-white outline-none transition focus:border-mg-green focus:ring-2 focus:ring-mg-green/30 sm:min-h-10 sm:text-sm"
                aria-label="Sort playback sources"
              >
                {SOURCE_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {sources.length > 1 && (
            <label className="min-w-[12rem] flex-1 basis-[16rem]">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                Source / quality
              </span>

              <div className="relative">
                <select
                  value={visibleSourceSelectorValue}
                  onPointerDown={pinSourceSelector}
                  onFocus={pinSourceSelector}
                  onBlur={releaseSourceSelector}
                  onChange={(event) => {
                    const value = event.target.value;
                    releaseSourceSelector();
                    selectSource(value);
                  }}
                  className="min-h-11 w-full appearance-none rounded-lg border border-white/10 bg-mg-card py-2.5 pl-3 pr-9 text-xs font-medium text-white outline-none transition focus:border-mg-green focus:ring-2 focus:ring-mg-green/30 sm:min-h-10 sm:text-sm"
                  aria-label="Choose playback source"
                >
                  {visibleSourceSelectorEntries.map(
                    ({ item, index }) => {
                      const failed =
                        failedSources.has(
                          index
                        );

                      const rawLabel = sourceDisplayLabel(item, index);
                      const label = concisePlaybackSourceLabel(item, index);

                      return (
                        <option
                          key={`${index}-${rawLabel}`}
                          value={index}
                          data-mg-source-label={rawLabel}
                        >
                          {failed
                            ? "Unavailable • "
                            : index === activeIdx
                              ? busy
                                ? "Selected • "
                                : "Playing • "
                              : ""}
                          {label}
                        </option>
                      );
                    }
                  )}
                </select>

                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/50">
                  <Tv className="h-4 w-4" />
                </div>
              </div>
            </label>
          )}

          {rdOverride &&
            visibleRdFileSelectorFiles.length > 1 && (
              <label className="min-w-[12rem] flex-1 basis-[18rem]">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                  Torrent file
                </span>

                <select
                  value={visibleRdFileSelectorValue}
                  onPointerDown={pinRdFileSelector}
                  onFocus={pinRdFileSelector}
                  onBlur={releaseRdFileSelector}
                  onChange={(event) => {
                    const file =
                      visibleRdFileSelectorFiles.find(
                        (item) =>
                          String(item.id) ===
                          String(
                            event.target.value
                          )
                      );

                    releaseRdFileSelector();

                    if (file) {
                      pickFile(file);
                    }
                  }}
                  disabled={fileSwitching}
                  className="min-h-11 w-full rounded-lg border border-white/10 bg-mg-card px-3 py-2.5 text-xs font-medium text-white outline-none transition focus:border-mg-green focus:ring-2 focus:ring-mg-green/30 disabled:opacity-60 sm:min-h-10 sm:text-sm"
                  aria-label="Choose torrent file"
                >
                  {visibleRdFileSelectorFiles.map(
                    (file, index) => (
                      <option
                        key={file.id}
                        value={file.id}
                        title={file.path || ""}
                      >
                        {torrentFileLabel(file, index)}
                      </option>
                    )
                  )}
                </select>
              </label>
            )}

          {nativePlaybackAvailable &&
            !isLive &&
            !forceNativePlayback && (
              <button
                type="button"
                data-mg-native-decoder="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setForceNativePlayback(true);
                }}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-mg-card px-3 text-xs font-semibold text-white transition hover:border-mg-green/40 hover:bg-white/10 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green sm:min-h-10"
                aria-label="Open native decoder"
                title="Use Media3 for difficult video or audio codecs"
              >
                <Tv className="h-4 w-4" />
                <span>Native decoder</span>
              </button>
            )}

          <button
            type="button"
            data-mg-no-sound="true"
            disabled={busy || fileSwitching}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleNoSound();
            }}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-mg-green disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-10 ${
              audioNeedsAttention
                ? "border-amber-400/35 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
                : "border-white/10 bg-mg-card text-white/75 hover:border-mg-green/35 hover:bg-white/10 hover:text-white"
            }`}
            aria-label="No sound"
            title="Try another audio track or source"
          >
            <VolumeX className="h-4 w-4" />
            <span className="hidden sm:inline">Fix audio</span>
          </button>

        </div>

        {displayedError &&
          !busy && (
            <div
              className="mt-2 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2.5 shadow-sm"
              title={displayedError}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300/80" />

              <p className="min-w-0 flex-1 text-xs font-medium leading-relaxed text-amber-100/80 sm:text-sm">
                {
                  friendlyError
                }
              </p>

              {isLive &&
                (source?.officialUrl || active?.officialUrl) && (
                  <button
                    type="button"
                    onClick={() =>
                      openExternalPlaybackFallback(
                        source?.officialUrl || active?.officialUrl
                      )
                    }
                    className="min-h-9 shrink-0 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green"
                  >
                    {source?.officialLabel || active?.officialLabel || "Open official"}
                  </button>
                )}

              {isRdSource && (
                <button
                  type="button"
                  onClick={
                    retryResolution
                  }
                  className="min-h-9 shrink-0 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-mg-green"
                >
                  Retry
                </button>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
