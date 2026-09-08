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
import { readTrackPreferences } from "@/components/mg/mediaTrackPreferences";
import { readPlaybackPreferences } from "@/components/mg/playbackPreferences";
import {
  hasRecentNoSoundHistory,
  playbackReliabilityAdjustment,
  recordPlaybackReliability,
} from "@/components/mg/playbackReliability";
import {
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

  const [rdOverride, setRdOverride] =
    useState(null);

  const [rdFiles, setRdFiles] =
    useState([]);

  const [rdTorrentId, setRdTorrentId] =
    useState(null);

  const [fileSwitching, setFileSwitching] =
    useState(false);

  const [
    failedSources,
    setFailedSources,
  ] = useState(() => new Set());

  const failedSourcesRef =
    useRef(new Set());

  const videoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const pollRef = useRef(null);
  const recoveryResumeRef = useRef(0);
  const preparedBackupsRef = useRef(new Map());
  const prewarmGenerationRef = useRef(0);
  const torrentFailoverTimerRef = useRef(null);
  const autoAudioRescueRef = useRef({
    key: "",
    timer: null,
  });
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

    const directBonus = /^https?:\/\//i.test(
      String(getSourceUrl(item) || "")
    )
      ? 2500
      : 0;

    const rdBonus = item?.viaRealDebrid ? 5000 : 0;
    const liveBonus =
      item?.live || item?.type === "live"
        ? liveTvUrlScore(getSourceUrl(item))
        : 0;

    return compatibility + learned + directBonus + rdBonus + liveBonus;
  };

  const markSourceFailed = (index) => {
    failedSourcesRef.current.add(index);

    setFailedSources(
      new Set(
        failedSourcesRef.current
      )
    );
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
    const candidates = sources
      .map((candidate, index) => {
        const url = getSourceUrl(candidate);
        const torrent =
          candidate?.type === "rd" ||
          candidate?.type === "rd_torrent" ||
          candidate?.type === "torrent" ||
          candidate?.type === "magnet" ||
          isMagnet(url);

        if (
          index === fromIndex ||
          failedSourcesRef.current.has(index) ||
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
          score: recoverySourceScore(candidate, index),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.index - b.index);

    return candidates[0]?.index ?? -1;
  };

  const switchToSource = (
    nextIndex,
    {
      preservePosition = true,
      statusMessage = "",
    } = {}
  ) => {
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
    setRdError("");
    setRdResolving(false);
    setRdPolling(false);

    const prepared =
      preparedBackupsRef.current.get(nextIndex);
    const candidate = sources[nextIndex];
    const candidateUrl = getSourceUrl(candidate);

    if (
      prepared?.override?.src &&
      (!prepared.sourceUrl || prepared.sourceUrl === candidateUrl)
    ) {
      setRdOverride(prepared.override);
      setRdFiles(
        Array.isArray(prepared.files)
          ? prepared.files
          : []
      );
    } else {
      setRdOverride(null);
      setRdFiles([]);
    }

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
      "This source could not be played."
  ) => {
    markSourceFailed(
      activeIdx
    );

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

  const isDirectFile =
    active?.type === "file" ||
    active?.type === "url" ||
    active?.type === "live";

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
    preparedBackupsRef.current.clear();
    prewarmGenerationRef.current += 1;

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

  const goFullscreen = () => {
    const stage =
      stageRef.current;

    if (
      !stage
    ) {
      return;
    }

    /*
     * IMPORTANT:
     * Never call requestFullscreen() or
     * webkitEnterFullscreen() here.
     *
     * Android WebView can hand fullscreen over to
     * the native activity and close/restart the app.
     * Media God therefore uses safe in-app fullscreen
     * by expanding the existing stage with CSS.
     */
    const currentlyFullscreen =
      stage.dataset
        .mgFullscreen ===
      "true";

    if (
      currentlyFullscreen
    ) {
      const previousStyle =
        stage.dataset
          .mgPreviousStyle ||
        "";

      if (
        previousStyle
      ) {
        stage.setAttribute(
          "style",
          previousStyle
        );
      } else {
        stage.removeAttribute(
          "style"
        );
      }

      delete stage.dataset
        .mgFullscreen;

      delete stage.dataset
        .mgPreviousStyle;

      setIsAppFullscreen(
        false
      );

      return;
    }

    stage.dataset
      .mgPreviousStyle =
      stage.getAttribute(
        "style"
      ) || "";

    stage.dataset
      .mgFullscreen =
      "true";

    setIsAppFullscreen(
      true
    );

    Object.assign(
      stage.style,
      {
        position:
          "fixed",

        top:
          "0",

        right:
          "0",

        bottom:
          "0",

        left:
          "0",

        width:
          "100vw",

        height:
          "100vh",

        maxWidth:
          "none",

        maxHeight:
          "none",

        margin:
          "0",

        padding:
          "0",

        border:
          "0",

        borderRadius:
          "0",

        aspectRatio:
          "auto",

        background:
          "#000",

        overflow:
          "hidden",

        zIndex:
          "2147483647",
      }
    );
  };

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

      const prepared = preparedBackupsRef.current.get(activeIdx);
      if (
        prepared?.sourceUrl === activeUrl &&
        prepared?.override?.src
      ) {
        setRdOverride(prepared.override);
        setRdFiles(prepared.files || []);
        setRdTorrentId(null);
        setRdPolling(false);
        setRdResolving(false);
        preparedBackupsRef.current.delete(activeIdx);
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
            const magnet =
              active?.magnet ||
              active?.magnetLink ||
              active?.src ||
              active?.url ||
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
            const explicitProvider = String(active?.debridProvider || "")
              .toLowerCase()
              .replace(/[^a-z]/g, "");
            let debridProviders = explicitProvider ? [explicitProvider] : [];

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

            if (!source?.hasRd && source?.hasDebrid) {
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

              return;
            }

            if (
              data.torrent_id
            ) {
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

            throw new Error(
              data.error ||
                "Real-Debrid could not resolve this source."
            );
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
              tryNextSource(
                error?.message ||
                  "Unable to resolve this stream."
              );
            }
          }
        };

      run();

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

              return;
            }

            if (
              data.error
            ) {
              setRdError(
                data.error
              );

              setRdPolling(
                false
              );

              setRdTorrentId(
                null
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

          if (
            attempts <
            36
          ) {
            pollRef.current =
              setTimeout(
                tick,
                5000
              );
          } else {
            setRdPolling(
              false
            );

            setRdTorrentId(
              null
            );

            setRdError(
              "Real-Debrid is still preparing this file. Please try Check Again shortly."
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

            if (
              !document
                .fullscreenElement
            ) {
              onClose();

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
            tag ===
              "input" ||
            tag ===
              "textarea" ||
            event.target
              ?.isContentEditable
          ) {
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
      stallTimer = window.setTimeout(
        () =>
          switchLiveSource(
            "Live TV stopped responding.",
            { stalled: true }
          ),
        8500
      );
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

    startupTimer = window.setTimeout(
      () =>
        switchLiveSource(
          "Live TV took too long to start."
        ),
      12000
    );

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
        rdTorrentId
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

      const activeTorrentLike =
        active?.type === "rd" ||
        active?.type === "rd_torrent" ||
        active?.type === "torrent" ||
        active?.type === "magnet" ||
        isMagnet(activeUrl) ||
        Boolean(magnetHash(activeUrl));
      const stallThresholdMs = activeTorrentLike
        ? 28000
        : 16000;

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
          setRdError(
            error?.message || "Debrid file selection failed."
          );
        } finally {
          setFileSwitching(false);
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
        setRdError(
          error?.message ||
            "Real-Debrid request failed."
        );
      } finally {
        setFileSwitching(
          false
        );
      }
    };

  const retryResolution =
    () => {
      setRdOverride(
        null
      );

      setRdFiles(
        []
      );

      setRdTorrentId(
        null
      );

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

  const handleNoSound =
    async (options = {}) => {
      const automatic = options?.automatic === true;

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

        if (hlsHandled) {
          setRdError("");
          return;
        }
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
            setRdResolving(false);
          }
        }
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
        (activeIdx + 1) %
        sources.length;

      if (resumeAt > 5) {
        recoveryResumeRef.current = resumeAt;
      }

      markSourceFailed(
        activeIdx
      );

      clearSourceFailed(
        nextIndex
      );

      setRdOverride(null);
      setRdFiles([]);
      setRdTorrentId(null);
      setRdError("");
      setRdResolving(false);
      setRdPolling(false);

      setActiveIdx(
        nextIndex
      );
    };

  handleNoSoundRef.current = handleNoSound;

  useEffect(() => {
    const state = autoAudioRescueRef.current;

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
      rdOverride?.audioRescue?.used ||
      readPlaybackPreferences().autoRecovery === false
    ) {
      return undefined;
    }

    const mediaInfo =
      rdOverride?.mediaInfo ||
      active?.mediaInfo ||
      active?.media_info ||
      null;
    const inspectedAudio = Array.isArray(mediaInfo?.audio_tracks)
      ? mediaInfo.audio_tracks
      : [];
    const extraAudioText = inspectedAudio
      .map((track) =>
        [
          track?.codec,
          track?.language,
          track?.lang,
          track?.channels,
          track?.label,
        ]
          .filter(Boolean)
          .join(" ")
      )
      .join(" ");
    const candidate = rdOverride
      ? {
          ...active,
          label: rdOverride.label || active?.label,
          audio: extraAudioText,
        }
      : active;
    const label = sourceDisplayLabel(candidate, activeIdx);
    const profile = getPlaybackDeviceProfile();
    const rememberedNoSound = hasRecentNoSoundHistory(label, profile);

    /*
     * Do not abandon a stream purely because metadata says DTS/TrueHD.
     * Fire TV hardware support can be better than WebView codec reporting.
     * Automatic rescue is reserved for sources that this device has actually
     * produced without sound before. First-time risky codecs remain playable
     * and the user can still force the full rescue chain with Fix audio.
     */
    if (!rememberedNoSound) {
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

    const attemptRescue = (remainingChecks = 4) => {
      state.timer = null;

      const video = stageRef.current?.querySelector("video");
      const ready =
        video instanceof HTMLVideoElement &&
        !video.paused &&
        !video.ended &&
        video.readyState >= 2;

      if (!ready) {
        if (remainingChecks > 0) {
          state.timer = window.setTimeout(
            () => attemptRescue(remainingChecks - 1),
            1200
          );
        }
        return;
      }

      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message: rememberedNoSound
              ? "Known audio issue detected — applying automatic audio rescue…"
              : "Audio compatibility risk detected — applying automatic audio rescue…",
          },
        })
      );

      handleNoSoundRef.current?.({ automatic: true });
    };

    state.timer = window.setTimeout(
      () => attemptRescue(4),
      2200
    );

    return () => {
      if (state.timer) {
        window.clearTimeout(state.timer);
        state.timer = null;
      }
    };
  }, [
    activeIdx,
    activeUrl,
    active,
    isLive,
    isYoutube,
    isProvider,
    rdOverride,
    rdResolving,
    rdPolling,
    source,
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
       * the browser reports a real decode/source failure. The normal 14-second
       * stall recovery remains responsible for genuine buffering stalls.
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
      clearSourceFailed(nextIndex);
      setRdOverride(null);
      setRdFiles([]);
      setRdTorrentId(null);
      setRdError("");
      setRdResolving(false);
      setRdPolling(false);
      setActiveIdx(nextIndex);

      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              "Video compatibility rescue · switching to a safer source…",
          },
        })
      );
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
    source,
    sources,
  ]);

  const busy =
    rdResolving ||
    rdPolling ||
    !!rdTorrentId;

  const displayedError =
    rdError ||
    "";

  return (
    <div
      data-mg-player-root="true"
      className="fixed inset-0 z-[2147483646] bg-black/95 flex items-center justify-center p-2 sm:p-3"
      onClick={
        onClose
      }
    >
      <div
        className="w-full max-w-[1500px]"
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        <div data-mg-player-topbar="true" className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              data-mg-player-exit="true"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose?.();
              }}
              className="shrink-0 flex items-center gap-1.5 min-h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-white hover:bg-white/10 hover:border-mg-green/40 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
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

            <h3 className="text-white font-semibold text-sm truncate">
              {
                source?.title
              }
            </h3>
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
                  className="min-h-9 min-w-9 flex items-center justify-center rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
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
          className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center"
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 text-mg-green animate-spin" />

              <p className="text-white/70 text-sm">
                Loading…
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
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
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
                        activeIdx
                      }
                      onChange={(
                        event
                      ) =>
                        selectSource(
                          event.target
                            .value
                        )
                      }
                      className="w-full appearance-none rounded-lg border border-white/15 bg-black/55 py-2.5 pl-3 pr-9 text-xs text-white outline-none backdrop-blur focus:border-mg-green sm:text-sm"
                      aria-label="Choose source or quality while loading"
                    >
                      {sortedSourceEntries.map(
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
                                ? "Failed — "
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
          className="mt-2 flex items-end gap-2"
        >
          {sources.length > 1 && (
            <label className="w-[7.5rem] shrink-0 sm:w-[9rem]">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/50">
                Sort
              </span>

              <select
                value={sourceSortMode}
                onChange={(event) => {
                  const next = writeSourceSortMode(event.target.value);
                  setSourceSortMode(next);
                }}
                className="w-full rounded-lg border border-white/10 bg-mg-card px-2 py-2.5 text-xs text-white outline-none focus:border-mg-green sm:text-sm"
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
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/50">
                Source
              </span>

              <div className="relative">
                <select
                  value={activeIdx}
                  onChange={(event) =>
                    selectSource(
                      event.target.value
                    )
                  }
                  className="w-full appearance-none rounded-lg border border-white/10 bg-mg-card py-2.5 pl-3 pr-9 text-xs text-white outline-none focus:border-mg-green sm:text-sm"
                  aria-label="Choose playback source"
                >
                  {sortedSourceEntries.map(
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
                            ? "Failed — "
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
            rdFiles.length > 1 && (
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/50">
                  Torrent file
                </span>

                <select
                  value={
                    rdFiles.find(
                      (file) =>
                        file.path === rdOverride.file ||
                        file.name === rdOverride.file
                    )?.id ?? ""
                  }
                  onChange={(event) => {
                    const file =
                      rdFiles.find(
                        (item) =>
                          String(item.id) ===
                          String(
                            event.target.value
                          )
                      );

                    if (file) {
                      pickFile(file);
                    }
                  }}
                  disabled={fileSwitching}
                  className="w-full rounded-lg border border-white/10 bg-mg-card px-3 py-2.5 text-xs text-white outline-none focus:border-mg-green disabled:opacity-60 sm:text-sm"
                  aria-label="Choose file"
                >
                  {rdFiles.map(
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

          <button
            type="button"
            data-mg-no-sound="true"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleNoSound();
            }}
            className="shrink-0 flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-mg-card px-3 text-xs font-semibold text-white hover:border-mg-green/40 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green/50"
            aria-label="No sound"
            title="Try another audio track or source"
          >
            <VolumeX className="h-4 w-4" />
            <span>Fix audio</span>
          </button>

        </div>

        {displayedError &&
          !busy && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-xs text-red-300">
                {
                  displayedError
                }
              </p>

              {isRdSource && (
                <button
                  type="button"
                  onClick={
                    retryResolution
                  }
                  className="shrink-0 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
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
