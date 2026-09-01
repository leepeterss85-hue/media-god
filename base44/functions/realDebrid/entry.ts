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

      const ep = {
        title: body.title,
        ...(body.year != null ? { year: String(body.year) } : {}),
        ...(body.season != null ? { season: String(body.season) } : {}),
        ...(body.episode != null ? { episode: String(body.episode) } : {}),
      };
      const stream = await resolveStreamable(torrentId, authHeaders, formHeaders, ep);
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
      const season = body.season != null ? String(body.season) : '';
      const episode = body.episode != null ? String(body.episode) : '';
      const year = body.year != null ? String(body.year).trim() : '';
      const res = await fetch(`${RD_BASE}/torrents`, { headers: authHeaders });
      if (!res.ok) return Response.json({ error: `RD error: ${res.status}` }, { status: 502 });
      const data = await res.json();
      const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const want = norm(title);
      const wantYear = norm(year);
      // Word-based matching: every significant title word (len >= 3, common
      // stopwords dropped) must appear in the torrent filename. This catches
      // library entries whose filename splits/reorders the title differently
      // from TMDB (e.g. "Minions: The Rise of Gru" vs "Minions Rise Of Gru
      // 2022 1080p"), which a strict contiguous-substring test would miss.
      const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'for', 'is', 'it', 'as', 'by', 'with', 'from', 'ii', 'iii']);
      const titleWords = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
      // Flexible S##E## matcher (handles S1E1 ↔ S01E01 zero-padding).
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
        // Reject torrents whose filename carries a release year that conflicts
        // with the requested year (ignoring any 4-digit number that's part of
        // the title itself, e.g. "Blade Runner 2049"). A different year almost
        // always means a different film — better to surface no match (paste
        // box) than to play the wrong movie.
        if (wantYear) {
          const fnYears = (rawFn.match(/\b(19\d{2}|20\d{2})\b/g) || []);
          const extra = fnYears.filter((y) => !titleYears.includes(y));
          if (extra.length > 0 && !extra.includes(wantYear)) return -1;
        }
        const fnWords = new Set(rawFn.toLowerCase().split(/[^a-z0-9]+/));
        // Require a real title match — the normalized title as a contiguous
        // chunk (handles compound names like "Spider-Man" stored as "spiderman"),
        // OR every significant title word as a token. Short titles such as "It"
        // would false-match as substrings of unrelated words, so they must
        // appear as a whole token instead.
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
      // Prefer an exact-episode match when season/episode are given; fall
      // back to any torrent of this title (e.g. a full-season pack).
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
        if (bVid !== aVid) return bVid - aVid;             // prefer real video files over .exe fakes
        const aDl = a.status === 'downloaded' ? 1 : 0;
        const bDl = b.status === 'downloaded' ? 1 : 0;
        if (bDl !== aDl) return bDl - aDl;                 // prefer ready-to-play
        return (b.bytes || 0) - (a.bytes || 0);           // prefer higher quality
      });
      if (usable.length === 0) return Response.json({ status: 'not_found' });
      const best = usable[0];
      // If the best match is already downloaded, resolve a direct streamable
      // link right now so playback starts instantly — no 5s poll wait.
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
async function resolveStreamable(torrentId, authHeaders, formHeaders, ep) {
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

  // For TV episodes, prefer the file whose name matches S##E## over the
  // largest file — in a full-season pack the largest file is a random episode.
  if (ep && ep.season && ep.episode) {
    const s = String(ep.season).replace(/^0+/, '');
    const e = String(ep.episode).replace(/^0+/, '');
    const epRe = new RegExp(`s0*${s}(?!\\d)e0*${e}(?!\\d)`, 'i');
    const epReAlt = new RegExp(`\\b0*${s}x0*${e}(?!\\d)`, 'i');
    const match = pool.find((f) => {
      const p = (f.path || '').split('/').pop();
      return epRe.test(p) || epReAlt.test(p);
    });
    if (match) target = match;
  }
  // For movies in a multi-file torrent (e.g. a pack), pick the file whose
  // name matches the requested title/year instead of the largest file,
  // which could be a different film bundled in the same pack.
  if (ep && ep.title && !(ep.season && ep.episode)) {
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const want = norm(ep.title);
    const wantYear = norm(ep.year || '');
    const scored = pool
      .map((f) => {
        const np = norm((f.path || '').split('/').pop());
        let s = 0;
        if (want && np.includes(want)) s += 100;
        if (wantYear && np.includes(wantYear)) s += 30;
        return { f, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    if (scored.length > 0) target = scored[0].f;
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