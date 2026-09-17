import React from "react";

export const REEZN_URL = "https://reezntvapp.com/download";

export default function ReeznCardAction({ focusKey = "" }) {
  return (
    <a
      href={REEZN_URL}
      target="_blank"
      rel="noreferrer"
      data-mg-reezn-card-action="true"
      {...(focusKey ? { "data-mg-focus-key": `reezn:${focusKey}` } : {})}
      onClick={(event) => event.stopPropagation()}
      className="absolute right-1.5 top-1.5 z-30 inline-flex min-h-7 items-center rounded-md border border-mg-green/45 bg-black/80 px-2 text-[9px] font-black uppercase tracking-[0.08em] text-mg-green shadow-lg backdrop-blur-sm transition hover:border-mg-green hover:bg-mg-green hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green 3xl:right-2 3xl:top-2 3xl:min-h-8 3xl:px-2.5 3xl:text-[10px]"
      title="Open Reezn"
      aria-label="Open Reezn"
    >
      Reezn
    </a>
  );
}
