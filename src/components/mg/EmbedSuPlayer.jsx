import React, { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { hostedEmbedLabel, hostedEmbedPage } from "@/components/mg/webEmbedProviders";

export default function EmbedSuPlayer({ url, media, title, onBack, backLabel = "Sources" }) {
  const [active, setActive] = useState({ url, label: "Embed.su" });
  const [servers, setServers] = useState([]);
  const [lookup, setLookup] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    setActive({ url, label: "Embed.su" });
    setServers([]);
    setLookup("loading");

    base44.functions.invoke("discoverEmbedSuServers", {
      mediaType: media.mediaType,
      tmdbId: media.tmdbId,
      season: media.season,
      episode: media.episode,
    }).then((response) => {
      if (cancelled) return;
      const data = response?.data ?? response ?? {};
      const seen = new Set();
      const choices = (Array.isArray(data.servers) ? data.servers : [])
        .map((item) => hostedEmbedPage(item?.url))
        .filter((item) => item && !seen.has(item.url) && seen.add(item.url))
        .map((item) => ({
          ...item,
          label: hostedEmbedLabel[item.provider],
        }));
      setServers(choices);
      setLookup(choices.length ? "ready" : "unavailable");
    }).catch(() => {
      if (!cancelled) setLookup("unavailable");
    });

    return () => { cancelled = true; };
  }, [url, media.mediaType, media.tmdbId, media.season, media.episode]);

  return (
    <div
      data-mg-player-root="true"
      data-mg-embedsu-player="true"
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/95 p-2 text-white sm:p-3"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1600px] flex-col">
        <div data-mg-player-topbar="true" className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5">
          <button
            type="button"
            data-mg-player-exit="true"
            onClick={onBack}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-mg-green"
            aria-label={"Back to Media God " + backLabel.toLowerCase()}
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
          <span className="hidden shrink-0 text-xs text-white/50 sm:block">{active.label} web player</span>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2" aria-label="Web player servers">
          <button
            type="button"
            onClick={() => setActive({ url, label: "Embed.su" })}
            aria-pressed={active.url === url}
            className="min-h-11 rounded-lg border border-white/20 bg-mg-card px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-mg-green aria-pressed:border-mg-green"
          >
            Embed.su
          </button>
          {servers.map((server) => (
            <button
              type="button"
              key={server.url}
              onClick={() => setActive(server)}
              aria-pressed={active.url === server.url}
              className="min-h-11 rounded-lg border border-white/20 bg-mg-card px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-mg-green aria-pressed:border-mg-green"
            >
              {server.label}
            </button>
          ))}
          <span className="text-xs text-white/50" role="status">
            {lookup === "loading"
              ? "Checking for UpStream, MixDrop and VidCloud links…"
              : lookup === "unavailable"
                ? "No verified server links found. You can use the Embed.su player or go back."
                : "Choose a discovered server."}
          </span>
        </div>

        <div data-mg-player-stage="true" className="relative aspect-video min-h-[34vh] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
          <iframe
            key={active.url}
            src={active.url}
            title={active.label + ": " + title}
            className="h-full w-full border-0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5 text-xs text-white/60">
          <span>{active.label} has its own player controls. Use {backLabel} to return to Media God.</span>
          <a href={active.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/20 px-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green">
            Open separately <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
