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
        files: stream.files || [],
      });
    }

    // Default-source resolver: check instant cache availability first (no
    // account pollution). Only if the torrent is cached on RD do we add it,
    // select files, and unrestrict to a direct streamable link.
    if (action === 'resolve_best') {
      const magnet = body.magnet;
      if (!magnet || !magnet.startsWith('magnet:')) {
        return Response.json({ error: 'A valid magnet URI is required' }, { status: 400 });
      }
      const hashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/i);
      if (!hashMatch) return Response.json({ error: 'Invalid magnet hash' }, { status: 400 });
      const hash = hashMatch[1].toLowerCase();

      const iaRes = await fetch(`${RD_BASE}/torrents/instantAvailability/${hash}`, { headers: authHeaders });
      let cached = false;
      if (iaRes.ok) {
        try {
          const iaData = await iaRes.json();
          const entry = iaData && iaData[hash];
          cached = !!(entry && entry.rd && entry.rd.length > 0);
        } catch {}
      }
      if (!cached) return Response.json({ status: 'not_cached' });

      const addRes = await fetch(`${RD_BASE}/torrents/addMagnet`, {
        method: 'POST',
        headers: formHeaders,
        body: `magnet=${encodeURIComponent(magnet)}`,
      });
      if (!addRes.ok) {
        const t = await addRes.text();
        return Response.json({ error: `addMagnet failed: ${addRes.status} ${t}` }, { status: 502 });
      }
      const torrentId = (await addRes.json()).id;
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
        files: stream.files || [],
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
        files: stream.files || [],
      });
    }

    // List the video files of an existing torrent (for the file picker).
    if (action === 'torrent_files') {
      const torrentId = body.torrent_id;
      if (!torrentId) return Response.json({ error: 'torrent_id required' }, { status: 400 });
      const infoRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
      if (!infoRes.ok) return Response.json({ error: `info failed: ${infoRes.status}` }, { status: 502 });
      const info = await infoRes.json();
      return Response.json({ files: buildFileEntries(info, null), rd_status: info.status });
    }

    // Unrestrict a single chosen file link to a direct streamable URL.
    if (action === 'unrestrict_file') {
      const link = body.link;
      if (!link) return Response.json({ error: 'link required' }, { status: 400 });
      const unRes = await fetch(`${RD_BASE}/unrestrict/link`, {
        method: 'POST',
        headers: formHeaders,
        body: `link=${encodeURIComponent(link)}`,
      });
      if (!unRes.ok) {
        const t = await unRes.text();
        return Response.json({ error: `unrestrict failed: ${unRes.status} ${t}` }, { status: 502 });
      }
      const unData = await unRes.json();
      return Response.json({ stream_url: unData.download, filename: unData.filename || '' });
    }

    // Delete a torrent from the user's Real-Debrid account (library cleanup).
    if (action === 'torrent_delete') {
      const torrentId = body.torrent_id;
      if (!torrentId) return Response.json({ error: 'torrent_id required' }, { status: 400 });
      const delRes = await fetch(`${RD_BASE}/torrents/delete/${torrentId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!delRes.ok) return Response.json({ error: `delete failed: ${delRes.status}` }, { status: 502 });
      return Response.json({ deleted: true });
    }

    // List the torrents on the user's Real-Debrid account (their RD library).
    if (action === 'torrents_list') {
      const res = await fetch(`${RD_BASE}/torrents`, { headers: authHeaders });
      if (!res.ok) return Response.json({ error: `RD error: ${res.status}` }, { status: 502 });
      const data = await res.json();
      const torrents = (data || []).map((t) => ({
        id: String(t.id),
        filename: t.filename || t.original_filename || '',
        status: t.status,
        progress: typeof t.progress === 'number' ? t.progress : 0,
        bytes: t.bytes || 0,
        ready: t.status === 'downloaded' || (Array.isArray(t.links) && t.links.length > 0),
      }));
      return Response.json({ torrents });
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

    // Search the user's OWN Real-Debrid library for a torrent whose filename
    // matches the requested title. If a ready (cached) copy exists, the client
    // resolves and plays it directly — no magnet pasting needed. This only
    // surfaces content the user already added to their account, so nothing is
    // auto-sourced from piracy indexes.
    if (action === 'find_cached') {
      const title = (body.title || '').trim();
      if (!title) return Response.json({ error: 'title required' }, { status: 400 });
      const res = await fetch(`${RD_BASE}/torrents`, { headers: authHeaders });
      if (!res.ok) return Response.json({ error: `RD error: ${res.status}` }, { status: 502 });
      const data = await res.json();
      const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const want = norm(title);
      const usable = (data || []).filter((t) => {
        const st = t.status;
        if (st === 'magnet_error' || st === 'error' || st === 'magnet_conversion') return false;
        return want && norm(t.filename || t.original_filename || '').includes(want);
      });
      usable.sort((a, b) => ((b.status === 'downloaded') ? 1 : 0) - ((a.status === 'downloaded') ? 1 : 0));
      if (usable.length === 0) return Response.json({ status: 'not_found' });
      const best = usable[0];
      return Response.json({
        status: best.status === 'downloaded' ? 'ready' : 'preparing',
        torrent_id: String(best.id),
        rd_status: best.status,
        filename: best.filename || best.original_filename || '',
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Build a list of video files (with RD file links) for a torrent. The
// auto-picked largest file is flagged so the client can highlight it.
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

// Fetch torrent info, pick the largest video file, unrestrict its link. If
// the torrent is downloaded but its files were never selected (e.g. added
// outside this app), select them first so RD exposes streamable links.
async function resolveStreamable(torrentId, authHeaders, formHeaders) {
  const infoRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
  if (!infoRes.ok) return { error: `info failed: ${infoRes.status}` };
  let info = await infoRes.json();

  let files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
  let pool = files.length > 0 ? files : (info.files || []);
  pool.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  let target = pool[0];

  // Downloaded but no file links → select all files, then re-fetch for links.
  if (info.status === 'downloaded' && (!target || !target.link)) {
    await fetch(`${RD_BASE}/torrents/selectFiles/${torrentId}`, {
      method: 'POST',
      headers: formHeaders,
      body: 'files=all',
    });
    const refetch = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
    if (refetch.ok) {
      info = await refetch.json();
      files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
      pool = files.length > 0 ? files : (info.files || []);
      pool.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
      target = pool[0];
    }
  }

  // RD exposes selected-file download links as a top-level `links` array when
  // the per-file `link` field is empty. Map them onto the selected files.
  const topLinks = Array.isArray(info.links) ? info.links : [];
  const selectedFiles = (info.files || []).filter((f) => f.selected);
  if (topLinks.length > 0 && selectedFiles.length === topLinks.length) {
    selectedFiles.forEach((f, i) => { if (!f.link) f.link = topLinks[i]; });
    files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
    pool = files.length > 0 ? files : (info.files || []);
    pool.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
    target = pool[0];
  }

  const fileEntries = buildFileEntries(info, target);

  if (!target || !target.link) {
    return { ready: false, rd_status: info.status, files: fileEntries };
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
    files: fileEntries,
  };
}