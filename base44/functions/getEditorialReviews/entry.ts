import { secrets } from 'base44:runtime';
import {
  selectGuardianReviews,
  selectNytReviews,
} from './editorialReviewMatch.mjs';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const GUARDIAN_BASE = 'https://content.guardianapis.com/search';
const NYT_BASE = 'https://api.nytimes.com/svc/movies/v2/reviews/search.json';

const safeYear = (date) => {
  const match = String(date || '').match(/^(\d{4})/);
  return match ? Number(match[1]) : 0;
};

const asJson = async (url) => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Publisher request failed: ${response.status}`);
  return response.json();
};

const publisherReviews = async (tmdb, mediaType) => {
  const title = String(tmdb.title || tmdb.name || '').trim();
  const originalTitle = String(tmdb.original_title || tmdb.original_name || '').trim();
  const releaseYear = safeYear(tmdb.release_date || tmdb.first_air_date);
  const titles = [title, originalTitle].filter(Boolean);
  if (!title || !releaseYear) return [];

  const nytKey = mediaType === 'movie'
    ? String(secrets.get('NYT_MOVIE_REVIEWS_API_KEY') || '').trim()
    : '';
  const guardianKey = String(secrets.get('GUARDIAN_CONTENT_API_KEY') || '').trim();
  const tasks = [];

  if (nytKey) {
    const url = new URL(NYT_BASE);
    url.searchParams.set('query', title);
    url.searchParams.set('api-key', nytKey);
    tasks.push(
      asJson(url).then((data) => selectNytReviews(data?.results, titles, releaseYear))
        .catch(() => [])
    );
  }

  if (guardianKey) {
    const url = new URL(GUARDIAN_BASE);
    url.searchParams.set('q', title);
    url.searchParams.set('tag', 'tone/reviews');
    url.searchParams.set('section', mediaType === 'tv' ? 'tv-and-radio' : 'film');
    url.searchParams.set('show-fields', 'trailText,byline');
    url.searchParams.set('page-size', '20');
    url.searchParams.set('api-key', guardianKey);
    tasks.push(
      asJson(url).then((data) =>
        selectGuardianReviews(
          data?.response?.results, titles, releaseYear, mediaType === 'tv'
        )
      ).catch(() => [])
    );
  }

  const groups = await Promise.all(tasks);
  return groups.flat().slice(0, 4);
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const tmdbId = String(body?.tmdb_id ?? '').trim();
  const mediaType = body?.media_type === 'tv' ? 'tv' : 'movie';
  if (!/^[1-9]\d{0,8}$/.test(tmdbId) ||
      !['tv', 'movie'].includes(body?.media_type)) {
    return Response.json({ error: 'Invalid title identity' }, { status: 400 });
  }

  const tmdbKey = String(secrets.get('TMDB_API_KEY') || '').trim();
  if (!tmdbKey) {
    return Response.json({ reviews: [] });
  }

  try {
    const url = new URL(`${TMDB_BASE}/${mediaType}/${tmdbId}`);
    url.searchParams.set('api_key', tmdbKey);
    url.searchParams.set('language', 'en-GB');
    const title = await asJson(url);
    const reviews = await publisherReviews(title, mediaType);
    return Response.json({ reviews }, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    // Publisher outages never block the description or Media God reviews.
    return Response.json({ reviews: [] });
  }
});
