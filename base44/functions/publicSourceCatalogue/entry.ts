import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Central public-only catalogue reads. This endpoint intentionally does not
// resolve streams, accept addon manifests, or handle Real-Debrid credentials.
// The scheduled writer is not enabled until its credit budget is verified.
export default async function (req: Request) {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  const client = createClientFromRequest(req);
  let input: Record<string, unknown> = {};
  try { input = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const mediaType = input.media_type === 'tv' ? 'tv' : input.media_type === 'movie' ? 'movie' : '';
  const id = String(input.tmdb_id ?? '');
  const season = Number(input.season);
  const episode = Number(input.episode);
  if (!mediaType || !/^\d{1,10}$/.test(id) ||
      (mediaType === 'tv' && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1))) {
    return Response.json({ error: 'Exact movie or episode identity required' }, { status: 400 });
  }
  const key = mediaType === 'movie' ? `movie:${id}` : `tv:${id}:${season}:${episode}`;
  try {
    const rows = await client.entities.PublicSourceAvailability.filter({ media_key: key }, '-checked_at', 1);
    const record = Array.isArray(rows) ? rows[0] : null;
    if (!record || !record.expires_at || Date.parse(record.expires_at) <= Date.now()) {
      return Response.json({ status: 'unknown', media_key: key, stale: true });
    }
    return Response.json({ status: record.status === 'found' ? 'found' : 'unknown', media_key: key,
      checked_at: record.checked_at, expires_at: record.expires_at });
  } catch {
    // Fail open; never suppress a title because the central store is down.
    return Response.json({ status: 'unknown', media_key: key, stale: true });
  }
}
