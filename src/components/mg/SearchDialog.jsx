import { catalogueLoadMessage } from "@/components/mg/catalogueFeedback";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Film,
  Loader2,
  Mic,
  Search,
  Tv,
  X,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import { getFreeTvChannels } from "@/components/mg/freeTvPlaylist";
import { searchTmdbId } from "@/components/mg/searchMediaIdentity";
import { Image } from "@/components/ui/image";

const PosterImage = /** @type {any} */ (Image);

const TMDB_IMAGE_BASE =
  "https://image.tmdb.org/t/p/w500";
const SEARCH_RESULT_PAGE_SIZE = 24;

const searchThumbnailUrl = (url) =>
  String(url || "").replace(
    /^(https?:\/\/image\.tmdb\.org\/t\/p\/)w\d+(\/.*)$/i,
    "$1w185$2"
  );

const RECENT_SEARCHES_KEY = "mg:recent-searches:v1";
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map();

const readRecentSearches = () => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_SEARCHES_KEY) || "[]"
    );

    return Array.isArray(parsed)
      ? parsed.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 8)
      : [];
  } catch {
    return [];
  }
};

const rememberRecentSearch = (value) => {
  const query = String(value || "").trim();
  if (query.length < 2 || typeof window === "undefined") return readRecentSearches();

  const next = [
    query,
    ...readRecentSearches().filter(
      (entry) => entry.toLowerCase() !== query.toLowerCase()
    ),
  ].slice(0, 8);

  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Recent search history is best effort.
  }

  return next;
};

const normaliseSearchText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Voice-search phrases are search requests, not commands to auto-start video.
// Keep search and source selection within the existing UI.
export const cleanVoiceSearch = (spoken) =>
  String(spoken || "").trim()
    .replace(/^(?:hey\s+media\s+god[,\s]*)?(?:please\s+)?(?:search\s+for|look\s+up|find|show\s+me|play)\s+/i, "")
    .replace(/[?.!]+$/, "")
    .trim();

export const searchRelevance = (item, query) => {
  const title = normaliseSearchText(item?.title || item?.name);
  const wanted = normaliseSearchText(query);
  // "Film 2026" should find the right release rather than ranking any
  // similarly named film from a different year ahead of it.
  const requestedYear = wanted.match(/(?:^|\s)((?:19|20)\d{2})(?:$|\s)/)?.[1] || "";
  const titleWanted = requestedYear
    ? wanted.replace(new RegExp(`(?:^|\\s)${requestedYear}(?=$|\\s)`), " ").replace(/\s+/g, " ").trim()
    : wanted;
  const itemYear = String(
    item?.year || item?.release_date || item?.first_air_date || ""
  ).slice(0, 4);
  const yearBoost = requestedYear
    ? itemYear === requestedYear ? 240 : itemYear ? -250 : -50
    : 0;
  const aliases = (
    Array.isArray(item?.search_aliases)
      ? item.search_aliases
      : []
  )
    .map(normaliseSearchText)
    .filter(Boolean);

  if (!titleWanted || !title) return 0;

  /*
   * Verified identity corrections carry explicit aliases. Let an exact alias
   * outrank a different movie/TV project whose literal title happens to match
   * the typed text, while still keeping that separate project in the results.
   */
  if (
    item?.identity_corrected === true &&
    aliases.includes(titleWanted)
  ) {
    return 1200 + yearBoost;
  }

  if (title === titleWanted) return 1000 + yearBoost;
  // A title's opening word is more useful than a numerical fragment in an
  // unrelated title (e.g. TV series "24" versus films from 2024).
  if (title.startsWith(titleWanted + " ")) return 850 + yearBoost;
  if (title.startsWith(titleWanted)) return 800 + yearBoost;
  if (title.split(" ").includes(titleWanted)) return 700 + yearBoost;
  if (title.includes(titleWanted)) return 400 + yearBoost;

  const words = titleWanted.split(" ").filter(Boolean);
  return words.reduce(
    (score, word) => score + (title.includes(word) ? 80 : 0),
    Number(item?.popularity || 0) / 100 + yearBoost
  );
};

