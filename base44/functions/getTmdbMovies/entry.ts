import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

const MOVIE_ENDPOINTS = {
  now_playing: 'movie/now_playing',
  popular: 'movie/popular',
  top_rated: 'movie/top_rated',
  upcoming: 'movie/upcoming',
};
const TV_ENDPOINTS = {
  tv_popular: 'tv/popular',
  tv_top_rated: 'tv/top_rated',
  tv_airing_today: 'tv/airing_today',
  tv_on_the_air: 'tv/on_the_air',
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const mediaType = body.media_type === 'tv' ? 'tv' : 'movie';
    const country = body.country || '';
    const genre = body.genre || '';
    const year = body.year || '';
    const language = body.language || '';
    const movieId = body.movie_id;

    const apiKey = secrets.get('TMDB_API_KEY');
    if (!apiKey) return Response.json({ error: 'TMDB API key not configured' }, { status: 500 });

    // Trailer lookup for a specific movie or show
    if (movieId) {
      const vRes = await fetch(
        `${TMDB_BASE}/${mediaType}/${movieId}/videos?api_key=${apiKey}&language=en-GB`,
        { headers: { Accept: 'application/json' } }
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

    const category = body.category || (mediaType === 'tv' ? 'tv_popular' : 'now_playing');

    const hasFilters = country || genre || year || language;
    let url;
    if (hasFilters) {
      const params = new URLSearchParams({
        api_key: apiKey,
        language: 'en-GB',
        sort_by: 'popularity.desc',
        page: '1',
      });
      if (country) params.set('with_origin_country', country);
      if (genre) params.set('with_genres', genre);
      if (year) {
        if (mediaType === 'tv') params.set('first_air_date_year', year);
        else params.set('primary_release_year', year);
      }
      if (language) params.set('with_original_language', language);
      url = `${TMDB_BASE}/discover/${mediaType}?${params.toString()}`;
    } else {
      const path = mediaType === 'tv' ? TV_ENDPOINTS[category] || TV_ENDPOINTS.tv_popular
        : MOVIE_ENDPOINTS[category] || MOVIE_ENDPOINTS.now_playing;
      url = `${TMDB_BASE}/${path}?api_key=${apiKey}&language=en-GB&page=1`;
    }

    const tmdbRes = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!tmdbRes.ok) {
      const txt = await tmdbRes.text();
      return Response.json({ error: `TMDB error: ${tmdbRes.status} ${txt}` }, { status: 502 });
    }
    const data = await tmdbRes.json();

    const items = (data.results || []).map((m) => {
      const isTv = mediaType === 'tv' || !!m.name;
      const title = isTv ? (m.name || m.title) : (m.title || m.name);
      const date = isTv ? (m.first_air_date || '') : (m.release_date || '');
      return {
        id: String(m.id),
        title,
        year: date.slice(0, 4),
        release_date: date,
        poster_url: m.poster_path ? `${IMG_BASE}${m.poster_path}` : '',
        description: m.overview || '',
        tmdb_id: m.id,
        genre_ids: m.genre_ids || [],
        media_type: isTv ? 'tv' : 'movie',
      };
    });

    return Response.json({ movies: items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}