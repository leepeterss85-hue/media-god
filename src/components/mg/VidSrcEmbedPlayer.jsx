import React from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import SafeEmbedStage from "@/components/mg/SafeEmbedStage";

export default function VidSrcEmbedPlayer({ url, title, onBack, backLabel = "Sources" }) {
  return (
    <div
      data-mg-player-root="true"
      data-mg-vidsrc-player="true"
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
          <button type="button" data-mg-skip-verification="true" onClick={onBack} className="min-h-11 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-mg-green" title="This provider requires verification; return to another source without scanning its QR code.">Skip QR · Sources</button>
          <span className="hidden shrink-0 text-xs text-white/50 sm:block">VidSrc web player</span>
        </div>

        <p role="note" data-mg-qr-help="true" className="mb-2 rounded-lg border border-white/10 bg-black/70 px-3 py-1.5 text-xs leading-snug text-white/80">If a QR code or human-verification message appears, go back to Sources and choose another player. Do not scan the code.</p>

        <SafeEmbedStage>
          <iframe
            key={url}
            src={url}
            title={"VidSrc: " + title}
            className="h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </SafeEmbedStage>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 p-2.5 text-xs text-white/60">
          <span>VidSrc has its own player controls. Use {backLabel} to return to Media God.</span>
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