const normaliseMediaType = (
  value,
  item = {}
) => {
  const type = String(
    value || ""
  ).toLowerCase();

  if (
    type === "tv" ||
    type === "series" ||
    type === "show"
  ) {
    return "tv";
  }

  if (
    type === "movie" ||
    type === "film"
  ) {
    return "movie";
  }

  if (
    item?.first_air_date ||
    item?.firstAirDate
  ) {
    return "tv";
  }

  if (
    item?.release_date ||
    item?.releaseDate
  ) {
    return "movie";
  }

  if (
    item?.name &&
    !item?.title
  ) {
    return "tv";
  }

  return "";
};

const posterUrl = (
  item
) => {
  const value = String(
    item?.poster_url ||
      item?.posterUrl ||
      item?.poster_path ||
      item?.posterPath ||
      ""
  ).trim();

  if (!value) {
    return "";
  }

  if (
    /^https?:\/\//i.test(
      value
    )
  ) {
    return value;
  }

  return `${TMDB_IMAGE_BASE}${
    value.startsWith("/")
      ? value
      : `/${value}`
  }`;
};

const normaliseSearchResult = (
  item
) => {
  const id = searchTmdbId(item);
  if (
    !item ||
    id == null ||
    id === ""
  ) {
    return null;
  }

  const mediaType =
    normaliseMediaType(
      item?.media_type ||
        item?.mediaType ||
        item?.type,
      item
    );

  /*
   * TMDB multi-search also returns people.
   *
   * Media God DetailModal supports movies and TV shows,
   * so never hand unsupported result types to it.
   */
  if (!mediaType) {
    return null;
  }

  const title = String(
    item?.title ||
      item?.name ||
      item?.original_title ||
      item?.original_name ||
      "Untitled"
  ).trim();

  const date = String(
    item?.release_date ||
      item?.first_air_date ||
      item?.date ||
      ""
  );

  const year =
    item?.year ||
    (
      /^\d{4}/.test(
        date
      )
        ? date.slice(
            0,
            4
          )
        : ""
    );

  return {
    ...item,

    id,

    tmdb_id: id,

    tmdbId: id,

    title,

    name:
      item?.name ||
      title,

    media_type:
      mediaType,

    mediaType,

    year:
      year
        ? String(
            year
          )
        : "",

    poster_url:
      posterUrl(
        item
      ),

    description:
      item?.description ||
      item?.overview ||
      "",

    vote_average:
      Number(
        item?.vote_average ||
          item?.rating ||
          0
      ),
  };
};

const normaliseLiveChannelResult = (
  channel
) => {
  if (!channel) {
    return null;
  }

  const title = String(
    channel?.name ||
      channel?.rawName ||
      "Live TV"
  ).trim();

  if (!title) {
    return null;
  }

  const id = String(
    channel?.id ||
      channel?.tvgId ||
      `${title}:${channel?.url || channel?.officialUrl || ""}`
  ).trim();

  return {
    id,
    title,
    name: title,
    media_type: "live",
    mediaType: "live",
    poster_url: String(channel?.logo || "").trim(),
    description: "Live TV channel",
    live_group: String(channel?.group || channel?.sourceCategory || "Live TV").trim(),
    live_country: String(channel?.country || "").trim().toUpperCase(),
    live_source: String(channel?.sourceName || "").trim(),
    live_channel: channel,
  };
};

