import React, { useEffect, useState } from "react";
import { Zap, Settings, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Top-of-app notice shown when the user has no Real-Debrid token on file.
// Streaming relies on RD, so prompt them to link their account.
export default function RdBanner({ onLinkSettings }) {
  const [hasRd, setHasRd] = useState(null); // null = still checking
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    base44.auth
      .me()
      .then((u) => setHasRd(!!u?.rd_token))
      .catch(() => setHasRd(false));
  }, []);

  if (hasRd === null || hasRd || dismissed) return null;

  return (
    <div className="flex items-center gap-2 bg-mg-green/10 border-b border-mg-green/30 px-3 py-2 text-xs">
      <Zap className="w-4 h-4 text-mg-green shrink-0" />
      <p className="text-white/80 flex-1 min-w-0">
        You must have a{" "}
        <span className="text-mg-green font-semibold">Real-Debrid</span> account
        linked to stream content.
      </p>
      <button
        onClick={onLinkSettings}
        className="flex items-center gap-1 bg-mg-green text-black font-semibold px-2.5 py-1 rounded-md whitespace-nowrap"
      >
        <Settings className="w-3.5 h-3.5" /> Link
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/50 hover:text-white shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}