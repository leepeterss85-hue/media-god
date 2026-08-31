import React, { useEffect, useState } from "react";
import { Play, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";

/**
 * Spotlight banner for a featured TV show. Fetches full details (backdrop,
 * overview, rating, genres) from TMDB by id and surfaces a "View Details"
 * action that opens the shared detail modal.
 */
export default function FeaturedSpotlight({ tmdbId, title, onOpen }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    base44.functions
      .invoke("getTmdbMovies", { media_type: "tv", movie_id: tmdbId })
      .then((res) => setData(res.data))
      .catch(() => setData(null));
  }, [tmdbId]);

  const details = data?.details || {};
  const backdrop = details.backdrop_url || "";
  const overview = details.overview || "";
  const rating = details.rating || "";
  const genres = details.genres || [];
  const release = details.release_date || "";

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-mg-card mb-5">
      {backdrop ? (
        <Image
          src={backdrop}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          fittingType="fill"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-mg-background via-mg-background/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-mg-background/90 via-mg-background/40 to-transparent" />

      <div className="relative p-4 md:p-6 min-h-[180px] md:min-h-[220px] flex flex-col justify-end">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-black bg-mg-green px-2 py-0.5 rounded w-fit mb-2">
          FEATURED
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{title}</h2>
        <div className="flex items-center gap-3 mt-1 text-xs text-white/70">
          {release && <span>{String(release).slice(0, 4)}</span>}
          {rating && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-mg-green fill-mg-green" /> {rating}
            </span>
          )}
          {genres.slice(0, 3).map((g) => (
            <span key={g} className="hidden sm:inline">
              {g}
            </span>
          ))}
        </div>
        {overview && (
          <p className="text-white/70 text-sm mt-2 max-w-2xl line-clamp-2 md:line-clamp-3">
            {overview}
          </p>
        )}
        <button
          onClick={onOpen}
          className="mt-3 inline-flex items-center gap-2 bg-mg-green text-black font-semibold text-sm px-4 py-2 rounded-lg w-fit hover:bg-mg-green-dim"
        >
          <Play className="w-4 h-4 fill-black" /> View Details
        </button>
      </div>
    </div>
  );
}