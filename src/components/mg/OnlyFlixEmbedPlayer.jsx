import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, ListVideo, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buildOnlyFlixEmbedUrl, buildOnlyFlixTitlePageUrl } from "@/components/mg/onlyFlixEmbed";
import { buildVidCoreEmbedUrl } from "@/components/mg/vidCoreEmbed";
import { buildVidSrcEmbedUrl } from "@/components/mg/vidsrcEmbed";
import { WEB_FALLBACK_LOAD_TIMEOUT_MS, nextWebFallback, mediaForTorrentFallback } from "@/components/mg/automaticWebFallback";
// The player portal is inside CorePlayerProvider but outside PlayerAutomationBridge.
// Its enhanced context is unavailable: use the core player context instead.
import { usePlayer } from "@/components/mg/MediaPlayerProvider";
import { isNativeFireTvEmbedRemoteAvailable, setNativeFireTvEmbedRemoteActive } from "@/components/mg/nativeFireTvBridge";
import OnlyFlixRemotePointer from "@/components/mg/OnlyFlixRemotePointer";
import CastButton from "@/components/mg/CastButton";
import { initialFireTvScraper } from "@/components/mg/fireTvScraperRecovery";
import SafeEmbedStage from "@/components/mg/SafeEmbedStage";
import {
  buildVidRiftEpisodeEmbedUrl,
  buildStellarEpisodeEmbedUrl,
  buildVidRiftMovieEmbedUrl,
  buildStellarMovieEmbedUrl,
  buildVidLinkMovieEmbedUrl,
  buildTwoEmbedEmbedUrl,
  buildCineSrcEmbedUrl,
  buildMultiEmbedEmbedUrl,
} from "@/components/mg/extraEmbedProviders";

