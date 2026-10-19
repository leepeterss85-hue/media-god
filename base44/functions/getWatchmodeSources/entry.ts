import { secrets } from 'base44:runtime';

const WATCHMODE_BASE = 'https://api.watchmode.com/v1';
const validId = (value) => /^[1-9]\d{0,9}$/.test(String(value ?? '').trim());
const validRegion = (value) => /^[A-Z]{2}$/.test(String(value || '').toUpperCase());

export default async function(req) {
  try {
    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const tmdbId = String(body.tmdb_id ?? body.movie_id ?? '').trim();
    const mediaType = body.media_type === 'tv' ? 'tv' : 'movie';
    const region = String(body.region || 'GB').trim().toUpperCase();

    if (!validId(tmdbId)) {
      return Response.json({ error: 'A valid TMDB title ID is required.', sources: [] }, { status: 400 });
    }
    if (!validRegion(region)) {
      return Response.json({ error: 'A valid two-letter region is required.', sources: [] }, { status: 400 });
    }

    const apiKey = secrets.get('WATCHMODE_API_KEY');
    if (!apiKey) {
      return Response.json({ configured: false, sources: [] });
    }

    const titleId = `${mediaType}-${tmdbId}`;
    const url = new URL(`${WATCHMODE_BASE}/title/${titleId}/sources/`);
    url.searchParams.set('regions', region);

    const response = await fetch(url.toString(), {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      // Keep the existing catalogue usable if Watchmode is unavailable or the
      // account does not include the requested region/endpoint.
      return Response.json({
        configured: true,
        sources: [],
        unavailable: response.status === 401 || response.status === 403 || response.status === 404,
      });
    }

    const data = await response.json();
    const availabilityLabels = {
      sub: 'Stream',
      free: 'Free',
      rent: 'Rent',
      buy: 'Buy',
      tve: 'TV app',
    };
    const seen = new Set();
    const sources = (Array.isArray(data) ? data : [])
      .filter((item) => String(item?.region || region).toUpperCase() === region)
      .map((item) => {
        const name = String(item?.name || '').trim();
        const type = String(item?.type || '').toLowerCase();
        const link = [item?.web_url, item?.android_url, item?.ios_url]
          .find((candidate) => typeof candidate === 'string' && /^https:\/\//i.test(candidate)) || '';
        const key = `${name.toLowerCase()}:${type}`;
        if (!name || seen.has(key)) return null;
        seen.add(key);
        return {
          provider_id: item?.source_id ?? null,
          provider_name: name,
          logo_url: '',
          availability: availabilityLabels[type] || 'Available',
          link,
          source: 'watchmode',
          format: String(item?.format || ''),
          price: Number.isFinite(Number(item?.price)) ? Number(item.price) : null,
          seasons: Number.isFinite(Number(item?.seasons)) ? Number(item.seasons) : null,
          episodes: Number.isFinite(Number(item?.episodes)) ? Number(item.episodes) : null,
        };
      })
      .filter(Boolean);

    return Response.json({ configured: true, sources, region });
  } catch {
    return Response.json({ configured: true, sources: [], error: 'Watchmode availability is temporarily unavailable.' });
  }
}
