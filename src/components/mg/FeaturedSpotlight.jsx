import React, { useEffect, useState } from "react";
import { Play, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";

export default function FeaturedSpotlight({ tmdbId, title, onOpen }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    base44.functions
      .invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: tmdbId,
      })
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
    <section className="relative w-full overflow-hidden rounded-xl 3xl:rounded-2xl border border-white/10 bg-mg-card mb-5 3xl:mb-8">
      {backdrop ? (
        <Image
          src={backdrop}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          fittingType="fill"
        />
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-mg-background via-mg-background/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-mg-background/95 via-mg-background/45 to-transparent" />

      <div className="relative p-4 sm:p-5 md:p-6 3xl:p-9 4xl:p-12 min-h-[190px] md:min-h-[240px] 3xl:min-h-[360px] 4xl:min-h-[440px] flex flex-col justify-end">
        <span className="inline-flex items-center gap-1 text-[10px] 3xl:text-xs 4xl:text-sm font-bold text-black bg-mg-green px-2 3xl:px-3 py-0.5 3xl:py-1 rounded w-fit mb-2 3xl:mb-3">
          FEATURED
        </span>

        <h2 className="text-2xl md:text-3xl xl:text-4xl 3xl:text-5xl 4xl:text-6xl font-bold text-white tracking-tight leading-tight">
          {title}
        </h2>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 3xl:gap-4 mt-1.5 3xl:mt-2 text-xs sm:text-sm 3xl:text-base 4xl:text-lg text-white/70">
          {release && <span>{String(release).slice(0, 4)}</span>}

          {rating && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 3xl:w-4 3xl:h-4 text-mg-green fill-mg-green" />
              {rating}
            </span>
          )}

          {genres.slice(0, 3).map((genre) => (
            <span key={genre} className="hidden sm:inline">
              {genre}
            </span>
          ))}
        </div>

        {overview && (
          <p className="text-white/70 text-sm md:text-base 3xl:text-lg 4xl:text-xl mt-2 3xl:mt-3 max-w-2xl 3xl:max-w-4xl line-clamp-2 md:line-clamp-3">
            {overview}
          </p>
        )}

        <button
          type="button"
          onClick={onOpen}
          className="mt-3 3xl:mt-5 min-h-11 3xl:min-h-12 inline-flex items-center gap-2 bg-mg-green text-black font-semibold text-sm md:text-base 3xl:text-lg px-4 3xl:px-6 py-2.5 3xl:py-3 rounded-lg w-fit hover:bg-mg-green-dim"
        >
          <Play className="w-4 h-4 3xl:w-5 3xl:h-5 fill-black" />
          View Details
        </button>
      </div>
    </section>
  );
}
