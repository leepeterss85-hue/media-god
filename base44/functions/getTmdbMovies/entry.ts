import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const category = body.category || 'now_playing';
    const movieId = body.movie_id;

    const apiKey = secrets.get('TMDB_API_KEY');
    if (!apiKey) return Response.json({ error: 'TMDB API key not configured' }, { status: 500 });

    // Trailer lookup for a specific movie
    if (movieId) {
      const vRes = await fetch(
        `${TMDB_BASE}/movie/${movieId}/videos?api_key=${apiKey}&language=en-GB`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (!vRes.ok) return Response.json({ error: `TMDB error: ${vRes.status}` }, { status: 502 });
      const vData = await vRes.json();
      const results = vData.results || [];
      const yt = results.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
        || results.find((v) => v.site === 'YouTube');
      const key = yt?.key || '';
      return Response.json({
        trailer_key: key,
        trailer_url: key ? `https://www.youtube.com/embed/${key}?autoplay=1&rel=0` : ''
      });
    }

    const tmdbRes = await fetch(
      `${TMDB_BASE}/movie/${category}?api_key=${apiKey}&language=en-GB&page=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!tmdbRes.ok) {
      const txt = await tmdbRes.text();
      return Response.json({ error: `TMDB error: ${tmdbRes.status} ${txt}` }, { status: 502 });
    }
    const data = await tmdbRes.json();

    const movies = (data.results || []).map((m) => ({
      id: String(m.id),
      title: m.title,
      year: (m.release_date || '').slice(0, 4),
      release_date: m.release_date || '',
      poster_url: m.poster_path ? `${IMG_BASE}${m.poster_path}` : '',
      description: m.overview || '',
      category: 'Cinema Releases',
      tmdb_id: m.id,
    }));

    return Response.json({ movies });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}