import React, { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Film,
  Globe2,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Square,
  Trophy,
  Tv,
  Volume2,
  Wifi,
  Star,
  Clock3,
  LayoutGrid,
  ListVideo,
} from "lucide-react";

import {
  getFreeTvChannels,
  LIVE_TV_REGION,
} from "@/components/mg/freeTvPlaylist";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import {
  liveTvUrlScore,
  prewarmLiveTvUrl,
  recordLiveTvPlaybackResult,
} from "@/components/mg/liveTvPlaybackLearning";

const DEFAULT_FILTER = "All";
const MAX_VISIBLE = 400;
const GUIDE_VISIBLE = 120;
const LIVE_TV_FAVOURITES_KEY = "mg_live_tv_favourites_v1";
const LIVE_TV_RECENT_KEY = "mg_live_tv_recent_v1";

const readStoredList = (key) => {
  if (typeof window === "undefined") return [];

  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
};

const writeStoredList = (key, values) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Favourites and recent channels are a convenience only.
  }
};

const BBC_RADIO_STREAMS = {
  "bbc radio 1":
    "https://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio%3d320000.norewind.m3u8",
  "bbc radio 1xtra":
    "https://as-hls-ww-live.akamaized.net/pool_92079267/live/ww/bbc_1xtra/bbc_1xtra.isml/bbc_1xtra-audio%3d96000.norewind.m3u8",
  "bbc radio 2":
    "https://as-hls-ww-live.akamaized.net/pool_74208725/live/ww/bbc_radio_two/bbc_radio_two.isml/bbc_radio_two-audio%3d320000.norewind.m3u8",
  "bbc radio 3":
    "https://as-hls-ww-live.akamaized.net/pool_23461179/live/ww/bbc_radio_three/bbc_radio_three.isml/bbc_radio_three-audio%3d320000.norewind.m3u8",
  "bbc radio 4":
    "https://as-hls-ww-live.akamaized.net/pool_55057080/live/ww/bbc_radio_fourfm/bbc_radio_fourfm.isml/bbc_radio_fourfm-audio%3d320000.norewind.m3u8",
  "bbc radio 4 extra":
    "https://as-hls-ww-live.akamaized.net/pool_26173715/live/ww/bbc_radio_four_extra/bbc_radio_four_extra.isml/bbc_radio_four_extra-audio%3d96000.norewind.m3u8",
  "bbc radio 5 live":
    "https://as-hls-ww-live.akamaized.net/pool_89021708/live/ww/bbc_radio_five_live/bbc_radio_five_live.isml/bbc_radio_five_live-audio%3d320000.norewind.m3u8",
  "bbc radio 5 sports extra":
    "https://as-hls-uk-live.akamaized.net/pool_47700285/live/uk/bbc_radio_five_live_sports_extra/bbc_radio_five_live_sports_extra.isml/bbc_radio_five_live_sports_extra-audio%3d96000.norewind.m3u8",
  "bbc radio 6 music":
    "https://as-hls-ww-live.akamaized.net/pool_81827798/live/ww/bbc_6music/bbc_6music.isml/bbc_6music-audio%3d320000.norewind.m3u8",
  "bbc asian network":
    "https://as-hls-ww-live.akamaized.net/pool_22108647/live/ww/bbc_asian_network/bbc_asian_network.isml/bbc_asian_network-audio%3d96000.norewind.m3u8",
  "bbc world service":
    "https://as-hls-ww-live.akamaized.net/pool_87948813/live/ww/bbc_world_service/bbc_world_service.isml/bbc_world_service-audio%3d96000.norewind.m3u8",
};

const RADIO_STREAM_OVERRIDES = {
  ...BBC_RADIO_STREAMS,
  "greatest hits radio":
    "https://stream-mz.hellorayo.co.uk/net2national.mp3?direct=true",
  "greatest hits radio uk":
    "https://stream-mz.hellorayo.co.uk/net2national.mp3?direct=true",
};

const SKY_STREAM_OVERRIDES = {
  "sky sports main event": "https://live20.bozztv.com/trn03/gin-skysportsmainevent/index.m3u8",
  "sky sports premier league": "https://live20.bozztv.com/trn03/gin-skysportspl/index.m3u8",
  "sky sports football": "https://live20.bozztv.com/trn03/gin-skysportsfootball/index.m3u8",
  "sky sports cricket": "https://live20.bozztv.com/trn03/gin-skysportscricket/index.m3u8",
  "sky sports f1": "https://live20.bozztv.com/trn03/gin-skysportsf1/index.m3u8",
  "sky showcase": "https://live20.bozztv.com/trn03/gin-skyshowcase/index.m3u8",
  "sky news": "https://skynews2-plutolive-vo.akamaized.net/playlist.m3u8",
  "gb news": "https://gbnews-live.rakuten.tv/v1/master.m3u8",
  "talktv": "https://live-talktv.uksse.wurl.tv/playlist.m3u8",
  "Bloomberg TV": "https://live.bloomberg.com/kinesis/us-live.m3u8",
  "trrt world": "https://trtworld.ios.bund.cpl.delvenetworks.com/playlist.m3u8",
  "tnt sports 1": "https://live20.bozztv.com/trn03/gin-tntsports1/index.m3u8",
  "tnt sports 2": "https://live20.bozztv.com/trn03/gin-tntsports2/index.m3u8",
  "tnt sports 3": "https://live20.bozztv.com/trn03/gin-tntsports3/index.m3u8",
  "tnt sports 4": "https://live20.bozztv.com/trn03/gin-tntsports4/index.m3u8",
};

