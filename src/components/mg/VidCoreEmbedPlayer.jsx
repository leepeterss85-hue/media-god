import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import OnlyFlixEmbedPlayer from "@/components/mg/OnlyFlixEmbedPlayer";
import SafeEmbedStage from "@/components/mg/SafeEmbedStage";
import { usePlayer } from "@/components/mg/MediaPlayerProvider";
import { buildOnlyFlixEmbedUrl } from "@/components/mg/onlyFlixEmbed";
import { WEB_FALLBACK_LOAD_TIMEOUT_MS, mediaForTorrentFallback } from "@/components/mg/automaticWebFallback";

// The protected portal supplies VidCore's URL but not its media object.
// Parse only the exact VidCore TV path; the movie player stays untouched.
const vidCoreEpisode = (url) => {
  try {
    const parsed = new URL(String(url || ""));
    if (parsed.protocol !== "https:" || parsed.hostname !== "vidcore.org") return null;
    const match = /^\/embed\/tv\/([1-9]\d{0,8})\/(0|[1-9]\d{0,2})\/([1-9]\d{0,3})\/?$/.exec(parsed.pathname);
    if (!match) return null;
    return { tmdbId: Number(match[1]), mediaType: "tv", season: Number(match[2]), episode: Number(match[3]) };
  } catch { return null; }
};

function TvVidCoreWithEpisodeChoices({ url, title, media, onBack, backLabel }) {
  const player = usePlayer();
  const openSources = () => {
    // Torrent/Real-Debrid discovery happens only on the explicit Sources action.
    void player.play({
      ...media,
      id: media.tmdbId,
      title,
      type: "series",
      rdTitle: title,
      rdSeason: media.season,
      rdEpisode: media.episode,
      sources: [],
      completeSources: [],
      skipRdLookup: false,
      skipAddonLookup: false,
      preferRd: true,
      verifiedPlaybackPolicy: "strict",
    });
  };
  return (
    <OnlyFlixEmbedPlayer
      url={url}
      title={title}
      media={media}
      onBack={onBack}
      backLabel={backLabel}
      onOpenSources={openSources}
      initialEpisodeProvider="vidcore"
    />
  );
}

const vidCoreMovie = (url) => {
  try {
    const parsed = new URL(String(url || ""));
    if (parsed.protocol !== "https:" || parsed.hostname !== "vidcore.org") return null;
    const match = /^\/embed\/movie\/([1-9]\d{0,8})\/?$/.exec(parsed.pathname);
    return match ? { tmdbId: Number(match[1]), mediaType: "movie" } : null;
  } catch { return null; }
};

export default function VidCoreEmbedPlayer({ url, title, onBack, backLabel = "Sources" }) {
  const episodeMedia = vidCoreEpisode(url);
  if (episodeMedia) {
    return <TvVidCoreWithEpisodeChoices url={url} title={title} media={episodeMedia} onBack={onBack} backLabel={backLabel} />;
  }
  return <VidCoreMoviePlayer url={url} title={title} onBack={onBack} backLabel={backLabel} />;
}

function VidCoreMoviePlayer({ url, title, onBack, backLabel }) {
  const player = usePlayer();
  const movieMedia = vidCoreMovie(url);
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    setNeedsRecovery(false);
  }, [url]);
  useEffect(() => {
    if (!movieMedia || needsRecovery) return undefined;
    loadedRef.current = false;
    const timeout = window.setTimeout(() => {
      if (!loadedRef.current) setNeedsRecovery(true);
    }, WEB_FALLBACK_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [url, needsRecovery, Boolean(movieMedia)]);
  if (needsRecovery && movieMedia) {
    const fallbackMedia = { ...movieMedia, title };
    return (
      <OnlyFlixEmbedPlayer
        url={buildOnlyFlixEmbedUrl(fallbackMedia)}
        title={title}
        media={fallbackMedia}
        initialFailedProvider="vidcore"
        onBack={onBack}
        backLabel={backLabel}
        onOpenSources={() => { void player.play(mediaForTorrentFallback(fallbackMedia)); }}
      />
    );
  }
  return (
    <div
      data-mg-player-root="true"
      data-mg-vidcore-player="true"
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/95 p-2 text-white sm:p-3"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1600px] flex-col">
        <div
          data-mg-player-topbar="true"
          className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5"
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
          {movieMedia && (
            <button type="button" data-mg-vidcore-try-next="true"
              onClick={() => setNeedsRecovery(true)}
              className="min-h-11 shrink-0 rounded-lg border border-white/20 px-3 text-xs font-semibold hover:bg-white/10"
            >Skip QR / Try next</button>
          )}
          <span className="hidden shrink-0 text-xs text-white/50 sm:block">VidCore web player</span>
        </div>

        <SafeEmbedStage>
          <iframe
            key={url}
            src={url}
            title={"VidCore: " + title}
            className="h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => { loadedRef.current = true; }}
            onError={() => { if (movieMedia) setNeedsRecovery(true); }}
          />
        </SafeEmbedStage>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5 text-xs text-white/60">
          <span>VidCore has its own player controls. Use {backLabel} to return to Media God.</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/20 px-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green"
          >
            Open separately <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}