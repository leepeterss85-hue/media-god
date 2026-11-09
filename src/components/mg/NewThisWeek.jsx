import React, { useEffect, useMemo, useState } from "react";
import { getCatalogueMovies } from "@/components/mg/catalogueRequests";
import { CalendarDays } from "lucide-react";
import MediaRow from "@/components/mg/MediaRow";
import NewEpisodesRow from "@/components/mg/NewEpisodesRow";
import { newThisWeekItems } from "@/components/mg/releaseDiscovery";

/*
 * One at-a-glance home section for films (cinema and digital), new series,
 * and episodes of watched or saved programmes. All use first-worldwide dates.
 * Playback stays in the existing card/details and episode pathways.
 */
export default function NewThisWeek({
  todayKey,
  historyRows = [],
  watchlistRows = [],
  region = "",
  onOpen,
  onWatchlist,
  watched = {},
}) {
  // Fetch weekly discovery independently so a slow TMDB response never
  // delays Home, its hero or Continue Watching.
  const [weekly, setWeekly] = useState({ cinema: [], digital: [], tv: [] });
  useEffect(() => {
    let active = true;
    const requests = [
      { media_type:"movie", category:"cinema_latest", region, include_global_releases:true },
      { media_type:"movie", category:"streaming_recent_movies", region, include_global_releases:true },
      { media_type:"tv", category:"tv_recent_premieres", region },
    ];
    Promise.all(requests.map((params) =>
      getCatalogueMovies(params).then((res) => {
        const data = res?.data ?? res ?? {};
        return Array.isArray(data.movies) ? data.movies : [];
      }).catch(() => [])
    )).then(([cinema, digital, tv]) => {
      if (active) setWeekly({ cinema, digital, tv });
    });
    return () => { active = false; };
  }, [region, todayKey]);

  const entries = useMemo(
    () => newThisWeekItems({ ...weekly, today: todayKey }),
    [weekly, todayKey]
  );

  return (
    <section data-mg-new-this-week="true" className="space-y-4">
      {entries.length > 0 && (
        <>
          <div className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14">
            <h2 className="flex items-center gap-2 text-base font-bold text-white sm:text-lg xl:text-xl 3xl:text-2xl">
              <CalendarDays className="h-5 w-5 text-mg-green" /> New This Week
            </h2>
            <p className="mt-1 text-xs text-white/50 sm:text-sm">
              Cinema films, digital releases and TV premieres first released anywhere in the world.
              Listings do not guarantee a playable stream in your country.
            </p>
          </div>
          <div className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14">
            <MediaRow embedded title="" items={entries} onOpen={onOpen}
              onWatchlist={onWatchlist} watched={watched} detailsOnly showReleaseDate />
          </div>
        </>
      )}

      <div className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14">
        <NewEpisodesRow historyRows={historyRows} watchlistRows={watchlistRows}
          showThisWeekOnly embedded region={region} todayKey={todayKey} onOpenDetail={onOpen} />
      </div>
    </section>
  );
}