const searchText = (value) => String(value || "").toLowerCase().trim();

const normaliseStationName = (value) =>
  searchText(value).replace(/\s+/g, " ").replace(/\s+(uk|hd|fhd)$/i, "").trim();

const channelMemoryKey = (channel) =>
  String(
    channel?.tvgId ||
      channel?.id ||
      normaliseStationName(channel?.name) ||
      "channel"
  );

const isRadioChannel = (channel) => {
  const name = searchText(channel?.name);
  const group = searchText(channel?.group);
  const tags = channel?.tags || [];

  return (
    tags.includes("Radio") ||
    /\bradio\b/.test(name) ||
    /\bradio\b/.test(group) ||
    /\bfm\b/.test(name) ||
    name === "bbc asian network" ||
    name === "bbc world service" ||
    name.includes("greatest hits")
  );
};

const isHlsUrl = (url) => /\.m3u8(?:[?#]|$)/i.test(String(url || ""));

const groupSort = (a, b) => {
  const preferred = ["United Kingdom", "Sports", "Movies"];
  const ai = preferred.indexOf(a);
  const bi = preferred.indexOf(b);

  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }

  return String(a || "").localeCompare(String(b || ""));
};

const epgKeyForChannel = (channel, index = 0) =>
  String(
    channel?.id ||
      channel?.tvgId ||
      `${channel?.name || "channel"}-${index}`
  );

const formatProgrammeTime = (value) => {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const programmeProgress = (programme, now = Date.now()) => {
  if (!programme?.start || !programme?.stop) return 0;
  const start = new Date(programme.start).getTime();
  const stop = new Date(programme.stop).getTime();
  if (!start || !stop || stop <= start) return 0;
  return Math.max(0, Math.min(1, (now - start) / (stop - start)));
};

const qualityLabel = (channel) => {
  const quality = Number(channel?.quality || 0);

  if (quality >= 2160) return "4K";
  if (quality >= 1080) return "1080p";
  if (quality >= 720) return "HD";
  if (quality >= 576) return "576p";
  if (quality > 0) return "SD";

  return "";
};

const playableChannelCandidates = (channel) =>
  [channel, ...(channel?.alternatives || [])]
    .filter(
      (candidate) =>
        candidate?.kind === "direct" &&
        candidate?.url &&
        candidate?.browserPlayable !== false
    )
    .map((candidate, index) => ({
      candidate,
      index,
      score:
        liveTvUrlScore(candidate.url) +
        Number(candidate?.sourcePriority || 0) * 30 +
        Number(candidate?.quality || 0) * 2 +
        (index === 0 ? 900 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ candidate }) => candidate);

const prewarmChannel = (channel) => {
  const candidate = playableChannelCandidates(channel)[0];

  if (candidate?.url) {
    prewarmLiveTvUrl(candidate.url);
  }
};

const radioUrlsFor = (channel) => {
  const seen = new Set();
  const urls = [];

  const add = (value) => {
    const url = String(value || "").trim();

    if (!url || seen.has(url)) {
      return;
    }

    seen.add(url);
    urls.push(url);
  };

  const normalised = normaliseStationName(channel?.name);

  add(RADIO_STREAM_OVERRIDES[normalised]);

  if (normalised.startsWith("greatest hits radio")) {
    add(
      "https://stream-mz.hellorayo.co.uk/net2national.mp3?direct=true"
    );

    add(
      "https://stream-mz.planetradio.co.uk/net2national.mp3"
    );
  }

  add(channel?.url);

  (channel?.alternatives || []).forEach((candidate) => {
    add(candidate?.url);
  });

  return urls;
};

export default function LiveTVView() {
  const [channels, setChannels] = useState([]);
  const [sourceStatus, setSourceStatus] = useState([]);
  const [rawCount, setRawCount] = useState(0);
  const [browserRejectedCount, setBrowserRejectedCount] = useState(0);
  const [region, setRegion] = useState(LIVE_TV_REGION || "GB");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(DEFAULT_FILTER);
  const [quickFilter, setQuickFilter] = useState(DEFAULT_FILTER);
  const [directOnly, setDirectOnly] = useState(false);
  const [radioStation, setRadioStation] = useState(null);
  const [radioSourceIndex, setRadioSourceIndex] = useState(0);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioStatus, setRadioStatus] = useState("");
  const [epgByKey, setEpgByKey] = useState({});
  const [epgMatched, setEpgMatched] = useState(0);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState("channels");
  const [favouriteKeys, setFavouriteKeys] = useState(
    () => new Set(readStoredList(LIVE_TV_FAVOURITES_KEY))
  );
  const [recentKeys, setRecentKeys] = useState(
    () => readStoredList(LIVE_TV_RECENT_KEY)
  );
  const [focusedChannelKey, setFocusedChannelKey] = useState("");

  const audioRef = useRef(null);
  const player = usePlayer();

  const load = async (force = false) => {
    if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const result = await getFreeTvChannels({
        force,
      });

      let loadedChannels = Array.isArray(result?.channels) ? result.channels : [];

      loadedChannels = loadedChannels.map((ch) => {
        const norm = normaliseStationName(ch.name);
        if (SKY_STREAM_OVERRIDES[norm] !== undefined && SKY_STREAM_OVERRIDES[norm] !== "") {
          return {
            ...ch,
            url: SKY_STREAM_OVERRIDES[norm],
            kind: "direct",
            browserPlayable: true,
            tags: Array.from(new Set([...(ch.tags || []), "United Kingdom", "Sports"])),
          };
        }
        return ch;
      });

      setChannels(loadedChannels);

      setSourceStatus(
        Array.isArray(result?.sourceStatus)
          ? result.sourceStatus
          : []
      );

      setRawCount(
        Number(result?.rawCount || 0)
      );

      setBrowserRejectedCount(
        Number(
          result?.browserRejectedCount || 0
        )
      );

      setRegion(
        String(
          result?.region ||
            LIVE_TV_REGION ||
            "GB"
        ).toUpperCase()
      );
    } catch (loadError) {
      setError(
        loadError?.message ||
          "Could not load the public Live TV playlists."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);

  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setClockTick(Date.now()),
      60 * 1000
    );

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (channels.length === 0) return undefined;

    let cancelled = false;
    let timer = null;

    const loadGuide = async () => {
      const targets = channels
        .map((channel, index) => ({ channel, index }))
        .filter(({ channel }) => !isRadioChannel(channel))
        .slice(0, 350)
        .map(({ channel }) => ({
          key: epgKeyForChannel(channel),
          tvgId: channel?.tvgId || "",
          name: channel?.name || "",
        }));

      if (targets.length === 0) return;

      try {
        const response = await base44.functions.invoke(
          "getLiveEpg",
          { channels: targets }
        );
        const data = response?.data ?? response ?? {};

        if (cancelled) return;

        const next = {};
        (Array.isArray(data?.items) ? data.items : []).forEach((item) => {
          if (item?.key) next[item.key] = item;
        });

        setEpgByKey(next);
        setEpgMatched(Number(data?.matched || 0));
      } catch {
        if (!cancelled) {
          setEpgByKey({});
          setEpgMatched(0);
        }
      }
    };

    loadGuide();
    timer = window.setInterval(loadGuide, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [channels]);

  const activeRadioUrls = useMemo(
    () => {
      const urls = radioStation
        ? radioUrlsFor(radioStation)
        : [];

      return urls
        .map((url, index) => ({
          url,
          index,
          score:
            liveTvUrlScore(url) +
            (index === 0 ? 900 : 0),
        }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.index - b.index
        )
        .map((item) => item.url);
    },
    [radioStation]
  );

  useEffect(() => {
    const audio = audioRef.current;

    if (
      !audio ||
      !radioStation ||
      activeRadioUrls.length === 0
    ) {
      return undefined;
    }

    const url =
      activeRadioUrls[radioSourceIndex];

    if (!url) {
      return undefined;
    }

    let hls = null;
    let cancelled = false;
    let sourceFailed = false;
    let recoveryAttempts = 0;
    let startupTimer = null;
    let stallTimer = null;
    let successRecorded = false;
    const startedAt =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();

    const clearStartupTimer = () => {
      if (startupTimer) {
        window.clearTimeout(startupTimer);
        startupTimer = null;
      }
    };

    const clearStallTimer = () => {
      if (stallTimer) {
        window.clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    setRadioStatus("Loading radio…");
    setRadioPlaying(false);

    const tryPlay = async () => {
      if (cancelled) {
        return;
      }

      try {
        audio.muted = false;
        audio.volume = 1;

        await audio.play();

        setRadioPlaying(true);
        setRadioStatus("");
      } catch {
        clearStartupTimer();
        setRadioPlaying(false);
        setRadioStatus(
          "Press Play to start the radio."
        );
      }
    };

    const failToNext = ({ stalled = false } = {}) => {
      if (
        cancelled ||
        sourceFailed
      ) {
        return;
      }

      sourceFailed = true;
      clearStartupTimer();
      clearStallTimer();

      recordLiveTvPlaybackResult(url, {
        success: false,
        stalled,
      });

      if (
        radioSourceIndex + 1 <
        activeRadioUrls.length
      ) {
        setRadioStatus(
          "Trying backup radio source…"
        );

        setRadioSourceIndex(
          (current) => current + 1
        );

        return;
      }

      setRadioPlaying(false);

      setRadioStatus(
        "This radio stream is currently unavailable."
      );
    };

    const handlePlaying = () => {
      clearStartupTimer();
      clearStallTimer();

      if (!successRecorded) {
        successRecorded = true;
        const now =
          typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();

        recordLiveTvPlaybackResult(url, {
          success: true,
          startupMs: Math.max(0, now - startedAt),
        });
      }

      setRadioPlaying(true);
      setRadioStatus("");
    };

    const handlePause = () => {
      setRadioPlaying(false);
    };

    const handleStalled = () => {
      if (cancelled || sourceFailed) return;

      setRadioStatus(
        "Radio stalled — trying to recover…"
      );

      clearStallTimer();
      stallTimer = window.setTimeout(
        () => failToNext({ stalled: true }),
        7000
      );
    };

    const handleError = () => {
      failToNext();
    };

    audio.addEventListener(
      "playing",
      handlePlaying
    );

    audio.addEventListener(
      "pause",
      handlePause
    );

    audio.addEventListener(
      "stalled",
      handleStalled
    );

    audio.addEventListener(
      "error",
      handleError
    );

    startupTimer = window.setTimeout(
      () => failToNext(),
      12000
    );

    try {
      audio.pause();

      audio.removeAttribute("src");

      audio.load();
    } catch {
      // Ignore reset errors.
    }

    if (
      isHlsUrl(url) &&
      Hls.isSupported()
    ) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });

      hls.on(
        Hls.Events.ERROR,
        (_event, data) => {
          if (
            !data?.fatal ||
            cancelled
          ) {
            return;
          }

          try {
            if (
              data.type ===
                Hls.ErrorTypes
                  .MEDIA_ERROR &&
              recoveryAttempts < 2
            ) {
              recoveryAttempts += 1;

              hls.recoverMediaError();

              return;
            }

            if (
              data.type ===
                Hls.ErrorTypes
                  .NETWORK_ERROR &&
              recoveryAttempts < 2
            ) {
              recoveryAttempts += 1;

              hls.startLoad();

              return;
            }
          } catch {
            // Move to fallback source.
          }

          failToNext();
        }
      );

      hls.on(
        Hls.Events.MANIFEST_PARSED,
        tryPlay
      );

      hls.loadSource(url);
      hls.attachMedia(audio);
    } else {
      audio.src = url;
      audio.load();
      tryPlay();
    }

    return () => {
      cancelled = true;
      clearStartupTimer();
      clearStallTimer();

      audio.removeEventListener(
        "playing",
        handlePlaying
      );

      audio.removeEventListener(
        "pause",
        handlePause
      );

      audio.removeEventListener(
        "stalled",
        handleStalled
      );

      audio.removeEventListener(
        "error",
        handleError
      );

      if (hls) {
        try {
          hls.destroy();
        } catch {
          // Ignore teardown errors.
        }
      }

      try {
        audio.pause();

        audio.removeAttribute("src");

        audio.load();
      } catch {
        // Ignore teardown errors.
      }
    };
  }, [
    radioStation,
    radioSourceIndex,
    activeRadioUrls,
  ]);

  const rememberRecentChannel = (channel) => {
    const key = channelMemoryKey(channel);

    setRecentKeys((current) => {
      const next = [
        key,
        ...current.filter((item) => item !== key),
      ].slice(0, 30);

      writeStoredList(LIVE_TV_RECENT_KEY, next);
      return next;
    });
  };

  const toggleFavouriteChannel = (channel) => {
    const key = channelMemoryKey(channel);

    setFavouriteKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      writeStoredList(LIVE_TV_FAVOURITES_KEY, Array.from(next));
      return next;
    });
  };

  const favouriteChannels = useMemo(
    () =>
      channels.filter((channel) =>
        favouriteKeys.has(channelMemoryKey(channel))
      ),
    [channels, favouriteKeys]
  );

  const recentChannels = useMemo(() => {
    const byKey = new Map(
      channels.map((channel) => [channelMemoryKey(channel), channel])
    );

    return recentKeys
      .map((key) => byKey.get(key))
      .filter(Boolean)
      .slice(0, 18);
  }, [channels, recentKeys]);


  const groups = useMemo(() => {
    const values = Array.from(
      new Set(
        channels
          .map(
            (channel) =>
              channel?.group
          )
          .filter(Boolean)
      )
    ).sort(groupSort);

    return [
      "All",
      ...values,
    ];
  }, [channels]);

  const quickCounts = useMemo(() => {
    const counts = {
      All: channels.length,
      "United Kingdom": 0,
      Sports: 0,
      Movies: 0,
      Favourites: 0,
      Recent: 0,
    };

    for (const channel of channels) {
      const tags = new Set(
        channel?.tags || []
      );
      const key = channelMemoryKey(channel);

      if (favouriteKeys.has(key)) {
        counts.Favourites += 1;
      }

      if (recentKeys.includes(key)) {
        counts.Recent += 1;
      }

      if (
        tags.has(
          "United Kingdom"
        )
      ) {
        counts["United Kingdom"] += 1;
      }

      if (
        tags.has("Sports")
      ) {
        counts.Sports += 1;
      }

      if (
        tags.has("Movies")
      ) {
        counts.Movies += 1;
      }
    }

    return counts;
  }, [channels, favouriteKeys, recentKeys]);

  const filtered = useMemo(() => {
    const q = searchText(query);

    const result = channels.filter(
      (channel) => {
        const tags = new Set(
          channel?.tags || []
        );
        const key = channelMemoryKey(channel);

        if (
          quickFilter === "Favourites" &&
          !favouriteKeys.has(key)
        ) {
          return false;
        }

        if (
          quickFilter === "Recent" &&
          !recentKeys.includes(key)
        ) {
          return false;
        }

        if (
          !["All", "Favourites", "Recent"].includes(quickFilter) &&
          !tags.has(quickFilter)
        ) {
          return false;
        }

        if (
          group !== "All" &&
          channel?.group !== group
        ) {
          return false;
        }

        if (
          directOnly &&
          channel?.kind !== "direct"
        ) {
          return false;
        }

        if (!q) {
          return true;
        }

        const haystack =
          searchText(
            `${
              channel?.name || ""
            } ${
              channel?.group || ""
            } ${
              channel?.country || ""
            } ${
              (
                channel?.sourceNames ||
                []
              ).join(" ")
            } ${
              (
                channel?.tags ||
                []
              ).join(" ")
            }`
          );

        return haystack.includes(q);
      }
    );

    if (quickFilter === "Recent") {
      const order = new Map(
        recentKeys.map((key, index) => [key, index])
      );

      return [...result].sort(
        (a, b) =>
          (order.get(channelMemoryKey(a)) ?? 9999) -
          (order.get(channelMemoryKey(b)) ?? 9999)
      );
    }

    return result;
  }, [
    channels,
    group,
    query,
    directOnly,
    quickFilter,
    favouriteKeys,
    recentKeys,
  ]);

  const visibleLimit =
    viewMode === "guide"
      ? GUIDE_VISIBLE
      : MAX_VISIBLE;

  const shown = filtered.slice(
    0,
    visibleLimit
  );

  useEffect(() => {
    setFocusedChannelKey("");
  }, [quickFilter, group, query, directOnly, viewMode]);

  const resetFilters = () => {
    setQuery("");
    setGroup(DEFAULT_FILTER);
    setQuickFilter(DEFAULT_FILTER);
    setDirectOnly(false);
  };

  const stopRadio = () => {
    try {
      audioRef.current?.pause();
    } catch {
      // Ignore.
    }

    setRadioStation(null);
    setRadioSourceIndex(0);
    setRadioPlaying(false);
    setRadioStatus("");
  };

  const openRadio = (channel) => {
    setRadioStation(channel);
    setRadioSourceIndex(0);
    setRadioStatus("Loading radio…");
  };

  const toggleRadio = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (!audio.paused) {
      audio.pause();

      return;
    }

    try {
      audio.muted = false;
      audio.volume = 1;

      await audio.play();

      setRadioPlaying(true);
      setRadioStatus("");
    } catch {
      setRadioStatus(
        "Radio could not start. Try the next source."
      );
    }
  };

  const nextRadioSource = () => {
    if (
      radioSourceIndex + 1 <
      activeRadioUrls.length
    ) {
      setRadioSourceIndex(
        (current) => current + 1
      );
    }
  };

  const playChannel = (channel) => {
    if (!channel) {
      return;
    }

    rememberRecentChannel(channel);
    setFocusedChannelKey(channelMemoryKey(channel));

    if (
      isRadioChannel(channel)
    ) {
      if (radioUrlsFor(channel).length > 0) {
        openRadio(channel);
      }

      return;
    }

    if (
      channel.kind ===
      "external"
    ) {
      if (channel.url) {
        window.open(
          channel.url,
          "_blank",
          "noopener,noreferrer"
        );
      }

      return;
    }

    const candidates = playableChannelCandidates(channel);

    if (candidates.length === 0) {
      setError(
        `${channel.name || "This channel"} does not currently have a browser-playable stream.`
      );
      return;
    }

    stopRadio();
    setError("");
    prewarmChannel(channel);

    const directSources = candidates
      .map(
        (
          candidate,
          index
        ) => {
          const quality =
            qualityLabel(candidate);

          return {
            label:
              index === 0
                ? `LIVE • Best${
                    quality
                      ? ` • ${quality}`
                      : ""
                  }`
                : `Backup ${index}${
                    quality
                      ? ` • ${quality}`
                      : ""
                  }`,
            type: "live",
            src: candidate.url,
            url: candidate.url,
            live: true,
            sourceName:
              candidate.sourceName,
          };
        }
      );

    player.play({
      id:
        channel.tvgId ||
        channel.id,

      title:
        channel.name,

      poster:
        channel.logo || "",

      type: "live",

      mediaType:
        "live",

      noRd: true,

      sources: directSources,
    });
  };

  const renderQuickChannelCard = (channel) => {
    const memoryKey = channelMemoryKey(channel);
    const guide = epgByKey[epgKeyForChannel(channel)] || {};
    const nowProgramme = guide?.now || null;
    const favourite = favouriteKeys.has(memoryKey);

    return (
      <button
        key={memoryKey}
        type="button"
        onClick={() => playChannel(channel)}
        onFocus={(event) => {
          setFocusedChannelKey(memoryKey);
          event.currentTarget.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        }}
        className="mg-fire-tv-card w-48 shrink-0 rounded-xl border border-white/10 bg-mg-card p-3 text-left outline-none transition-colors focus:border-mg-green focus:bg-mg-surface focus:ring-2 focus:ring-mg-green/40"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
            <Tv className="h-4 w-4 text-white/25" />
            {channel.logo && (
              <img
                src={channel.logo}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-contain p-1"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-bold text-white">
                {channel.name}
              </span>
              {favourite && (
                <Star className="h-3.5 w-3.5 shrink-0 fill-current text-mg-green" />
              )}
            </div>
            <div className="mt-1 truncate text-[10px] text-white/40">
              {nowProgramme?.title || channel.group || "Live TV"}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const failedSources =
    sourceStatus.filter(
      (source) =>
        source.error
    );

  const workingSources =
    sourceStatus.filter(
      (source) =>
        !source.error
    );

  if (loading) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="h-7 w-7 animate-spin text-mg-green" />

        <p className="text-sm text-white/55">
          Loading and checking public Live TV sources…
        </p>
      </div>
    );
  }

  return (
    <div className="w-full p-3 min-[420px]:p-4 sm:p-6 md:p-8 3xl:p-10 4xl:p-14">
      <audio
        ref={audioRef}
        preload="none"
        className="hidden"
      />

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Radio className="h-5 w-5 text-mg-green" />

            <h1 className="text-xl font-bold text-white sm:text-2xl 3xl:text-3xl">
              Live TV
            </h1>
          </div>

          <p className="max-w-3xl text-xs text-white/45 sm:text-sm">
            UK-aware public Live TV, sports, movies and radio with Sky, TNT, and public news streams integrated.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            load(true)
          }
          disabled={refreshing}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-mg-card px-4 py-2 text-sm font-semibold text-white/75 hover:border-mg-green/50 hover:text-white disabled:opacity-50"
        >
          <RefreshCw
            className={cn(
              "h-4 w-4",
              refreshing &&
                "animate-spin"
            )}
          />

          Refresh channels
        </button>
      </div>

      {region === "GB" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-mg-green/20 bg-mg-green/5 px-3 py-2 text-xs text-mg-green">
          <CheckCircle2 className="h-4 w-4 shrink-0" />

          UK mode active — UK geo-restricted feeds are treated as available in Great Britain.
        </div>
      )}

      {radioStation && (
        <div className="mb-5 rounded-xl border border-mg-green/40 bg-mg-card p-4 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                <Radio className="h-6 w-6 text-mg-green" />

                {radioStation.logo && (
                  <img
                    src={
                      radioStation.logo
                    }
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain p-1"
                    onError={(
                      event
                    ) => {
                      event.currentTarget.style.display =
                        "none";
                    }}
                  />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 shrink-0 text-mg-green" />

                  <div className="truncate font-bold text-white">
                    {
                      radioStation.name
                    }
                  </div>
                </div>

                <div className="mt-1 text-xs text-white/45">
                  Radio • source{" "}
                  {radioSourceIndex + 1}{" "}
                  of{" "}
                  {Math.max(
                    activeRadioUrls.length,
                    1
                  )}
                </div>

                {radioStatus && (
                  <div className="mt-1 text-xs text-amber-200/80">
                    {radioStatus}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={
                  toggleRadio
                }
                className="flex min-h-11 items-center gap-2 rounded-lg bg-mg-green px-4 py-2 text-sm font-bold text-black"
              >
                {radioPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}

                {radioPlaying
                  ? "Pause"
                  : "Play"}
              </button>

              {radioSourceIndex + 1 <
                activeRadioUrls.length && (
                <button
                  type="button"
                  onClick={
                    nextRadioSource
                  }
                  className="min-h-11 rounded-lg border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/75 hover:text-white"
                >
                  Next source
                </button>
              )}

              <button
                type="button"
                onClick={
                  stopRadio
                }
                className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/75 hover:text-white"
              >
                <Square className="h-4 w-4" />

                Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

          <div>
            <div className="font-semibold">
              Live TV could not load
            </div>

            <div className="mt-1 text-red-200/70">
              {error}
            </div>
          </div>
        </div>
      )}

      {!error &&
        failedSources.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
            {failedSources.length} playlist source
            {failedSources.length === 1
              ? ""
              : "s"}{" "}
            could not be reached. Working playlists are still available.
          </div>
        )}

      {viewMode === "channels" &&
        quickFilter === "All" &&
        !query.trim() &&
        favouriteChannels.length > 0 && (
          <section className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <Star className="h-4 w-4 fill-current text-mg-green" />
              <h2 className="text-sm font-bold text-white">Favourite channels</h2>
            </div>
            <div
              data-mg-tv-row="true"
              className="flex gap-3 overflow-x-auto pb-2 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {favouriteChannels
                .slice(0, 18)
                .map(renderQuickChannelCard)}
            </div>
          </section>
        )}

      {viewMode === "channels" &&
        quickFilter === "All" &&
        !query.trim() &&
        recentChannels.length > 0 && (
          <section className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-mg-green" />
              <h2 className="text-sm font-bold text-white">Recent channels</h2>
            </div>
            <div
              data-mg-tv-row="true"
              className="flex gap-3 overflow-x-auto pb-2 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {recentChannels.map(renderQuickChannelCard)}
            </div>
          </section>
        )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          {
            id: "All",
            label: "All",
            icon: Tv,
          },
          {
            id: "United Kingdom",
            label: "UK",
            icon: Globe2,
          },
          {
            id: "Sports",
            label: "Sports",
            icon: Trophy,
          },
          {
            id: "Movies",
            label: "Movies",
            icon: Film,
          },
          {
            id: "Favourites",
            label: "Favourites",
            icon: Star,
          },
          {
            id: "Recent",
            label: "Recent",
            icon: Clock3,
          },
        ].map((item) => {
          const Icon =
            item.icon;

          const active =
            quickFilter ===
            item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setQuickFilter(
                  item.id
                );

                setGroup("All");
              }}
              className={cn(
                "flex min-h-12 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green focus-visible:ring-offset-2 focus-visible:ring-offset-mg-background",

                active
                  ? "border-mg-green bg-mg-green text-black"
                  : "border-white/10 bg-mg-card text-white/70 hover:border-mg-green/50 hover:text-white"
              )}
              aria-pressed={active}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />

                {item.label}
              </span>

              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px]",

                  active
                    ? "bg-black/15"
                    : "bg-white/5 text-white/45"
                )}
              >
                {Number(
                  quickCounts[
                    item.id
                  ] || 0
                ).toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />

          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="Search channel, country, source or category…"
            aria-label="Search Live TV channels"
            className="h-11 w-full rounded-lg border border-white/10 bg-mg-card pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green focus:ring-2 focus:ring-mg-green/30"
          />
        </label>

        <select
          value={group}
          onChange={(event) =>
            setGroup(
              event.target.value
            )
          }
          aria-label="Filter Live TV by group"
          className="h-11 rounded-lg border border-white/10 bg-mg-card px-3 text-sm text-white outline-none focus:border-mg-green focus:ring-2 focus:ring-mg-green/30"
        >
          {groups.map((item) => (
            <option
              key={item}
              value={item}
            >
              {item}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() =>
            setDirectOnly(
              (current) =>
                !current
            )
          }
          aria-pressed={directOnly}
          className={cn(
            "h-11 rounded-lg border px-4 text-sm font-semibold transition-colors",

            directOnly
              ? "border-mg-green bg-mg-green text-black"
              : "border-white/10 bg-mg-card text-white/70 hover:text-white"
          )}
        >
          Direct streams only
        </button>

        <div className="grid h-11 grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-mg-card">
          <button
            type="button"
            onClick={() => setViewMode("channels")}
            aria-label="Channel cards view"
            aria-pressed={viewMode === "channels"}
            className={cn(
              "flex min-w-11 items-center justify-center gap-1.5 px-2 text-xs font-semibold outline-none transition-colors focus:ring-2 focus:ring-inset focus:ring-mg-green",
              viewMode === "channels"
                ? "bg-mg-green text-black"
                : "text-white/60 hover:text-white"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden xl:inline">Channels</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("guide")}
            aria-label="TV Guide view"
            aria-pressed={viewMode === "guide"}
            className={cn(
              "flex min-w-11 items-center justify-center gap-1.5 px-2 text-xs font-semibold outline-none transition-colors focus:ring-2 focus:ring-inset focus:ring-mg-green",
              viewMode === "guide"
                ? "bg-mg-green text-black"
                : "text-white/60 hover:text-white"
            )}
          >
            <ListVideo className="h-4 w-4" />
            <span className="hidden xl:inline">Guide</span>
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/40 sm:text-xs">
        <span className="flex items-center gap-1.5">
          <Tv className="h-3.5 w-3.5" />

          {filtered.length.toLocaleString()} matching channels
        </span>

        <span data-mg-live-tv-technical="true">
          {rawCount.toLocaleString()} raw entries merged into{" "}
          {channels.length.toLocaleString()} visible channels
        </span>

        <span data-mg-live-tv-technical="true">
          {workingSources.length}/
          {sourceStatus.length} playlist sources loaded
        </span>

        {epgMatched > 0 && (
          <span data-mg-live-tv-technical="true" className="text-mg-green/70">
            Now/Next guide matched to {epgMatched} channels
          </span>
        )}

        {browserRejectedCount > 0 && (
          <span data-mg-live-tv-technical="true">
            {browserRejectedCount.toLocaleString()} incompatible/dead-format sources filtered out
          </span>
        )}

        {filtered.length >
          visibleLimit && (
          <span>
            Showing first {visibleLimit}. Use search or filters to narrow the list.
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-mg-card p-8 text-center">
          <Tv className="mx-auto mb-3 h-8 w-8 text-white/25" />

          <div className="font-semibold text-white">
            No channels found
          </div>

          <div className="mt-1 text-sm text-white/40">
            Try All, another group, or a different search.
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 min-h-10 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/70 hover:border-mg-green/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
          >
            Reset filters
          </button>
        </div>
      ) : viewMode === "guide" ? (
        <div className="grid gap-2" data-mg-live-tv-guide="true">
          {shown.map((channel, index) => {
            const memoryKey = channelMemoryKey(channel);
            const guide = epgByKey[epgKeyForChannel(channel)] || {};
            const upcoming = Array.isArray(guide?.upcoming)
              ? guide.upcoming.slice(0, 4)
              : [guide?.now, guide?.next].filter(Boolean);
            const currentStart = String(guide?.now?.start || "");

            return (
              <div
                key={`guide-${channel.id || memoryKey}-${index}`}
                data-mg-tv-row="true"
                className="grid min-h-[84px] gap-2 rounded-xl border border-white/8 bg-mg-card/70 p-2 md:grid-cols-[220px_minmax(0,1fr)]"
              >
                <button
                  type="button"
                  onClick={() => playChannel(channel)}
                  onFocus={(event) => {
                    setFocusedChannelKey(memoryKey);
                    event.currentTarget.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                    });
                  }}
                  className={cn(
                    "mg-fire-tv-card flex min-h-[68px] items-center gap-3 rounded-lg border bg-black/25 px-3 text-left outline-none transition-colors focus:border-mg-green focus:bg-mg-surface focus:ring-2 focus:ring-mg-green/35",
                    focusedChannelKey === memoryKey
                      ? "border-mg-green/35"
                      : "border-white/8"
                  )}
                >
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                    <Tv className="h-4 w-4 text-white/25" />
                    {channel.logo && (
                      <img
                        src={channel.logo}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-contain p-1"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">
                      {channel.name}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-white/40">
                      {channel.group || channel.country || "Live TV"}
                    </div>
                  </div>

                  {favouriteKeys.has(memoryKey) && (
                    <Star className="h-4 w-4 shrink-0 fill-current text-mg-green" />
                  )}
                </button>

                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {upcoming.length > 0 ? (
                    upcoming.map((programme, programmeIndex) => {
                      const isNow =
                        Boolean(currentStart) &&
                        String(programme?.start || "") === currentStart;
                      const progress = isNow
                        ? programmeProgress(programme, clockTick)
                        : 0;

                      return (
                        <div
                          key={`${programme?.start || programmeIndex}-${programme?.title || "programme"}`}
                          className={cn(
                            "min-w-0 rounded-lg border px-3 py-2",
                            isNow
                              ? "border-mg-green/30 bg-mg-green/8"
                              : "border-white/8 bg-black/20"
                          )}
                        >
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                            <span className={isNow ? "text-mg-green" : "text-white/45"}>
                              {isNow ? "NOW" : formatProgrammeTime(programme?.start)}
                            </span>
                            {!isNow && programme?.stop && (
                              <span className="text-white/25">
                                – {formatProgrammeTime(programme.stop)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 truncate text-xs font-semibold text-white/85">
                            {programme?.title || "Programme"}
                          </div>
                          {isNow && (
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full bg-mg-green"
                                style={{ width: `${Math.round(progress * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-full flex min-h-[68px] items-center rounded-lg border border-white/8 bg-black/20 px-3 text-xs text-white/35">
                      Guide information is not available for this channel yet.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5">
          {shown.map(
            (
              channel,
              index
            ) => {
              const external =
                channel.kind ===
                "external";

              const radio =
                isRadioChannel(
                  channel
                );

              const quality =
                qualityLabel(
                  channel
                );

              const backupCount =
                (
                  channel.alternatives ||
                  []
                ).filter(
                  (
                    candidate
                  ) =>
                    candidate?.kind ===
                      "direct" &&
                    candidate?.url &&
                    candidate?.browserPlayable !==
                      false
                ).length;

              const guide = epgByKey[
                epgKeyForChannel(channel)
              ];
              const nowProgramme = guide?.now || null;
              const nextProgramme = guide?.next || null;
              const nowProgress = programmeProgress(
                nowProgramme,
                clockTick
              );

              const memoryKey = channelMemoryKey(channel);
              const favourite = favouriteKeys.has(memoryKey);

              return (
                <div
                  key={`${channel.id}-${index}`}
                  className="group relative min-h-[118px]"
                  data-mg-live-tv-channel="true"
                >
                  <button
                    type="button"
                    onClick={() =>
                      playChannel(
                        channel
                      )
                    }
                    onFocus={(event) => {
                      setFocusedChannelKey(memoryKey);
                      event.currentTarget.scrollIntoView({
                        block: "nearest",
                        inline: "nearest",
                      });
                    }}
                    className="flex h-full min-h-[118px] w-full items-start gap-3 rounded-xl border border-white/10 bg-mg-card p-3 pr-11 text-left transition-colors hover:border-mg-green/60 hover:bg-mg-surface focus:border-mg-green focus:bg-mg-surface focus:outline-none focus:ring-2 focus:ring-mg-green/40"
                  >
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                    {radio ? (
                      <Radio className="h-5 w-5 text-mg-green/50" />
                    ) : (
                      <Tv className="h-5 w-5 text-white/20" />
                    )}

                    {channel.logo && (
                      <img
                        src={channel.logo}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-contain p-1"
                        onError={(event) => {
                          event.currentTarget.style.display =
                            "none";
                        }}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white group-hover:text-mg-green">
                      {channel.name}
                    </div>

                    <div className="mt-1 truncate text-xs text-white/40">
                      {channel.group ||
                        channel.country ||
                        "Free TV"}
                    </div>

                    {nowProgramme && (
                      <div className="mt-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 rounded bg-mg-green/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-mg-green">
                            Now
                          </span>
                          <span className="truncate text-[11px] font-semibold text-white/85">
                            {nowProgramme.title}
                          </span>
                        </div>

                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-mg-green"
                            style={{ width: `${Math.round(nowProgress * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {nextProgramme && (
                      <div className="mt-1.5 flex min-w-0 gap-1.5 text-[10px] text-white/45">
                        <span className="shrink-0 font-semibold text-white/55">
                          Next {formatProgrammeTime(nextProgramme.start)}
                        </span>
                        <span className="truncate">· {nextProgramme.title}</span>
                      </div>
                    )}

                    <div className="mt-1.5 truncate text-[10px] text-white/30">
                      {channel.sourceName ||
                        "Public IPTV"}

                      {backupCount > 0
                        ? ` • ${backupCount} backup${
                            backupCount === 1
                              ? ""
                              : "s"
                          }`
                        : ""}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {radio ? (
                        <span className="inline-flex items-center gap-1 rounded bg-mg-green/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-mg-green">
                          <Volume2 className="h-2.5 w-2.5" />

                          Radio
                        </span>
                      ) : external ? (
                        <span className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/50">
                          <ExternalLink className="h-2.5 w-2.5" />

                          Web stream
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-mg-green/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-mg-green">
                          <Wifi className="h-2.5 w-2.5" />

                          Live
                        </span>
                      )}

                      {!radio &&
                        quality && (
                          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-200">
                            {quality}
                          </span>
                        )}

                      {(channel.tags || []).includes(
                        "Sports"
                      ) && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200">
                          Sports
                        </span>
                      )}

                      {(channel.tags || []).includes(
                        "Movies"
                      ) && (
                        <span className="rounded bg-fuchsia-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-fuchsia-200">
                          Movies
                        </span>
                      )}

                      {channel.geoAvailableHere && (
                        <span className="rounded bg-mg-green/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-mg-green">
                          UK Available
                        </span>
                      )}

                      {channel.geoBlocked && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
                          Geo Restricted
                        </span>
                      )}

                      {channel.standardDefinition &&
                        !radio && (
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/40">
                            SD
                          </span>
                        )}

                      {channel.insecure && (
                        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-300">
                          HTTP
                        </span>
                      )}
                    </div>
                  </div>

                    {radio ? (
                      <Volume2 className="h-4 w-4 shrink-0 text-mg-green" />
                    ) : external ? (
                      <ExternalLink className="h-4 w-4 shrink-0 text-white/30" />
                    ) : (
                      <Wifi className="h-4 w-4 shrink-0 text-mg-green" />
                    )}
                  </button>

                  <button
                    type="button"
                    aria-label={
                      favourite
                        ? `Remove ${channel.name} from favourites`
                        : `Add ${channel.name} to favourites`
                    }
                    title={favourite ? "Remove favourite" : "Add favourite"}
                    onClick={() => toggleFavouriteChannel(channel)}
                    onFocus={(event) => {
                      setFocusedChannelKey(memoryKey);
                      event.currentTarget.scrollIntoView({
                        block: "nearest",
                        inline: "nearest",
                      });
                    }}
                    className={cn(
                      "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border bg-black/70 outline-none transition-colors focus:ring-2 focus:ring-mg-green",
                      favourite
                        ? "border-mg-green/50 text-mg-green"
                        : "border-white/10 text-white/45 hover:text-white"
                    )}
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        favourite && "fill-current"
                      )}
                    />
                  </button>
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}
