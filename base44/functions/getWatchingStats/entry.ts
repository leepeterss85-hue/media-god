import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// Aggregates the current user's watching habits from their Continue Watching
// history: resolves each title's genres + media type via TMDB search, then
// rolls up most-watched genres and content-type split weighted by progress.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = secrets.get('TMDB_API_KEY');
    if (!apiKey) return Response.json({ error: 'TMDB API key not configured' }, { status: 500 });

    // ContinueWatching is RLS-scoped to the user; the user client sees only
    // their own rows.
    const rows = await base44.entities.ContinueWatching.list('-updated_date', 100);
    const items = (rows || []).filter((r) => r && r.title);

    if (items.length === 0) {
      return Response.json({
        total_titles: 0,
        total_watch_seconds: 0,
        content_types: [],
        genres: [],
      });
    }

    // Fetch a title's full details to get named genres + confirm media type.
    // The search endpoint returns genre_ids but they don't always map cleanly,
    // so the details endpoint (genres: [{id,name}]) is more reliable here.
    const fetchDetails = async (id, mediaType) => {
      try {
        const res = await fetch(`${TMDB_BASE}/${mediaType}/${id}?api_key=${apiKey}&language=en-GB`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    // Dedupe by content_key so a resumed title isn't counted multiple times.
    const seen = new Set();
    const unique = [];
    for (const r of items) {
      const key = r.content_key || r.title;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }

    // Resolve each title's genres + media type via a single multi-search call.
    // Capped to keep the request bounded; the oldest beyond the cap are skipped.
    const CAP = 60;
    const resolved = [];
    await Promise.all(
      unique.slice(0, CAP).map(async (r) => {
        try {
          const res = await fetch(
            `${TMDB_BASE}/search/multi?api_key=${apiKey}&language=en-GB&query=${encodeURIComponent(r.title)}&page=1`,
            { headers: { Accept: 'application/json' } }
          );
          if (!res.ok) return;
          const data = await res.json();
          // Prefer a result whose year matches, else the first movie/tv hit.
          const results = (data.results || []).filter(
            (m) => m.media_type === 'movie' || m.media_type === 'tv'
          );
          if (results.length === 0) return;
          const year = (r.year || '').slice(0, 4);
          const match =
            results.find((m) => {
              const d = m.media_type === 'tv' ? m.first_air_date : m.release_date;
              return year && d && d.slice(0, 4) === year;
            }) || results[0];
          const isTv = match.media_type === 'tv';
          const details = await fetchDetails(match.id, isTv ? 'tv' : 'movie');
          const genreNames = (details?.genres || []).map((g) => g.name).filter(Boolean);
          resolved.push({
            title: r.title,
            media_type: isTv ? 'tv' : 'movie',
            genres: genreNames,
            progress: Number(r.progress) || 0,
            duration: Number(r.duration) || 0,
          });
        } catch {
          // skip unresolvable titles
        }
      })
    );

    // Aggregate. Genres weighted by watched seconds (progress); content types
    // counted by both titles and watch seconds.
    const genreWeight = {};
    const typeTitles = { movie: 0, tv: 0 };
    const typeSeconds = { movie: 0, tv: 0 };
    let totalSeconds = 0;

    for (const r of resolved) {
      const secs = r.progress || 0;
      totalSeconds += secs;
      typeTitles[r.media_type] = (typeTitles[r.media_type] || 0) + 1;
      typeSeconds[r.media_type] = (typeSeconds[r.media_type] || 0) + secs;
      for (const g of r.genres) {
        genreWeight[g] = (genreWeight[g] || 0) + secs + 1; // +1 so a genre with
        // many short watches still ranks, not only long single watches
      }
    }

    const genres = Object.entries(genreWeight)
      .map(([name, weight]) => ({ name, weight: Math.round(weight) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    const content_types = Object.entries(typeTitles)
      .map(([type, titles]) => ({
        type,
        titles,
        seconds: Math.round(typeSeconds[type] || 0),
      }))
      .sort((a, b) => b.titles - a.titles);

    return Response.json({
      total_titles: resolved.length,
      total_watch_seconds: Math.round(totalSeconds),
      content_types,
      genres,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}