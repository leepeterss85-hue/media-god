import { Navbar } from '@/components/navbar'
import { HeroSlider } from '@/components/hero-slider'
import { MediaRow } from '@/components/media-row'
import { ContinueWatchingRow } from '@/components/continue-watching-row'
import {
  getTrending,
  getPopularMovies,
  getTopRatedMovies,
  getPopularTVShows,
  getNowPlayingMovies,
  getOnTheAirTVShows,
  type MediaItem,
} from '@/lib/tmdb'
import { getSessionSafe } from '@/lib/auth'
import { headers } from 'next/headers'

export default async function HomePage() {
  const session = await getSessionSafe(await headers())

  const [trending, popularMovies, topRatedMovies, popularTV, nowPlaying, onTheAir] = await Promise.all([
    getTrending(),
    getPopularMovies(),
    getTopRatedMovies(),
    getPopularTVShows(),
    getNowPlayingMovies(),
    getOnTheAirTVShows(),
  ])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Hero Section */}
      <HeroSlider items={trending.slice(0, 6) as MediaItem[]} />

      <div className="flex flex-col gap-8 py-8">
        {/* Continue Watching - Only for logged in users */}
        {session?.user && <ContinueWatchingRow />}

        {/* Trending Now */}
        <MediaRow
          title="Trending Now"
          items={trending as MediaItem[]}
          viewAllHref="/browse?category=trending"
        />

        {/* Now Playing Movies */}
        <MediaRow
          title="Now Playing"
          items={nowPlaying.results.map(m => ({ ...m, media_type: 'movie' as const }))}
          mediaType="movie"
          viewAllHref="/movies?category=now_playing"
        />

        {/* Popular Movies */}
        <MediaRow
          title="Popular Movies"
          items={popularMovies.results.map(m => ({ ...m, media_type: 'movie' as const }))}
          mediaType="movie"
          viewAllHref="/movies"
        />

        {/* On The Air TV Shows */}
        <MediaRow
          title="On The Air"
          items={onTheAir.results.map(t => ({ ...t, title: t.name, media_type: 'tv' as const }))}
          mediaType="tv"
          viewAllHref="/tv-shows?category=on_the_air"
        />

        {/* Popular TV Shows */}
        <MediaRow
          title="Popular TV Shows"
          items={popularTV.results.map(t => ({ ...t, title: t.name, media_type: 'tv' as const }))}
          mediaType="tv"
          viewAllHref="/tv-shows"
        />

        {/* Top Rated Movies */}
        <MediaRow
          title="Top Rated Movies"
          items={topRatedMovies.results.map(m => ({ ...m, media_type: 'movie' as const }))}
          mediaType="movie"
          viewAllHref="/movies?category=top_rated"
        />
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-8">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              StreamVibe - Your ultimate streaming destination
            </p>
            <p className="text-xs text-muted-foreground">
              Demo application with mock data
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}