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

      const ep = {
        title: body.title,
        ...(body.year != null ? { year: String(body.year) } : {}),
        ...(body.season != null ? { season: String(body.season) } : {}),
        ...(body.episode != null ? { episode: String(body.episode) } : {}),
      };
      const stream = await resolveStreamable(torrentId, authHeaders, formHeaders, ep);
      if (stream.error) return Response.json({ error: stream.error }, { status: 502 });

      if (body.title) {
        try {
          const rYear = (body.year != null ? String(body.year) : '').trim();
          const rSeason = body.season != null ? String(body.season) : '';
          const rEpisode = body.episode != null ? String(body.episode) : '';
          const existing = await base44.entities.RdLink.filter({ title: body.title.trim(), year: rYear, season: rSeason, episode: rEpisode });
          if (existing.length > 0) {
            await base44.entities.RdLink.update(existing[0].id, { magnet, torrent_id: String(torrentId) });
          } else {
            await base44.entities.RdLink.create({ title: body.title.trim(), year: rYear, season: rSeason, episode: rEpisode, magnet, torrent_id: String(torrentId) });
          }
        } catch {}
      }

      return Response.json({
        status: stream.ready ? 'ready' : 'preparing',
        torrent_id: torrentId,
        stream_url: stream.stream_url || '',
        filename: stream.filename || '',
        rd_status: stream.rd_status,
        files: stream.files || [],
      });
    }

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
      
      // If not cached, add it anyway so it starts downloading/preparing in the background instead of failing
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

    if (action === 'torrent_info') {
      const torrentId = body.torrent_id;
      if (!torrentId) return Response.json({ error: 'torrent_id required' }, { status: 400 });
      const opts = {
        title: body.title,
        year: body.year,
        ...(body.season != null ? { season: String(body.season) } : {}),
        ...(body.episode != null ? { episode: String(body.episode) } : {}),
      };
      const stream = await resolveStreamable(torrentId, authHeaders, formHeaders, opts);
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

    if (action === 'torrent_files') {
      const torrentId = body.torrent_id;
      if (!torrentId) return Response.json({ error: 'torrent_id required' }, { status: 400 });
      const infoRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
      if (!infoRes.ok) return Response.json({ error: `info failed: ${infoRes.status}` }, { status: 502 });
      const info = await infoRes.json();
      return Response.json({ files: buildFileEntries(info, null), rd_status: info.status });
    }

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
      const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'for', 'is', 'it', 'as', 'by', 'with', 'from', 'ii', 'iii']);
      const titleWords = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
      let epRegex = null;
      if (season && episode) {
        const s = String(season).replace(/^0+/, '');
        const e = String(episode).replace(/^0+/, '');
        epRegex = new RegExp(`s0*${s}(?!\\d)e0*${e}(?!\\d)`, 'i');
      }
      const titleYears = (title.match(/\b(19\d{2}|20\d{2})\b/g) || []).map((y) => y);
      const scoreTorrent = (t) => {
        const rawFn = t.filename || t.original_filename || '';
        const fn = norm(rawFn);
        if (!fn || !want) return -1;
        if (wantYear) {
          const fnYears = (rawFn.match(/\b(19\d{2}|20\d{2})\b/g) || []);
          const extra = fnYears.filter((y) => !titleYears.includes(y));
          if (extra.length > 0 && !extra.includes(wantYear)) return -1;
        }
        const fnWords = new Set(rawFn.toLowerCase().split(/[^a-z0-9]+/));
        const contiguous = want.length >= 4 && fn.includes(want);
        const allWords = titleWords.length > 0 && titleWords.every((w) => fnWords.has(w));
        const tokenMatch = titleWords.length === 0 && fnWords.has(want);
        if (!contiguous && !allWords && !tokenMatch) return -1;
        let s = 0;
        if (contiguous) s += 100;
        if (allWords) s += 50;
        if (tokenMatch) s += 100;
        if (fn.startsWith(want) && want.length >= 4) s += 20;
        if (wantYear && fn.includes(wantYear)) s += 15;
        return s;
      };
      const candidates = (data || []).filter((t) => {
        const st = t.status;
        if (st === 'magnet_error' || st === 'error' || st === 'magnet_conversion') return false;
        return scoreTorrent(t) > 0;
      });
      let usable = candidates;
      if (epRegex) {
        const exact = candidates.filter((t) => epRegex.test(t.filename || t.original_filename || ''));
        if (exact.length > 0) usable = exact;
      }
      usable.sort((a, b) => {
        const sa = scoreTorrent(a), sb = scoreTorrent(b);
        if (sb !== sa) return sb - sa;
        const aVid = VIDEO_RE.test(a.filename || a.original_filename || '') ? 1 : 0;
        const bVid = VIDEO_RE.test(b.filename || b.original_filename || '') ? 1 : 0;
        if (bVid !== aVid) return bVid - aVid;
        const aDl = a.status === 'downloaded' ? 1 : 0;
        const bDl = b.status === 'downloaded' ? 1 : 0;
        if (bDl !== aDl) return bDl - aDl;
        return (b.bytes || 0) - (a.bytes || 0);
      });
      if (usable.length === 0) {
        try {
          const remembered = await base44.entities.RdLink.filter({ title, year, season, episode });
          if (remembered.length > 0) {
            const rec = remembered[0];
            if (rec.torrent_id) {
              const stream = await resolveStreamable(rec.torrent_id, authHeaders, formHeaders, { title, year, season, episode });
              if (!stream.error && (stream.ready || stream.rd_status)) {
                return Response.json({
                  status: stream.ready ? 'ready' : 'preparing',
                  torrent_id: String(rec.torrent_id),
                  stream_url: stream.stream_url || '',
                  filename: stream.filename || '',
                  files: stream.files || [],
                });
              }
            }
            const addRes = await fetch(`${RD_BASE}/torrents/addMagnet`, {
              method: 'POST',
              headers: formHeaders,
              body: `magnet=${encodeURIComponent(rec.magnet)}`,
            });
            if (addRes.ok) {
              const tid = (await addRes.json()).id;
              await fetch(`${RD_BASE}/torrents/selectFiles/${tid}`, { method: 'POST', headers: formHeaders, body: 'files=all' });
              const stream = await resolveStreamable(tid, authHeaders, formHeaders, { title, year, season, episode });
              try { await base44.entities.RdLink.update(rec.id, { torrent_id: String(tid) }); } catch {}
              if (stream.error) return Response.json({ error: stream.error }, { status: 502 });
              return Response.json({
                status: stream.ready ? 'ready' : 'preparing',
                torrent_id: String(tid),
                stream_url: stream.stream_url || '',
                filename: stream.filename || '',
                files: stream.files || [],
              });
            }
          }
        } catch {}
        return Response.json({ status: 'not_found' });
      }
      const best = usable[0];
      if (best.status === 'downloaded') {
        const stream = await resolveStreamable(String(best.id), authHeaders, formHeaders, { season, episode, title, year });
        if (stream.ready && stream.stream_url) {
          return Response.json({
            status: 'ready',
            torrent_id: String(best.id),
            stream_url: stream.stream_url,
            filename: stream.filename || '',
            files: stream.files || [],
            rd_status: best.status,
          });
        }
      }
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
  let info = await infoRes.json();

  if (info.status === 'waiting_files_selection') {
    await fetch(`${RD_BASE}/torrents/selectFiles/${torrentId}`, {
      method: 'POST',
      headers: formHeaders,
      body: 'files=all',
    });
    const retryRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
    if (retryRes.ok) info = await retryRes.json();
  }

  const files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
  if (files.length === 0) {
    return { ready: info.status === 'downloaded', rd_status: info.status, filename: info.filename || '', files: [] };
  }

  let target = files[0];
  if (ep?.episode && ep?.season) {
    const sStr = String(ep.season);
    const eStr = String(ep.episode);
    const match = files.find((f) => {
      const p = (f.path || '').toLowerCase();
      return p.includes(`s0${sStr}e0${eStr}`) || p.includes(`s${sStr}e${eStr}`) || p.includes(`${sStr}x${eStr}`);
    });
    if (match) target = match;
  } else {
    files.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
    target = files[0];
  }

  const fileLinks = info.links || [];
  let targetLink = '';
  if (fileLinks.length === files.length) {
    const index = files.findIndex((f) => f.id === target.id);
    if (index >= 0 && fileLinks[index]) targetLink = fileLinks[index];
  }
  if (!targetLink && fileLinks.length > 0) targetLink = fileLinks[0];

  if (!targetLink || info.status !== 'downloaded') {
    return {
      ready: false,
      rd_status: info.status,
      filename: info.filename || '',
      files: buildFileEntries(info, target),
    };
  }

  const unRes = await fetch(`${RD_BASE}/unrestrict/link`, {
    method: 'POST',
    headers: formHeaders,
    body: `link=${encodeURIComponent(targetLink)}`,
  });
  if (!unRes.ok) return { error: `unrestrict failed: ${unRes.status}` };
  const unData = await unRes.json();

  return {
    ready: true,
    rd_status: info.status,
    stream_url: unData.download,
    filename: unData.filename || target.path || '',
    files: buildFileEntries(info, target),
  };
}
