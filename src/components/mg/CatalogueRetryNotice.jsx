import React, { useEffect, useState } from "react";

export default function CatalogueRetryNotice({ busy, blocked = false, onRetry, hasItems = false, catalogue = false }) {
  const [online, setOnline] = useState(() => globalThis.navigator?.onLine !== false);
  const [reconnected, setReconnected] = useState(false);
  useEffect(() => {
    const connected = () => { setOnline(true); setReconnected(true); };
    const disconnected = () => { setOnline(false); setReconnected(false); };
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  const message = busy ? "Trying to load your titles again…"
    : !online ? "You're offline. Check your Wi-Fi or internet connection, then choose Retry."
    : reconnected ? "Your device reports that the connection is back. Choose Retry to load your titles."
    : "We couldn't load your titles. The service may be temporarily unavailable. Choose Retry to try again.";
  return (
    <div className="my-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">
      <div role="status" aria-live="polite" className="min-w-0 flex-1">
        <p>{message}</p>
        {hasItems && <p className="mt-1 text-white/60">{catalogue
          ? "Showing previously loaded results; they may not match your current filters."
          : "Your last loaded titles are still shown."}</p>}
      </div>
      <button type="button" aria-disabled={busy || blocked}
        onClick={() => { if (!busy && !blocked) onRetry(); }}
        className="min-h-11 rounded-lg border border-white/20 bg-white/10 px-5 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-mg-green"
      >{busy ? "Retrying…" : "Retry"}</button>
    </div>
  );
}
