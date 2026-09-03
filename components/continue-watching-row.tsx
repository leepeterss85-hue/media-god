'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { getContinueWatching, removeContinueWatching } from '@/app/actions/media'
import { getImageUrl } from '@/lib/tmdb'
import { useSession } from '@/lib/auth-client'

interface ContinueWatchingItem {
  id: number
  mediaId: number
  mediaType: string
  title: string
  posterPath: string | null
  progress: number
  duration: number
  seasonNumber: number | null
  episodeNumber: number | null
}

export function ContinueWatchingRow() {
  const { data: session } = useSession()
  const [items, setItems] = useState<ContinueWatchingItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!session?.user) {
        setLoading(false)
        return
      }
      try {
        const data = await getContinueWatching()
        setItems(data)
      } catch (error) {
        console.error('Failed to fetch continue watching:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [session])

  const handleRemove = async (mediaId: number, mediaType: string) => {
    try {
      await removeContinueWatching(mediaId, mediaType)
      setItems((prev) =>
        prev.filter((item) => !(item.mediaId === mediaId && item.mediaType === mediaType))
      )
    } catch (error) {
      console.error('Failed to remove:', error)
    }
  }

  if (loading || items.length === 0) return null

  return (
    <section className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4">Continue Watching</h2>
      <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-4">
        {items.map((item) => {
          const posterUrl = getImageUrl(item.posterPath, 'w500')
          const progressPercent = item.duration > 0 ? (item.progress / item.duration) * 100 : 0

          return (
            <div
              key={item.id}
              className="group relative flex-shrink-0 w-[280px] sm:w-[320px] rounded-xl overflow-hidden bg-card"
            >
              <Link href={`/${item.mediaType}/${item.mediaId}`} className="flex">
                <div className="relative w-24 h-36 flex-shrink-0">
                  {posterUrl ? (
                    <Image
                      src={posterUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary flex items-center justify-center">
                      <Play className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 p-3 flex flex-col justify-between">
                  <div>
                    <h3 className="font-medium text-foreground line-clamp-2">{item.title}</h3>
                    {item.mediaType === 'tv' && item.seasonNumber && item.episodeNumber && (
                      <p className="text-sm text-muted-foreground mt-1">
                        S{item.seasonNumber} E{item.episodeNumber}
                      </p>
                    )}
                  </div>
                  <div className="mt-2">
                    <Progress value={progressPercent} className="h-1" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.round(progressPercent)}% watched
                    </p>
                  </div>
                </div>
              </Link>

              {/* Remove button */}
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleRemove(item.mediaId, item.mediaType)}
              >
                <X className="w-3 h-3" />
              </Button>

              {/* Play overlay */}
              <Link
                href={`/${item.mediaType}/${item.mediaId}`}
                className="absolute inset-0 flex items-center justify-center bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Button size="sm" className="gap-2">
                  <Play className="w-4 h-4 fill-current" />
                  Resume
                </Button>
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}