const liveChannelSearchText = (
  channel
) =>
  String(
    `${channel?.name || ""} ${channel?.rawName || ""} ${channel?.group || ""} ${channel?.country || ""} ${channel?.sourceName || ""} ${(channel?.sourceNames || []).join(" ")} ${(channel?.tags || []).join(" ")}`
  )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const extractResults = (
  response
) => {
  const data =
    response?.data ||
    {};

  const raw =
    Array.isArray(
      data?.movies
    )
      ? data.movies
      : Array.isArray(
            data?.results
          )
        ? data.results
        : Array.isArray(
              data
            )
          ? data
          : [];

  const seen =
    new Set();

  return raw
    .map(
      normaliseSearchResult
    )
    .filter(
      Boolean
    )
    .filter(
      (item) => {
        const key =
          `${item.media_type}:${item.id}`;

        if (
          seen.has(
            key
          )
        ) {
          return false;
        }

        seen.add(
          key
        );

        return true;
      }
    );
};

export default function SearchDialog({
  open,
  onOpenChange,
  onSelect,
}) {
  const [
    query,
    setQuery,
  ] = useState(
    ""
  );
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const voiceTimeoutRef = useRef(null);
  const voiceRecognitionRef = useRef(null);
  const clearVoiceTimeout = useCallback(() => {
    if (voiceTimeoutRef.current !== null) {
      window.clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
  }, []);
  const waitForVoiceResult = useCallback(() => {
    clearVoiceTimeout();
    voiceTimeoutRef.current = window.setTimeout(() => {
      voiceTimeoutRef.current = null;
      setVoiceListening(false);
      setVoiceError("No voice-search result was received. Press Select on the search box to use your Fire TV keyboard instead.");
      inputRef.current?.focus?.();
    }, 15000);
  }, [clearVoiceTimeout]);

  useEffect(() => {
    if (!open) {
      clearVoiceTimeout();
      voiceRecognitionRef.current?.abort?.();
      voiceRecognitionRef.current = null;
      return undefined;
    }
    const onVoiceResult = (event) => {
      // Fire TV sends `text`; Android phone sends `transcript`.
      // Both are valid native speech-recognition results.
      const spoken = cleanVoiceSearch(event?.detail?.text || event?.detail?.transcript);
      clearVoiceTimeout();
      setVoiceListening(false);
      if (spoken) {
        setQuery(spoken);
        setVoiceError("");
        inputRef.current?.focus?.();
      } else if (event?.detail?.error) {
        setVoiceError("Fire TV could not recognise that request. Select the search box to use the Fire TV keyboard, or type a title.");
        inputRef.current?.focus?.();
      }
    };
    window.addEventListener("mg:voice-search-result", onVoiceResult);
    window.addEventListener("mg:native-voice-search-result", onVoiceResult);
    return () => {
      window.removeEventListener("mg:voice-search-result", onVoiceResult);
      window.removeEventListener("mg:native-voice-search-result", onVoiceResult);
      clearVoiceTimeout();
      voiceRecognitionRef.current?.abort?.();
      voiceRecognitionRef.current = null;
    };
  }, [open, clearVoiceTimeout]);

  const nativeBridgeUnavailableMessage = () =>
    "Fire TV voice recognition is not installed or available. Press Select on the search box to open the Fire TV keyboard; use its microphone if offered, or type the title.";

  const startVoiceSearch = useCallback(() => {
    if (voiceListening) return;
    setVoiceError("");
    try {
      const nativeBridge = window.MediaGodNative;
      if (nativeBridge && typeof nativeBridge.startVoiceSearch === "function") {
        const started = nativeBridge.startVoiceSearch();
        if (started === true || started === "true") {
          setVoiceListening(true);
          waitForVoiceResult();
          return;
        }
      }
    } catch {
      // Use browser speech recognition if this browser provides it.
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceListening(false);
      setVoiceError(nativeBridgeUnavailableMessage());
      inputRef.current?.focus?.();
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      voiceRecognitionRef.current = recognition;
      recognition.lang = "en-GB";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      let receivedText = false;
      let recognitionFailed = false;
      recognition.onresult = (event) => {
        const spoken = event?.results?.[0]?.[0]?.transcript;
        if (spoken) {
          receivedText = true;
          clearVoiceTimeout();
          setQuery(cleanVoiceSearch(spoken));
          setVoiceError("");
          inputRef.current?.focus?.();
        }
        setVoiceListening(false);
      };
      recognition.onerror = (event) => {
        recognitionFailed = true;
        clearVoiceTimeout();
        setVoiceListening(false);
        const failure = String(event?.error || "");
        setVoiceError(failure === "not-allowed" || failure === "service-not-allowed"
          ? "Microphone access was denied. Use the Fire TV keyboard or type a title."
          : failure === "no-speech"
            ? "No speech heard. Try again or use the Fire TV keyboard."
            : "Voice search could not complete. Use the Fire TV keyboard or type a title.");
      };
      recognition.onend = () => {
        clearVoiceTimeout();
        setVoiceListening(false);
        voiceRecognitionRef.current = null;
        if (!receivedText && !recognitionFailed) {
          setVoiceError("No speech was recognised. Try again or use the Fire TV keyboard.");
        }
      };
      recognition.start();
      setVoiceListening(true);
      waitForVoiceResult();
    } catch {
      clearVoiceTimeout();
      voiceRecognitionRef.current = null;
      setVoiceListening(false);
      setVoiceError(nativeBridgeUnavailableMessage());
      inputRef.current?.focus?.();
    }
  }, [voiceListening, waitForVoiceResult, clearVoiceTimeout]);


  const [
    results,
    setResults,
  ] = useState(
    []
  );

  const [
    loading,
    setLoading,
  ] = useState(
    false
  );

  const [
    error,
    setError,
  ] = useState(
    ""
  );

  const [
    liveChannels,
    setLiveChannels,
  ] = useState(
    []
  );

  const [
    liveLoading,
    setLiveLoading,
  ] = useState(
    false
  );

  const [
    liveError,
    setLiveError,
  ] = useState(
    ""
  );

  const [mediaFilter, setMediaFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("");
  const [visibleResultCount, setVisibleResultCount] = useState(SEARCH_RESULT_PAGE_SIZE);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);

  useEffect(() => {
    setVisibleResultCount(SEARCH_RESULT_PAGE_SIZE);
  }, [query, mediaFilter, yearFilter, open]);

  const requestRef =
    useRef(
      0
    );

  const inputRef =
    useRef(
      null
    );

  const search =
    useCallback(
      async (
        value
      ) => {
        const cleanQuery =
          String(
            value ||
              ""
          ).trim();

        const requestId =
          ++requestRef.current;

        if (
          cleanQuery.length < 2
        ) {
          setResults(
            []
          );

          setLoading(
            false
          );

          setError(
            ""
          );

          return;
        }

        const cacheKey = cleanQuery.toLowerCase();
        const cached = searchCache.get(cacheKey);

        if (cached && cached.expiresAt > Date.now()) {
          setResults(cached.results);
          setLoading(false);
          setError("");
          return;
        }

        setLoading(
          true
        );

        setResults(
          []
        );

        setError(
          ""
        );

        try {
          const response =
            await base44.functions.invoke(
              "getTmdbMovies",
              {
                multi_search:
                  cleanQuery,
              }
            );

          if (
            requestId !==
            requestRef.current
          ) {
            return;
          }

          const extracted = extractResults(response);
          searchCache.set(cacheKey, {
            results: extracted,
            expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
          });

          setResults(
            extracted
          );
        } catch (
          searchError
        ) {
          if (
            requestId !==
            requestRef.current
          ) {
            return;
          }

          setResults(
            []
          );

          setError(
            catalogueLoadMessage()
          );
        } finally {
          if (
            requestId ===
            requestRef.current
          ) {
            setLoading(
              false
            );
          }
        }
      },
      []
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () =>
            search(
              query
            ),
          260
        );

      return () =>
        window.clearTimeout(
          timer
        );
    },
    [
      query,
      search,
    ]
  );

  useEffect(
    () => {
      if (!open) {
        return undefined;
      }

      let cancelled = false;

      setLiveLoading(
        true
      );
      setLiveError(
        ""
      );

      getFreeTvChannels()
        .then((response) => {
          if (cancelled) {
            return;
          }

          setLiveChannels(
            Array.isArray(response?.channels)
              ? response.channels
              : []
          );
        })
        .catch((catalogError) => {
          if (cancelled) {
            return;
          }

          setLiveError(
            catalogError?.message ||
              "Live TV channels could not be loaded."
          );
        })
        .finally(() => {
          if (!cancelled) {
            setLiveLoading(
              false
            );
          }
        });

      return () => {
        cancelled = true;
      };
    },
    [
      open,
    ]
  );

  useEffect(
    () => {
      if (!open) {
        requestRef.current +=
          1;

        setQuery(
          ""
        );

        setResults(
          []
        );

        setLoading(
          false
        );

        setError(
          ""
        );

        return;
      }

      const timer =
        window.setTimeout(
          () => {
            try {
              inputRef.current?.focus?.();
            } catch {
              /*
               * Focus is optional on
               * Android / Fire TV.
               */
            }
          },
          60
        );

      return () =>
        window.clearTimeout(
          timer
        );
    },
    [
      open,
    ]
  );

  useEffect(
    () => {
      if (!open) {
        return undefined;
      }

      const onKey =
        (
          event
        ) => {
          if (
            event.key ===
            "Escape"
          ) {
            event.preventDefault();

            onOpenChange(
              false
            );
          }
        };

      window.addEventListener(
        "keydown",
        onKey
      );

      return () => {
        window.removeEventListener(
          "keydown",
          onKey
        );
      };
    },
    [
      open,
      onOpenChange,
    ]
  );

  const filteredMediaResults = useMemo(() => {
    const cleanYear = String(yearFilter || "").trim();

    return [...results]
      .filter((item) => {
        if (mediaFilter !== "all" && item?.media_type !== mediaFilter) {
          return false;
        }

        if (cleanYear && String(item?.year || "") !== cleanYear) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          searchRelevance(b, query) -
            searchRelevance(a, query) ||
          Number(b?.vote_average || 0) - Number(a?.vote_average || 0)
      );
  }, [mediaFilter, query, results, yearFilter]);

  const liveResults = useMemo(
    () => {
      const cleanQuery = String(query || "")
        .trim()
        .toLowerCase();

      if (cleanQuery.length < 2) {
        return [];
      }

      return liveChannels
        .filter((channel) =>
          liveChannelSearchText(channel).includes(cleanQuery)
        )
        .sort((a, b) =>
          Number(String(b?.country || "").toUpperCase() === "GB") -
            Number(String(a?.country || "").toUpperCase() === "GB") ||
          Number(b?.sourcePriority || 0) - Number(a?.sourcePriority || 0) ||
          String(a?.name || "").localeCompare(String(b?.name || ""))
        )
        .slice(0, 30)
        .map(normaliseLiveChannelResult)
        .filter(Boolean);
    },
    [
      liveChannels,
      query,
    ]
  );

  /*
   * Mixed search used to prepend every matching Live TV channel before the
   * movie/TV catalogue. Short title searches such as "24" could therefore
   * bury an exact TV-show match beneath dozens of channel rows.
   *
   * Keep Live TV searchable, but rank the combined list by the same title
   * relevance used for movies/TV. When relevance ties, prefer catalogue media
   * so an exact movie/show title is not displaced by a channel with the same
   * text.
   */
  const combinedSearchResults = useMemo(() => {
    if (mediaFilter !== "all") {
      return filteredMediaResults;
    }

    return [
      ...filteredMediaResults,
      ...liveResults,
    ].sort((a, b) => {
      const relevance =
        searchRelevance(b, query) -
        searchRelevance(a, query);

      if (relevance !== 0) {
        return relevance;
      }

      const mediaPriority =
        Number(b?.media_type !== "live") -
        Number(a?.media_type !== "live");

      if (mediaPriority !== 0) {
        return mediaPriority;
      }

      return (
        Number(b?.vote_average || 0) -
          Number(a?.vote_average || 0) ||
        String(a?.title || "").localeCompare(String(b?.title || ""))
      );
    });
  }, [
    filteredMediaResults,
    liveResults,
    mediaFilter,
    query,
  ]);

  if (!open) {
    return null;
  }

  const choose =
    (
      rawResult
    ) => {
      // Both catalogue and live results are already normalised when added
      // to the results list. Preserve that exact identity for selection.
      const result = rawResult;

      if (
        !result ||
        result.id == null ||
        result.id === ""
      ) {
        setError(
          "That search result could not be opened."
        );

        return;
      }

      /*
       * Important on Android / Fire TV:
       *
       * Close the search overlay BEFORE
       * mounting DetailModal.
       *
       * This avoids two full-screen dialogs
       * existing during the same frame.
       */
      try {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
          activeElement.blur();
        }
      } catch {
        // Optional.
      }

      setRecentSearches(
        rememberRecentSearch(query)
      );

      onOpenChange(
        false
      );

      if (result.media_type === "live") {
        window.requestAnimationFrame(() => onSelect?.(result));
      } else {
        onSelect?.(result);
      }
    };

  const close =
    () => {
      onOpenChange(
        false
      );
    };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search movies, TV shows and live TV channels"
      data-mg-search-dialog="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-start justify-center sm:pt-[7vh] 3xl:pt-[9vh] p-0 sm:px-4"
      onClick={
        close
      }
    >
      <div
        className="w-full sm:max-w-2xl 3xl:max-w-4xl 4xl:max-w-5xl max-h-[92svh] sm:max-h-[84vh] bg-mg-surface border border-white/10 rounded-t-2xl sm:rounded-xl 3xl:rounded-2xl overflow-hidden shadow-2xl mg-safe-bottom"
        onClick={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-center gap-3 3xl:gap-4 px-4 sm:px-5 3xl:px-7 py-3.5 3xl:py-5 border-b border-white/10">
          <Search className="w-5 h-5 3xl:w-6 3xl:h-6 4xl:w-7 4xl:h-7 text-white/40 shrink-0" />
          <button
            type="button"
            onClick={startVoiceSearch}
            aria-label={voiceListening ? "Listening for voice search" : "Search by voice"}
            aria-pressed={voiceListening}
            title={voiceListening ? "Listening…" : "Search by voice"}
            className={`w-10 h-10 3xl:w-12 3xl:h-12 rounded-full flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green ${voiceListening ? "bg-mg-green text-black animate-pulse" : "text-white/70 hover:text-white hover:bg-white/10"}`}
          >
            <Mic className="w-5 h-5 3xl:w-6 3xl:h-6" />
          </button>

          <input
            ref={
              inputRef
            }
            value={
              query
            }
            onChange={(
              event
            ) =>
              setQuery(
                event
                  .target
                  .value
              )
            }
            placeholder="Search movies, TV shows, live TV channels..."
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-white text-base sm:text-lg 3xl:text-xl 4xl:text-2xl placeholder:text-white/30 focus-visible:ring-0"
            autoComplete="off"
            aria-label="Search"
          />

          <button
            type="button"
            onClick={() => {
              if (
                query
              ) {
                setQuery(
                  ""
                );

                setResults(
                  []
                );

                setError(
                  ""
                );

                inputRef.current?.focus?.();
              } else {
                close();
              }
            }}
            className="w-10 h-10 3xl:w-12 3xl:h-12 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
            aria-label={
              query
                ? "Clear search"
                : "Close search"
            }
          >
            <X className="w-5 h-5 3xl:w-6 3xl:h-6" />
          </button>
        </div>

        {voiceError && (
          <div role="status" className="px-4 pt-2 text-xs text-amber-300/90" aria-live="polite">{voiceError}</div>
        )}

        <div className="sr-only" role="status" aria-live="polite">{voiceListening ? "Listening for your search" : voiceError}</div>

        <div className="border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["all", "All"],
              ["movie", "Movies"],
              ["tv", "TV Shows"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMediaFilter(id)}
                aria-pressed={mediaFilter === id}
                className={`min-h-9 rounded-full px-3 text-xs font-bold transition ${
                  mediaFilter === id
                    ? "bg-mg-green text-black"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}

            <input
              inputMode="numeric"
              maxLength={4}
              value={yearFilter}
              onChange={(event) =>
                setYearFilter(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="Year"
              aria-label="Filter search by year"
              className="min-h-9 w-20 rounded-full border border-white/10 bg-black/25 px-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-mg-green/60"
            />
          </div>

          {query.trim().length < 2 && recentSearches.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                Recent searches
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {recentSearches.map((recent) => (
                  <button
                    key={recent}
                    type="button"
                    onClick={() => setQuery(recent)}
                    className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-mg-green"
                  >
                    {recent}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.localStorage.removeItem(RECENT_SEARCHES_KEY);
                    } catch {
                      // Best effort.
                    }
                    setRecentSearches([]);
                  }}
                  aria-label="Clear recent search history"
                  className="min-h-11 rounded-lg px-3 text-xs text-white/60 hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-mg-green"
                >
                  Clear history
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="max-h-[75svh] sm:max-h-[68vh] overflow-y-auto overscroll-contain">
          {(loading || liveLoading) &&
            query.trim().length >= 2 && (
            <div role="status" aria-live="polite" className="p-4 3xl:p-6 text-center text-white/40 flex items-center justify-center gap-2 3xl:text-lg">
              <Loader2 className="w-4 h-4 3xl:w-6 3xl:h-6 animate-spin" />

              Searching movies, TV shows and live channels...
            </div>
          )}

          {!loading &&
            error &&
            liveResults.length === 0 && (
              <div role="alert" className="p-6 3xl:p-10 text-center">
                <p className="text-sm 3xl:text-lg text-red-300">
                  {
                    error
                  }
                </p>
                <button type="button" onClick={() => search(query)}
                  className="mt-3 min-h-11 rounded-lg bg-white/10 px-5 text-white focus-visible:ring-2 focus-visible:ring-mg-green">Retry search</button>
              </div>
            )}

          {!liveLoading &&
            liveError &&
            results.length === 0 &&
            query.trim().length >= 2 && (
              <div role="status" className="px-6 pb-4 text-center">
                <p className="text-xs 3xl:text-base text-amber-300/80">
                  Live TV channel search is temporarily unavailable. Movie and TV search still works.
                </p>
              </div>
            )}

          {!loading &&
            !liveLoading &&
            !error &&
            !liveError &&
            query.trim().length >= 2 &&
            filteredMediaResults.length === 0 &&
            (mediaFilter !== "all" || liveResults.length === 0) && (
              <div className="p-8 3xl:p-12 text-center text-white/40 text-sm 3xl:text-lg">
                No movies, TV shows or live channels found for &quot;
                {
                  query
                }
                &quot;
              </div>
            )}

          {combinedSearchResults.length > 0 && (
              <div className="divide-y divide-white/5">
                {combinedSearchResults.slice(0, visibleResultCount).map(
                  (
                    result
                  ) => (
                    <button
                      type="button"
                      key={`${result.media_type}-${result.id}`}
                      onClick={() =>
                        choose(
                          result
                        )
                      }
                      className="w-full flex items-center gap-3 sm:gap-4 3xl:gap-5 p-3 sm:p-4 3xl:p-5 hover:bg-white/5 focus:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mg-green transition-colors text-left min-h-[78px] 3xl:min-h-[104px]"
                      aria-label={`Open ${result.title}`}
                    >
                      <div className="w-11 h-16 sm:w-12 sm:h-17 3xl:w-16 3xl:h-24 4xl:w-20 4xl:h-28 rounded-md 3xl:rounded-lg overflow-hidden bg-mg-card shrink-0">
                        {result.poster_url ? (
                          <PosterImage
                            src={
                              searchThumbnailUrl(result.poster_url)
                            }
                            alt={
                              result.title
                            }
                            className="w-full h-full object-cover"
                            fittingType="fill"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/30">
                            {result.media_type === "movie" ? (
                              <Film className="w-5 h-5 3xl:w-7 3xl:h-7" />
                            ) : (
                              <Tv className="w-5 h-5 3xl:w-7 3xl:h-7" />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm sm:text-base 3xl:text-xl 4xl:text-2xl truncate">
                          {
                            result.title
                          }
                        </p>

                        <div className="flex flex-wrap items-center gap-2 3xl:gap-3 text-xs 3xl:text-base text-white/40 mt-1">
                          <span>
                            {result.media_type === "live"
                              ? "Live TV channel"
                              : result.media_type === "tv"
                                ? "TV show"
                                : "Movie"}
                          </span>

                          {result.media_type === "live" && result.live_group && (
                            <>
                              <span>•</span>
                              <span>{result.live_group}</span>
                            </>
                          )}

                          {result.media_type === "live" && result.live_country && (
                            <>
                              <span>•</span>
                              <span>{result.live_country}</span>
                            </>
                          )}

                          {result.year && (
                            <>
                              <span>
                                •
                              </span>

                              <span>
                                {
                                  result.year
                                }
                              </span>
                            </>
                          )}

                          {result.vote_average >
                            0 && (
                            <>
                              <span>
                                •
                              </span>

                              <span>
                                ★{" "}
                                {Number(
                                  result.vote_average
                                ).toFixed(
                                  1
                                )}
                              </span>
                            </>
                          )}
                        </div>

                        {Array.isArray(result.watch_providers) &&
                          result.watch_providers.length > 0 && (
                            <div
                              className="mt-2 flex flex-wrap items-center gap-1.5"
                              aria-label="Streaming services"
                            >
                              {result.watch_providers.slice(0, 5).map((provider) => (
                                <span
                                  key={`${provider.provider_id || provider.provider_name}-${provider.availability || "watch"}`}
                                  className="inline-flex h-7 w-7 3xl:h-9 3xl:w-9 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/5"
                                  title={`${provider.provider_name}${provider.availability ? ` • ${provider.availability}` : ""}`}
                                >
                                  {provider.logo_url ? (
                                    <img
                                      src={provider.logo_url}
                                      alt={provider.provider_name || "Streaming service"}
                                      loading="lazy"
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <Tv className="h-3.5 w-3.5 text-white/35" />
                                  )}
                                </span>
                              ))}
                              <span className="ml-1 text-[9px] 3xl:text-xs text-white/25">
                                via JustWatch
                              </span>
                            </div>
                          )}
                      </div>
                    </button>
                  )
                )}
                {combinedSearchResults.length > visibleResultCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleResultCount((count) => count + SEARCH_RESULT_PAGE_SIZE)}
                    className="w-full min-h-12 px-4 text-sm font-semibold text-mg-green hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
                  >
                    Show more results ({combinedSearchResults.length - visibleResultCount} remaining)
                  </button>
                )}
              </div>
            )}

          {query.trim().length < 2 && recentSearches.length === 0 && (
              <div className="p-8 3xl:p-12 text-center text-white/40 text-sm 3xl:text-lg">
                Type at least 2 characters to search movies and TV shows. Recent searches will appear here.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
