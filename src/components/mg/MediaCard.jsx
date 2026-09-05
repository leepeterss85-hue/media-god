import React from "react";

import {
  Check,
  ListVideo,
  Play,
  Plus,
} from "lucide-react";

import { Image } from "@/components/ui/image";
import { usePlayer } from "@/components/mg/PlayerProvider";

const getMediaType = (item) => {
  const explicit = String(
    item?.media_type ||
      item?.mediaType ||
      item?.type ||
      ""
  ).toLowerCase();

  if (
    explicit === "tv" ||
    explicit === "series" ||
    explicit === "show"
  ) {
    return "tv";
  }

  return "movie";
};

export default function MediaCard({
  item,
  onOpen,
  onWatchlist,
  watched,
}) {
  const { play } = usePlayer();

  const mediaType = getMediaType(item);
  const isTv = mediaType === "tv";

  const openDetails = () => {
    if (typeof onOpen !== "function") {
      return false;
    }

    onOpen({
      ...item,
      media_type: mediaType,
    });

    return true;
  };

  const handlePrimaryAction = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    // TV must go through DetailModal -> EpisodeSelector
    // so an exact season and episode is selected first.
    if (isTv) {
      openDetails();
      return;
    }

    // Keep the working movie playback path.
    await play({
      id: item?.id || item?.tmdb_id,
      tmdbId: item?.tmdb_id || item?.id,
      imdbId: item?.imdb_id || item?.imdbId || "",
      title: item?.title || "Movie",
      poster: item?.poster_url || "",
      year: item?.year,
      rdTitle: item?.title || "",
      rdYear: item?.year,
      mediaType: "movie",
      type: "movie",
      sources: [],
    });
  };

  const handleTitleClick = (event) => {
    if (typeof onOpen !== "function") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    openDetails();
  };

  const handleWatchlist = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (typeof onWatchlist === "function") {
      onWatchlist({
        ...item,
        media_type: mediaType,
      });
    }
  };

  return (
    <div className="group shrink-0 w-28 sm:w-36 md:w-40">
      <div className="relative aspect-[2/3] rounded-md overflow-hidden border border-white/10 bg-mg-card">
        <Image
          src={item?.poster_url}
          alt={item?.title || "Media"}
          className="w-full h-full object-cover"
          fittingType="fill"
        />

        <button
          type="button"
          onClick={handlePrimaryAction}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          aria-label={
            isTv
              ? `Choose episode for ${item?.title || "TV show"}`
              : `Play ${item?.title || "movie"}`
          }
        >
          <span className="w-10 h-10 rounded-full bg-mg-green text-black flex items-center justify-center">
            {isTv ? (
              <ListVideo className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 fill-black" />
            )}
          </span>
        </button>

        {onWatchlist && (
          <button
            type="button"
            onClick={handleWatchlist}
            className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-mg-green text-black flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label={
              watched
                ? "In Watchlist"
                : "Add to Watchlist"
            }
          >
            {watched ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleTitleClick}
        className="block w-full mt-1.5 text-left"
        disabled={typeof onOpen !== "function"}
      >
        <p className="text-xs sm:text-sm text-white truncate">
          {item?.title}
        </p>

        <p className="text-[10px] sm:text-xs text-white/40">
          {item?.year}
          {isTv ? " · TV" : ""}
        </p>
      </button>
    </div>
  );
}
