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
      const season = body.season != null ? String(body.season) : '';
      const episode = body.episode != null ? String(body.episode) : '';
      const year = body.year != null ? String(body.year).trim() : '';
      
      const res = await fetch(`${RD_BASE}/torrents`, { headers: authHeaders });
      if (!res.ok) return Response.json({ error: `RD error: ${res.status}` }, { status: 502 });
      const data = await res.json();
      
      const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const want = norm(title);
      const wantYear = norm(year);
      
      const candidates = (data || []).filter((t) => {
        if (t.status !== 'downloaded') return false;
        const fn = norm(t.filename || t.original_filename || '');
        return fn.includes(want);
      });

      if (candidates.length === 0) {
        return Response.json({ status: 'not_found' });
      }

      const best = candidates[0];
      const stream = await resolveStreamable(String(best.id), authHeaders, formHeaders, { season, episode, title, year });
      if (stream.ready && stream.stream_url) {
        return Response.json({
          status: 'ready',
          torrent_id: String(best.id),
          stream_url: stream.stream_url,
          filename: stream.filename || '',
          files: stream.files || [],
        });
      }
      return Response.json({ status: 'not_found' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function buildFileEntries(info, target) {
  const files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
  return files.map((f) => ({
    id: f.id,
    path: (f.path || '').split('/').pop(),
    bytes: f.bytes || 0,
    link: f.link,
    selected: !!(target && f.id === target.id),
  }));
}

async function resolveStreamable(torrentId, authHeaders, formHeaders, ep) {
  const infoRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
  if (!infoRes.ok) return { error: `info failed: ${infoRes.status}` };
  const info = await infoRes.json();

  if (info.status !== 'downloaded') return { ready: false };

  const files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
  if (files.length === 0) return { ready: false };

  let target = files[0];
  if (ep?.episode && ep?.season) {
    const sStr = String(ep.season);
    const eStr = String(ep.episode);
    const match = files.find((f) => {
      const p = (f.path || '').toLowerCase();
      return p.includes(`s0${sStr}e0${eStr}`) || p.includes(`s${sStr}e${eStr}`) || p.includes(`${sStr}x${eStr}`);
    });
    if (match) target = match;
  }

  const fileLinks = info.links || [];
  let targetLink = fileLinks[0] || '';
  const index = files.findIndex((f) => f.id === target.id);
  if (index >= 0 && fileLinks[index]) targetLink = fileLinks[index];

  if (!targetLink) return { ready: false };

  const unRes = await fetch(`${RD_BASE}/unrestrict/link`, {
    method: 'POST',
    headers: formHeaders,
    body: `link=${encodeURIComponent(targetLink)}`,
  });
  if (!unRes.ok) return { error: `unrestrict failed: ${unRes.status}` };
  const unData = await unRes.json();

  return {
    ready: true,
    stream_url: unData.download,
    filename: unData.filename || target.path || '',
    files: buildFileEntries(info, target),
  };
}
