import React, { useMemo } from "react";
import { Film } from "lucide-react";
import { Image } from "@/components/ui/image";

// Public (no-auth) page that renders a shared watchlist from the `d` URL param.
export default function SharedWatchlist() {
  const items = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("d");
    if (!d) return [];
    try {
      return JSON.parse(decodeURIComponent(atob(d)));
    } catch {
      return [];
    }
  }, []);

  return (
    <div className="min-h-screen bg-mg-background text-white">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Film className="w-5 h-5 text-mg-green" />
          <h1 className="text-xl font-bold text-white">Shared Watchlist</h1>
        </div>
        <p className="text-sm text-white/50 mb-6">
          {items.length} {items.length === 1 ? "title" : "titles"} to watch
        </p>

        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/40 text-sm">This share link is empty or invalid.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {items.map((m, i) => (
              <div key={i}>
                <div className="relative aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
                  <Image
                    src={m.poster_url}
                    alt={m.title}
                    className="w-full h-full object-cover"
                    fittingType="fill"
                  />
                </div>
                <p className="mt-2 text-sm text-white truncate">{m.title}</p>
                <p className="text-xs text-white/40">{m.year}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}