import React, { useEffect, useState } from "react";
import { Play, X, History } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { Image } from "@/components/ui/image";

const fmtTime = (seconds) => {
  if (!seconds || seconds < 1 || !isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const hours = Math.floor(minutes / 60);

  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(
        remainingSeconds
      ).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

export default function ContinueWatchingRow() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();

  const load = () => {
    base44.entities.ContinueWatching.list("-updated_date", 20)
      .then((rows) => setItems(rows))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.ContinueWatching.subscribe(() => load());
    return unsubscribe;
  }, []);

  const remove = async (id, event) => {
    event?.stopPropagation();

    try {
      await base44.entities.ContinueWatching.delete(id);
    } catch {
      // Keep the row usable even if a delete request fails.
    }
  };

  const resume = (item) => {
    if (item.source_type === "rd") {
      player.play({
        title: item.title,
        poster: item.poster_url,
        rdTitle: item.title,
        rdYear: item.year,
        startTime: item.progress,
        noRd: true,
        sources: [{ label: "Real-Debrid", type: "rd", src: "" }],
      });
      return;
    }

    player.play({
      title: item.title,
      poster: item.poster_url,
      rdYear: item.year,
      startTime: item.progress,
      noRd: true,
      sources: [{ label: "Resume", type: "file", src: item.video_url }],
    });
  };

  if (loading || items.length === 0) return null;

  return (
    <section className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14 pt-2 sm:pt-4">
      <div className="flex items-center gap-2 3xl:gap-3 mb-3 3xl:mb-4">
        <History className="w-4 h-4 3xl:w-5 3xl:h-5 text-mg-green" />
        <h2 className="text-white font-semibold text-sm sm:text-base 3xl:text-xl 4xl:text-2xl">
          Continue Watching
        </h2>
      </div>

      <div className="flex gap-3 3xl:gap-5 overflow-x-auto overscroll-x-contain pb-2 scrollbar-hide snap-x snap-proximity">
        {items.map((item) => {
          const progress =
            item.duration > 0
              ? Math.min(100, (item.progress / item.duration) * 100)
              : 0;

          return (
            <div
              key={item.id}
              onClick={() => resume(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  resume(item);
                }
              }}
              className="group relative w-36 sm:w-44 md:w-48 xl:w-52 3xl:w-64 4xl:w-72 shrink-0 text-left cursor-pointer snap-start"
            >
              <div className="relative aspect-video rounded-lg 3xl:rounded-xl overflow-hidden bg-mg-card border border-white/10">
                <Image
                  src={item.poster_url}
                  fittingType="fill"
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-80" />

                <div className="mg-hover-action absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-9 h-9 3xl:w-12 3xl:h-12 4xl:w-14 4xl:h-14 rounded-full bg-mg-green text-black flex items-center justify-center">
                    <Play className="w-4 h-4 3xl:w-6 3xl:h-6 fill-black" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => remove(item.id, event)}
                  className="mg-hover-action absolute top-1 right-1 3xl:top-2 3xl:right-2 w-7 h-7 3xl:w-9 3xl:h-9 rounded-full bg-black/70 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
                  aria-label="Remove"
                >
                  <X className="w-3.5 h-3.5 3xl:w-4 3xl:h-4" />
                </button>

                <div className="absolute bottom-0 left-0 right-0 h-1 3xl:h-1.5 bg-white/20">
                  <div
                    className="h-full bg-mg-green"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-1.5 3xl:mt-2 text-white font-semibold text-xs sm:text-sm 3xl:text-base truncate">
                {item.title}
              </div>

              <div className="text-white/40 text-[10px] sm:text-xs 3xl:text-sm">
                {fmtTime(item.progress)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
