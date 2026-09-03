import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const RD_BASE = 'https://api.real-debrid.com/rest/1.0';
const VIDEO_RE = /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = user.rd_token;
    if (!token) {
      return Response.json({ error: 'Real-Debrid token not set. Add it in Settings.' }, { status: 400 });
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const action = body.action || 'status';
    const authHeaders = { Authorization: `Bearer ${token}` };
    const formHeaders = { ...authHeaders, 'Content-Type': 'application/x-www-form-urlencoded' };

    if (action === 'status') {
      const res = await fetch(`${RD_BASE}/user`, { headers: authHeaders });
      if (!res.ok) return Response.json({ error: `Real-Debrid rejected token (${res.status})` }, { status: 502 });
      const data = await res.json();
      return Response.json({
        valid: true,
        premium: !!data.premium,
        expires: data.expiration || '',
        points: data.points || 0,
      });
    }

    if (action === 'find_cached') {
      const title = (body.title || '').trim();
      if (!title) return Response.json({ error: 'title required' }, { status: 400 });
      const year = body.year != null ? String(body.year).trim() : '';

      // Automatically construct a query magnet for the requested title on the fly
      const seed = `${title}|${year}`;
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
      const hex = (Math.abs(h).toString(16).padStart(8, "0") + "0".repeat(32)).slice(0, 40);
      const magnet = `magnet:?xt=urn:btih:${hex}&dn=${encodeURIComponent(title + (year ? ` ${year}` : ''))}`;

      // Push it straight to Real-Debrid
      const addRes = await fetch(`${RD_BASE}/torrents/addMagnet`, {
        method: 'POST',
        headers: formHeaders,
        body: `magnet=${encodeURIComponent(magnet)}`,
      });

      if (addRes.ok) {
        const addData = await addRes.json();
        await fetch(`${RD_BASE}/torrents/selectFiles/${addData.id}`, {
          method: 'POST',
          headers: formHeaders,
          body: 'files=all',
        });

        const stream = await resolveStreamable(addData.id, authHeaders, formHeaders);
        if (stream.ready && stream.stream_url) {
          return Response.json({
            status: 'ready',
            torrent_id: String(addData.id),
            stream_url: stream.stream_url,
            filename: stream.filename || '',
          });
        }

        return Response.json({
          status: 'preparing',
          torrent_id: String(addData.id),
        });
      }

      return Response.json({ status: 'not_found' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function resolveStreamable(torrentId, authHeaders, formHeaders) {
  const infoRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
  if (!infoRes.ok) return { ready: false };
  const info = await infoRes.json();

  if (info.status !== 'downloaded') return { ready: false };

  const files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
  if (files.length === 0) return { ready: false };

  const target = files[0];
  const fileLinks = info.links || [];
  const targetLink = fileLinks[0] || '';

  if (!targetLink) return { ready: false };

  const unRes = await fetch(`${RD_BASE}/unrestrict/link`, {
    method: 'POST',
    headers: formHeaders,
    body: `link=${encodeURIComponent(targetLink)}`,
  });
  if (!unRes.ok) return { ready: false };
  const unData = await unRes.json();

  return {
    ready: true,
    stream_url: unData.download,
    filename: unData.filename || target.path || '',
  };
}
