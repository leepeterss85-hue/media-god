'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Film, Tv, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getImageUrl } from '@/lib/tmdb'
import Image from 'next/image'

interface SearchResult {
  id: number
  title?: string
  name?: string
  media_type: 'movie' | 'tv' | 'person'
  poster_path: string | null
  release_date?: string
  first_air_date?: string
  vote_average: number
}

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const searchMedia = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      setResults(data.results?.filter((r: SearchResult) => r.media_type !== 'person').slice(0, 8) || [])
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchMedia(query)
    }, 300)

    return () => clearTimeout(timer)
  }, [query, searchMedia])

  const handleSelect = (result: SearchResult) => {
    const type = result.media_type === 'movie' ? 'movie' : 'tv'
    router.push(`/${type}/${result.id}`)
    onOpenChange(false)
    setQuery('')
    setResults([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, TV shows..."
            className="border-0 focus-visible:ring-0 bg-transparent text-lg"
            autoFocus
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults([])
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="p-8 text-center text-muted-foreground">Searching...</div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No results found for &quot;{query}&quot;
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="divide-y divide-border">
              {results.map((result) => (
                <button
                  key={`${result.media_type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-secondary/50 transition-colors text-left"
                >
                  <div className="relative w-12 h-16 rounded-md overflow-hidden bg-secondary flex-shrink-0">
                    {result.poster_path ? (
                      <Image
                        src={getImageUrl(result.poster_path, 'w200') || ''}
                        alt={result.title || result.name || ''}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {result.media_type === 'movie' ? (
                          <Film className="w-6 h-6 text-muted-foreground" />
                        ) : (
                          <Tv className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {result.title || result.name}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="capitalize">{result.media_type}</span>
                      {(result.release_date || result.first_air_date) && (
                        <>
                          <span>&#8226;</span>
                          <span>
                            {new Date(result.release_date || result.first_air_date || '').getFullYear()}
                          </span>
                        </>
                      )}
                      {result.vote_average > 0 && (
                        <>
                          <span>&#8226;</span>
                          <span>{result.vote_average.toFixed(1)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!query && (
            <div className="p-8 text-center text-muted-foreground">
              Start typing to search movies and TV shows
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}