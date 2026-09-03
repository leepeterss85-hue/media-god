'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MediaCard } from './media-card'
import Link from 'next/link'
import type { MediaItem, Movie, TVShow } from '@/lib/tmdb'

interface MediaRowProps {
  title: string
  items: (MediaItem | Movie | TVShow)[]
  mediaType?: 'movie' | 'tv'
  viewAllHref?: string
}

export function MediaRow({ title, items, mediaType, viewAllHref }: MediaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const scrollAmount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  if (items.length === 0) return null

  return (
    <section className="relative">
      <div className="flex items-center justify-between mb-4 px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
        <div className="flex items-center gap-2">
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="text-sm text-primary hover:underline underline-offset-4"
            >
              View All
            </Link>
          )}
          <div className="hidden sm:flex gap-1">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => scroll('left')}
              className="w-8 h-8"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => scroll('right')}
              className="w-8 h-8"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto hide-scrollbar px-4 sm:px-6 lg:px-8 pb-4"
      >
        {items.map((item) => (
          <MediaCard
            key={`${item.id}-${'media_type' in item ? item.media_type : mediaType}`}
            item={item}
            mediaType={mediaType}
          />
        ))}
      </div>
    </section>
  )
}