export default function OnlyFlixEmbedPlayer({ url, title, media, onBack, onOpenSources, backLabel = "Sources", initialEpisodeProvider = "onlyflix", initialFailedProvider = "" }) {
  useEffect(() => {
    setNativeFireTvEmbedRemoteActive(true);
    return () => { setNativeFireTvEmbedRemoteActive(false); };
  }, []);

  const player = usePlayer();
  const [vylaResult, setVylaResult] = useState({ status: "IDLE", streams: [] });
  const [autoRecovery, setAutoRecovery] = useState(false);
  const iframeLoadedRef = useRef(false);
  const handledFailureRef = useRef(false);
  const torrentStartedRef = useRef(false);
  const vylaStartedRef = useRef(false);
  const failedProvidersRef = useRef(new Set(initialFailedProvider ? [initialFailedProvider] : []));
  const isFireTv = isNativeFireTvEmbedRemoteAvailable();
  // Match the working source-card OnlyFlix Multiple Servers route. This is
  // an extra manual scraper choice, not a replacement for web provider tabs.
  const onlyFlixServersUrl = isFireTv ? buildOnlyFlixTitlePageUrl({
    mediaType: media?.mediaType || (media?.type === "series" ? "tv" : media?.type),
    title,
  }) : "";
  // Fire TV first tries OnlyFlix after its picture-surface fix. Do not
  // pre-emptively select VidCore based on historic CDN failures. If this
  // specific iframe cannot load, Try next and automatic web fallbacks still
  // retain VidCore and every selectable scraper tab.
  const firstFireTvScraper = useMemo(() => initialFireTvScraper({
    nativeFireTv: isFireTv,
    url,
    mediaType: media?.mediaType || (media?.type === "series" ? "tv" : media?.type),
    initialProvider: initialEpisodeProvider,
    alternatives: [
      { id: "vidcore", url: buildVidCoreEmbedUrl(media) },
      { id: "vidrift", url: media?.mediaType === "tv" ? buildVidRiftEpisodeEmbedUrl(media) : buildVidRiftMovieEmbedUrl(media) },
      { id: "stellar", url: media?.mediaType === "tv" ? buildStellarEpisodeEmbedUrl(media) : buildStellarMovieEmbedUrl(media) },
    ],
  }), [isFireTv, url, initialEpisodeProvider, media]);
  const [activeEpisodePlayer, setActiveEpisodePlayer] = useState(firstFireTvScraper);
  useEffect(() => {
    setActiveEpisodePlayer(firstFireTvScraper);
    setAutoRecovery(false);
    torrentStartedRef.current = false;
    vylaStartedRef.current = false;
    failedProvidersRef.current = new Set(initialFailedProvider ? [initialFailedProvider] : []);
  }, [url, firstFireTvScraper, initialFailedProvider]);
  // All eligible web players stay selectable for an exact TV episode.
  // VidCore can be the entry point, but switching to OnlyFlix or another
  // episode player never opens the unrelated torrent-finding screen.
  const tvBackups = useMemo(() => media?.mediaType === "tv" ? [
    { id: "onlyflix", label: "OnlyFlix", url: initialEpisodeProvider === "vidcore" ? buildOnlyFlixEmbedUrl(media) : url },
    { id: "vidcore", label: "VidCore", url: initialEpisodeProvider === "vidcore" ? url : buildVidCoreEmbedUrl(media) },
    { id: "vidrift", label: "VidRift", url: buildVidRiftEpisodeEmbedUrl(media) },
    { id: "stellar", label: "Stellar", url: buildStellarEpisodeEmbedUrl(media) },
    { id: "vidsrc", label: "VidSrc", url: buildVidSrcEmbedUrl(media) },
    { id: "twoembed", label: "2Embed", url: buildTwoEmbedEmbedUrl(media) },
    { id: "cinesrc", label: "CineSrc", url: buildCineSrcEmbedUrl(media) },
    { id: "multiembed", label: "MultiEmbed", url: buildMultiEmbedEmbedUrl(media) },
  ].filter((item) => Boolean(item.url)) : [], [media, url, initialEpisodeProvider]);
  // Movie backups mirror the proven TV switcher without changing the
  // default OnlyFlix film launch or making backup network requests upfront.
  const movieBackups = useMemo(() => media?.mediaType === "movie" ? [
    { id: "onlyflix", label: "OnlyFlix", url },
    { id: "vidcore", label: "VidCore", url: buildVidCoreEmbedUrl(media) },
    { id: "vidsrc", label: "VidSrc", url: buildVidSrcEmbedUrl(media) },
    { id: "vidrift", label: "VidRift", url: buildVidRiftMovieEmbedUrl(media) },
    { id: "stellar", label: "Stellar", url: buildStellarMovieEmbedUrl(media) },
    { id: "vidlink", label: "VidLink", url: buildVidLinkMovieEmbedUrl(media) },
    { id: "twoembed", label: "2Embed", url: buildTwoEmbedEmbedUrl(media) },
    { id: "cinesrc", label: "CineSrc", url: buildCineSrcEmbedUrl(media) },
    { id: "multiembed", label: "MultiEmbed", url: buildMultiEmbedEmbedUrl(media) },
  ].filter((item) => Boolean(item.url)) : [], [media, url]);
  const activeBackups = useMemo(() => {
    const options = tvBackups.length ? tvBackups : movieBackups;
    const index = options.findIndex((item) => item.id === initialEpisodeProvider);
    return index > 0 ? [options[index], ...options.filter((_, i) => i !== index)] : options;
  }, [tvBackups, movieBackups, initialEpisodeProvider]);
  const vylaType = media?.mediaType === "tv" ? "tv" : media?.mediaType === "movie" ? "movie" : "";
  const vylaId = Number(media?.tmdbId ?? media?.tmdb_id ?? media?.id);
  const vylaSeason = Number(media?.season ?? media?.rdSeason);
  const vylaEpisode = Number(media?.episode ?? media?.rdEpisode);
  const vylaReady = Boolean(vylaType && Number.isInteger(vylaId) && vylaId > 0 &&
    (vylaType === "movie" || (Number.isInteger(vylaSeason) && vylaSeason > 0 &&
      Number.isInteger(vylaEpisode) && vylaEpisode > 0)));
  const beginTorrentFallback = useCallback(() => {
    if (torrentStartedRef.current) return;
    torrentStartedRef.current = true;
    // This Sources handoff closes the iframe and starts the existing
    // torrent/Real-Debrid discovery pipeline for this exact title/episode.
    if (typeof onOpenSources === "function") {
      onOpenSources();
      return;
    }
    void player.play(mediaForTorrentFallback(media));
  }, [onOpenSources, player, media]);
  useEffect(() => {
    if (activeEpisodePlayer !== "vyla") return undefined;
    if (!vylaReady) {
      setVylaResult({ status: "INVALID_IDENTITY", streams: [] });
      return undefined;
    }
    let cancelled = false;
    setVylaResult({ status: "LOADING", streams: [] });
    base44.functions.invoke("vylaStreamPilot", {
      media_type: vylaType,
      tmdb_id: vylaId,
      ...(vylaType === "tv" ? { season: vylaSeason, episode: vylaEpisode } : {}),
    }).then((response) => {
      if (cancelled) return;
      const result = response?.data ?? response ?? {};
      setVylaResult({
        status: String(result.status || "UNAVAILABLE"),
        streams: Array.isArray(result.streams) ? result.streams.slice(0, 6) : [],
      });
    }).catch(() => {
      if (!cancelled) setVylaResult({ status: "UNAVAILABLE", streams: [] });
    });
    return () => { cancelled = true; };
  }, [activeEpisodePlayer, vylaType, vylaId, vylaSeason, vylaEpisode, vylaReady]);
  const launchVylaCandidate = (candidate) => {
    if (candidate?.type !== "url" || candidate?.addon !== "Vyla (test)" ||
      !/^https:\/\//i.test(String(candidate?.url || ""))) return;
    // Only a viewer-selected candidate enters the normal player. The
    // iframe default and every existing movie/episode provider remain intact.
    void player.play({
      ...media,
      tmdbId: vylaId,
      mediaType: vylaType,
      ...(vylaType === "tv" ? { season: vylaSeason, episode: vylaEpisode } : {}),
      verifiedPlaybackPolicy: "strict",
      preferRd: false,
      skipAddonLookup: true,
      skipRdLookup: true,
      sources: [candidate],
      completeSources: [candidate],
    });
  };
  const chosen = activeBackups.find((item) => item.id === activeEpisodePlayer);
  const selectedUrl = chosen?.url || url;
  const providerLabel = chosen?.label || "OnlyFlix";
  const advanceAfterFailure = useCallback(() => {
    if (handledFailureRef.current) return;
    handledFailureRef.current = true;
    failedProvidersRef.current.add(activeEpisodePlayer);
    const next = nextWebFallback(
      activeBackups, activeEpisodePlayer, vylaReady,
      Array.from(failedProvidersRef.current)
    );
    setAutoRecovery(true);
    if (next === "torrents") {
      beginTorrentFallback();
    } else {
      if (next === "vyla") {
        vylaStartedRef.current = false;
        setVylaResult({ status: "LOADING", streams: [] });
      }
      setActiveEpisodePlayer(next);
    }
  }, [activeBackups, activeEpisodePlayer, vylaReady, beginTorrentFallback]);

  useEffect(() => {
    // Cross-origin iframes cannot report actual video playback. Never change
    // a loaded page on a timer: only auto-advance a failed/stalled page load.
    if (activeEpisodePlayer === "vyla") return undefined;
    iframeLoadedRef.current = false;
    handledFailureRef.current = false;
    const timeout = window.setTimeout(() => {
      if (!iframeLoadedRef.current) advanceAfterFailure();
    }, WEB_FALLBACK_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [activeEpisodePlayer, selectedUrl, advanceAfterFailure]);

  useEffect(() => {
    if (activeEpisodePlayer !== "vyla" || !autoRecovery ||
        vylaResult.status === "IDLE" || vylaResult.status === "LOADING" ||
        vylaStartedRef.current) return;
    vylaStartedRef.current = true;
    const candidates = vylaResult.streams.filter((item) =>
      item?.addon === "Vyla (test)" && item?.type === "url" &&
      /^https:\/\//i.test(String(item?.url || ""))
    );
    if (candidates.length) {
      // Vyla's direct candidates are all supplied to the existing native
      // player before any torrent lookup is permitted.
      void player.play({
        ...mediaForTorrentFallback(media),
        skipAddonLookup: true,
        skipRdLookup: true,
        preferRd: false,
        sources: candidates,
        completeSources: candidates,
      });
    } else {
      beginTorrentFallback();
    }
  }, [activeEpisodePlayer, autoRecovery, vylaResult, player, media, beginTorrentFallback]);
  const [chromeVisible, setChromeVisible] = useState(true);
  useEffect(() => {
    if (!isFireTv) return;
    let timer;
    const scheduleHide = () => {
      setChromeVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setChromeVisible(false), 2500);
    };
    scheduleHide();
    const onActivity = () => scheduleHide();
    window.addEventListener("keydown", onActivity);
    window.addEventListener("mg:onlyflix-pointer-move", onActivity);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("mg:onlyflix-pointer-move", onActivity);
    };
  }, [isFireTv]);

  // Keep source buttons visible for Fire TV D-pad access even after inactivity.
  // The crosshair itself can still fade independently.
  const chromeFade = "opacity-100";


  return (
    <div
      data-mg-player-root="true"
      data-mg-onlyflix-player="true"
      data-mg-embedded-remote-player="true"
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/95 p-2 text-white sm:p-3"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1600px] flex-col">
        <div
          data-mg-player-topbar="true"
          className={`mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5 transition-opacity duration-500 ${chromeFade}`}
        >
          <button
            type="button"
            data-mg-player-exit="true"
            onClick={onBack}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-mg-green"
            aria-label={"Back to Media God " + backLabel.toLowerCase()}
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
          <button
            type="button"
            data-mg-try-next-web-source="true"
            onClick={() => {
              handledFailureRef.current = false;
              advanceAfterFailure();
            }}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-semibold hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-mg-green"
            data-mg-skip-verification="true"
            title="If this provider asks for a human-verification QR code, skip it and try the next source without scanning"
          >Skip QR / Try next</button>
          <button
            type="button"
            data-mg-embedded-open-sources="true"
            onClick={onOpenSources}
            aria-label="Sources inside video player"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-mg-green/40 bg-mg-green/10 px-3 text-xs font-bold text-mg-green hover:bg-mg-green/20 focus:outline-none focus:ring-2 focus:ring-mg-green"
          >
            <ListVideo className="h-4 w-4" />
            Sources
          </button>
          {isFireTv && (
            <button
              type="button"
              data-mg-embedded-top-fullscreen="true"
              onClick={() => window.dispatchEvent(new CustomEvent("mg:embed-toggle-fullscreen"))}
              aria-label="Fullscreen"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-mg-green/50 bg-mg-green/10 px-3 text-xs font-bold text-white hover:bg-mg-green/20 focus:outline-none focus:ring-2 focus:ring-mg-green"
            >Fullscreen</button>
          )}
          <CastButton
            url=""
            title={title}
            source={{ type: "provider", browserPlayable: false }}
            media={{
              title,
              tmdbId: media?.tmdbId || media?.tmdb_id || media?.id || "",
              year: media?.year || "",
              poster: media?.poster || "",
              mediaType: media?.mediaType || media?.type || "movie",
              season: media?.season || media?.rdSeason || 0,
              episode: media?.episode || media?.rdEpisode || 0,
              startTime: media?.startTime || 0,
            }}
          />
          <span className="hidden shrink-0 text-xs text-white/50 sm:block">{providerLabel} web player</span>
        </div>

        {activeBackups.length > 1 && (
          <nav
            data-mg-episode-player-backups={tvBackups.length ? "true" : undefined}
            data-mg-movie-player-backups={movieBackups.length ? "true" : undefined}
            aria-label={movieBackups.length ? "Movie players" : "TV episode players"}
            className="mb-2 flex max-w-full items-center gap-2 overflow-x-auto rounded-lg bg-zinc-950/80 px-2 py-2"
          >
            {isFireTv && (
              <button type="button"
                data-mg-embedded-top-sources="true"
                onClick={onOpenSources}
                className="min-h-10 shrink-0 rounded-lg border border-mg-green/60 px-3 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green"
              >Sources</button>
            )}
            {onlyFlixServersUrl && (
              <button type="button"
                data-mg-embedded-onlyflix-servers="true"
                onClick={() => window.open(onlyFlixServersUrl, "_blank", "noopener,noreferrer")}
                className="min-h-10 shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green"
              >OnlyFlix servers</button>
            )}
            <span className="shrink-0 text-xs text-white/50">
              {movieBackups.length ? "Movie player:" : "Episode player:"}
            </span>
            {activeBackups.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setAutoRecovery(false);
                  setActiveEpisodePlayer(option.id);
                }}
                aria-pressed={activeEpisodePlayer === option.id}
                data-mg-episode-provider={tvBackups.length ? option.id : undefined}
                data-mg-movie-provider={movieBackups.length ? option.id : undefined}
                className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green ${activeEpisodePlayer === option.id
                  ? "border-mg-green/70 bg-mg-green/20 text-mg-green"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/15"}`}
              >
                {option.label}
              </button>
            ))}
            {vylaReady && (
              <button
                type="button"
                data-mg-vyla-test-player="true"
                onClick={() => {
                  setAutoRecovery(false);
                  setActiveEpisodePlayer("vyla");
                }}
                aria-pressed={activeEpisodePlayer === "vyla"}
                className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green ${activeEpisodePlayer === "vyla" ? "border-mg-green/70 bg-mg-green/20 text-mg-green" : "border-white/15 bg-white/5 text-white hover:bg-white/15"}`}
              >Vyla (test)</button>
            )}
          </nav>
        )}
        <SafeEmbedStage>
          {activeEpisodePlayer === "vyla" ? (
            <div data-mg-vyla-source-panel="true" className="h-full w-full overflow-y-auto p-4 sm:p-6">
              <h3 className="mb-2 text-base font-bold">Vyla (test) · {vylaType === "tv" ? `S${vylaSeason} E${vylaEpisode}` : "Film"}</h3>
              <p className="mb-4 text-xs text-white/60">
                Choose a candidate to test it. Availability and English audio have not been verified.
                OnlyFlix remains the default; return to its tab at any time.
              </p>
              {vylaResult.status === "LOADING" ? (
                <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Checking Vyla sources…</p>
              ) : vylaResult.streams.length ? (
                <div className="flex flex-col gap-2">
                  {vylaResult.streams.map((candidate, index) => (
                    <button
                      type="button"
                      key={candidate.url || index}
                      onClick={() => launchVylaCandidate(candidate)}
                      className="min-h-11 rounded-lg border border-white/20 bg-white/10 p-3 text-left text-sm font-medium hover:border-mg-green/60 hover:bg-mg-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
                    >{candidate.label || `Vyla candidate ${index + 1}`} · Try source</button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-amber-100">
                  {vylaResult.status === "DISABLED" ? "Vyla is not enabled yet." :
                    vylaResult.status === "NO_CANDIDATES" ? "No playable candidates were returned for this title." :
                    "Vyla could not return a source. Please use OnlyFlix or Sources instead."}
                </p>
              )}
            </div>
          ) : (
            <>
              <iframe
                key={selectedUrl}
                src={selectedUrl}
                title={providerLabel + ": " + title}
                className="h-full w-full border-0"
                allow={isFireTv
                  ? "autoplay; encrypted-media; picture-in-picture; fullscreen"
                  : "autoplay; encrypted-media; picture-in-picture"}
                allowFullScreen={isFireTv}
                referrerPolicy="strict-origin-when-cross-origin"
                tabIndex={0}
                data-mg-embed-iframe="true"
                onLoad={() => { iframeLoadedRef.current = true; }}
                onError={advanceAfterFailure}
              />
              <OnlyFlixRemotePointer compact={isFireTv} visible={!isFireTv || chromeVisible} />
            </>
          )}
        </SafeEmbedStage>

        {!isFireTv && <div data-mg-embed-footer="true" className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5 text-xs text-white/60 transition-opacity duration-500 ${chromeFade}`}>
          <span>{activeEpisodePlayer === "vyla" ? "Select a returned source to try it, or choose OnlyFlix to return to the usual player." : isNativeFireTvEmbedRemoteAvailable() ? "Use Menu for all movie/episode sources, Left/Right to choose and Select to switch. Press Down to return to the video pointer; press Back to exit." : <>{providerLabel} has its own player controls. Use {backLabel} to return to Media God.</>}</span>
          {activeEpisodePlayer !== "vyla" && <a
            href={selectedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/20 px-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green"
          >
            Open separately <ExternalLink className="h-4 w-4" />
          </a>}
        </div>}
      </div>
    </div>
  );
}