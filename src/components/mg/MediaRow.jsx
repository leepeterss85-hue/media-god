import React, { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MediaCard from "@/components/mg/MediaCard";

export default function MediaRow({
  title,
  items,
  onOpen,
  onWatchlist,
  watched,
  iconUrl = "",
  actionLabel = "",
  onAction = null,
  embedded = false,
  detailsOnly = false,
}) {
  const ref = useRef(null);

  const scroll = (direction) => {
    const element = ref.current;
    if (!element) return;

    element.scrollBy({
      left: direction * element.clientWidth * 0.82,
      behavior: "smooth",
    });
  };

  if (!items || items.length === 0) return null;

  return (
    <section
      className={
        embedded
          ? "min-w-0"
          : "px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14"
      }
      data-mg-media-row-embedded={
        embedded
          ? "true"
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3 mb-2 3xl:mb-3">
        <div className="flex min-w-0 items-center gap-2.5 3xl:gap-3">
          {iconUrl && (
            <img
              src={iconUrl}
              alt=""
              aria-hidden="true"
              className="h-7 w-7 shrink-0 rounded-md object-cover 3xl:h-9 3xl:w-9"
              loading="lazy"
            />
          )}
          <h2 className="truncate text-base font-semibold text-white sm:text-lg xl:text-xl 3xl:text-2xl 4xl:text-3xl">
            {title}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2 3xl:gap-3">
          {actionLabel && onAction && (
            <button
              type="button"
              data-mg-row-action="true"
              onClick={onAction}
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/75 transition hover:border-mg-green/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-mg-green/60 3xl:min-h-11 3xl:px-4 3xl:text-sm"
              aria-label={`${actionLabel} ${title}`}
            >
              {actionLabel}
            </button>
          )}

          <div data-mg-row-arrows="true" className="hidden sm:flex gap-1.5 3xl:gap-2">
            <button
              type="button"
              onClick={() => scroll(-1)}
              className="w-9 h-9 3xl:w-11 3xl:h-11 4xl:w-12 4xl:h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6" />
            </button>

            <button
              type="button"
              onClick={() => scroll(1)}
              className="w-9 h-9 3xl:w-11 3xl:h-11 4xl:w-12 4xl:h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={ref}
        data-mg-tv-row="true"
        className="flex gap-2.5 sm:gap-3 xl:gap-4 3xl:gap-5 4xl:gap-6 overflow-x-auto overscroll-x-contain pb-2 3xl:pb-3 scrollbar-hide snap-x snap-proximity"
      >
        {items.map((item) => (
          <div key={`${item?.media_type || "movie"}:${item.id}`} className="snap-start">
            <MediaCard
              item={item}
              onOpen={onOpen}
              onWatchlist={onWatchlist}
              watched={watched?.[item.id]}
              detailsOnly={detailsOnly}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
