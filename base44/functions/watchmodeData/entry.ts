import { secrets } from 'base44:runtime';

const API_BASE = 'https://api.watchmode.com/v1';
const VALID_REGION = /^[A-Z]{2}$/;
const VALID_ID = /^[1-9]\d{0,9}$/;

const ACTIONS = {
  coverage: () => '/live-coverage/',
  events: () => '/live-events/',
  leagues: () => '/live-leagues/',
  leaving: () => '/title-leaving-dates/',
  releases: () => '/title-release-dates/',
  search: () => '/search/',
  details: (p) => `/title/${encodeURIComponent(p.id)}/details/`,
  sources: (p) => `/title/${encodeURIComponent(p.id)}/sources/`,
  episodes: (p) => `/title/${encodeURIComponent(p.id)}/episodes/`,
  awards: (p) => `/title/${encodeURIComponent(p.id)}/details/`,
  person: (p) => `/person/${encodeURIComponent(p.id)}/`,
  sourceChanges: () => '/changes/titles_sources_changed/',
};

const QUERY_KEYS = [
  'region', 'regions', 'search_field', 'search_value', 'types', 'type',
  'date_from', 'date_to', 'status', 'page', 'limit', 'league_id',
  'league_ids', 'provider_ids', 'start_date', 'end_date', 'season',
  'episode', 'episode_language', 'append_to_response', 'source_types', 'award_ids', 'award_result',
];

const asText = (value, max = 180) => String(value ?? '').trim().slice(0, max);

export default async function(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const action = asText(body?.action, 40);
  const params = body?.params && typeof body.params === 'object' ? body.params : {};
  const makePath = ACTIONS[action];
  if (!makePath) {
    return Response.json({ error: 'Unsupported Watchmode action' }, { status: 400 });
  }

  const id = asText(params.id, 40);
  if (['details', 'sources', 'episodes', 'awards', 'person'].includes(action)) {
    const valid = action === 'person' ? VALID_ID.test(id) : (VALID_ID.test(id) || /^tt\d{5,12}$/i.test(id) || /^(movie|tv)-\d{1,10}$/.test(id));
    if (!valid) return Response.json({ error: 'A valid Watchmode, IMDb or TMDB title ID is required.' }, { status: 400 });
  }

  const apiKey = String(secrets.get('WATCHMODE_API_KEY') || '').trim();
  if (!apiKey) {
    return Response.json({
      error: 'Watchmode is not configured on the server. Add WATCHMODE_API_KEY to the Base44 backend secrets.',
      code: 'WATCHMODE_NOT_CONFIGURED',
    }, { status: 503 });
  }

  const path = makePath({ ...params, id });
  const url = new URL(path, API_BASE);
  if (action === 'awards' && !params.append_to_response) {
    url.searchParams.set('append_to_response', 'awards');
  }
  for (const key of QUERY_KEYS) {
    const value = params[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'region' && !VALID_REGION.test(asText(value, 2).toUpperCase())) continue;
    if (key === 'regions') {
      const regions = asText(value, 100).toUpperCase();
      if (!/^[A-Z]{2}(,[A-Z]{2})*$/.test(regions)) continue;
      url.searchParams.set(key, regions);
      continue;
    }
    url.searchParams.set(key, asText(value, 180));
  }

  // UK-first defaults for catalogue and streaming data. Live event availability
  // is account- and region-dependent, so callers can explicitly request another region.
  if (['events', 'leagues'].includes(action) && !url.searchParams.has('region')) {
    url.searchParams.set('region', 'GB');
  }
  if (['leaving', 'sources', 'episodes', 'sourceChanges'].includes(action) && !url.searchParams.has('regions')) {
    url.searchParams.set('regions', 'GB');
  }
  if (action === 'search') {
    if (!url.searchParams.has('search_field') || !url.searchParams.has('search_value')) {
      return Response.json({ error: 'Search needs a field and search value.' }, { status: 400 });
    }
    const field = url.searchParams.get('search_field');
    if (!['name', 'imdb_id', 'tmdb_movie_id', 'tmdb_tv_id', 'tmdb_person_id'].includes(field)) {
      return Response.json({ error: 'Unsupported Watchmode search field.' }, { status: 400 });
    }
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(12000),
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 500) }; }

    if (!response.ok) {
      const status = response.status === 401 ? 502 : response.status;
      return Response.json({
        error: response.status === 403
          ? 'Your Watchmode plan or country may not include this feature.'
          : response.status === 429
            ? 'Watchmode request limit or monthly credits reached. Try again later.'
            : 'Watchmode could not complete this request.',
        provider_status: response.status,
        details: asText(data?.message || data?.error || data?.detail, 240),
      }, { status });
    }

    return Response.json({ data, action }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch {
    return Response.json({ error: 'Watchmode is temporarily unreachable. Try again shortly.' }, { status: 502 });
  }
}
