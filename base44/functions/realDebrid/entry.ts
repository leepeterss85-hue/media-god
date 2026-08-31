import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const RD_BASE = 'https://api.real-debrid.com/rest/1.0';
const VIDEO_RE = /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

// Real-Debrid proxy. The user's personal RD API token is stored on their user
// record (auth.updateMe({ rd_token })) and read server-side here — never sent
// to the client. Only the bounded actions the app needs are exposed.
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

    // Validate the token + show premium status.
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

    // Add a magnet to RD, select all files, and resolve a direct streamable link
    // from the largest video file (instant when the torrent is cached on RD).
    if (action === 'add_magnet') {
      const magnet = body.magnet;
      if (!magnet || !magnet.startsWith('magnet:')) {
        return Response.json({ error: 'A valid magnet URI is required' }, { status: 400 });
      }

      const addRes = await fetch(`${RD_BASE}/torrents/addMagnet`, {
        method: 'POST',
        headers: formHeaders,
        body: `magnet=${encodeURIComponent(magnet)}`,
      });
      if (!addRes.ok) {
        const t = await addRes.text();
        return Response.json({ error: `addMagnet failed: ${addRes.status} ${t}` }, { status: 502 });
      }
      const addData = await addRes.json();
      const torrentId = addData.id;

      await fetch(`${RD_BASE}/torrents/selectFiles/${torrentId}`, {
        method: 'POST',
        headers: formHeaders,
        body: 'files=all',
      });

      const stream = await resolveStreamable(torrentId, authHeaders, formHeaders);
      if (stream.error) return Response.json({ error: stream.error }, { status: 502 });
      return Response.json({
        status: stream.ready ? 'ready' : 'preparing',
        torrent_id: torrentId,
        stream_url: stream.stream_url || '',
        filename: stream.filename || '',
        rd_status: stream.rd_status,
      });
    }

    // Poll an existing torrent for a ready streamable link.
    if (action === 'torrent_info') {
      const torrentId = body.torrent_id;
      if (!torrentId) return Response.json({ error: 'torrent_id required' }, { status: 400 });
      const stream = await resolveStreamable(torrentId, authHeaders, formHeaders);
      if (stream.error) return Response.json({ error: stream.error }, { status: 502 });
      return Response.json({
        status: stream.ready ? 'ready' : 'preparing',
        torrent_id: torrentId,
        stream_url: stream.stream_url || '',
        filename: stream.filename || '',
        rd_status: stream.rd_status,
      });
    }

    // List supported hosters (for the settings page).
    if (action === 'hosts') {
      const res = await fetch(`${RD_BASE}/hosts/status`, { headers: authHeaders });
      if (!res.ok) return Response.json({ error: `RD error: ${res.status}` }, { status: 502 });
      const data = await res.json();
      const active = Object.entries(data || {})
        .filter(([, v]) => v && v.supported && !v.disabled)
        .map(([k]) => k)
        .slice(0, 40);
      return Response.json({ hosts: active });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Fetch torrent info, pick the largest video file, unrestrict its link.
async function resolveStreamable(torrentId, authHeaders, formHeaders) {
  const infoRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
  if (!infoRes.ok) return { error: `info failed: ${infoRes.status}` };
  const info = await infoRes.json();

  const files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
  const pool = files.length > 0 ? files : (info.files || []);
  pool.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  const target = pool[0];

  if (!target || !target.link) {
    return { ready: false, rd_status: info.status };
  }

  const unRes = await fetch(`${RD_BASE}/unrestrict/link`, {
    method: 'POST',
    headers: formHeaders,
    body: `link=${encodeURIComponent(target.link)}`,
  });
  if (!unRes.ok) {
    const t = await unRes.text();
    return { error: `unrestrict failed: ${unRes.status} ${t}` };
  }
  const unData = await unRes.json();
  return {
    ready: true,
    stream_url: unData.download,
    filename: unData.filename || (target.path || '').split('/').pop(),
    rd_status: info.status,
  };
}