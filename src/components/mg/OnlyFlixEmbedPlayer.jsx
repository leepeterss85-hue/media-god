import React, { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, ListVideo } from "lucide-react";
import { isNativeFireTvEmbedRemoteAvailable, setNativeFireTvEmbedRemoteActive } from "@/components/mg/nativeFireTvBridge";
import OnlyFlixRemotePointer from "@/components/mg/OnlyFlixRemotePointer";
import CastButton from "@/components/mg/CastButton";
import {
  buildVidRiftEpisodeEmbedUrl,
  buildStellarEpisodeEmbedUrl,
} from "@/components/mg/extraEmbedProviders";

export default function OnlyFlixEmbedPlayer({ url, title, media, onBack, onOpenSources, backLabel = "Sources" }) {
  useEffect(() => {
    setNativeFireTvEmbedRemoteActive(true);
    return () => { setNativeFireTvEmbedRemoteActive(false); };
  }, []);

  const isFireTv = isNativeFireTvEmbedRemoteAvailable();
  const [activeEpisodePlayer, setActiveEpisodePlayer] = useState("onlyflix");
  useEffect(() => setActiveEpisodePlayer("onlyflix"), [url]);
  const tvBackups = media?.mediaType === "tv" ? [
    { id: "onlyflix", label: "OnlyFlix", url },
    { id: "vidrift", label: "VidRift", url: buildVidRiftEpisodeEmbedUrl(media) },
    { id: "stellar", label: "Stellar", url: buildStellarEpisodeEmbedUrl(media) },
  ].filter((item) => Boolean(item.url)) : [];
  const chosen = tvBackups.find((item) => item.id === activeEpisodePlayer);
  const selectedUrl = chosen?.url || url;
  const providerLabel = chosen?.label || "OnlyFlix";
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

  const chromeFade = isFireTv && !chromeVisible ? "opacity-0" : "opacity-100";

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
            data-mg-embedded-open-sources="true"
            onClick={onOpenSources}
            aria-label="Sources inside video player"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-mg-green/40 bg-mg-green/10 px-3 text-xs font-bold text-mg-green hover:bg-mg-green/20 focus:outline-none focus:ring-2 focus:ring-mg-green"
          >
            <ListVideo className="h-4 w-4" />
            Sources
          </button>
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

        {tvBackups.length > 1 && (
          <nav
            data-mg-episode-player-backups="true"
            aria-label="TV episode players"
            className="mb-2 flex max-w-full items-center gap-2 overflow-x-auto rounded-lg bg-zinc-950/80 px-2 py-2"
          >
            <span className="shrink-0 text-xs text-white/50">Episode player:</span>
            {tvBackups.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveEpisodePlayer(option.id)}
                aria-pressed={activeEpisodePlayer === option.id}
                data-mg-episode-provider={option.id}
                className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green ${activeEpisodePlayer === option.id
                  ? "border-mg-green/70 bg-mg-green/20 text-mg-green"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/15"}`}
              >
                {option.label}
              </button>
            ))}
          </nav>
        )}
        <div
          data-mg-player-stage="true"
          className="relative aspect-video min-h-[34vh] w-full overflow-hidden rounded-xl border border-white/10 bg-black"
        >
          <iframe
            key={selectedUrl}
            src={selectedUrl}
            title={providerLabel + ": " + title}
            className="h-full w-full border-0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            tabIndex={0}
            data-mg-embed-iframe="true"
          />
          <OnlyFlixRemotePointer visible={!isFireTv || chromeVisible} />
        </div>

        <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5 text-xs text-white/60 transition-opacity duration-500 ${chromeFade}`}>
          <span>{isNativeFireTvEmbedRemoteAvailable() ? "Move the pointer onto Play with the D-pad, then press Select. Press Back to return to Media God." : <>{providerLabel} has its own player controls. Use {backLabel} to return to Media God.</>}</span>
          <a
            href={selectedUrl}
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