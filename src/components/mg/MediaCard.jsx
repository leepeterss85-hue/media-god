import React from "react";
import { Play, Plus, Check } from "lucide-react";
import { Image } from "@/components/ui/image";
import { usePlayer } from "@/components/mg/PlayerProvider";

const getMediaType = (item) => {
  const value = String(
    item?.media_type ||
      item?.mediaType ||
      item?.type ||
      "movie"
  ).toLowerCase();

  return value === "tv" || value === "series"
    ? "tv"
    : "movie";
};

export default function MediaCard({
  item,
  onOpen,
  onWatchlist,
  watched,
}) {
  const player = usePlayer();

  const handlePlay = (event) => {
    event.stopPropagation();

    const mediaType = getMediaType(item);
    const tmdbId = item.id || item.tmdb_id;

    /*
     * A TV card must not start a generic title/season pack.
     * Open the show's details first so the user can choose the
     * exact season and episode, just like everywhere else.
     */
    if (mediaType === "tv" && onOpen) {
      onOpen({
        ...item,
        id: tmdbId,
        media_type: "tv",
        mediaType: "tv",
        type: "tv",
      });
      return;
    }

    player.play({
      id: tmdbId,
      tmdbId,
      tmdb_id: tmdbId,
      imdbId: item.imdb_id || item.imdbId,
      title: item.title,
      year: item.year,
      rdYear: item.year,
      poster: item.poster_url,
      mediaType,
      type: mediaType === "tv" ? "series" : "movie",
      rdTitle: item.title,
    });

    /*
     * Fallback for any MediaCard used without an onOpen handler:
     * once the player mounts, ask it to open the TV picker.
     */
    if (mediaType === "tv") {
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("mg:open-episode-picker")
        );
      }, 250);
    }
  };

  const handleDetails = (event) => {
    event.stopPropagation();

    const mediaType = getMediaType(item);

    onOpen?.({
      ...item,
      media_type: mediaType,
      mediaType,
    });
  };

  const handleWatchlist = (event) => {
    event.stopPropagation();
    onWatchlist?.(item);
  };

  return (
    <article className="group shrink-0 w-28 min-[420px]:w-32 sm:w-36 md:w-40 xl:w-44 3xl:w-52 4xl:w-60">
      <div className="relative aspect-[2/3] rounded-md 3xl:rounded-lg overflow-hidden border border-white/10 bg-mg-card">
        <Image
          src={item.poster_url}
          alt={item.title}
          className="w-full h-full object-cover"
          fittingType="fill"
        />

        <button
          type="button"
          onClick={handlePlay}
          className="mg-hover-action absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={`Play ${item.title}`}
        >
          <span className="w-10 h-10 3xl:w-12 3xl:h-12 4xl:w-14 4xl:h-14 rounded-full bg-mg-green text-black flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 3xl:w-6 3xl:h-6 4xl:w-7 4xl:h-7 fill-black" />
          </span>
        </button>

        <button
          type="button"
          onClick={handleDetails}
          className="mg-hover-action absolute top-1.5 left-1.5 3xl:top-2 3xl:left-2 px-2 py-1 3xl:px-2.5 3xl:py-1.5 rounded bg-black/70 text-white text-[10px] 3xl:text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Details
        </button>

        {onWatchlist && (
          <button
            type="button"
            onClick={handleWatchlist}
            className="mg-hover-action absolute bottom-1.5 right-1.5 3xl:bottom-2 3xl:right-2 w-8 h-8 3xl:w-10 3xl:h-10 rounded-full bg-mg-green text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={watched ? "In Watchlist" : "Add to Watchlist"}
          >
            {watched ? (
              <Check className="w-4 h-4 3xl:w-5 3xl:h-5" />
            ) : (
              <Plus className="w-4 h-4 3xl:w-5 3xl:h-5" />
            )}
          </button>
        )}
      </div>

      <p className="mt-1.5 3xl:mt-2 text-xs sm:text-sm 3xl:text-base 4xl:text-lg text-white truncate">
        {item.title}
      </p>

      <p className="text-[10px] sm:text-xs 3xl:text-sm text-white/40">
        {item.year}
      </p>
    </article>
  );
}
