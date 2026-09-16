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
  detectStreamTraits,
  getPlaybackDeviceProfile,
  hasSevereVideoRisk,
  scoreSourceCompatibility,
} from "@/components/mg/mediaCompatibility";
import {
  debridProviderScoreHints,
  recordDebridProviderResult,
} from "@/components/mg/debridProviderReliability";
import {
  chooseDebridResolutionStrategy,
  debridTorrentHasMetadata,
} from "@/components/mg/debridResolutionStrategy";
import {
  concisePlaybackSourceLabel,
  torrentFileLabel,
} from "@/components/mg/playbackSourceLabels";
import {
  liveTvUrlQuarantined,
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
import { runRealDebridCacheSession } from "@/components/mg/realDebridCacheEngine";
import { buildAlternateEmbedFallback } from "@/components/mg/alternateEmbedFallback";
import { sourceHasEdition } from "@/components/mg/mediaEdition";

const isMagnet = (value) =>
  String(value || "")
    .toLowerCase()
    .startsWith("magnet:");

const prefersMobileBrowserRdCompatibility = () => {
  if (typeof navigator === "undefined") return false;

  /*
   * The installed Android/Fire TV apps expose MediaGodNative and can hand the
   * unrestricted Real-Debrid file to Media3/LibVLC. A normal phone browser
   * cannot do that and Android Chrome in particular is unreliable with common
   * torrent containers such as MKV even when the underlying codecs are valid.
   * Ask Real-Debrid for its browser-safe HLS/MP4 stream only in that browser
   * case. This keeps native-app playback on the original highest-quality file.
   */
  if (isNativeFireTvPlayerAvailable()) return false;

  return /android|iphone|ipad|ipod|mobile/i.test(
    String(navigator.userAgent || "")
  );
};

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

const richestSourceMagnet = (item) =>
  [
    item?.richMagnet,
    item?.magnet,
    item?.magnetLink,
    item?.src,
    item?.url,
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => /^magnet:/i.test(value))
    .sort((left, right) => {
      const leftTrackers = (left.match(/(?:[?&])tr=/gi) || []).length;
      const rightTrackers = (right.match(/(?:[?&])tr=/gi) || []).length;
      return rightTrackers - leftTrackers || right.length - left.length;
    })[0] || "";

const stablePlaybackSourceKey = (item, fallbackIndex = -1) => {
  if (!item) return "";

  const id = String(item?.id || "").trim();
  if (id) return `id:${id}`;

  const hash = sourceTorrentHash(item);
  if (hash) {
    return [
      "torrent",
      hash,
      String(item?.fileIdx ?? item?.file_idx ?? ""),
      String(item?.addon || item?.debridProvider || ""),
      sourceDisplayLabel(item, fallbackIndex),
    ].join(":");
  }

  const url = String(getSourceUrl(item) || "").trim();
  if (url) return `url:${url}`;

  return [
    "label",
    String(item?.type || ""),
    sourceDisplayLabel(item, fallbackIndex),
  ].join(":");
};

/*
 * Torrent resolution has three deliberately separate ownership paths:
 *
 * 1. cached_debrid  - the payload already exists in debrid; resolve/play it.
 * 2. comet_uncached - Comet discovered the torrent. When Comet's Torrent Mode
 *                     companion row supplies its Stremio `sources`, Media God
 *                     submits that exact tracker-rich magnet to Real-Debrid.
 *                     The Comet playback URL is only a legacy fallback when no
 *                     torrent-source metadata was returned.
 * 3. rd_magnet      - a normal magnet/info-hash source that Media God may add
 *                     to Real-Debrid itself.
 */
const sourceResolutionStrategy = (item) => {
  if (!item) return "";

  if (
    item?.rdTorrentId ||
    (
      item?.type === "rd_torrent" &&
      !sourceTorrentHash(item)
    )
  ) {
    return "existing_rd";
  }

  const value = String(getSourceUrl(item) || "").trim();
  const torrentLike =
    item?.type === "rd" ||
    item?.type === "rd_torrent" ||
    item?.type === "torrent" ||
    item?.type === "magnet" ||
    isMagnet(value) ||
    Boolean(sourceTorrentHash(item));

  if (
    !torrentLike &&
    item?.debridCached !== true &&
    item?.cometUncached !== true
  ) {
    return String(item?.resolutionStrategy || "").trim();
  }

  return chooseDebridResolutionStrategy(item, {
    debridCached: item?.debridCached === true,
  });
};

const sourceNeedsCaching = (item) => {
  if (!item || item?.debridCached === true) return false;

  const strategy = sourceResolutionStrategy(item);

  return (
    strategy === "comet_uncached" ||
    strategy === "rd_magnet" ||
    item?.cacheRequired === true ||
    (
      item?.debridCacheChecked === true &&
      item?.debridCached !== true &&
      Boolean(sourceTorrentHash(item))
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

const forgetPersistentFailedTorrentHash = (hash) => {
  const normalized = String(hash || "").trim().toLowerCase();

  if (
    typeof window === "undefined" ||
    !/^[a-f0-9]{40,64}$/i.test(normalized)
  ) {
    return;
  }

  try {
    const raw = JSON.parse(
      window.localStorage.getItem(FAILED_TORRENT_HASHES_KEY) || "{}"
    );

    if (raw && typeof raw === "object") {
      delete raw[normalized];
      window.localStorage.setItem(
        FAILED_TORRENT_HASHES_KEY,
        JSON.stringify(raw)
      );
    }
  } catch {
    // Persistence is only a recovery optimisation.
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
  const bytesPerSecond = Math.max(0, Number(value || 0));
  if (!bytesPerSecond) return "";

  /*
   * Real-Debrid reports torrent speed in bytes/second, while users normally
   * recognise their internet/download speed in bits/second. Show Mbps so the
   * number matches the way broadband and mobile-data speeds are advertised.
   * Example: 2.95 MB/s ~= 23.6 Mbps.
   */
  const bitsPerSecond = bytesPerSecond * 8;

  if (bitsPerSecond >= 1_000_000) {
    const mbps = bitsPerSecond / 1_000_000;
    const decimals = mbps >= 100 ? 0 : mbps >= 10 ? 1 : 2;
    return `${mbps.toFixed(decimals)} Mbps`;
  }

  if (bitsPerSecond >= 1_000) {
    const kbps = bitsPerSecond / 1_000;
    const decimals = kbps >= 100 ? 0 : kbps >= 10 ? 1 : 2;
    return `${kbps.toFixed(decimals)} Kbps`;
  }

  return `${Math.round(bitsPerSecond)} bps`;
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
    comet_starting: "Starting in Comet",
    comet_start_failed: "Comet could not start torrent",
    restarting: "Restarting torrent",
    stalled: "Waiting for peers",
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

const cachePhaseDetails = (preparation = {}) => {
  const phase = String(preparation?.phase || "").trim().toLowerCase();
  const status = String(preparation?.status || "").trim().toLowerCase();
  const progress = Math.max(0, Math.min(100, Number(preparation?.progress || 0)));

  if (phase === "ready" || status === "ready") {
    return { key: "ready", step: 5, label: "Ready" };
  }

  if (
    phase === "finalizing" ||
    status === "downloaded" ||
    progress >= 100
  ) {
    return { key: "finalizing", step: 4, label: "Finalising stream" };
  }

  if (
    phase === "selecting" ||
    /^(?:waiting_files_selection|waiting_selection)$/.test(status)
  ) {
    return { key: "selecting", step: 2, label: "Selecting file" };
  }

  if (
    phase === "downloading" ||
    status === "downloading" ||
    progress > 0
  ) {
    return { key: "downloading", step: 3, label: "Downloading" };
  }

  if (phase === "restarting" || status === "restarting") {
    return { key: "starting", step: 1, label: "Restarting torrent" };
  }

  return {
    key: "starting",
    step: 1,
    label: friendlyRdStatus(status || "preparing"),
  };
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

  const [liveRecoveryNotice, setLiveRecoveryNotice] =
    useState(null);

  const [rdPreparation, setRdPreparation] =
    useState(null);

  const [rdOverride, setRdOverride] =
    useState(null);

  const [rdFiles, setRdFiles] =
    useState([]);

  const [rdTorrentId, setRdTorrentId] =
    useState(null);

  const [rdManualFileSelection, setRdManualFileSelection] =
    useState(null);

  const [rdCacheEngineNonce, setRdCacheEngineNonce] =
    useState(0);

  const [runtimeReadyTorrentHashes, setRuntimeReadyTorrentHashes] =
    useState(() => new Set());

  const [fileSwitching, setFileSwitching] =
    useState(false);

  const [nativeFallbackUrl, setNativeFallbackUrl] =
    useState("");

  const [alternateEmbedFallback, setAlternateEmbedFallback] =
    useState(null);

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
    useRef(readPersistentFailedTorrentHashes());

  useEffect(() => {
    setAlternateEmbedFallback(null);
  }, [activeIdx, source?.playRequestId]);

  const videoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const pollRef = useRef(null);
  const recoveryResumeRef = useRef(0);
  const rdResolutionQueueRef = useRef(Promise.resolve());
  const rdCacheEngineAbortRef = useRef(null);
  const rdCacheEngineOwnsPollingRef = useRef(false);
  const retryExistingTorrentIdRef = useRef("");
  const retryInactiveTorrentHashRef = useRef("");
  const repairedStuckTorrentHashesRef = useRef(new Set());
  const torrentFailoverTimerRef = useRef(null);
  const nativePlaybackRef = useRef({
    requestId: "",
    url: "",
  });
  const nativeLaunchTimerRef = useRef(null);
  const liveRecoveryNoticeTimerRef = useRef(null);
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

      if (liveRecoveryNoticeTimerRef.current) {
        window.clearTimeout(liveRecoveryNoticeTimerRef.current);
        liveRecoveryNoticeTimerRef.current = null;
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
  const sourceSelectorPinnedRef = useRef(false);
  const sourceSelectorPinnedAtRef = useRef(0);
  const sourceSelectorEntriesRef = useRef([]);
  const sourceSelectorValueRef = useRef(0);

  const rdFileSelectorPinnedRef = useRef(false);
  const rdFileSelectorPinnedAtRef = useRef(0);
  const rdFileSelectorFilesRef = useRef([]);
  const rdFileSelectorValueRef = useRef("");

  const pinSourceSelector = () => {
    sourceSelectorEntriesRef.current = sortedSourceEntries;
    sourceSelectorValueRef.current = activeIdx;
    sourceSelectorPinnedRef.current = true;
    sourceSelectorPinnedAtRef.current = Date.now();
  };

  const releaseSourceSelector = () => {
    sourceSelectorPinnedRef.current = false;
    sourceSelectorPinnedAtRef.current = 0;
    sourceSelectorEntriesRef.current = [];
  };

  const selectorOpenKey = (event) =>
    [
      "Enter",
      "NumpadEnter",
      "Select",
      "Accept",
      " ",
      "Spacebar",
      "ArrowDown",
    ].includes(String(event?.key || event?.code || ""));

  const visibleSourceSelectorEntries =
    sourceSelectorPinnedRef.current && sourceSelectorEntriesRef.current.length > 0
      ? sourceSelectorEntriesRef.current
      : sortedSourceEntries;

  const visibleSourceSelectorValue =
    sourceSelectorPinnedRef.current
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
    rdFileSelectorPinnedRef.current = true;
    rdFileSelectorPinnedAtRef.current = Date.now();
  };

  const releaseRdFileSelector = () => {
    rdFileSelectorPinnedRef.current = false;
    rdFileSelectorPinnedAtRef.current = 0;
    rdFileSelectorFilesRef.current = [];
  };

  const visibleRdFileSelectorFiles =
    rdFileSelectorPinnedRef.current && rdFileSelectorFilesRef.current.length > 0
      ? rdFileSelectorFilesRef.current
      : rdFiles;

  const visibleRdFileSelectorValue =
    rdFileSelectorPinnedRef.current
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

  const activeResolutionKey =
    stablePlaybackSourceKey(active, activeIdx);

  const rdMediaContextKey = [
    source?.rdTitle || source?.title || "",
    source?.rdYear ?? source?.year ?? "",
    source?.rdSeason ?? source?.season ?? "",
    source?.rdEpisode ?? source?.episode ?? "",
  ].join("|");

  const liveSelectableIndices = () =>
    sources
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          item &&
          (item?.live || item?.type === "live") &&
          !item?.diagnostic &&
          item?.type !== "status" &&
          item?.type !== "provider" &&
          item?.type !== "youtube" &&
          Boolean(getSourceUrl(item))
      )
      .map(({ index }) => index);

  const liveSourcePosition = (index = activeIdx) => {
    const indices = liveSelectableIndices();
    const ordinal = indices.indexOf(Number(index));

    return {
      current: ordinal >= 0 ? ordinal + 1 : 0,
      total: indices.length,
    };
  };

  const classifyLiveFailure = (message, explicitClass = "") => {
    const explicit = String(explicitClass || "").trim().toLowerCase();
    if (explicit) return explicit;

    const text = String(message || "").toLowerCase();
    if (/too long|start(?:up)?|did not open|didn['’]?t open/.test(text)) return "startup";
    if (/stall|stopped responding|buffer/.test(text)) return "stall";
    if (/fire tv|native|media3/.test(text)) return "native";
    if (/decode|decoder|codec|format|not supported/.test(text)) return "decoder";
    if (/network|http|connection|fetch|load/.test(text)) return "network";
    return "media";
  };

  const liveFailureLabel = (failureClass) => {
    switch (String(failureClass || "").toLowerCase()) {
      case "startup":
        return "startup timeout";
      case "stall":
        return "stream stalled";
      case "network":
        return "network failure";
      case "decoder":
        return "decoder failure";
      case "native":
        return "native player failure";
      default:
        return "playback failure";
    }
  };

  const safeLiveHost = (item) => {
    try {
      const url = new URL(String(getSourceUrl(item) || ""));
      return url.hostname || "";
    } catch {
      return "";
    }
  };

  const emitLiveDiagnostic = ({
    event = "status",
    failureClass = "",
    index = activeIdx,
    message = "",
  } = {}) => {
    const candidate = sources[index] || {};
    const liveItem =
      source?.type === "live" || candidate?.live || candidate?.type === "live";

    if (!liveItem || typeof window === "undefined") return;

    const position = liveSourcePosition(index);
    const detail = {
      at: new Date().toISOString(),
      event: String(event || "status"),
      failureClass: String(failureClass || ""),
      channel: String(source?.title || "Live TV"),
      sourceNumber: position.current,
      sourceTotal: position.total,
      sourceName: String(candidate?.sourceName || ""),
      sourceCategory: String(candidate?.sourceCategory || ""),
      host: safeLiveHost(candidate),
      format: String(candidate?.format || candidate?.mimeType || ""),
      geoRestricted: candidate?.geoRestricted === true,
      browserPlayable: candidate?.browserPlayable !== false,
      mixedContent: candidate?.mixedContent === true,
      requiresHeaders: candidate?.requiresHeaders === true,
      message: String(message || "").slice(0, 180),
    };

    try {
      const history = Array.isArray(window.__MG_LIVE_TV_DIAGNOSTICS__)
        ? window.__MG_LIVE_TV_DIAGNOSTICS__
        : [];
      window.__MG_LIVE_TV_DIAGNOSTICS__ = [...history.slice(-39), detail];
      window.dispatchEvent(
        new CustomEvent("mg:live-tv-diagnostic", { detail })
      );
      console.info("[Media God Live TV]", detail);
    } catch {
      // Diagnostics must never interrupt playback.
    }
  };

  const showLiveRecoveryNotice = (
    message,
    {
      index = activeIdx,
      failureClass = "",
      kind = "info",
      clearAfterMs = 0,
    } = {}
  ) => {
    const liveItem =
      source?.type === "live" ||
      sources[index]?.live ||
      sources[index]?.type === "live";

    if (!liveItem) return;

    if (liveRecoveryNoticeTimerRef.current) {
      window.clearTimeout(liveRecoveryNoticeTimerRef.current);
      liveRecoveryNoticeTimerRef.current = null;
    }

    const position = liveSourcePosition(index);
    setLiveRecoveryNotice({
      message: String(message || ""),
      sourceNumber: position.current,
      sourceTotal: position.total,
      failureClass: String(failureClass || ""),
      kind: String(kind || "info"),
    });

    if (clearAfterMs > 0) {
      liveRecoveryNoticeTimerRef.current = window.setTimeout(() => {
        liveRecoveryNoticeTimerRef.current = null;
        setLiveRecoveryNotice(null);
      }, clearAfterMs);
    }
  };

  const mediaElementFailureClass = () => {
    const video = stageRef.current?.querySelector("video");
    const code = Number(video?.error?.code || 0);

    if (code === 2) return "network";
    if (code === 3 || code === 4) return "decoder";
    return "media";
  };

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

  const automaticNetworkScore = (item, label) => {
    const preferences = readPlaybackPreferences();
    if (!preferences.networkAware4K || typeof navigator === "undefined") return 0;

    const traits = detectStreamTraits(item, label);
    if (Number(traits.resolution || 0) < 2160) return 0;

    const downlink = Number(navigator.connection?.downlink || 0);
    if (!Number.isFinite(downlink) || downlink <= 0) return 0;

    const rawBitrate = Number(
      item?.bitrate || item?.bit_rate || item?.videoBitrate || item?.video_bitrate || 0
    );
    const labelRate = Number(
      String(label || "").match(/(\d+(?:\.\d+)?)\s*(?:mbps|mb\/s)/i)?.[1] || 0
    );
    const bitrateMbps = rawBitrate > 100000 ? rawBitrate / 1_000_000 : rawBitrate > 0 ? rawBitrate : labelRate;
    const remux = /\b(?:remux|blu-?ray|bdmv)\b/i.test(String(label || ""));
    const required = bitrateMbps > 0 ? bitrateMbps * 1.2 : remux ? 55 : 24;

    if (downlink < required * 0.72) return -70000;
    if (downlink < required) return -22000;
    if (downlink >= required * 1.5) return 6000;
    return 0;
  };

  const hdrRecoveryScore = (item, label) => {
    const activeTraits = detectStreamTraits(
      active,
      sourceDisplayLabel(active, activeIdx)
    );
    if (!activeTraits.dolbyVision) return 0;
    const candidate = detectStreamTraits(item, label);
    if (candidate.dolbyVision) return -8000;
    const sameQuality = Number(candidate.resolution || 0) >= Number(activeTraits.resolution || 0);
    if (candidate.hdr && sameQuality) return 36000;
    if (sameQuality) return 26000;
    return candidate.hdr ? 16000 : 10000;
  };

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
    const liveItem = item?.live || item?.type === "live";
    const liveBonus =
      liveItem
        ? liveTvUrlScore(getSourceUrl(item))
        : 0;
    const liveQuarantinePenalty =
      liveItem && liveTvUrlQuarantined(getSourceUrl(item))
        ? -180000
        : 0;
    const liveGeoPenalty =
      liveItem && item?.geoRestricted === true
        ? -120000
        : 0;
    const liveRepositoryBonus =
      item?.live || item?.type === "live"
        ? Number(item?.sourcePriority || 0) * 30 +
          Number(item?.quality || 0) * 2
        : 0;

    return (
      compatibility +
      languagePriority +
      learned +
      directBonus +
      rdBonus +
      trackerRichBonus +
      swarmBonus +
      liveBonus +
      liveQuarantinePenalty +
      liveGeoPenalty +
      liveRepositoryBonus +
      automaticNetworkScore(item, label) +
      hdrRecoveryScore(item, label)
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

  const markTorrentHashReady = (item = active) => {
    const hash = sourceTorrentHash(item);
    if (!hash) return "";

    failedTorrentHashesRef.current.delete(hash);
    forgetPersistentFailedTorrentHash(hash);
    setRuntimeReadyTorrentHashes((current) => {
      if (current.has(hash)) return current;
      const next = new Set(current);
      next.add(hash);
      return next;
    });

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
    fromIndex,
    { allowCaching = true } = {}
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

    const liveFailover =
      isLive || sources.some((item) => item?.live || item?.type === "live");
    const obeySelectorOrder =
      sourceSortMode !== "best" && !liveFailover;

    const activeRecoveryTraits = detectStreamTraits(
      active,
      sourceDisplayLabel(active, fromIndex)
    );
    const activeRecoveryResolution = Number(
      activeRecoveryTraits?.resolution || 0
    );
    const activeRecoveryDolbyVision =
      activeRecoveryTraits?.dolbyVision === true;

    const qualityRecoveryRank = (traits) => {
      const resolution = Number(traits?.resolution || 0);
      if (activeRecoveryResolution <= 0) return 0;
      if (resolution === activeRecoveryResolution) return 0;
      if (resolution > 0 && resolution < activeRecoveryResolution) {
        return activeRecoveryResolution - resolution;
      }
      if (resolution > activeRecoveryResolution) {
        return 10000 + resolution - activeRecoveryResolution;
      }
      return 20000;
    };

    const hdrRecoveryRank = (traits) => {
      if (
        !activeRecoveryDolbyVision ||
        activeRecoveryResolution < 2000 ||
        Number(traits?.resolution || 0) !== activeRecoveryResolution
      ) {
        return 0;
      }

      if (traits?.dolbyVision !== true && traits?.hdr === true) return 0;
      if (traits?.dolbyVision !== true) return 1;
      return 2;
    };

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
          (allowCaching === false && sourceNeedsCaching(candidate)) ||
          (!url && !torrent)
        ) {
          return null;
        }

        const candidateTraits = detectStreamTraits(
          candidate,
          sourceDisplayLabel(candidate, index)
        );

        return {
          index,
          qualityRank: qualityRecoveryRank(candidateTraits),
          hdrRescueRank: hdrRecoveryRank(candidateTraits),
          selectorRank:
            selectorRankByIndex.get(index) ??
            Number.MAX_SAFE_INTEGER,
          quarantined:
            liveFailover && liveTvUrlQuarantined(url),
          score: recoverySourceScore(candidate, index),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (liveFailover) {
          const aRestricted = sources[a.index]?.geoRestricted === true;
          const bRestricted = sources[b.index]?.geoRestricted === true;

          if (aRestricted !== bRestricted) {
            return Number(aRestricted) - Number(bRestricted);
          }

          if (a.quarantined !== b.quarantined) {
            return Number(a.quarantined) - Number(b.quarantined);
          }

          // Live TV recovery is always health-first. User selector sorting still
          // controls the visible list, but automatic failover should never jump
          // to a known-bad mirror merely because it appears earlier in that list.
          return b.score - a.score || a.index - b.index;
        }

        if (a.qualityRank !== b.qualityRank) {
          return a.qualityRank - b.qualityRank;
        }

        if (a.hdrRescueRank !== b.hdrRescueRank) {
          return a.hdrRescueRank - b.hdrRescueRank;
        }

        return obeySelectorOrder
          ? a.selectorRank - b.selectorRank ||
            b.score - a.score ||
            a.index - b.index
          : b.score - a.score ||
            a.index - b.index;
      });

    return candidates[0]?.index ?? -1;
  };

  const switchToSource = (
    nextIndex,
    {
      preservePosition = true,
      statusMessage = "",
      manualSelection = false,
    } = {}
  ) => {
    /*
     * Never move the active source underneath an open native selector during
     * background recovery. A deliberate movie/TV source choice is allowed to
     * break the pin because that exact choice is the action the user requested.
     */
    if (
      !manualSelection &&
      (
        sourceSelectorPinnedRef.current ||
        rdFileSelectorPinnedRef.current
      )
    ) {
      return false;
    }

    if (manualSelection) {
      releaseSourceSelector();
      releaseRdFileSelector();
    }

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
    setRdManualFileSelection(null);
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
      liveFailureClass = "",
    } = {}
  ) => {
    const activeIsLive =
      source?.type === "live" || active?.live || active?.type === "live";
    const selectorPinned =
      sourceSelectorPinnedRef.current || rdFileSelectorPinnedRef.current;

    /*
     * A native Android/Fire TV source chooser can remain focused after the
     * visual popup has gone away. Do not let that stale UI pin strand a failed
     * live stream on screen. Fatal/immediate recovery and all live-TV recovery
     * are allowed to dismiss the stale selector snapshot and continue to the
     * next healthy source. Movie/TV background recovery still respects an
     * actively pinned selector unless the failure is explicitly immediate.
     */
    if (selectorPinned && !immediate && !activeIsLive) {
      return false;
    }

    if (selectorPinned) {
      releaseSourceSelector();
      releaseRdFileSelector();
    }

    const hardFailureMessage =
      /(?:\b451\b|infringing[_ -]?file|copyright|wrong\s+ip|rate[-\s]?limit|not\s+cached|couldn['’]?t\s+start|could\s+not\s+start|comet\s+returned\s+its\s+error)/i.test(
        String(message || "")
      );

    const permanentRdTorrentRejection =
      /(?:\b451\b|infringing[_ -]?file|copyright|infringing)/i.test(
        String(message || "")
      );

    /*
     * Uncached torrent caching is an explicit operation, not ordinary playback
     * failover. Never silently abandon the torrent the user chose just because
     * its first RD/Comet request failed. Keep the same source on screen, show
     * the actual reason and let Retry/manual source selection decide what to do
     * next. Cached/direct playback can continue to use automatic failover.
     */
    if (sourceNeedsCaching(active) && !permanentRdTorrentRejection) {
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

    const classifiedLiveFailure = activeIsLive
      ? classifyLiveFailure(message, liveFailureClass)
      : "";

    if (activeIsLive) {
      emitLiveDiagnostic({
        event: "failure",
        failureClass: classifiedLiveFailure,
        index: activeIdx,
        message,
      });
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

      if (activeIsLive) {
        showLiveRecoveryNotice(
          `Source ${liveSourcePosition(activeIdx).current || 1}/${liveSourcePosition(activeIdx).total || 1} failed • no working backup`,
          {
            index: activeIdx,
            failureClass: classifiedLiveFailure,
            kind: "error",
          }
        );
      }

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

    if (activeIsLive) {
      const nextPosition = liveSourcePosition(nextIndex);
      const reasonLabel = liveFailureLabel(classifiedLiveFailure);
      showLiveRecoveryNotice(
        `Trying source ${nextPosition.current || 1}/${nextPosition.total || sources.length} • ${reasonLabel}`,
        {
          index: nextIndex,
          failureClass: classifiedLiveFailure,
          kind: "trying",
        }
      );
      emitLiveDiagnostic({
        event: "failover",
        failureClass: classifiedLiveFailure,
        index: nextIndex,
        message: `Trying backup after ${reasonLabel}`,
      });
    }

    switchToSource(nextIndex, {
      preservePosition: true,
      statusMessage:
        activeIsLive
          ? `Live stream failed (${liveFailureLabel(classifiedLiveFailure)}) — trying the best available backup…`
          : "Source failed — switching to the best available backup…",
    });

    return true;
  };

  const sourceSelectionKey = (item, fallbackIndex = -1) =>
    stablePlaybackSourceKey(item, fallbackIndex);

  const selectSource = (
    index,
    pinnedItem = null
  ) => {
    const requestedIndex = Number(index);
    const selectingLive =
      source?.type === "live" || active?.live || active?.type === "live";

    let nextIndex = requestedIndex;

    /*
     * Movie/TV source discovery can refresh or reorder the source array while a
     * native Android selector is open. The option the user sees belongs to the
     * pinned snapshot, so its old numeric index may no longer identify the same
     * cached/uncached torrent when onChange fires. Resolve the chosen snapshot
     * item back into the CURRENT source array before switching.
     */
    if (!selectingLive && pinnedItem) {
      const exactIndex = sources.indexOf(pinnedItem);

      if (exactIndex >= 0) {
        nextIndex = exactIndex;
      } else {
        const wantedKey = sourceSelectionKey(pinnedItem, requestedIndex);
        const refreshedIndex = sources.findIndex(
          (candidate, candidateIndex) =>
            sourceSelectionKey(candidate, candidateIndex) === wantedKey
        );

        if (refreshedIndex >= 0) {
          nextIndex = refreshedIndex;
        }
      }
    }

    if (
      Number.isNaN(nextIndex) ||
      nextIndex < 0 ||
      nextIndex >= sources.length ||
      nextIndex === activeIdx
    ) {
      return;
    }

    switchToSource(nextIndex, {
      preservePosition: true,
      manualSelection: !selectingLive,
      statusMessage:
        selectingLive
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

  useEffect(() => {
    if (!isProvider || !isFireTvRemoteRuntime()) {
      return undefined;
    }

    const stage = stageRef.current;
    const root = stage?.closest?.('[data-mg-player-root="true"]');

    if (!(root instanceof HTMLElement)) {
      return undefined;
    }

    let hideTimer = null;

    const clearProviderHideTimer = () => {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const scheduleProviderChromeHide = () => {
      clearProviderHideTimer();
      hideTimer = window.setTimeout(() => {
        root.dataset.mgControlsVisible = "false";
      }, 2200);
    };

    const revealProviderChrome = () => {
      root.dataset.mgControlsVisible = "true";
      scheduleProviderChromeHide();
    };

    /*
     * Provider/iframe playback has no parent <video> element, so the normal
     * PlayerControls component never receives a `playing` event. Without this
     * bridge the Exit/source/Fix-audio panel stays visible forever over EV
     * SPORTS and over movie/TV provider fallbacks. Treat an opened provider as
     * playing for chrome purposes only: hide after a short delay and let the
     * first Fire TV D-pad/OK action reveal it again.
     */
    revealProviderChrome();
    window.addEventListener("mg:player-reveal-controls", revealProviderChrome);
    root.addEventListener("focusin", revealProviderChrome);

    return () => {
      clearProviderHideTimer();
      window.removeEventListener("mg:player-reveal-controls", revealProviderChrome);
      root.removeEventListener("focusin", revealProviderChrome);

      if (root.dataset.mgControlsVisible != null) {
        delete root.dataset.mgControlsVisible;
      }
    };
  }, [isProvider, activeUrl]);

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
    setLiveRecoveryNotice(null);
    if (liveRecoveryNoticeTimerRef.current) {
      window.clearTimeout(liveRecoveryNoticeTimerRef.current);
      liveRecoveryNoticeTimerRef.current = null;
    }
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
    if (!isLive || isNativeFireTvPlayerAvailable()) {
      /*
       * Native Fire TV playback lives in PlayerActivity/Media3, so there is no
       * WebView <video> element to observe here. Trying to attach browser
       * playback listeners while Media3 owns the stream can leave stale timers
       * behind and make the web player think a healthy native stream failed.
       */
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

      const position = liveSourcePosition(activeIdx);
      showLiveRecoveryNotice(
        `Source ${position.current || 1}/${position.total || 1} connected`,
        {
          index: activeIdx,
          kind: "connected",
          clearAfterMs: 2800,
        }
      );
      emitLiveDiagnostic({
        event: "playing",
        index: activeIdx,
        message: "Live source started successfully",
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

    const attach = () => {
      video = stageRef.current?.querySelector("video") || null;
      if (!(video instanceof HTMLVideoElement)) {
        attachTimer = window.setTimeout(attach, 120);
        return;
      }

      video.addEventListener("playing", onPlaying);
      video.addEventListener("error", onError);

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

      retryExistingTorrentIdRef.current = "";

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
   * UNCACHED REAL-DEBRID CACHE ENGINE
   *
   * Uncached torrents used to share the same giant resolution/polling effects
   * as cached library links, browser playback and source failover. That made a
   * refresh or background source update capable of re-adopting an old partial
   * RD job and presenting its last percentage forever. The cache lifecycle now
   * has one owner and one AbortController from start -> monitor -> verified
   * restart -> ready/failover. The older resolution path below is deliberately
   * bypassed for every source that actually requires caching.
   */
  useEffect(() => {
    if (
      !active ||
      isYoutube ||
      isProvider ||
      isDirectFile ||
      isLive ||
      !isRdSource ||
      !sourceNeedsCaching(active)
    ) {
      return undefined;
    }

    rdCacheEngineAbortRef.current?.abort?.();
    const controller = new AbortController();
    rdCacheEngineAbortRef.current = controller;
    rdCacheEngineOwnsPollingRef.current = true;

    const preferredTorrentId = String(
      retryExistingTorrentIdRef.current || ""
    ).trim();
    retryExistingTorrentIdRef.current = "";

    setRdResolving(true);
    setRdPolling(false);
    setRdError("");
    setRdOverride(null);
    setRdFiles([]);
    setRdTorrentId(null);
    setRdPreparation({
      status: "starting",
      phase: "starting",
      progress: 0,
      seeders: Math.max(0, Number(active?.reportedSeeders || 0)),
      speed_bps: 0,
      size_bytes: 0,
      downloaded_bytes: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
      cacheEngine: "v2",
    });

    const context = {
      title: source?.rdTitle || source?.title || "",
      year: source?.rdYear ?? source?.year ?? null,
      season: source?.rdSeason ?? source?.season ?? null,
      episode: source?.rdEpisode ?? source?.episode ?? null,
      fileIdx:
        active?.fileIdx != null && Number.isFinite(Number(active.fileIdx))
          ? Number(active.fileIdx)
          : null,
      preferBrowserTranscode: prefersMobileBrowserRdCompatibility(),
      preferredTorrentId,
    };

    void runRealDebridCacheSession({
      source: active,
      context,
      signal: controller.signal,
      onProgress: (snapshot) => {
        if (controller.signal.aborted) return;

        const torrentId = String(snapshot?.torrent_id || "").trim();
        const phase = String(snapshot?.phase || "").toLowerCase();

        setRdTorrentId(torrentId || null);
        setRdResolving(
          phase === "starting" ||
          phase === "restarting"
        );
        setRdPolling(
          Boolean(torrentId) &&
          phase !== "restarting"
        );
        setRdPreparation((current) => ({
          ...(current || {}),
          ...snapshot,
          status: snapshot?.status || current?.status || "preparing",
          progress: Math.max(
            0,
            Math.min(100, Number(snapshot?.progress ?? current?.progress ?? 0))
          ),
          startedAt: current?.startedAt || Date.now(),
          updatedAt: Date.now(),
          attempts: Number(snapshot?.attempt ?? current?.attempts ?? 0),
          cacheEngine: "v2",
        }));
      },
    })
      .then((result) => {
        if (controller.signal.aborted || !result) return;

        if (result.status === "ready" && result.streamUrl) {
          markTorrentHashReady(active);
          setRdOverride({
            src: result.streamUrl,
            label:
              result.filename ||
              active?.label ||
              "Real-Debrid Stream",
            file: currentFilePath(result.files),
            audioRescue: result.audioRescue || null,
            fallbackSrc: result.fallbackStreamUrl || "",
            videoRescue: result.videoRescue || null,
            mediaInfo: result.mediaInfo || null,
          });
          setRdFiles(result.files || []);
          setRdResolving(false);
          setRdPolling(false);
          setRdTorrentId(null);
          setRdPreparation(null);
          setRdError("");
          return;
        }

        setRdResolving(false);
        setRdPolling(false);
        setRdTorrentId(null);

        /*
         * EV/SX Movies keeps an IMDb iframe fallback ready instead of forcing
         * the viewer through one uncached source after another. Mirror that
         * behaviour here after the cache engine reaches a terminal result:
         * first prefer a source that is already playable/cached, then use the
         * alternate IMDb player, and only try another uncached torrent when no
         * instant fallback exists for this title.
         *
         * Active-slot exhaustion is different: it is an account-wide RD state,
         * not evidence that this source/hash is bad. Preserve the current source
         * so Retry works after a slot becomes available, and never churn through
         * every other uncached hash for the same account-wide failure.
         */
        const preserveUncachedSource =
          result.accountBlocked === true ||
          result.retrySameSource === true ||
          result.errorCode === "RD_ACTIVE_SLOTS_FULL" ||
          result.errorCode === "RD_CACHE_STATUS_UNAVAILABLE";

        if (!preserveUncachedSource) {
          markSourceFailed(activeIdx);
        }
        if (result.hashFailed === true) {
          markTorrentHashFailed(active);
        }

        const nextReadySource = findNextPlayableSource(activeIdx, {
          allowCaching: false,
        });

        if (nextReadySource !== -1) {
          setRdPreparation(null);
          setRdError("");
          switchToSource(nextReadySource, {
            preservePosition: true,
            statusMessage:
              `${result.message || "This uncached torrent could not be prepared."} Trying an already-playable backup…`,
          });
          return;
        }

        const alternate = buildAlternateEmbedFallback(source, {
          resumeAt: recoveryResumeRef.current,
        });

        if (alternate?.url) {
          setRdPreparation(null);
          setRdError("");
          setAlternateEmbedFallback(alternate);
          setForceNativePlayback(false);
          return;
        }

        if (!preserveUncachedSource) {
          const nextSource = findNextPlayableSource(activeIdx);
          if (nextSource !== -1) {
            setRdPreparation(null);
            setRdError("");
            switchToSource(nextSource, {
              preservePosition: true,
              statusMessage:
                `${result.message || "This uncached torrent could not be prepared."} No instant backup was available, so Media God is trying a different torrent…`,
            });
            return;
          }
        }

        setRdPreparation((current) => ({
          ...(current || {}),
          status: "stalled",
          stallReason:
            result.errorCode ||
            (result.hashFailed ? "hash_failed" : "cache_failed"),
          progress: Math.max(
            0,
            Math.min(100, Number(result.progress ?? current?.progress ?? 0))
          ),
          updatedAt: Date.now(),
          cacheEngine: "v2",
        }));
        setRdError(
          result.message ||
          "Real-Debrid could not prepare this uncached torrent."
        );
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === "AbortError") return;

        setRdResolving(false);
        setRdPolling(false);
        setRdTorrentId(null);
        markSourceFailed(activeIdx);

        const nextReadySource = findNextPlayableSource(activeIdx, {
          allowCaching: false,
        });

        if (nextReadySource !== -1) {
          setRdPreparation(null);
          setRdError("");
          switchToSource(nextReadySource, {
            preservePosition: true,
            statusMessage:
              "The uncached torrent engine stopped — trying an already-playable backup…",
          });
          return;
        }

        const alternate = buildAlternateEmbedFallback(source, {
          resumeAt: recoveryResumeRef.current,
        });

        if (alternate?.url) {
          setRdPreparation(null);
          setRdError("");
          setAlternateEmbedFallback(alternate);
          setForceNativePlayback(false);
          return;
        }

        const nextSource = findNextPlayableSource(activeIdx);
        if (nextSource !== -1) {
          setRdPreparation(null);
          setRdError("");
          switchToSource(nextSource, {
            preservePosition: true,
            statusMessage:
              "The uncached torrent engine stopped — trying a different torrent…",
          });
          return;
        }

        setRdPreparation((current) => ({
          ...(current || {}),
          status: "stalled",
          stallReason: "cache_engine_error",
          updatedAt: Date.now(),
          cacheEngine: "v2",
        }));
        setRdError(
          error?.message ||
          "The Real-Debrid cache engine stopped unexpectedly."
        );
      });

    return () => {
      controller.abort();
      if (rdCacheEngineAbortRef.current === controller) {
        rdCacheEngineAbortRef.current = null;
        rdCacheEngineOwnsPollingRef.current = false;
      }
    };
  }, [
    activeIdx,
    activeResolutionKey,
    rdMediaContextKey,
    rdCacheEngineNonce,
    isYoutube,
    isProvider,
    isDirectFile,
    isLive,
    isRdSource,
  ]);

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

      if (sourceNeedsCaching(active)) {
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
             * Generic magnet sources can arrive in several variants. Preserve
             * the richest tracker-bearing form for Media God's direct RD path.
             * Tracker-backed Comet uncached rows now use the same direct RD path;
             * the legacy Comet playback trigger is only for a genuinely opaque
             * Comet row with no usable torrent metadata at all.
             */
            const magnet =
              richestSourceMagnet(active) ||
              active?.src ||
              active?.url ||
              active?.magnet ||
              active?.magnetLink ||
              richMagnet ||
              "";

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

            if (
              hash &&
              retryInactiveTorrentHashRef.current === hash
            ) {
              /*
               * The user explicitly pressed Retry after Media God had already
               * watched this exact torrent sit inactive for the full stall
               * window. Ask the backend to clear that inactive same-hash RD job
               * before adoption so Retry can genuinely restart it instead of
               * reconnecting to the same dead partial download forever.
               */
              retryInactiveTorrentHashRef.current = "";

              try {
                await base44.functions.invoke(
                  "realDebrid",
                  {
                    action: "reset_stale_hash",
                    info_hash: hash,
                    claim_for_playback: true,
                    force_inactive_reset: true,
                    title:
                      source?.rdTitle ||
                      source?.title ||
                      "",
                  }
                );
              } catch {
                // Retry remains safe: adopt_hash below will preserve a job that
                // has resumed activity and only a genuinely inactive job resets.
              }

              if (cancelled) return;
            }

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
                  prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),
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
            const hasTorrentTrackers = debridTorrentHasMetadata({
              ...active,
              magnet,
              src: magnet,
            });
            const hasAuthoritativeTorrentMetadata =
              hasTorrentTrackers &&
              active?.torrentMetadataSource !== "public_fallback";

            /*
             * Any uncached torrent with usable tracker metadata can be owned by
             * Media God/Real-Debrid directly. For Comet this is the important
             * distinction: Torrent Mode exposes the torrent's real Stremio
             * `sources`, so we can safely submit the exact magnet ourselves
             * instead of depending on Comet's partially-supported uncached RD
             * playback path.
             */
            if (
              hash &&
              knownUncached &&
              (
                resolutionStrategy !== "comet_uncached" ||
                hasAuthoritativeTorrentMetadata
              ) &&
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
                    prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),
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
                      force_progress_reset: true,
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
             * COMET LEGACY FALLBACK
             *
             * Current Comet can expose a direct torrent companion row containing
             * Stremio `sources`. When those trackers were merged above, skip
             * this entire block and continue to Media God's own Real-Debrid
             * resolve_best path below. Only installations that did not return
             * torrent metadata still need the Comet playback endpoint fallback.
             */
            const cometPlaybackUrl = String(
              active?.cometPlaybackUrl || ""
            ).trim();

            if (
              resolutionStrategy === "comet_uncached" &&
              !hasAuthoritativeTorrentMetadata
            ) {
              if (
                !hash ||
                !/^https?:\/\//i.test(cometPlaybackUrl)
              ) {
                setRdResolving(false);
                setRdPolling(false);
                setRdTorrentId(null);
                setRdPreparation({
                  status: "comet_start_failed",
                  progress: 0,
                  seeders: Math.max(0, Number(active?.reportedSeeders || 0)),
                  speed_bps: 0,
                  startedAt: Date.now(),
                  updatedAt: Date.now(),
                  attempts: 0,
                });
                setRdError(
                  "Comet did not provide the playback metadata needed to start this uncached torrent. Retry the source or choose another source manually."
                );
                return;
              }

              setRdError("");
              setRdPreparation((current) => ({
                ...(current || {}),
                status: "comet_starting",
                progress: Number(current?.progress || 0),
                seeders: Math.max(
                  0,
                  Number(
                    current?.seeders ||
                      active?.reportedSeeders ||
                      0
                  )
                ),
                speed_bps: Number(current?.speed_bps || 0),
                startedAt: current?.startedAt || Date.now(),
                updatedAt: Date.now(),
                attempts: 0,
              }));
              setRdResolving(false);

              /*
               * Clean only an old terminal/long-stale copy of this exact hash
               * before Comet starts. reset_stale_hash intentionally leaves a
               * fresh active torrent alone, so Retry can safely reconnect to a
               * healthy in-progress download instead of deleting it.
               */
              let legacyCometReset = {};

              try {
                const cleanupResponse = await base44.functions.invoke(
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
                legacyCometReset = cleanupResponse?.data || {};
              } catch {
                // Cleanup is best-effort; Comet still gets the start request.
                legacyCometReset = {};
              }

              if (cancelled) return;

              if (
                legacyCometReset?.status === "failed" &&
                legacyCometReset?.error
              ) {
                setRdResolving(false);
                setRdPolling(false);
                setRdTorrentId(null);
                setRdPreparation((current) => ({
                  ...(current || {}),
                  status: "stalled",
                  stallReason: "stale_delete_not_confirmed",
                  updatedAt: Date.now(),
                }));
                setRdError(
                  `${legacyCometReset.error} Retry after a few seconds; Media God will not reattach to the same stale partial job.`
                );
                return;
              }

              const triggerController = new AbortController();
              const triggerTimer = window.setTimeout(
                () => triggerController.abort(),
                65000
              );

              const triggerComet = () => {
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
                     * Browsers can reject reading a cross-origin/manual-redirect
                     * response even after Comet received the request. That is
                     * expected: RD adoption below, not the HTTP response body,
                     * tells us whether Comet started the torrent.
                     */
                  });
              };

              triggerComet();

              let lastAdoptError = "";
              const clearedLegacyProgress = Math.max(
                0,
                Math.min(100, Number(legacyCometReset?.cleared_progress || 0))
              );
              const clearedLegacyTorrentId = String(
                legacyCometReset?.torrent_id || ""
              ).trim();
              let resumedLegacyPartialChecks = 0;

              for (let adoptAttempt = 0; adoptAttempt < 48; adoptAttempt += 1) {
                if (cancelled) {
                  triggerController.abort();
                  window.clearTimeout(triggerTimer);
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
                      prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),
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

                  if (cancelled) {
                    triggerController.abort();
                    window.clearTimeout(triggerTimer);
                    return;
                  }

                  const adoptData = adoptResponse?.data || {};

                  setRdPreparation((current) => ({
                    ...(current || {}),
                    ...(adoptData.torrent_progress || {}),
                    status:
                      adoptData.torrent_progress?.status ||
                      adoptData.rd_status ||
                      (adoptData.status === "not_found"
                        ? "comet_starting"
                        : current?.status || "comet_starting"),
                    seeders: Math.max(
                      0,
                      Number(
                        adoptData.torrent_progress?.seeders ??
                          current?.seeders ??
                          active?.reportedSeeders ??
                          0
                      )
                    ),
                    speed_bps: Math.max(
                      0,
                      Number(
                        adoptData.torrent_progress?.speed_bps ??
                          current?.speed_bps ??
                          0
                      )
                    ),
                    startedAt: current?.startedAt || Date.now(),
                    updatedAt: Date.now(),
                    attempts: adoptAttempt + 1,
                  }));

                  if (
                    adoptData.status === "ready" &&
                    adoptData.stream_url
                  ) {
                    triggerController.abort();
                    window.clearTimeout(triggerTimer);
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

                  if (
                    adoptData.status === "preparing" &&
                    adoptData.torrent_id
                  ) {
                    const adoptedProgress = Math.max(
                      0,
                      Math.min(
                        100,
                        Number(adoptData.torrent_progress?.progress || 0)
                      )
                    );
                    const adoptedTorrentId = String(adoptData.torrent_id).trim();
                    const resumedDeletedPartial =
                      clearedLegacyProgress > 0 &&
                      clearedLegacyProgress < 100 &&
                      adoptedTorrentId &&
                      adoptedTorrentId !== clearedLegacyTorrentId &&
                      Math.abs(adoptedProgress - clearedLegacyProgress) <= 0.001;

                    if (resumedDeletedPartial) {
                      resumedLegacyPartialChecks += 1;

                      if (resumedLegacyPartialChecks < 5) {
                        continue;
                      }

                      triggerController.abort();
                      window.clearTimeout(triggerTimer);

                      try {
                        await base44.functions.invoke(
                          "realDebrid",
                          {
                            action: "torrent_delete",
                            torrent_id: adoptedTorrentId,
                          }
                        );
                      } catch {
                        // The source hash is being abandoned either way.
                      }

                      markSourceFailed(activeIdx);
                      markTorrentHashFailed(active);
                      const nextSource = findNextPlayableSource(activeIdx);

                      if (nextSource !== -1) {
                        setRdResolving(false);
                        setRdPolling(false);
                        setRdTorrentId(null);
                        setRdPreparation(null);
                        setRdError("");
                        switchToSource(nextSource, {
                          preservePosition: true,
                          statusMessage:
                            `Real-Debrid removed the old ${Math.round(clearedLegacyProgress)}% job, but Comet re-created the same hash at the same stuck percentage and it still did not move. Trying a different torrent hash for the same title…`,
                        });
                        return;
                      }

                      setRdResolving(false);
                      setRdPolling(false);
                      setRdTorrentId(null);
                      setRdPreparation({
                        ...(adoptData.torrent_progress || {}),
                        status: "stalled",
                        stallReason: "rd_partial_state_persisted",
                        progress: adoptedProgress,
                        updatedAt: Date.now(),
                        attempts: adoptAttempt + 1,
                      });
                      setRdError(
                        `Real-Debrid removed the old ${Math.round(clearedLegacyProgress)}% job, but the same torrent hash immediately resumed at ${Math.round(adoptedProgress)}% and still did not advance. No different torrent hash is currently available for this title.`
                      );
                      return;
                    }

                    triggerController.abort();
                    window.clearTimeout(triggerTimer);
                    setRdPreparation({
                      ...(adoptData.torrent_progress || {}),
                      status:
                        adoptData.torrent_progress?.status ||
                        adoptData.rd_status ||
                        "preparing",
                      seeders: Math.max(
                        0,
                        Number(
                          adoptData.torrent_progress?.seeders ??
                            active?.reportedSeeders ??
                            0
                        )
                      ),
                      startedAt: Date.now(),
                      updatedAt: Date.now(),
                      attempts: 0,
                    });
                    setRdTorrentId(adoptedTorrentId);
                    setRdResolving(false);
                    return;
                  }

                  if (adoptData.status === "stale") {
                    const staleTorrentId = String(adoptData.torrent_id || "").trim();
                    const repairMagnet = richestSourceMagnet(active);

                    if (staleTorrentId && repairMagnet) {
                      try {
                        const restartResponse = await base44.functions.invoke(
                          "realDebrid",
                          {
                            action: "restart_playback_torrent",
                            torrent_id: staleTorrentId,
                            info_hash: hash,
                            magnet: repairMagnet,
                            prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),
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
                            ...(active?.fileIdx != null &&
                            Number.isFinite(Number(active.fileIdx))
                              ? { file_idx: Number(active.fileIdx) }
                              : {}),
                          }
                        );

                        const restartData = restartResponse?.data || {};

                        triggerController.abort();
                        window.clearTimeout(triggerTimer);

                        if (
                          restartData.error_code ===
                          "RD_RESTART_RESUMED_STALE_PARTIAL"
                        ) {
                          markSourceFailed(activeIdx);
                          markTorrentHashFailed(active);
                          const nextSource = findNextPlayableSource(activeIdx);

                          if (nextSource !== -1) {
                            setRdResolving(false);
                            setRdPolling(false);
                            setRdTorrentId(null);
                            setRdPreparation(null);
                            setRdError("");
                            switchToSource(nextSource, {
                              preservePosition: true,
                              statusMessage:
                                `Real-Debrid re-created this torrent at the same stuck ${Math.round(Number(restartData.previous_progress || 0))}% and it still did not move. Trying a different torrent hash for the same title…`,
                            });
                            return;
                          }

                          setRdResolving(false);
                          setRdPolling(false);
                          setRdTorrentId(null);
                          setRdPreparation((current) => ({
                            ...(current || {}),
                            status: "stalled",
                            stallReason: "rd_partial_state_persisted",
                            progress: Number(restartData.fresh_progress || restartData.previous_progress || 0),
                            updatedAt: Date.now(),
                          }));
                          setRdError(
                            `${restartData.error || "Real-Debrid kept the same stalled partial state for this torrent hash."} No different torrent hash is currently available for this title.`
                          );
                          return;
                        }

                        if (restartData.status === "ready" && restartData.stream_url) {
                          setRdOverride({
                            src: restartData.stream_url,
                            label:
                              restartData.filename ||
                              active?.label ||
                              "Real-Debrid Stream",
                            file: currentFilePath(restartData.files),
                            audioRescue: restartData.audio_rescue || null,
                            fallbackSrc: restartData.fallback_stream_url || "",
                            videoRescue: restartData.video_rescue || null,
                            mediaInfo: restartData.media_info || null,
                          });
                          setRdFiles(restartData.files || []);
                          setRdResolving(false);
                          setRdPreparation(null);
                          return;
                        }

                        if (restartData.torrent_id) {
                          setRdPreparation({
                            ...(restartData.torrent_progress || {}),
                            status:
                              restartData.torrent_progress?.status ||
                              restartData.rd_status ||
                              "restarting",
                            torrent_id: String(restartData.torrent_id),
                            startedAt: Date.now(),
                            updatedAt: Date.now(),
                            attempts: 0,
                          });
                          setRdTorrentId(String(restartData.torrent_id));
                          setRdResolving(false);
                          return;
                        }

                        lastAdoptError =
                          restartData.error ||
                          "Real-Debrid did not return a fresh torrent after deleting the stale copy.";
                      } catch (restartError) {
                        lastAdoptError = String(
                          restartError?.message ||
                            "Real-Debrid could not restart the stale torrent."
                        ).trim();
                      }
                    } else {
                      lastAdoptError =
                        "Real-Debrid still has an old stalled copy of this torrent.";
                    }
                  } else if (adoptData.status === "failed") {
                    lastAdoptError = String(
                      adoptData.error ||
                        "Real-Debrid rejected the torrent Comet tried to start."
                    ).trim();

                    /*
                     * This is now a genuine Comet-created RD failure, not a
                     * reason to submit a second magnet ourselves. Stop here and
                     * leave the selected source visible for Retry/manual choice.
                     */
                    triggerController.abort();
                    window.clearTimeout(triggerTimer);
                    setRdPolling(false);
                    setRdTorrentId(null);
                    setRdPreparation((current) => ({
                      ...(current || {}),
                      status:
                        adoptData.rd_status ||
                        "comet_start_failed",
                      updatedAt: Date.now(),
                      attempts: adoptAttempt + 1,
                    }));
                    setRdError(
                      `${lastAdoptError} Retry this Comet source or choose another source manually.`
                    );
                    return;
                  }
                } catch (adoptError) {
                  lastAdoptError = String(
                    adoptError?.message ||
                      "Could not check Real-Debrid for the Comet torrent."
                  ).trim();
                }
              }

              triggerController.abort();
              window.clearTimeout(triggerTimer);
              setRdResolving(false);
              setRdPolling(false);
              setRdTorrentId(null);
              setRdPreparation((current) => ({
                ...(current || {}),
                status: "comet_start_failed",
                updatedAt: Date.now(),
                attempts: 48,
              }));
              setRdError(
                lastAdoptError
                  ? `Comet did not create an active Real-Debrid torrent within about a minute. ${lastAdoptError} Retry this source or choose another source manually.`
                  : "Comet did not create an active Real-Debrid torrent within about a minute. Retry this source or choose another source manually."
              );
              return;
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
                  prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),

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
              const uncachedActive = sourceNeedsCaching(active);
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
      activeResolutionKey,
      activeUrl,
      rdMediaContextKey,
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
        rdCacheEngineOwnsPollingRef.current ||
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

      let latestSizeBytes =
        0;

      let lastProgressValue =
        -1;

      let lastProgressAdvanceAt =
        Date.now();

      let consecutivePollFailures =
        0;

      const scheduleTransientPollRetry =
        (message) => {
          consecutivePollFailures += 1;

          setRdPreparation((current) => ({
            ...(current || {}),
            lastPollError: String(message || "Real-Debrid status check failed."),
            updatedAt: Date.now(),
            attempts,
          }));

          if (consecutivePollFailures > 4) {
            return false;
          }

          const retryDelayMs = Math.min(
            20000,
            3000 * 2 ** Math.max(0, consecutivePollFailures - 1)
          );

          setRdPolling(true);
          pollRef.current = window.setTimeout(tick, retryDelayMs);
          return true;
        };

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

          /*
           * Android/Fire TV renders <select> as a native popup. The first RD
           * torrent status poll runs about 2.5 seconds after a cache job starts;
           * updating React state while that native popup is open makes WebView
           * dismiss it. Pause polling completely while the user is choosing a
           * source/torrent file, then resume as soon as the selector closes.
           */
          if (
            sourceSelectorPinnedRef.current ||
            rdFileSelectorPinnedRef.current
          ) {
            /*
             * Some Android browsers do not emit blur/change when a native
             * <select> popup is dismissed without changing the value. That can
             * leave the selector "pinned" forever and, because polling pauses
             * while pinned, freeze the Real-Debrid progress display at an old
             * percentage. Treat a pin older than 12 seconds as abandoned and
             * resume polling automatically.
             */
            const now = Date.now();
            const sourcePinStale =
              sourceSelectorPinnedRef.current &&
              sourceSelectorPinnedAtRef.current > 0 &&
              now - sourceSelectorPinnedAtRef.current > 12000;
            const filePinStale =
              rdFileSelectorPinnedRef.current &&
              rdFileSelectorPinnedAtRef.current > 0 &&
              now - rdFileSelectorPinnedAtRef.current > 12000;

            if (sourcePinStale) releaseSourceSelector();
            if (filePinStale) releaseRdFileSelector();

            if (
              sourceSelectorPinnedRef.current ||
              rdFileSelectorPinnedRef.current
            ) {
              pollRef.current = window.setTimeout(
                tick,
                500
              );
              return;
            }
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
                  prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),

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

                  ...(rdManualFileSelection
                    ? {
                        file_id: Number(rdManualFileSelection.fileId),
                        file_path: rdManualFileSelection.path || "",
                        manual_file_selection: true,
                      }
                    : active?.fileIdx != null &&
                        Number.isFinite(Number(active.fileIdx))
                      ? {
                          file_idx: Number(active.fileIdx),
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

            if (!data.error) {
              consecutivePollFailures = 0;
            }

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

            latestSizeBytes = Math.max(
              0,
              Number(progressData.size_bytes || latestSizeBytes || 0)
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
                lastPollError: "",
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

              if (rdManualFileSelection) {
                setRdError(
                  `Real-Debrid stopped the selected extra: ${friendlyRdStatus(
                    currentRdStatus
                  )}. Choose the file again to retry it.`
                );
                setRdManualFileSelection(null);
                return;
              }

              const uncachedActive = sourceNeedsCaching(active);

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

              setRdFiles((current) => {
                const incoming = Array.isArray(data.files) ? data.files : [];

                if (!rdManualFileSelection || current.length === 0) {
                  return incoming;
                }

                const byPath = new Map(
                  incoming.map((file) => [String(file?.path || ""), file])
                );

                return current.map((file) => {
                  const replacement = byPath.get(String(file?.path || ""));
                  return replacement && (replacement?.link || replacement?.selected)
                    ? { ...file, ...replacement }
                    : file;
                });
              });

              setRdManualFileSelection(null);

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

              if (
                rdErrorCode === "RD_TORRENT_INFO_FAILED" &&
                scheduleTransientPollRetry(data.error)
              ) {
                return;
              }

              setRdPolling(
                false
              );

              setRdTorrentId(
                null
              );

              if (rdManualFileSelection) {
                setRdPreparation(null);
                setRdError(
                  `${data.error || "The selected extra could not be prepared."} Choose the file again to retry it.`
                );
                setRdManualFileSelection(null);
                return;
              }

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

              if (rdErrorCode === "RD_TORRENT_INFO_FAILED") {
                setRdPreparation((current) => ({
                  ...(current || {}),
                  status: sourceNeedsCaching(active)
                    ? "stalled"
                    : current?.status || "stalled",
                  stallReason: "poll_failure",
                  updatedAt: Date.now(),
                  attempts,
                }));
              }

              setRdError(
                rdErrorCode === "RD_TORRENT_INFO_FAILED"
                  ? `${data.error} Media God retried the status check several times. The Real-Debrid torrent was left untouched; Retry to reconnect.`
                  : data.error
              );

              return;
            }
          } catch (
            error
          ) {
            if (
              !cancelled &&
              scheduleTransientPollRetry(
                error?.message || "Real-Debrid polling failed."
              )
            ) {
              return;
            }

            if (
              !cancelled
            ) {
              setRdPreparation((current) => ({
                ...(current || {}),
                status: sourceNeedsCaching(active)
                  ? "stalled"
                  : current?.status || "stalled",
                stallReason: "poll_failure",
                updatedAt: Date.now(),
                attempts,
              }));

              setRdError(
                `${error?.message || "Real-Debrid polling failed."} Media God retried the status check several times. The torrent was left untouched; Retry to reconnect.`
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
          const activelyDownloading =
            latestSpeed > 0;

          /*
           * RD's percentage is rounded, so a large slow torrent can sit on one
           * whole percentage for a while. But a tiny file claiming several
           * MB/s should not remain at exactly 43% for many minutes. Scale the
           * active-download grace period from the time it should take to move
           * roughly one percentage point, with sensible minimum/maximum bounds.
           * This catches stale RD speed reports without punishing genuinely
           * large/slow downloads.
           */
          const expectedOnePercentMs =
            activelyDownloading && latestSizeBytes > 0
              ? (latestSizeBytes / 100 / latestSpeed) * 1000
              : 0;
          const activeDownloadFlatlineMs =
            expectedOnePercentMs > 0
              ? Math.min(
                  30 * 60 * 1000,
                  Math.max(45 * 1000, expectedOnePercentMs * 8)
                )
              : 30 * 60 * 1000;

          const stallAfterMs =
            latestProgress <= 0.001
              ? activelyDownloading
                ? activeDownloadFlatlineMs
                : latestSeeders > 0
                  ? 15 * 60 * 1000
                  : hasOriginalTrackerMagnet
                    ? 3 * 60 * 1000
                    : 2 * 60 * 1000
              : activelyDownloading
                ? activeDownloadFlatlineMs
                : latestSeeders > 0
                  ? 15 * 60 * 1000
                  : 3 * 60 * 1000;

          const rdAddedAt = Date.parse(
            String(progressData?.added || rdPreparation?.added || "")
          );
          const rdJobAgeMs = Number.isFinite(rdAddedAt)
            ? Math.max(0, Date.now() - rdAddedAt)
            : 0;
          const expectedFullTransferMs =
            activelyDownloading && latestSizeBytes > 0
              ? (latestSizeBytes / latestSpeed) * 1000
              : 0;
          const staleByOriginalRdAge =
            attempts >= 2 &&
            latestProgress > 0 &&
            latestProgress < 100 &&
            expectedFullTransferMs > 0 &&
            rdJobAgeMs >= Math.max(90 * 1000, expectedFullTransferMs * 6) &&
            noProgressForMs >= 4000;

          const looksCompletelyStalled =
            latestProgress < 100 &&
            (
              noProgressForMs >= stallAfterMs ||
              staleByOriginalRdAge
            );
          const flatlineMinutes = Math.max(
            1,
            Math.round(stallAfterMs / 60000)
          );

          if (looksCompletelyStalled) {
            if (sourceNeedsCaching(active)) {
              const activeHash = sourceTorrentHash(active);
              const canRepairSameTorrent =
                activeHash &&
                !repairedStuckTorrentHashesRef.current.has(activeHash);

              /*
               * Repair the selected torrent itself before considering anything
               * else. If RD's percentage has genuinely flat-lined, delete only
               * the Media-God-owned RD job for this exact hash and re-submit the
               * SAME tracker-rich magnet. This is a source repair, not failover.
               */
              if (canRepairSameTorrent) {
                const repairMagnet = richestSourceMagnet(active);
                const currentTorrentId = String(rdTorrentId || "").trim();

                if (repairMagnet && currentTorrentId) {
                  repairedStuckTorrentHashesRef.current.add(activeHash);

                  try {
                    setRdPreparation((current) => ({
                      ...(current || {}),
                      status: "restarting",
                      progress: 0,
                      seeders: 0,
                      speed_bps: 0,
                      size_bytes: latestSizeBytes,
                      downloaded_bytes: 0,
                      updatedAt: Date.now(),
                      attempts,
                    }));

                    const restartResponse = await base44.functions.invoke(
                      "realDebrid",
                      {
                        action: "restart_playback_torrent",
                        torrent_id: currentTorrentId,
                        info_hash: activeHash,
                        magnet: repairMagnet,
                        prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),
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
                        ...(active?.fileIdx != null &&
                        Number.isFinite(Number(active.fileIdx))
                          ? { file_idx: Number(active.fileIdx) }
                          : {}),
                      }
                    );

                    const restartData = restartResponse?.data || {};

                    if (
                      restartData.error_code ===
                      "RD_RESTART_RESUMED_STALE_PARTIAL"
                    ) {
                      markSourceFailed(activeIdx);
                      markTorrentHashFailed(active);
                      const nextSource = findNextPlayableSource(activeIdx);

                      if (nextSource !== -1) {
                        setRdPolling(false);
                        setRdTorrentId(null);
                        setRdPreparation(null);
                        setRdError("");
                        switchToSource(nextSource, {
                          preservePosition: true,
                          statusMessage:
                            `Real-Debrid re-created this torrent at the same stuck ${Math.round(Number(restartData.previous_progress || latestProgress || 0))}% and it still did not move. Trying a different torrent hash for the same title…`,
                        });
                        return;
                      }

                      setRdPolling(false);
                      setRdTorrentId(null);
                      setRdPreparation((current) => ({
                        ...(current || {}),
                        status: "stalled",
                        stallReason: "rd_partial_state_persisted",
                        progress: Number(restartData.fresh_progress || restartData.previous_progress || latestProgress || 0),
                        updatedAt: Date.now(),
                      }));
                      setRdError(
                        `${restartData.error || "Real-Debrid kept the same stalled partial state for this torrent hash."} No different torrent hash is currently available for this title.`
                      );
                      return;
                    }

                    if (restartData.status === "ready" && restartData.stream_url) {
                      setRdOverride({
                        src: restartData.stream_url,
                        label:
                          restartData.filename ||
                          active?.label ||
                          "Real-Debrid Stream",
                        file: currentFilePath(restartData.files),
                        audioRescue: restartData.audio_rescue || null,
                        fallbackSrc: restartData.fallback_stream_url || "",
                        videoRescue: restartData.video_rescue || null,
                        mediaInfo: restartData.media_info || null,
                      });
                      setRdFiles(restartData.files || []);
                      setRdPolling(false);
                      setRdTorrentId(null);
                      setRdPreparation(null);
                      setRdError("");
                      return;
                    }

                    if (restartData.torrent_id) {
                      setRdPolling(true);
                      setRdTorrentId(String(restartData.torrent_id));
                      setRdError("");
                      setRdPreparation({
                        ...(restartData.torrent_progress || {}),
                        status:
                          restartData.torrent_progress?.status ||
                          restartData.rd_status ||
                          "restarting",
                        startedAt: Date.now(),
                        updatedAt: Date.now(),
                        attempts: 0,
                      });

                      window.dispatchEvent(
                        new CustomEvent("mg:player-status", {
                          detail: {
                            message:
                              `Real-Debrid stalled at ${latestProgress.toFixed(0)}% — the exact torrent job was deleted and re-created.`,
                          },
                        })
                      );
                      return;
                    }

                    throw new Error(
                      restartData.error ||
                        "Real-Debrid did not return a fresh torrent after the restart."
                    );
                  } catch (repairError) {
                    setRdError(
                      repairError?.message ||
                        "Real-Debrid could not restart this exact torrent."
                    );
                  }
                }
              }

              /*
               * If the same-torrent repair was already attempted and this hash
               * still cannot progress, keep it selected and report the real RD
               * state. Do not disguise the fault by hopping to another source.
               */
              setRdPolling(false);
              setRdTorrentId(null);
              setRdPreparation((current) => ({
                ...(current || {}),
                status: "stalled",
                stallReason: "no_progress",
                torrent_id: String(rdTorrentId || current?.torrent_id || ""),
                progress: latestProgress,
                seeders: latestSeeders,
                speed_bps: latestSpeed,
                updatedAt: Date.now(),
                attempts,
              }));
              setRdError(
                latestProgress <= 0.001
                  ? activelyDownloading
                    ? `Real-Debrid is still reporting download speed, but the rounded percentage has not moved for about ${flatlineMinutes} minute${flatlineMinutes === 1 ? "" : "s"}. The torrent has been left in Real-Debrid; Retry to reconnect or choose another source manually.`
                    : latestSeeders > 0
                      ? "Real-Debrid still sees seeders but has reported no download speed for about 15 minutes. The torrent has been left in Real-Debrid; Retry to reconnect or choose another source manually."
                      : sourceReportedSeeders > 0
                        ? "The addon reported seeders, but Real-Debrid has found no live peer activity for several minutes. The torrent has been left in Real-Debrid; Retry or choose another source manually."
                        : "Real-Debrid has found no live peer activity for this torrent for several minutes. The torrent has been left in Real-Debrid; Retry or choose another source manually."
                  : activelyDownloading
                    ? `Real-Debrid has remained at ${latestProgress.toFixed(2)}% for about ${flatlineMinutes} minute${flatlineMinutes === 1 ? "" : "s"} while still reporting download speed. The torrent has been left in Real-Debrid; Retry to reconnect or choose another source manually.`
                    : latestSeeders > 0
                      ? `Real-Debrid has remained at ${latestProgress.toFixed(2)}% with seeders but no download speed for about 15 minutes. The torrent has been left in Real-Debrid; Retry or choose another source manually.`
                      : `Real-Debrid has remained at ${latestProgress.toFixed(2)}% with no peer activity for several minutes. The torrent has been left in Real-Debrid; Retry or choose another source manually.`
              );
              return;
            }

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
                  ? activelyDownloading
                    ? "Real-Debrid kept reporting download speed but the whole-percent progress value did not advance for about 30 minutes. Trying another torrent."
                    : latestSeeders > 0
                      ? "Real-Debrid still saw seeders but reported no download speed for about 15 minutes. Trying another torrent."
                      : hasOriginalTrackerMagnet
                        ? "Real-Debrid could not establish peer activity for this original tracker magnet after about 3 minutes. Trying another torrent."
                        : sourceReportedSeeders > 0
                          ? "The source reported seeders, but Real-Debrid still found no live peer activity after about 2 minutes. Trying another torrent."
                          : "Real-Debrid found no peer activity after about 2 minutes. Trying another torrent."
                  : activelyDownloading
                    ? `Real-Debrid stayed at ${latestProgress.toFixed(2)}% for about 30 minutes despite continuing to report download speed. Trying another source.`
                    : latestSeeders > 0
                      ? `Real-Debrid stayed at ${latestProgress.toFixed(2)}% with seeders but no download speed for about 15 minutes. Trying another source.`
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
            1440
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

            setRdPreparation((current) => ({
              ...(current || {}),
              status: "stalled",
              stallReason: "monitoring_timeout",
              progress: latestProgress,
              seeders: latestSeeders,
              speed_bps: latestSpeed,
              updatedAt: Date.now(),
              attempts,
            }));

            setRdError(
              latestProgress > 0
                ? `Media God monitored this Real-Debrid download for about 2 hours and it is still at ${Math.round(latestProgress)}%.${stalledHint} The torrent has been left in Real-Debrid; Retry to reconnect or choose another source.`
                : `Media God monitored this Real-Debrid torrent for about 2 hours without usable progress.${stalledHint} The torrent has been left in Real-Debrid; Retry or choose another source.`
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
      rdManualFileSelection,
    ]
  );

  useEffect(
    () => {
      failedSourcesRef.current =
        new Set();
      failedTorrentHashesRef.current =
        readPersistentFailedTorrentHashes();
      repairedStuckTorrentHashesRef.current =
        new Set();

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
   * Failed-hash history is still useful when choosing an automatic backup for
   * ordinary playback, but it must never auto-skip a source the user has just
   * selected or retried. Uncached caching attempts now remain visible until
   * they succeed, the user retries them, or the user manually chooses another
   * source.
   */

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
        alternateEmbedFallback?.url ||
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
          alternateEmbedFallback?.url
            ? "provider"
            : rdOverride
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

  useEffect(() => {
    if (!alternateEmbedFallback?.url) return undefined;

    const onAlternatePlayerEvent = (event) => {
      if (event?.origin !== "https://vaplayer.ru") return;
      if (event?.data?.type !== "PLAYER_EVENT") return;

      const payload = event?.data?.data || {};
      const time = Math.max(0, Number(payload?.player_progress || 0));
      const duration = Math.max(0, Number(payload?.player_duration || 0));

      if (time > 0) {
        lastPosRef.current = { t: time, d: duration };
        saveProgressRef.current?.(
          time,
          duration,
          payload?.player_status === "completed"
        );
      }
    };

    window.addEventListener("message", onAlternatePlayerEvent);
    return () => window.removeEventListener("message", onAlternatePlayerEvent);
  }, [alternateEmbedFallback?.url]);

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
    if (
      !isLive ||
      sources.length <= 1 ||
      isNativeFireTvPlayerAvailable()
    ) {
      /*
       * Do not run the browser startup/stall watchdog while Fire TV Media3 is
       * playing Live TV. There is deliberately no HTMLVideoElement in native
       * mode, so the old watchdog could time out a stream that was already
       * playing and switch to another source/player behind it.
       */
      return undefined;
    }

    let video = null;
    let attachTimer = null;
    let startupTimer = null;
    let stallTimer = null;
    let switched = false;
    const nativeLivePlayback = isNativeFireTvPlayerAvailable();
    const startupGraceMs = nativeLivePlayback ? 16000 : 12000;
    const stallGraceMs = nativeLivePlayback ? 10000 : 8000;

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

      tryNextSource(message, {
        liveFailureClass: stalled ? "stall" : "startup",
      });
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
      }, stallGraceMs);
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
    }, startupGraceMs);

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
        const parentTorrentId = String(
          file?.torrent_id ||
            file?.torrentId ||
            rdPreparation?.torrent_id ||
            rdTorrentId ||
            active?.rdTorrentId ||
            ""
        ).trim();

        if (!parentTorrentId) {
          setRdError(
            "This extra is not linked yet and Media God no longer has the parent Real-Debrid torrent id. Reopen the title and choose the extra again."
          );
          return;
        }

        setFileSwitching(true);
        setRdError("");
        setRdPreparation({
          status: "starting",
          phase: "starting",
          progress: 0,
          torrent_id: parentTorrentId,
          selected_file_path: file?.path || "",
          manual_file_selection: true,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        });

        try {
          const response = await base44.functions.invoke(
            "realDebrid",
            {
              action: "select_torrent_file",
              torrent_id: parentTorrentId,
              file_id: file?.id,
              file_path: file?.path || "",
              magnet: richestSourceMagnet(active),
              title: source?.rdTitle || source?.title || "",
              ...(source?.rdYear != null ? { year: source.rdYear } : {}),
              ...(source?.rdSeason != null ? { season: source.rdSeason } : {}),
              ...(source?.rdEpisode != null ? { episode: source.rdEpisode } : {}),
              prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),
            }
          );

          if (!actionStillCurrent()) {
            return;
          }

          const data = response?.data || {};

          if (data?.error || data?.status === "failed") {
            throw new Error(
              data?.error || "Real-Debrid could not prepare the selected extra."
            );
          }

          if (data?.status === "ready" && data?.stream_url) {
            setRdOverride({
              src: data.stream_url,
              label:
                data.filename ||
                file?.path ||
                "Real-Debrid Extra",
              file: file?.path || data.filename || "",
              provider: "realdebrid",
              audioRescue: data.audio_rescue || null,
              fallbackSrc: data.fallback_stream_url || "",
              videoRescue: data.video_rescue || null,
              mediaInfo: data.media_info || null,
            });

            if (Array.isArray(data.files) && data.files.length > 0) {
              setRdFiles((current) => {
                const byPath = new Map(
                  data.files.map((entry) => [String(entry?.path || ""), entry])
                );
                return current.length > 0
                  ? current.map((entry) => {
                      const replacement = byPath.get(String(entry?.path || ""));
                      return replacement && (replacement?.link || replacement?.selected)
                        ? { ...entry, ...replacement }
                        : entry;
                    })
                  : data.files;
              });
            }

            setRdManualFileSelection(null);
            setRdTorrentId(null);
            setRdPreparation(null);
            setRdPolling(false);
            return;
          }

          const selectedTorrentId = String(data?.torrent_id || "").trim();
          if (!selectedTorrentId) {
            throw new Error(
              "Real-Debrid accepted the selected extra but did not return a torrent id to monitor."
            );
          }

          const manualSelection = {
            fileId: Number(data?.selected_file_id ?? file?.id),
            path: String(data?.selected_file_path || file?.path || ""),
            parentTorrentId,
          };

          setRdManualFileSelection(manualSelection);
          setRdTorrentId(selectedTorrentId);
          setRdPreparation({
            ...(data?.torrent_progress || {}),
            status:
              data?.rd_status ||
              data?.torrent_progress?.status ||
              "preparing",
            phase:
              Number(data?.torrent_progress?.progress || 0) >= 100
                ? "finalizing"
                : "downloading",
            torrent_id: selectedTorrentId,
            parent_torrent_id: parentTorrentId,
            selected_file_path: manualSelection.path,
            manual_file_selection: true,
            startedAt: Date.now(),
            updatedAt: Date.now(),
          });
          setRdPolling(true);

          if (Array.isArray(data.files) && data.files.length > 0) {
            setRdFiles((current) => {
              const byPath = new Map(
                data.files.map((entry) => [String(entry?.path || ""), entry])
              );
              return current.length > 0
                ? current.map((entry) => {
                    const replacement = byPath.get(String(entry?.path || ""));
                    return replacement && (replacement?.link || replacement?.selected)
                      ? { ...entry, ...replacement }
                      : entry;
                  })
                : data.files;
            });
          }
        } catch (error) {
          if (actionStillCurrent()) {
            setRdManualFileSelection(null);
            setRdTorrentId(null);
            setRdPreparation(null);
            setRdPolling(false);
            setRdError(
              error?.message || "Real-Debrid could not prepare the selected extra."
            );
          }
        } finally {
          if (actionStillCurrent()) {
            setFileSwitching(false);
          }
        }

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
              prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),
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
    async () => {
      streamActionGenerationRef.current += 1;
      setFileSwitching(false);

      if (sourceNeedsCaching(active)) {
        retryExistingTorrentIdRef.current = String(
          rdPreparation?.torrent_id ||
            rdTorrentId ||
            ""
        ).trim();
        rdCacheEngineAbortRef.current?.abort?.();
        clearSourceFailed(activeIdx);
        setRdOverride(null);
        setRdFiles([]);
        setRdTorrentId(null);
        setRdPreparation(null);
        setRdError("");
        setRdPolling(false);
        setRdResolving(true);
        setRdCacheEngineNonce((value) => value + 1);
        return;
      }

      const retryHash = sourceTorrentHash(active);
      const retryMagnet = richestSourceMagnet(active);
      const stalledNoProgress =
        String(rdPreparation?.status || "").toLowerCase() === "stalled" &&
        String(rdPreparation?.stallReason || "").toLowerCase() === "no_progress";
      const retryTorrentId = String(
        rdPreparation?.torrent_id ||
          rdTorrentId ||
          ""
      ).trim();

      if (
        stalledNoProgress &&
        retryHash &&
        retryMagnet &&
        retryTorrentId
      ) {
        setRdOverride(null);
        setRdFiles([]);
        setRdError("");
        setRdResolving(true);
        setRdPolling(false);
        setRdPreparation((current) => ({
          ...(current || {}),
          status: "restarting",
          progress: 0,
          seeders: 0,
          speed_bps: 0,
          downloaded_bytes: 0,
          updatedAt: Date.now(),
        }));

        try {
          const restartResponse = await base44.functions.invoke(
            "realDebrid",
            {
              action: "restart_playback_torrent",
              torrent_id: retryTorrentId,
              info_hash: retryHash,
              magnet: retryMagnet,
              prefer_browser_transcode: prefersMobileBrowserRdCompatibility(),
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

          const restartData = restartResponse?.data || {};

          if (
            restartData.error_code ===
            "RD_RESTART_RESUMED_STALE_PARTIAL"
          ) {
            markSourceFailed(activeIdx);
            markTorrentHashFailed(active);
            const nextSource = findNextPlayableSource(activeIdx);

            if (nextSource !== -1) {
              setRdResolving(false);
              setRdPolling(false);
              setRdTorrentId(null);
              setRdPreparation(null);
              setRdError("");
              switchToSource(nextSource, {
                preservePosition: true,
                statusMessage:
                  `Real-Debrid re-created this torrent at the same stuck ${Math.round(Number(restartData.previous_progress || 0))}% and it still did not move. Trying a different torrent hash for the same title…`,
              });
              return;
            }

            setRdResolving(false);
            setRdPolling(false);
            setRdTorrentId(null);
            setRdPreparation((current) => ({
              ...(current || {}),
              status: "stalled",
              stallReason: "rd_partial_state_persisted",
              progress: Number(restartData.fresh_progress || restartData.previous_progress || 0),
              updatedAt: Date.now(),
            }));
            setRdError(
              `${restartData.error || "Real-Debrid kept the same stalled partial state for this torrent hash."} No different torrent hash is currently available for this title.`
            );
            return;
          }

          if (restartData.status === "ready" && restartData.stream_url) {
            setRdOverride({
              src: restartData.stream_url,
              label:
                restartData.filename ||
                active?.label ||
                "Real-Debrid Stream",
              file: currentFilePath(restartData.files),
              audioRescue: restartData.audio_rescue || null,
              fallbackSrc: restartData.fallback_stream_url || "",
              videoRescue: restartData.video_rescue || null,
              mediaInfo: restartData.media_info || null,
            });
            setRdFiles(restartData.files || []);
            setRdTorrentId(null);
            setRdPreparation(null);
            setRdResolving(false);
            return;
          }

          if (restartData.torrent_id) {
            setRdTorrentId(String(restartData.torrent_id));
            setRdPreparation({
              ...(restartData.torrent_progress || {}),
              status:
                restartData.torrent_progress?.status ||
                restartData.rd_status ||
                "restarting",
              torrent_id: String(restartData.torrent_id),
              startedAt: Date.now(),
              updatedAt: Date.now(),
              attempts: 0,
            });
            setRdPolling(true);
            setRdResolving(false);
            return;
          }

          throw new Error(
            restartData.error ||
              "Real-Debrid did not return a fresh torrent after the restart."
          );
        } catch (error) {
          setRdResolving(false);
          setRdPreparation((current) => ({
            ...(current || {}),
            status: "stalled",
            stallReason: "no_progress",
            torrent_id: retryTorrentId,
            updatedAt: Date.now(),
          }));
          setRdError(
            error?.message ||
              "Real-Debrid could not restart this exact torrent."
          );
          return;
        }
      }

      retryInactiveTorrentHashRef.current =
        stalledNoProgress && retryHash
          ? retryHash
          : "";

      setRdOverride(null);
      setRdFiles([]);
      setRdTorrentId(null);
      setRdPreparation(null);
      setRdError("");
      setRdResolving(true);

      const current = activeIdx;
      setActiveIdx(-1);
      setTimeout(() => {
        setActiveIdx(current);
      }, 0);
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

  const handleDirectPlaybackError = (eventOrOptions = null) => {
    const reportedLiveErrorMessage =
      eventOrOptions instanceof Error
        ? String(eventOrOptions.message || "")
        : "";
    const explicitLiveFailureClass =
      typeof eventOrOptions === "string"
        ? eventOrOptions
        : String(eventOrOptions?.liveFailureClass || "") ||
          (reportedLiveErrorMessage
            ? classifyLiveFailure(reportedLiveErrorMessage)
            : "");

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
      "This stream failed during playback.",
      {
        liveFailureClass:
          explicitLiveFailureClass ||
          (source?.type === "live" || active?.live || active?.type === "live"
            ? mediaElementFailureClass()
            : ""),
      }
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
    !alternateEmbedFallback?.url &&
    nativePlaybackAvailable &&
    (isLive || forceNativePlayback || isFireTvRemoteRuntime());

  const fireTvNativeSelectorMode =
    !alternateEmbedFallback?.url &&
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

      if (detail?.diagnostics) {
        try {
          const history = Array.isArray(window.__MG_NATIVE_PLAYBACK_DIAGNOSTICS__)
            ? window.__MG_NATIVE_PLAYBACK_DIAGNOSTICS__
            : [];
          const entry = {
            ...detail.diagnostics,
            requestId: String(detail.requestId || ""),
            reason: String(detail.reason || ""),
          };
          const nextHistory = [...history.slice(-49), entry];
          window.__MG_NATIVE_PLAYBACK_DIAGNOSTICS__ = nextHistory;
          window.localStorage.setItem(
            "mg:native-playback-diagnostics:v1",
            JSON.stringify(nextHistory)
          );
          window.dispatchEvent(
            new CustomEvent("mg:native-playback-diagnostic", { detail: entry })
          );
          console.info("[Media God native playback]", entry);

          const diagnosticFailure =
            Number(entry.compatibilityErrorCode || 0) > 0 ||
            /decoder|codec|format|profile|unsupported/i.test(
              `${entry.compatibilityError || ""} ${entry.compatibilityReason || ""} ${entry.message || ""}`
            );
          if (diagnosticFailure) {
            recordPlaybackReliability(
              sourceDisplayLabel(active, activeIdx),
              "failure"
            );
          }
        } catch {
          // Diagnostics must never interrupt playback.
        }
      }

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
        recordPlaybackReliability(
          sourceDisplayLabel(active, activeIdx),
          "failure"
        );

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

        if (isLive && /^https?:\/\//i.test(String(activeUrl || ""))) {
          recordLiveTvPlaybackResult(String(activeUrl), {
            success: false,
            stalled: false,
          });
        }

        if (rdOverride) {
          handleRdPlaybackError();
        } else {
          handleDirectPlaybackError({ liveFailureClass: "native" });
        }

        return;
      }

      if (
        reason === "ended" &&
        !isLive
      ) {
        recordPlaybackReliability(
          sourceDisplayLabel(active, activeIdx),
          "good"
        );

        const playerContext =
          typeof window !== "undefined"
            ? window.__MG_PLAYER_CONTEXT__ || {}
            : {};

        if (
          playerContext?.mediaType === "tv" &&
          playerContext?.autoNext !== false
        ) {
          window.dispatchEvent(
            new CustomEvent("mg:native-playback-ended", {
              detail: {
                positionSeconds,
                durationSeconds,
              },
            })
          );
          return;
        }
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
      drm:
        rdOverride?.drm ||
        active?.drm ||
        null,
      audioLanguage: trackPreferences.audioLanguage,
      subtitleLanguage: trackPreferences.subtitleLanguage,
      subtitlesEnabled: trackPreferences.subtitlesEnabled,
      preferForcedSubtitles: trackPreferences.preferForcedSubtitles,
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
    if (!isLive) {
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
    }

    /*
     * Live TV is different: once Media3 accepts the handoff it is the only
     * playback owner. A WebView timeout must never decide that native playback
     * failed and start a second player/source behind an already-running stream.
     * PlayerActivity reports real native errors back through
     * mg:native-player-result, which remains the single failover authority.
     */
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


  /* Automatic no-sound recovery is proactive for codec combinations that are
   * commonly silent on Android/Fire TV/browser decoders, and immediate for a
   * source that this device has already remembered as silent. */
  useEffect(() => {
    if (
      isLive || isYoutube || isProvider || rdResolving || rdPolling ||
      rdTorrentId || rdPreparation || readPlaybackPreferences().automaticNoSoundRecovery === false
    ) {
      return undefined;
    }

    const candidate = rdOverride
      ? { ...active, src: rdOverride.src || activeUrl, label: rdOverride.label || active?.label }
      : active;
    const label = sourceDisplayLabel(candidate, activeIdx);
    const traits = detectStreamTraits(candidate, label);
    const rememberedSilent = hasRecentNoSoundHistory(label);
    if (!rememberedSilent && !traits.audioRisk) return undefined;

    const timer = window.setTimeout(() => {
      const video = stageRef.current?.querySelector("video");
      if (
        video instanceof HTMLVideoElement &&
        !video.paused && !video.ended && !video.error
      ) {
        handleNoSoundRef.current?.({ automatic: true });
      }
    }, rememberedSilent ? 2200 : 4200);

    return () => window.clearTimeout(timer);
  }, [
    active, activeIdx, activeUrl, isLive, isProvider, isYoutube,
    rdOverride, rdPolling, rdResolving, rdTorrentId, rdPreparation,
  ]);

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

      /*
       * Manual source selection owns the player while its native selector is
       * open. Do not let the compatibility watchdog update state or switch
       * sources underneath the Android/Fire TV selection dialog.
       */
      if (
        sourceSelectorPinnedRef.current ||
        rdFileSelectorPinnedRef.current
      ) {
        state.timer = window.setTimeout(
          () => rescue(remainingChecks, previousTime),
          750
        );
        return;
      }

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

  const rdPreparationStatus = String(
    rdPreparation?.status || ""
  ).toLowerCase();
  const rdPreparationTerminal =
    /^(?:comet_start_failed|stalled|dead|error|magnet_error|virus)$/.test(
      rdPreparationStatus
    );

  const busy =
    rdResolving ||
    rdPolling ||
    !!rdTorrentId ||
    (!!rdPreparation && !rdPreparationTerminal);

  const displayedError =
    rdError ||
    "";

  const friendlyError =
    friendlyPlaybackError(
      displayedError
    );

  const sourceCacheStateLabel = (item, index) => {
    const base = concisePlaybackSourceLabel(item, index);
    const hash = sourceTorrentHash(item);
    const runtimeReady = Boolean(
      hash && runtimeReadyTorrentHashes.has(hash)
    );

    if (runtimeReady || item?.debridCached === true) {
      return `Cached / Ready • ${base}`;
    }

    if (sourceNeedsCaching(item)) {
      return `Uncached • ${base}`;
    }

    return base;
  };

  const activeSourceLabel =
    sourceCacheStateLabel(
      active,
      activeIdx
    );

  const activeLiveSourcePosition = isLive
    ? liveSourcePosition(activeIdx)
    : { current: 0, total: 0 };

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

  const cachePhase = cachePhaseDetails(rdPreparation || {});
  const cacheStatusLabel = cachePhase.label;

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

  const cachePollWarning = String(
    rdPreparation?.lastPollError || ""
  ).trim();

  const cacheHint =
    cachePollWarning && rdPolling
      ? "Real-Debrid's status check was interrupted. Media God is retrying the check without cancelling the torrent download."
      : cachePhase.key === "finalizing" || cacheProgress >= 100
      ? "Download is complete. Real-Debrid is preparing the playable link. Playback will begin automatically."
      : cacheSeeders <= 0 &&
          cacheSpeedBps <= 0 &&
          cacheElapsedSeconds >= 30
        ? sourceReportedSeeders > 0
          ? `Comet found ${sourceReportedSeeders} seeder${sourceReportedSeeders === 1 ? "" : "s"}, but Real-Debrid currently reports no active peers. Media God will keep this source selected while it checks.`
          : "Real-Debrid reports no active seeders. Media God will keep this source selected rather than silently switching torrents."
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
            ? cachePhase.key === "downloading"
              ? `${cacheStatusLabel} ${cacheProgress}%`
              : cacheStatusLabel
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
      data-mg-rd-cache-source={sourceNeedsCaching(active) ? "true" : "false"}
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

                {isLive && activeLiveSourcePosition.total > 0 ? (
                  <span className="shrink-0 font-semibold text-white/60">
                    Source {activeLiveSourcePosition.current || 1}/{activeLiveSourcePosition.total}
                  </span>
                ) : selectableSourceCount > 0 ? (
                  <span className="shrink-0">
                    {selectableSourceCount} {selectableSourceCount === 1 ? "source" : "sources"}
                  </span>
                ) : null}

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
                        Step {cachePhase.step}/5 · {cacheStatusLabel}
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
          ) : displayedError ? (
            <div className="flex max-w-lg flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-amber-200">
                <VolumeX className="h-6 w-6" />
              </div>

              <p className="text-sm font-semibold text-white/85 sm:text-base">
                {sourceNeedsCaching(active)
                  ? "This torrent needs attention"
                  : "This source is unavailable"}
              </p>

              <p className="max-w-md text-xs leading-relaxed text-white/50 sm:text-sm">
                {friendlyError || "Media God rejected an error/status stream instead of playing it as video."}
              </p>

              {isRdSource && (
                <button
                  type="button"
                  onClick={retryResolution}
                  className="mt-1 flex min-h-10 items-center gap-2 rounded-lg bg-mg-green px-4 text-xs font-bold text-black hover:bg-mg-green-dim focus:outline-none focus:ring-2 focus:ring-white/70"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry this source
                </button>
              )}
            </div>
          ) : alternateEmbedFallback?.url ? (
            <iframe
              data-mg-alternate-embed-fallback="true"
              src={alternateEmbedFallback.url}
              title={`${source?.title || "Video"} alternate stream`}
              className="w-full h-full bg-black"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
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
                isLive={isLive}
                headers={
                  rdOverride?.headers ||
                  active?.headers ||
                  active?.requestHeaders ||
                  {}
                }
                drm={rdOverride?.drm || active?.drm || null}
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
                isLive={isLive}
                headers={active?.headers || active?.requestHeaders || {}}
                drm={active?.drm || null}
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

          {isLive && liveRecoveryNotice?.message && (
            <div
              data-mg-live-recovery-notice="true"
              className={`pointer-events-none absolute left-1/2 top-3 z-50 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full border px-3 py-1.5 text-center text-[11px] font-semibold shadow-xl backdrop-blur-md sm:text-xs ${
                liveRecoveryNotice.kind === "error"
                  ? "border-red-400/30 bg-red-950/85 text-red-100"
                  : liveRecoveryNotice.kind === "connected"
                    ? "border-mg-green/30 bg-black/80 text-mg-green"
                    : "border-amber-300/25 bg-black/85 text-amber-100"
              }`}
            >
              {liveRecoveryNotice.message}
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
                      onKeyDown={(event) => {
                        if (selectorOpenKey(event)) pinSourceSelector();
                      }}
                      onBlur={releaseSourceSelector}
                      onChange={(
                        event
                      ) => {
                        const value = event.target.value;
                        const selectedEntry = visibleSourceSelectorEntries.find(
                          (entry) => String(entry.index) === String(value)
                        );
                        releaseSourceSelector();
                        selectSource(value, selectedEntry?.item || null);
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
                          const label = sourceCacheStateLabel(item, index);

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
            <label className="w-[9.5rem] shrink-0 sm:w-[11.5rem]">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                Sort / edition
              </span>

              <select
                value={sourceSortMode}
                onChange={(event) => {
                  const next = writeSourceSortMode(event.target.value);
                  setSourceSortMode(next);

                  if (next.startsWith("edition:")) {
                    const edition = next.slice("edition:".length);
                    const match = sortSourceEntries(sources, next).find((entry) =>
                      sourceHasEdition(entry.item, edition)
                    );

                    if (match && match.index !== activeIdx) {
                      selectSource(match.index, match.item);
                    }
                  }
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
                  onKeyDown={(event) => {
                    if (selectorOpenKey(event)) pinSourceSelector();
                  }}
                  onBlur={releaseSourceSelector}
                  onChange={(event) => {
                    const value = event.target.value;
                    const selectedEntry = visibleSourceSelectorEntries.find(
                      (entry) => String(entry.index) === String(value)
                    );
                    releaseSourceSelector();
                    selectSource(value, selectedEntry?.item || null);
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
                      const label = sourceCacheStateLabel(item, index);

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
                  onKeyDown={(event) => {
                    if (selectorOpenKey(event)) pinRdFileSelector();
                  }}
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
