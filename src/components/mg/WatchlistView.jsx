import React, { useEffect, useState } from "react";
import { Trash2, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function WatchlistView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = () =>
    base44.entities.WatchlistItem.list("-created_date", 100).then((i) => {
      setItems(i);
      setLoading(false);
    });

  useEffect(() => {
    load();
  }, []);

  const remove = async (item) => {
    await base44.entities.WatchlistItem.delete(item.id);
    toast({ title: "Removed from Watchlist" });
    load();
  };

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-white mb-1">Watchlist</h1>
      <p className="text-sm text-white/50 mb-6">
        {items.length} saved {items.length === 1 ? "title" : "titles"}
      </p>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-mg-card rounded-md animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/40 text-sm">Your watchlist is empty.</p>
          <p className="text-white/30 text-xs mt-1">
            Add movies from the Movies tab.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {items.map((m) => (
            <div key={m.id} className="group">
              <div className="relative aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
                <Image
                  src={m.poster_url}
                  alt={m.title}
                  className="w-full h-full object-cover"
                  fittingType="fill"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button className="w-9 h-9 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-4 h-4 fill-black" />
                  </button>
                  <button
                    onClick={() => remove(m)}
                    className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-white truncate">{m.title}</p>
              <p className="text-xs text-white/40">{m.year}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}